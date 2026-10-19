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

// The reel whose visible area in the viewport is the largest.
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

function setSpeed(next) {
  save({ speed: next });
  const video = currentVideo();
  if (video) video.playbackRate = next;
  toast(`Speed ${next}x`);
}

function changeSpeed(delta) {
  const i = SPEEDS.indexOf(settings.speed);
  setSpeed(SPEEDS[Math.min(Math.max((i === -1 ? 2 : i) + delta, 0), SPEEDS.length - 1)]);
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
    setSpeed(1);
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

// On-screen player bar pinned to the bottom of the current reel. It lives in a shadow root so
// Instagram's styles can't touch it, and swallows its own clicks so they don't toggle the reel.
const HIDE_AFTER_MS = 2500;

function formatTime(seconds) {
  if (!isFinite(seconds)) return "0:00";
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function createBar() {
  const host = document.createElement("div");
  host.id = "irc-bar";
  host.style.cssText = "position:fixed;z-index:2147483646;display:none;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      .bar { display: flex; flex-direction: column; gap: 4px; padding: 18px 10px 8px; box-sizing: border-box;
        background: linear-gradient(transparent, rgba(0, 0, 0, 0.75)); color: #fff;
        font: 600 12px/1 system-ui, sans-serif; }
      .row { display: flex; align-items: center; gap: 8px; }
      .spacer { flex: 1; }
      button { all: unset; cursor: pointer; padding: 4px 6px; border-radius: 4px; font-size: 14px; }
      button:hover { background: rgba(255, 255, 255, 0.2); }
      button.on { background: rgba(255, 255, 255, 0.35); }
      input[type="range"] { accent-color: #fff; cursor: pointer; margin: 0; }
      #seek { width: 100%; }
      #volume { width: 56px; }
      #time { white-space: nowrap; font-variant-numeric: tabular-nums; }
    </style>
    <div class="bar">
      <input id="seek" type="range" min="0" max="1000" value="0" />
      <div class="row">
        <button id="play" title="Play / pause (K)"></button>
        <span id="time"></span>
        <span class="spacer"></span>
        <button id="mute" title="Mute (M)"></button>
        <input id="volume" type="range" min="0" max="1" step="0.05" />
        <button id="speed" title="Kecepatan ([ ])"></button>
        <button id="auto" title="Auto-next (A)">⏭</button>
      </div>
    </div>`;
  for (const type of ["click", "dblclick", "mousedown", "pointerdown", "mouseup", "pointerup", "touchstart"]) {
    host.addEventListener(type, (e) => e.stopPropagation());
  }
  document.body.appendChild(host);
  return { host, $: (id) => root.getElementById(id) };
}

function initBar() {
  const { host, $ } = createBar();
  const play = $("play");
  const time = $("time");
  const seek = $("seek");
  const mute = $("mute");
  const volume = $("volume");
  const speed = $("speed");
  const auto = $("auto");

  let dragging = false;
  let lastMove = 0;
  let pointer = { x: -1, y: -1 };

  seek.addEventListener("pointerdown", () => (dragging = true));
  addEventListener("pointerup", () => (dragging = false), true);

  seek.oninput = () => {
    const video = currentVideo();
    if (video && video.duration) video.currentTime = (seek.value / 1000) * video.duration;
  };
  play.onclick = () => currentVideo() && actions.k(currentVideo());
  mute.onclick = () => currentVideo() && actions.m(currentVideo());
  volume.oninput = () => {
    const video = currentVideo();
    if (!video) return;
    video.volume = Number(volume.value);
    video.muted = video.volume === 0;
  };
  speed.onclick = () => setSpeed(SPEEDS[(SPEEDS.indexOf(settings.speed) + 1) % SPEEDS.length]);
  auto.onclick = () => actions.a();

  document.addEventListener(
    "mousemove",
    (e) => {
      pointer = { x: e.clientX, y: e.clientY };
      lastMove = Date.now();
    },
    true
  );

  function render() {
    const video = settings.enabled && currentVideo();
    if (!video) {
      host.style.display = "none";
      return requestAnimationFrame(render);
    }
    const r = video.getBoundingClientRect();
    const hovering =
      pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom;
    const visible = video.paused || dragging || (hovering && Date.now() - lastMove < HIDE_AFTER_MS);

    host.style.display = visible ? "block" : "none";
    if (visible) {
      host.style.left = `${Math.max(r.left, 0)}px`;
      host.style.width = `${Math.min(r.width, innerWidth - Math.max(r.left, 0))}px`;
      host.style.top = `${Math.min(r.bottom, innerHeight) - host.offsetHeight}px`;

      play.textContent = video.paused ? "▶" : "❚❚";
      time.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
      if (!dragging && video.duration) seek.value = (video.currentTime / video.duration) * 1000;
      mute.textContent = video.muted || video.volume === 0 ? "🔇" : "🔊";
      if (document.activeElement !== volume) volume.value = video.muted ? 0 : video.volume;
      speed.textContent = `${settings.speed}x`;
      auto.classList.toggle("on", settings.autoNext);
    }
    requestAnimationFrame(render);
  }
  render();
}

initBar();
