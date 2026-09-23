import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SimplifyModifier } from "three/examples/jsm/modifiers/SimplifyModifier.js";

const PANEL_WIDTH = 380; // px — keep in sync with --panel-width in style.css
const SIDEBAR_BREAKPOINT = 640; // px — keep in sync with the media query in style.css
const MAX_QUALITY_REDUCTION = 0.9; // quality=0 removes at most 90% of vertices, never fully destroys the mesh

export function createViewer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 1000);
  camera.position.set(0, 0, 3);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  // controls.listenToKeyEvents() is never called, so OrbitControls ignores
  // arrow keys entirely — orbitInspect.js owns keyboard rotation instead.
  controls.autoRotateSpeed = 1.0; // ~60s per revolution; toggled on/off by autoMode.js

  const gltfLoader = new GLTFLoader();
  const exrLoader = new EXRLoader();
  const hdrLoader = new RGBELoader();
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const simplifyModifier = new SimplifyModifier();

  let currentModel = null;
  let currentMeshes = []; // { mesh, originalGeometry, materials: [{ material, baseRoughness, baseMetalness }] }
  let currentRadius = 1;
  let currentEnvTexture = null;
  let currentHdriPath = null;
  let currentGrid = null;
  let qualityValue = 100; // 0-100, persisted across item swaps
  let vanishedValue = 0; // 0-100, set per item by main.js (computed from date/expiration_date)

  function setSize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;

    // The overlay panel sits on top of the full-bleed canvas rather than
    // resizing it, so without this the model renders dead-center behind the
    // panel. Shifting the view frustum left by half the panel's width
    // (below the breakpoint the panel becomes a bottom sheet, so no shift
    // is needed) re-centers the model in the space that's actually visible,
    // with no perspective distortion since the crop size still matches the
    // full render size.
    const offsetX = w > SIDEBAR_BREAKPOINT ? PANEL_WIDTH / 2 : 0;
    camera.setViewOffset(w, h, offsetX, 0, w, h);
  }
  setSize();
  window.addEventListener("resize", setSize);

  async function loadEnvironment(hdriPath) {
    if (hdriPath === currentHdriPath) return;

    const loader = hdriPath.toLowerCase().endsWith(".hdr") ? hdrLoader : exrLoader;
    const texture = await loader.loadAsync(hdriPath);
    texture.mapping = THREE.EquirectangularReflectionMapping;

    const envMap = pmremGenerator.fromEquirectangular(texture).texture;
    texture.dispose();

    scene.environment = envMap;
    scene.background = envMap;

    if (currentEnvTexture) currentEnvTexture.dispose();
    currentEnvTexture = envMap;
    currentHdriPath = hdriPath;
  }

  function updateGrid(size, floorY) {
    if (currentGrid) {
      scene.remove(currentGrid);
      currentGrid.geometry.dispose();
      currentGrid.material.dispose();
    }

    const gridSize = Math.max(size.x, size.z, 0.001) * 4;
    const grid = new THREE.GridHelper(gridSize, 20, 0xffffff, 0xffffff);
    grid.material.transparent = true;
    grid.material.opacity = 0.25;
    grid.position.y = floorY;
    scene.add(grid);
    currentGrid = grid;
  }

  function frameModel(model) {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    model.position.sub(center);
    updateGrid(size, -size.y / 2);

    const radius = Math.max(size.length() / 2, 0.001);
    currentRadius = radius;
    const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.2;

    camera.near = Math.max(distance / 100, 0.01);
    camera.far = distance * 100;
    camera.updateProjectionMatrix();
    camera.position.set(0, radius * 0.15, distance);

    controls.target.set(0, 0, 0);
    controls.minDistance = distance * 0.2;
    controls.maxDistance = distance * 5;
    controls.update();
  }

  // MeshStandardMaterial (glTF's default) has no transmission/ior/thickness,
  // so every material is upgraded to MeshPhysicalMaterial up front — at
  // vanished=0 this looks identical to the original, but it means the
  // vanish/glass effect is available without a shader swap later.
  // MeshPhysicalMaterial.prototype.copy() unconditionally reads
  // physical-only fields off its source (sheenColor, attenuationColor,
  // clearcoatNormalScale, specularColor, iridescenceThicknessRange), which
  // don't exist on a plain glTF MeshStandardMaterial and throw when copied.
  // Building via the constructor instead only touches fields that are
  // actually present on the source.
  function toPhysicalMaterial(mat) {
    if (mat.isMeshPhysicalMaterial) return mat;
    return new THREE.MeshPhysicalMaterial({
      name: mat.name,
      color: mat.color,
      map: mat.map,
      roughness: mat.roughness,
      roughnessMap: mat.roughnessMap,
      metalness: mat.metalness,
      metalnessMap: mat.metalnessMap,
      normalMap: mat.normalMap,
      normalMapType: mat.normalMapType,
      normalScale: mat.normalScale,
      aoMap: mat.aoMap,
      aoMapIntensity: mat.aoMapIntensity,
      emissive: mat.emissive,
      emissiveMap: mat.emissiveMap,
      emissiveIntensity: mat.emissiveIntensity,
      envMap: mat.envMap,
      envMapIntensity: mat.envMapIntensity,
      alphaMap: mat.alphaMap,
      transparent: mat.transparent,
      opacity: mat.opacity,
      side: mat.side,
      vertexColors: mat.vertexColors,
      flatShading: mat.flatShading,
      wireframe: mat.wireframe,
    });
  }

  // material.color is the only thing applyVanished() can fade through the
  // stock MeshPhysicalMaterial API, which is a no-op for materials whose
  // look actually comes from a baseColorTexture (glTF materials with no
  // baseColorFactor default color to white, so there's nothing for the
  // color lerp to fade) — the map keeps rendering at full strength and the
  // model never visually vanishes. This patches the compiled fragment
  // shader to also mix the sampled map texel toward white, driven by a
  // uniform applyVanished() updates directly (no recompile needed per
  // slider move — only the uniform value changes).
  function attachVanishMapFade(material) {
    if (material.userData.vanishMapFadeAttached) return;
    material.userData.vanishMapFadeAttached = true;
    material.userData.vanishMapMix = 0;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.vanishMapMix = { value: material.userData.vanishMapMix };
      material.userData.shader = shader;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "uniform float vanishMapMix;\n#include <common>")
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
#ifdef USE_MAP
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0 ), vanishMapMix );
#endif`
        );
    };
  }

  function upgradeToPhysical(mesh) {
    const wasArray = Array.isArray(mesh.material);
    const sourceMaterials = wasArray ? mesh.material : [mesh.material];
    const entries = sourceMaterials.map((mat) => {
      const material = toPhysicalMaterial(mat);
      if (material !== mat) mat.dispose();
      attachVanishMapFade(material);
      return {
        material,
        baseRoughness: material.roughness,
        baseMetalness: material.metalness,
        baseColor: material.color.clone(),
      };
    });
    mesh.material = wasArray ? entries.map((e) => e.material) : entries[0].material;
    return entries;
  }

  function disposeCurrentModel() {
    if (!currentModel) return;
    scene.remove(currentModel);
    currentMeshes.forEach(({ mesh, originalGeometry, materials }) => {
      if (mesh.geometry !== originalGeometry) mesh.geometry.dispose();
      originalGeometry.dispose();
      materials.forEach(({ material }) => {
        Object.values(material).forEach((value) => {
          if (value && value.isTexture) value.dispose();
        });
        material.dispose();
      });
    });
    currentModel = null;
    currentMeshes = [];
  }

  // Re-simplifies from a pristine clone of the original geometry every time
  // (rather than the currently-displayed one) so quality changes don't
  // compound decimation error, and so raising the slider back up recovers
  // detail instead of only ever losing more.
  function applyQuality(value) {
    qualityValue = value;
    const reductionFraction = ((100 - value) / 100) * MAX_QUALITY_REDUCTION;

    currentMeshes.forEach(({ mesh, originalGeometry }) => {
      if (mesh.geometry !== originalGeometry) mesh.geometry.dispose();

      if (reductionFraction <= 0) {
        mesh.geometry = originalGeometry;
        return;
      }

      const vertexCount = originalGeometry.attributes.position.count;
      const removeCount = Math.floor(vertexCount * reductionFraction);
      mesh.geometry = simplifyModifier.modify(originalGeometry, removeCount);
    });
  }

  const WHITE = new THREE.Color(0xffffff);

  // 0 = untouched material, 100 = fully "vanished" into clear transmissive
  // glass (using the PMREM environment already in the scene for
  // refraction). The base color is faded to white as it goes up too —
  // MeshPhysicalMaterial uses material.color to tint transmitted light
  // (that's correct for stained glass), but at 100 we want the object to
  // actually vanish rather than remain a solid-looking colored glass.
  function applyVanished(value) {
    vanishedValue = value;
    const t = value / 100;
    const thicknessMax = Math.max(currentRadius * 0.6, 0.01);

    currentMeshes.forEach(({ materials }) => {
      materials.forEach(({ material, baseRoughness, baseMetalness, baseColor }) => {
        const wasTransmissive = material.transmission > 0;
        material.transmission = t;
        material.roughness = THREE.MathUtils.lerp(baseRoughness, 0, t);
        material.metalness = THREE.MathUtils.lerp(baseMetalness, 0, t);
        material.ior = THREE.MathUtils.lerp(1.0, 1.5, t);
        material.thickness = t * thicknessMax;
        material.color.copy(baseColor).lerp(WHITE, t);
        material.userData.vanishMapMix = t;
        if (material.userData.shader) material.userData.shader.uniforms.vanishMapMix.value = t;
        if (wasTransmissive !== t > 0) material.needsUpdate = true;
      });
    });
  }

  async function loadModel(glbPath) {
    const gltf = await gltfLoader.loadAsync(glbPath);
    const model = gltf.scene;

    disposeCurrentModel();

    scene.add(model);
    currentModel = model;

    model.traverse((obj) => {
      if (!obj.isMesh) return;
      const materials = upgradeToPhysical(obj);
      currentMeshes.push({ mesh: obj, originalGeometry: obj.geometry, materials });
    });

    frameModel(model);
    applyQuality(qualityValue);
    applyVanished(vanishedValue);
  }

  async function loadItem(item) {
    await Promise.all([loadEnvironment(item.hdri_path), loadModel(item.glb_path)]);
  }

  function render() {
    controls.update();
    renderer.render(scene, camera);
  }

  return {
    camera,
    controls,
    renderer,
    loadItem,
    setHdri: loadEnvironment,
    setQuality: applyQuality,
    setVanished: applyVanished,
    render,
  };
}
