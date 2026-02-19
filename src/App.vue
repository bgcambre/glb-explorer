<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'

const sceneHost = ref(null)
const isPlaying = ref(false)
const selectedModel = ref('')
const modelNames = Object.keys(import.meta.glob('./assets/models/*.glb', { eager: true, import: 'default' }))
  .map((path) => path.split('/').pop())

if (modelNames.length > 0) {
  selectedModel.value = modelNames[0]
}

const modelModules = import.meta.glob('./assets/models/*.glb', { eager: true, import: 'default' })

let renderer
let scene
let camera
let animationId
let currentModel = null
let environmentMap = null
const loader = new GLTFLoader()
const rgbeLoader = new RGBELoader()
const clock = new THREE.Clock()
const sunsetHdriUrl = 'https://threejs.org/examples/textures/equirectangular/venice_sunset_1k.hdr'

const velocity = new THREE.Vector3()
const direction = new THREE.Vector3()
const planarVelocity = new THREE.Vector3()
let jetpackThrottle = 0
const cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ')
let yaw = 0
let pitch = 0
const lookSensitivity = 0.002
const player = {
  height: 1.7,
  speed: 5,
  acceleration: 18,
  deceleration: 14,
  jetpackForce: 20,
  jetpackAcceleration: 14,
  jetpackDeceleration: 10,
  maxVerticalSpeed: 12,
  gravity: 14
}

const keys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
  Space: false
}

function onResize() {
  if (!renderer || !camera || !sceneHost.value) return
  const width = sceneHost.value.clientWidth
  const height = sceneHost.value.clientHeight
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
}

function setMovementKey(code, isDown) {
  if (code in keys) keys[code] = isDown
}

function clearInputState() {
  Object.keys(keys).forEach((code) => {
    keys[code] = false
  })
  planarVelocity.set(0, 0, 0)
  velocity.y = 0
  jetpackThrottle = 0
}

function onKeyDown(e) {
  if (!isPlaying.value) return
  setMovementKey(e.code, true)
}

function onKeyUp(e) {
  if (!isPlaying.value) return
  setMovementKey(e.code, false)
}

function applyCameraRotation() {
  cameraEuler.set(pitch, yaw, 0)
  camera.quaternion.setFromEuler(cameraEuler)
}

function onMouseMove(e) {
  if (!isPlaying.value) return
  yaw -= e.movementX * lookSensitivity
  pitch -= e.movementY * lookSensitivity
  const maxPitch = Math.PI / 2 - 0.01
  pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch))
  applyCameraRotation()
}

function onPointerLockChange() {
  if (!renderer) return
  isPlaying.value = document.pointerLockElement === renderer.domElement
  if (!isPlaying.value) clearInputState()
}

function createFloor() {
  const floorSize = 120
  const tileSize = 2
  const textureCanvas = document.createElement('canvas')
  textureCanvas.width = 256
  textureCanvas.height = 256
  const ctx = textureCanvas.getContext('2d')

  const light = '#ececec'
  const dark = '#d4d4d4'
  const cells = 8
  const step = textureCanvas.width / cells

  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? light : dark
      ctx.fillRect(x * step, y * step, step, step)
    }
  }

  const texture = new THREE.CanvasTexture(textureCanvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(floorSize / tileSize, floorSize / tileSize)
  texture.anisotropy = 8

  const floorGeometry = new THREE.PlaneGeometry(floorSize, floorSize)
  const floorMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0 })
  const floor = new THREE.Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)
}

function placeOnFloor(object3d) {
  object3d.updateMatrixWorld(true)
  const bbox = new THREE.Box3().setFromObject(object3d)
  if (Number.isFinite(bbox.min.y)) {
    object3d.position.y -= bbox.min.y
  }
}

function clearCurrentModel() {
  if (!currentModel) return
  scene.remove(currentModel)
  currentModel.traverse((child) => {
    if (child.isMesh) {
      child.geometry?.dispose()
      if (Array.isArray(child.material)) {
        child.material.forEach((mat) => mat.dispose?.())
      } else {
        child.material?.dispose?.()
      }
    }
  })
  currentModel = null
}

function loadModel(filename) {
  if (!filename) {
    clearCurrentModel()
    return
  }

  const path = `./assets/models/${filename}`
  const modelUrl = modelModules[path]
  if (!modelUrl) return

  loader.load(
    modelUrl,
    (gltf) => {
      clearCurrentModel()
      const root = gltf.scene
      root.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true
          child.receiveShadow = true
        }
      })
      placeOnFloor(root)
      currentModel = root
      scene.add(root)
    },
    undefined,
    (error) => {
      console.error('Failed to load model:', error)
    }
  )
}

function updatePlayer(delta) {
  direction.set(0, 0, 0)

  if (keys.ArrowUp) direction.z += 1
  if (keys.ArrowDown) direction.z -= 1
  if (keys.ArrowLeft) direction.x -= 1
  if (keys.ArrowRight) direction.x += 1

  if (direction.lengthSq() > 0) direction.normalize()

  const forward = new THREE.Vector3()
  camera.getWorldDirection(forward)
  forward.y = 0
  forward.normalize()

  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

  const move = new THREE.Vector3()
  move.addScaledVector(forward, direction.z)
  move.addScaledVector(right, direction.x)

  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(player.speed)
  }
  const response = move.lengthSq() > 0 ? player.acceleration : player.deceleration
  const blend = 1 - Math.exp(-response * delta)
  planarVelocity.lerp(move, blend)
  camera.position.addScaledVector(planarVelocity, delta)

  const throttleTarget = keys.Space ? 1 : 0
  const throttleResponse = throttleTarget > jetpackThrottle ? player.jetpackAcceleration : player.jetpackDeceleration
  const throttleBlend = 1 - Math.exp(-throttleResponse * delta)
  jetpackThrottle = THREE.MathUtils.lerp(jetpackThrottle, throttleTarget, throttleBlend)

  const verticalAccel = jetpackThrottle * player.jetpackForce - player.gravity
  velocity.y += verticalAccel * delta
  velocity.y = THREE.MathUtils.clamp(velocity.y, -player.maxVerticalSpeed, player.maxVerticalSpeed)
  camera.position.y += velocity.y * delta

  if (camera.position.y <= player.height) {
    camera.position.y = player.height
    if (velocity.y < 0) velocity.y = 0
  }
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.033)
  updatePlayer(delta)
  renderer.render(scene, camera)
  animationId = requestAnimationFrame(animate)
}

function startPlay() {
  renderer?.domElement?.requestPointerLock()
}

function applySunsetHdri() {
  const pmrem = new THREE.PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()

  rgbeLoader.load(
    sunsetHdriUrl,
    (hdrTexture) => {
      const env = pmrem.fromEquirectangular(hdrTexture).texture
      scene.environment = env
      scene.background = env
      scene.backgroundBlurriness = 0.2
      scene.backgroundIntensity = 0.8
      environmentMap = env
      hdrTexture.dispose()
      pmrem.dispose()
    },
    undefined,
    () => {
      // Fallback keeps scene usable if HDRI cannot be fetched.
      scene.background = new THREE.Color('#f6f6f6')
      pmrem.dispose()
    }
  )
}

onMounted(() => {
  scene = new THREE.Scene()

  camera = new THREE.PerspectiveCamera(70, 1, 0.1, 500)
  camera.position.set(0, player.height, 5)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1
  renderer.shadowMap.enabled = true
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  sceneHost.value.appendChild(renderer.domElement)

  const hemi = new THREE.HemisphereLight('#ffffff', '#bcbcbc', 0.25)
  scene.add(hemi)

  const dir = new THREE.DirectionalLight('#ffffff', 0.6)
  dir.position.set(8, 14, 8)
  dir.castShadow = true
  dir.shadow.mapSize.set(1024, 1024)
  scene.add(dir)

  applySunsetHdri()
  createFloor()
  loadModel(selectedModel.value)

  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('pointerlockchange', onPointerLockChange)

  applyCameraRotation()
  onResize()
  animate()
})

watch(selectedModel, (filename) => {
  if (scene) loadModel(filename)
})

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('pointerlockchange', onPointerLockChange)
  clearCurrentModel()
  if (environmentMap) environmentMap.dispose()

  if (renderer) {
    renderer.dispose()
    renderer.domElement?.remove()
  }
})
</script>

<template>
  <div class="app-shell">
    <div ref="sceneHost" class="scene-host" @click="startPlay">
      <div class="hud">
        {{ isPlaying ? 'Play mode active | Press Esc to Exit' : 'Click Start to Play' }}
      </div>
    </div>

    <aside class="sidebar">
      <h1>Inspector</h1>

      <button class="start-btn" type="button" @click="startPlay">Start</button>

      <label for="model">Model</label>
      <select id="model" v-model="selectedModel">
        <option v-if="modelNames.length === 0" disabled value="">No .glb files found</option>
        <option v-for="name in modelNames" :key="name" :value="name">{{ name }}</option>
      </select>

      <p class="hint">Controls: Arrow keys move, hold Space for jetpack, mouse looks around.</p>
      <p class="hint">Put your models in <code>src/assets/models</code>.</p>
    </aside>
  </div>
</template>
