import * as THREE from "three";

const ROTATE_SPEED = 1.4; // radians per second
const MIN_POLAR = 0.05;
const MAX_POLAR = Math.PI - 0.05;

const KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

export function createKeyboardOrbit(camera, controls) {
  const held = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
  const spherical = new THREE.Spherical();
  const offset = new THREE.Vector3();

  function onKeyDown(event) {
    if (!KEYS.includes(event.key)) return;
    held[event.key] = true;
    event.preventDefault();
  }

  function onKeyUp(event) {
    if (!KEYS.includes(event.key)) return;
    held[event.key] = false;
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  function update(delta) {
    const azimuthDelta = (held.ArrowLeft ? 1 : 0) - (held.ArrowRight ? 1 : 0);
    const polarDelta = (held.ArrowUp ? 1 : 0) - (held.ArrowDown ? 1 : 0);
    if (!azimuthDelta && !polarDelta) return;

    offset.copy(camera.position).sub(controls.target);
    spherical.setFromVector3(offset);

    spherical.theta += azimuthDelta * ROTATE_SPEED * delta;
    spherical.phi = Math.max(MIN_POLAR, Math.min(MAX_POLAR, spherical.phi - polarDelta * ROTATE_SPEED * delta));

    offset.setFromSpherical(spherical);
    camera.position.copy(controls.target).add(offset);
    camera.lookAt(controls.target);
  }

  function dispose() {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  }

  return { update, dispose };
}
