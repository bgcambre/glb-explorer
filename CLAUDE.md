# GLB Explorer

A small, dependency-light web tool that presents a set of 3D models (`.glb`) as a
fullscreen slideshow, each one lit by its own HDRI environment, with an overlay
panel for metadata, navigation, and a few live scene controls. Driven entirely by
a JSON data file — new items can be added without touching code.

No backend, no framework — a static Vite + vanilla JS project using three.js
directly.

## Running it

```
npm install
npm run dev      # Vite dev server
npm run build    # production build to dist/
```

## Data model (`public/data/items.json`)

An array of items:

```json
{
  "title": "string",
  "author": "string",
  "description": "string",
  "date": "YYYY-MM-DD",
  "expiration_date": "YYYY-MM-DD",
  "hdri_path": "/assets/hdri/....exr|.hdr",
  "glb_path": "/assets/glb/....glb"
}
```

`public/assets/` holds the actual binary assets (`glb/`, `hdri/`) and is served
by Vite as static files, unprocessed — paths in `items.json` are root-relative
(`/assets/...`), matching that.

**Root-relative in the file, resolved against the base when read.** Keep writing
them with the leading slash: it is how `public/` is laid out, and it reads as the
one true location of an asset rather than as a guess about where the page is.
They are joined to `import.meta.env.BASE_URL` by `asset()` in `src/slideshow.js`
as the data enters the app, because the site is served from a subdirectory (see
"Deploying"). Resolved once there rather than at each point of use, since these
paths are also identity — `hdri.js` dedupes by `hdri_path` and `main.js` locates
the current HDRI with `indexOf`, so a mix of resolved and raw strings would
quietly stop matching.

Note: `public/assets/hdri/` currently has two `.exr` files, but only one
(`docklands_02_1k.exr`) is referenced from `items.json`. The HDRI prev/next
control only has something to switch to once more than one unique `hdri_path`
appears across items — see "Scene controls" below.

## Deploying

Served from **https://lacambre-3d.be/glb-explorer/**, a subdirectory — the domain
root is a separate Quartz site. Hence `base: "./"` in `vite.config.js`; with
Vite's default `base: "/"` the built `index.html` asks for `/assets/index-*.js`,
which is a 404 on that host, and a 404 is an HTML page — so the browser rejects
the module on its MIME type ("text/html") rather than on its status. If that
error ever comes back, it is this, and it names the MIME type rather than the
missing file.

Upload the **whole** of `dist/` each time, not just the part that changed: the
asset filenames are content-hashed, so a new `index.html` beside the previous
assets (or the reverse) points at a hash that is not there — the same 404, and
the same misleading error.

## Architecture

Plain ES modules, no framework, no global state container — `src/main.js` is the
composition root that wires the others together.

- **`src/scene.js`** — owns the three.js side: renderer/camera/`OrbitControls`,
  loading a model (`GLTFLoader`) and its HDRI (`EXRLoader`/`RGBELoader` →
  `PMREMGenerator`), auto-framing the camera to each model's bounding box (models
  vary wildly in native scale), a floor `GridHelper`, and the two scene
  controls (vanished/HDRI — see below). Returns a small `{ loadItem,
  setHdri, setVanished, render, camera, controls, renderer }` API;
  nothing outside this file touches `THREE` directly.
- **`src/slideshow.js`** — pure data logic: fetches `items.json`, current-index
  state with circular `next()`/`prev()`, `isExpired()`, and
  `computeVanishedDefault()` (see below). No DOM, no three.js.
- **`src/hdri.js`** — derives the list of unique HDRIs referenced across all
  items, and a human-readable display name from a file path.
- **`src/ui.js`** — all DOM reads/writes live here (`document.getElementById`
  etc.); exposes `render*()` setters and `on*()` listener-registration functions.
  Nothing else in the app touches the DOM directly.
- **`src/orbitInspect.js`** — arrow-key camera orbit, layered on top of
  `OrbitControls` (mouse) by mutating `camera.position` via `THREE.Spherical`
  before `controls.update()` runs each frame; the two compose cleanly since
  `OrbitControls` re-derives its internal spherical state from the camera's
  current position every call.
- **`src/autoMode.js`** — idle-timer state machine (30s idle → auto-orbit +
  advance to next item every 30s, looping; any interaction pauses it and resets
  the countdown) plus a manual on/off `toggle()` used by the top-left badge.
- **`src/main.js`** — composition root: wires data, scene, UI, and the
  keyboard/auto-mode systems together; owns the render loop.

## Scene controls (right panel, above Prev/Next)

- **Environment** — prev/next cycles through the *unique* `hdri_path` values
  found across `items.json`. Defaults to the current item's own HDRI; switching
  items resets it back to that item's default. Buttons auto-disable when there's
  only one HDRI available (nothing to switch to).
- **Vanished** (0–100, default computed per item) — interpolates each mesh's
  material toward fully transmissive glass using `MeshPhysicalMaterial`'s
  `transmission`/`roughness`/`metalness`/`ior`/`thickness`, refracting through
  whatever HDRI is currently active. It is **not** a sticky global
  preference — `computeVanishedDefault(item)` in `slideshow.js` maps `0` at
  `item.date` to `100` at `item.expiration_date` (clamped, recomputed against
  the real clock every time an item is shown), so items visually "vanish" as
  they approach expiry. Dragging the slider overrides that for the current
  view; navigating to another item resets it to that item's own computed
  default.

## Non-obvious gotchas

- **Panel offset via frustum shift, not object translation.** The canvas is
  full-viewport; the right-side info panel sits on top of it rather than
  resizing it. `scene.js`'s `setSize()` calls
  `camera.setViewOffset(w, h, PANEL_WIDTH / 2, 0, w, h)` to shift the camera's
  frustum left by exactly half the panel's width, re-centering the model in the
  space that's actually visible — with zero perspective distortion (it's a pure
  shift, not a crop/zoom, since the requested view size equals the full render
  size). `PANEL_WIDTH` / `SIDEBAR_BREAKPOINT` constants at the top of
  `scene.js` must stay in sync with `--panel-width` / the media query in
  `style.css`; below the breakpoint the panel becomes a bottom sheet and the
  offset is skipped.
- **Never call `MeshPhysicalMaterial.prototype.copy()` on a plain
  `MeshStandardMaterial`.** It unconditionally reads physical-only fields
  (`sheenColor`, `attenuationColor`, `clearcoatNormalScale`, `specularColor`,
  `iridescenceThicknessRange`) that don't exist on the glTF loader's default
  material, and throws (`Cannot read properties of undefined`). This is exactly
  what glTF loading produces for these sample assets (no
  `KHR_materials_*` extensions), so it *will* happen, not just "could."
  `toPhysicalMaterial()` in `scene.js` instead builds a new
  `MeshPhysicalMaterial` through the constructor with an explicit safe field
  list — do the same for any future material-related feature.
- **Auto mode starts active immediately**, not after 30s — the idle timer only
  governs *resuming* after an interaction, not the very first entry (this was a
  deliberate product decision, reversed once already; don't "fix" it back).
  It's created only after the first item has finished loading (`main.js`), so
  the 30s idle clock can't silently run out in the background while the loading
  spinner is still showing.
- **The auto-mode badge stops its own click from being read as generic
  "activity."** It calls `stopPropagation()` on `pointerdown` before the
  window-level activity listener in `autoMode.js` sees it — otherwise clicking
  the badge to turn auto mode on/off would immediately be undone by the
  activity handler's own exit/reset logic.
