export function getHdriList(items) {
  const seen = new Set();
  const list = [];
  items.forEach((item) => {
    if (!seen.has(item.hdri_path)) {
      seen.add(item.hdri_path);
      list.push(item.hdri_path);
    }
  });
  return list;
}

export function hdriDisplayName(path) {
  const base = path.split("/").pop().replace(/\.[^.]+$/, "");
  return base
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
