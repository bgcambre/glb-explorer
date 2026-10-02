const els = {
  loading: document.getElementById("loading"),
  panel: document.getElementById("panel"),
  index: document.getElementById("item-index"),
  badge: document.getElementById("item-badge"),
  title: document.getElementById("item-title"),
  author: document.getElementById("item-author"),
  description: document.getElementById("item-description"),
  date: document.getElementById("item-date"),
  btnPrev: document.getElementById("btn-prev"),
  btnNext: document.getElementById("btn-next"),
  hdriName: document.getElementById("hdri-name"),
  btnHdriPrev: document.getElementById("btn-hdri-prev"),
  btnHdriNext: document.getElementById("btn-hdri-next"),
  vanishedSlider: document.getElementById("vanished-slider"),
  vanishedValue: document.getElementById("vanished-value"),
  autoBadge: document.getElementById("auto-mode-badge"),
};

let hdriSwitchable = true;

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "long",
  day: "numeric",
});

function formatDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : dateFormatter.format(d);
}

export function renderItem(item, { index, total, expired }) {
  els.index.textContent = `${index + 1} / ${total}`;
  els.badge.hidden = !expired;
  els.title.textContent = item.title;
  els.author.textContent = item.author;
  els.description.textContent = item.description;
  els.date.textContent = `Added ${formatDate(item.date)} · Expires ${formatDate(item.expiration_date)}`;
}

export function renderHdriName(name) {
  els.hdriName.textContent = name;
}

export function renderVanished(value) {
  els.vanishedSlider.value = value;
  els.vanishedValue.textContent = String(value);
}

// There's nothing to switch to when the data file only references one
// unique HDRI — disabling the buttons (rather than leaving them clickable
// no-ops) makes that visible instead of looking broken.
export function setHdriSwitchable(canSwitch) {
  hdriSwitchable = canSwitch;
  els.btnHdriPrev.disabled = !canSwitch;
  els.btnHdriNext.disabled = !canSwitch;
  const title = canSwitch ? "" : "Only one HDRI available in items.json";
  els.btnHdriPrev.title = title;
  els.btnHdriNext.title = title;
}

export function renderAutoMode(isActive) {
  els.autoBadge.classList.toggle("is-active", isActive);
  els.autoBadge.setAttribute("aria-pressed", String(isActive));
}

export function setLoading(isLoading) {
  els.loading.classList.toggle("is-hidden", !isLoading);
  els.panel.classList.toggle("is-loading", isLoading);
  els.btnPrev.disabled = isLoading;
  els.btnNext.disabled = isLoading;
  els.btnHdriPrev.disabled = isLoading || !hdriSwitchable;
  els.btnHdriNext.disabled = isLoading || !hdriSwitchable;
}

export function onNav({ onPrev, onNext }) {
  els.btnPrev.addEventListener("click", onPrev);
  els.btnNext.addEventListener("click", onNext);
}

export function onSceneControls({ onHdriPrev, onHdriNext, onVanishedChange }) {
  els.btnHdriPrev.addEventListener("click", onHdriPrev);
  els.btnHdriNext.addEventListener("click", onHdriNext);
  els.vanishedSlider.addEventListener("input", (e) => onVanishedChange(Number(e.target.value)));
}

export function onAutoToggle(handler) {
  // Keeps a badge click from also being seen by autoMode.js's window-level
  // activity listener, which would otherwise immediately override the
  // toggle (pointerdown fires and bubbles before click does).
  els.autoBadge.addEventListener("pointerdown", (e) => e.stopPropagation());
  els.autoBadge.addEventListener("click", handler);
}
