const defaults = { enabled: true, autoNext: false, speed: 1 };

const enabled = document.getElementById("enabled");
const autoNext = document.getElementById("autoNext");
const speed = document.getElementById("speed");

chrome.storage.sync.get(defaults, (s) => {
  enabled.checked = s.enabled;
  autoNext.checked = s.autoNext;
  speed.value = String(s.speed);
});

enabled.onchange = () => chrome.storage.sync.set({ enabled: enabled.checked });
autoNext.onchange = () => chrome.storage.sync.set({ autoNext: autoNext.checked });
speed.onchange = () => chrome.storage.sync.set({ speed: Number(speed.value) });
