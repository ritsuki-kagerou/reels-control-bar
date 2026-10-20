const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SEEK_STEP = 5;

const settings = { enabled: true, autoNext: false, speed: 1 };

chrome.storage.sync.get(settings, (s) => Object.assign(settings, s));
chrome.storage.onChanged.addListener((changes) => {
  for (const [key, { newValue }] of Object.entries(changes)) settings[key] = newValue;
  const video = currentVideo();
  if (video) video.playbackRate = settings.speed;
});

// Instagram keeps its own mute state and re-applies it to every replay and new reel, and it
// reverts a `video.muted` set from outside. Mute has to go through Instagram's own button.
function nativeMuteButton(video) {
  const v = video.getBoundingClientRect();
  const inside = [...document.querySelectorAll('[role="button"]')].filter((el) => {
    const r = el.getBoundingClientRect();
    return (
      r.width > 0 && r.width <= 48 && r.height <= 48 &&
      r.left >= v.left && r.right <= v.right && r.top >= v.top && r.bottom <= v.bottom &&
      el.querySelector("svg")
    );
  });
  const labelled = inside.find((el) => /audio|mute|sound|volume/i.test(el.querySelector("svg").getAttribute("aria-label") || ""));
  return labelled || inside[inside.length - 1];
}

// Instagram updates video.muted a moment after the click, so a burst of calls (a double click or a
// key repeat) would otherwise toggle the button back and forth.
const MUTE_COOLDOWN_MS = 300;
let lastMuteClick = 0;

function setMuted(video, muted) {
  if (video.muted === muted || Date.now() - lastMuteClick < MUTE_COOLDOWN_MS) return;
  const button = nativeMuteButton(video);
  if (button) {
    lastMuteClick = Date.now();
    button.click();
  } else {
    video.muted = muted;
  }
}

function save(patch) {
  Object.assign(settings, patch);
  chrome.storage.sync.set(patch);
}

// Grids (explore, profiles, home) hold many small preview videos; only reel pages and the
// post/reel dialog opened from a grid have a video worth controlling.
function candidateVideos() {
  if (/^\/(reels?|p|tv)\//.test(location.pathname)) return document.querySelectorAll("video");
  return document.querySelectorAll('[role="dialog"] video');
}

// The reel whose visible area in the viewport is the largest.
function currentVideo() {
  let best = null;
  let bestArea = 0;
  for (const video of candidateVideos()) {
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
    const muted = !video.muted;
    setMuted(video, muted);
    toast(muted ? "Muted" : "Unmuted");
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
    if (!(e.target instanceof HTMLVideoElement)) return;
    e.target.playbackRate = settings.speed;
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
const BAR_GAP_PX = 8;

function formatTime(seconds) {
  if (!isFinite(seconds)) return "0:00";
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M6 6.2v11.6a1 1 0 0 0 1.55.83l8.2-5.8a1 1 0 0 0 0-1.66l-8.2-5.8A1 1 0 0 0 6 6.2z"/><rect x="17" y="5.5" width="2.5" height="13" rx="1"/></svg>',
};

function createBar() {
  const host = document.createElement("div");
  host.id = "irc-bar";
  host.style.cssText = "position:fixed;z-index:2147483646;display:none;transition:opacity 0.18s;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      .bar { display: flex; flex-direction: column; gap: 2px; padding: 0 16px; box-sizing: border-box;
        color: #fff; font: 500 12px/1 system-ui, sans-serif;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55)); }
      .row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; height: 28px; }
      .spacer { flex: 1; }
      button { all: unset; cursor: pointer; display: grid; place-items: center; width: 28px; height: 28px;
        border-radius: 50%; color: rgba(255, 255, 255, 0.85); transition: background 0.15s, color 0.15s, transform 0.1s; }
      button:hover { background: rgba(255, 255, 255, 0.18); color: #fff; }
      button:active { transform: scale(0.92); }
      button.on { background: #fff; color: #000; }
      button svg { width: 18px; height: 18px; fill: currentColor; }
      input[type="range"] { -webkit-appearance: none; appearance: none; width: 100%; height: 14px; margin: 0;
        background: transparent; cursor: pointer; --p: 0%; }
      input[type="range"]::-webkit-slider-runnable-track { height: 3px; border-radius: 2px; transition: height 0.12s;
        background: linear-gradient(to right, #fff var(--p), rgba(255, 255, 255, 0.3) var(--p)); }
      input[type="range"]:hover::-webkit-slider-runnable-track { height: 5px; }
      input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; margin-top: -4.5px;
        border-radius: 50%; background: #fff; transform: scale(0); transition: transform 0.12s; }
      input[type="range"]:hover::-webkit-slider-thumb { transform: scale(1); }
      select { appearance: none; cursor: pointer; padding: 5px 8px; border: 0; border-radius: 999px; outline: 0;
        background: rgba(255, 255, 255, 0.14); color: #fff; font: inherit; font-weight: 600; transition: background 0.15s; }
      select:hover { background: rgba(255, 255, 255, 0.26); }
      select option { background: #1c1c1e; color: #fff; }
      #time { white-space: nowrap; margin-left: 4px; color: rgba(255, 255, 255, 0.85); font-variant-numeric: tabular-nums; }
    </style>
    <div class="bar">
      <input id="seek" type="range" min="0" max="1000" value="0" />
      <div class="row" id="row">
        <button id="play" title="Play / pause (K)"></button>
        <span id="time"></span>
        <span class="spacer"></span>
        <select id="speed" title="Speed ([ ])"></select>
        <button id="auto" title="Auto-next (A)">${ICON.next}</button>
      </div>
    </div>`;
  for (const type of ["click", "dblclick", "mousedown", "pointerdown", "mouseup", "pointerup", "touchstart"]) {
    host.addEventListener(type, (e) => e.stopPropagation());
  }
  document.body.appendChild(host);
  return { host, root, $: (id) => root.getElementById(id) };
}

function initBar() {
  const { host, root, $ } = createBar();
  const play = $("play");
  const time = $("time");
  const seek = $("seek");
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
  for (const value of SPEEDS) speed.add(new Option(`${value}x`, value));
  speed.onchange = () => {
    setSpeed(Number(speed.value));
    speed.blur(); // a focused <select> would also react to the keyboard shortcuts
  };
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
    // The open dropdown list is drawn outside the page, so the mouse over it isn't "hovering".
    const choosingSpeed = root.activeElement === speed;
    const visible =
      video.paused || dragging || choosingSpeed || (hovering && Date.now() - lastMove < HIDE_AFTER_MS);

    // Fade instead of toggling display so the bar eases in and out; it keeps its layout box
    // (needed to pin it to the reel's bottom) but ignores the mouse while faded out.
    host.style.display = "block";
    host.style.opacity = visible ? "1" : "0";
    host.style.pointerEvents = visible ? "auto" : "none";
    if (visible) {
      // Stop short of Instagram's mute button so it stays clickable while the bar is showing.
      const native = nativeMuteButton(video);
      const left = Math.max(r.left, 0);
      const right = Math.min(native ? native.getBoundingClientRect().left - BAR_GAP_PX : r.right, innerWidth);
      host.style.left = `${left}px`;
      host.style.width = `${Math.max(right - left, 0)}px`;
      // Center the control row on Instagram's mute button so the two read as one strip.
      const row = $("row");
      const rowCenter = row.offsetTop + row.offsetHeight / 2;
      const mid = native
        ? native.getBoundingClientRect().top + native.getBoundingClientRect().height / 2
        : Math.min(r.bottom, innerHeight) - 30;
      host.style.top = `${mid - rowCenter}px`;

      const icon = video.paused ? ICON.play : ICON.pause;
      if (play.dataset.icon !== icon) {
        play.dataset.icon = icon;
        play.innerHTML = icon;
      }
      time.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
      if (!dragging && video.duration) seek.value = (video.currentTime / video.duration) * 1000;
      seek.style.setProperty("--p", `${seek.value / 10}%`);
      speed.value = String(settings.speed);
      auto.classList.toggle("on", settings.autoNext);
    }
    requestAnimationFrame(render);
  }
  render();
}

initBar();
