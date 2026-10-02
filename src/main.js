import { Clock } from "three";
import { createViewer } from "./scene.js";
import { createKeyboardOrbit } from "./orbitInspect.js";
import { createAutoMode } from "./autoMode.js";
import { loadItems, isExpired, computeVanishedDefault, createSlideshow } from "./slideshow.js";
import { getHdriList, hdriDisplayName } from "./hdri.js";
import {
  renderItem,
  renderHdriName,
  renderVanished,
  renderAutoMode,
  setHdriSwitchable,
  setLoading,
  onNav,
  onSceneControls,
  onAutoToggle,
} from "./ui.js";

async function main() {
  const canvas = document.getElementById("viewport");
  const viewer = createViewer(canvas);
  const keyboardOrbit = createKeyboardOrbit(viewer.camera, viewer.controls);

  const items = await loadItems();
  const slideshow = createSlideshow(items);
  const hdriList = getHdriList(items);
  let hdriIndex = 0;
  setHdriSwitchable(hdriList.length > 1);

  async function showCurrent() {
    setLoading(true);
    try {
      const item = slideshow.current();
      await viewer.loadItem(item);
      hdriIndex = Math.max(hdriList.indexOf(item.hdri_path), 0);
      renderItem(item, {
        index: slideshow.index,
        total: slideshow.length,
        expired: isExpired(item),
      });
      renderHdriName(hdriDisplayName(hdriList[hdriIndex]));

      const vanished = computeVanishedDefault(item);
      viewer.setVanished(vanished);
      renderVanished(vanished);
    } catch (err) {
      console.error("Failed to show item", err);
    } finally {
      setLoading(false);
    }
  }

  function goPrev() {
    slideshow.prev();
    showCurrent();
  }

  function goNext() {
    slideshow.next();
    showCurrent();
  }

  async function cycleHdri(direction) {
    if (hdriList.length <= 1) return;
    hdriIndex = (hdriIndex + direction + hdriList.length) % hdriList.length;
    setLoading(true);
    try {
      await viewer.setHdri(hdriList[hdriIndex]);
      renderHdriName(hdriDisplayName(hdriList[hdriIndex]));
    } catch (err) {
      console.error("Failed to switch HDRI", err);
    } finally {
      setLoading(false);
    }
  }

  function changeVanished(value) {
    viewer.setVanished(value);
    renderVanished(value);
  }

  onNav({ onPrev: goPrev, onNext: goNext });
  onSceneControls({
    onHdriPrev: () => cycleHdri(-1),
    onHdriNext: () => cycleHdri(1),
    onVanishedChange: changeVanished,
  });

  await showCurrent();

  // Started only once the first item is actually visible, so the 30s idle
  // countdown doesn't run out in the background while the user is still
  // waiting on the initial model/HDRI load.
  const autoMode = createAutoMode({
    controls: viewer.controls,
    onAdvance: goNext,
    onStateChange: renderAutoMode,
  });
  onAutoToggle(() => autoMode.toggle());

  const clock = new Clock();
  function animate() {
    requestAnimationFrame(animate);
    keyboardOrbit.update(clock.getDelta());
    viewer.render();
  }
  animate();
}

main();
