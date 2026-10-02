// Vite's `base` rewrites the URLs it can see while building — the module and stylesheet in
// index.html — but not a path handed to `fetch` at runtime, and not one sitting inside a data
// file. Both kinds are root-relative by design (CLAUDE.md, "Data model"), which is correct for a
// site served from its root and wrong for this one, served from /glb-explorer/. So they are
// resolved against the base here.
//
// `import.meta.env.BASE_URL` is "/" in dev and "./" in the build, and the trailing slash is
// dropped before joining so neither produces a doubled one.
const asset = (path) =>
  typeof path === "string" && path.startsWith("/")
    ? import.meta.env.BASE_URL.replace(/\/$/, "") + path
    : path;

// Resolved once, as the data enters the app, rather than at each point of use. The paths are also
// identity: `hdri.js` dedupes the HDRI list by `hdri_path` and `main.js` finds the current one with
// `indexOf`, so a mix of resolved and raw strings would quietly stop matching.
export async function loadItems(url = "/data/items-2026.json") {
  const res = await fetch(asset(url));
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const items = await res.json();
  return items.map((item) => ({
    ...item,
    hdri_path: asset(item.hdri_path),
    glb_path: asset(item.glb_path),
  }));
}

export function isExpired(item) {
  return new Date(item.expiration_date) < new Date();
}

// 0 at item.date, 100 at item.expiration_date, tracking how far through its
// lifespan the item currently is — recomputed against the real clock each
// time it's shown, so it keeps advancing (and clamps at 100 once expired)
// the longer the page stays open.
export function computeVanishedDefault(item) {
  const start = new Date(item.date).getTime();
  const end = new Date(item.expiration_date).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;

  const progress = (Date.now() - start) / (end - start);
  return Math.round(Math.min(1, Math.max(0, progress)) * 100);
}

export function createSlideshow(items) {
  let index = 0;

  function current() {
    return items[index];
  }

  function next() {
    index = (index + 1) % items.length;
    return current();
  }

  function prev() {
    index = (index - 1 + items.length) % items.length;
    return current();
  }

  return {
    get index() {
      return index;
    },
    get length() {
      return items.length;
    },
    current,
    next,
    prev,
  };
}
