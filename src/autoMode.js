const IDLE_DELAY_MS = 30_000;
const ADVANCE_INTERVAL_MS = 30_000;
const ACTIVITY_EVENTS = ["pointerdown", "wheel", "keydown", "touchstart"];

export function createAutoMode({ controls, onAdvance, onStateChange }) {
  let idleTimer = null;
  let advanceTimer = null;
  let active = false;
  let enabled = true; // manual on/off, controlled by the toggle badge

  function enter() {
    if (!enabled || active) return;
    active = true;
    controls.autoRotate = true;
    advanceTimer = setInterval(onAdvance, ADVANCE_INTERVAL_MS);
    onStateChange?.(true);
  }

  function exit() {
    if (!active) return;
    active = false;
    controls.autoRotate = false;
    clearInterval(advanceTimer);
    onStateChange?.(false);
  }

  function onActivity() {
    exit();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(enter, IDLE_DELAY_MS);
  }

  ACTIVITY_EVENTS.forEach((type) => window.addEventListener(type, onActivity));

  enter(); // active immediately on startup; onActivity() takes over from here

  function toggle() {
    enabled = !enabled;
    if (enabled) {
      enter(); // give immediate feedback rather than waiting out the idle timer
    } else {
      clearTimeout(idleTimer);
      exit();
    }
    return enabled;
  }

  return { toggle };
}
