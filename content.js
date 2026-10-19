const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SEEK_STEP = 5;

const settings = { enabled: true, autoNext: false, speed: 1 };

chrome.storage.sync.get(settings, (s) => Object.assign(settings, s));
chrome.storage.onChanged.addListener((changes) => {
  for (const [key, { newValue }] of Object.entries(changes)) settings[key] = newValue;
  const video = currentVideo();
  if (video) video.playbackRate = settings.speed;
});

function save(patch) {
  Object.assign(settings, patch);
  chrome.storage.sync.set(patch);
}

function currentVideo() {
  let best = null;
  let bestArea = 0;
  for (const video of document.querySelectorAll("video")) {
    const r = video.getBoundingClientRect();
    const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
    const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    const area = Math.max(w, 0) * Math.max(h, 0);
    if (area > bestArea) {
      best = video;
      bestArea = area;
    }
  }
  return best;
}

function scrollParent(el) {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (/(auto|scroll)/.test(overflowY) && node.scrollHeight > node.clientHeight) return node;
  }
  return document.scrollingElement;
}

function step(direction) {
  const video = currentVideo();
  if (!video) return;
  const container = scrollParent(video);
  container.scrollBy({ top: direction * video.getBoundingClientRect().height, behavior: "smooth" });
}

let toastTimer;
function toast(text) {
  let el = document.getElementById("irc-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "irc-toast";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add("irc-show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("irc-show"), 900);
}

function changeSpeed(delta) {
  const i = SPEEDS.indexOf(settings.speed);
  const next = SPEEDS[Math.min(Math.max((i === -1 ? 2 : i) + delta, 0), SPEEDS.length - 1)];
  save({ speed: next });
  const video = currentVideo();
  if (video) video.playbackRate = next;
  toast(`Speed ${next}x`);
}

function isTyping(target) {
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

const actions = {
  k(video) {
    if (video.paused) video.play();
    else video.pause();
    toast(video.paused ? "Pause" : "Play");
  },
  j(video) {
    video.currentTime = Math.max(video.currentTime - SEEK_STEP, 0);
    toast(`-${SEEK_STEP}s`);
  },
  l(video) {
    video.currentTime = Math.min(video.currentTime + SEEK_STEP, video.duration || Infinity);
    toast(`+${SEEK_STEP}s`);
  },
  m(video) {
    video.muted = !video.muted;
    toast(video.muted ? "Muted" : "Unmuted");
  },
  n() {
    step(1);
  },
  p() {
    step(-1);
  },
  "]"() {
    changeSpeed(1);
  },
  "["() {
    changeSpeed(-1);
  },
  0() {
    save({ speed: 1 });
    const video = currentVideo();
    if (video) video.playbackRate = 1;
    toast("Speed 1x");
  },
  a() {
    save({ autoNext: !settings.autoNext });
    toast(`Auto-next ${settings.autoNext ? "on" : "off"}`);
  },
};

document.addEventListener(
  "keydown",
  (e) => {
    if (!settings.enabled || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    const action = actions[e.key.toLowerCase()];
    if (!action) return;
    const video = currentVideo();
    if (!video && !["a"].includes(e.key.toLowerCase())) return;
    e.preventDefault();
    action(video);
  },
  true
);

// Media events don't bubble, so listen in the capture phase to catch every new reel.
document.addEventListener(
  "play",
  (e) => {
    if (e.target instanceof HTMLVideoElement) e.target.playbackRate = settings.speed;
  },
  true
);

// Reels loop, so "ended" never fires; move on just before the loop point instead.
document.addEventListener(
  "timeupdate",
  (e) => {
    const video = e.target;
    if (!settings.enabled || !settings.autoNext || !(video instanceof HTMLVideoElement)) return;
    if (video !== currentVideo() || !video.duration || video.dataset.ircAdvanced) return;
    if (video.currentTime >= video.duration - 0.3) {
      video.dataset.ircAdvanced = "1";
      step(1);
    }
  },
  true
);
