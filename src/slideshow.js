export async function loadItems(url = "/data/items.json") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
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
