# Reels Control Bar

A Chrome extension (Manifest V3) that adds playback controls to Reels on instagram.com: a media-player-style control bar, keyboard shortcuts, playback speed and auto-next.

> This is an unofficial extension. It is not affiliated with, endorsed by or sponsored by Instagram or Meta.

## Features

- **Control bar** at the bottom of the video with a seek bar, play/pause, current time, speed and auto-next. It has no background, so the video stays fully visible.
- **Keyboard shortcuts** for the main controls.
- **Playback speed** from 0.5x to 2x, remembered across reels.
- **Unmute carries over between reels.** Unmuting with the `M` key or Instagram's own button stays in effect when you move to another reel.
- **Auto-next** moves on to the next reel when the current one is about to loop.
- **Popup** to enable or disable the extension and change settings.

## Installation

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this project folder.
4. Go to [instagram.com](https://www.instagram.com) and play a reel.

After changing the code, click the reload icon on the extension's card in `chrome://extensions`, then refresh the Instagram tab (`Ctrl+Shift+R`).

## Usage

### Control bar

The bar appears when you move the mouse over the video and hides after 2.5 seconds without movement. It stays visible while the video is paused. It stops just short of Instagram's own mute button, so that button stays clickable while the bar is showing.

| Control | Action |
|---|---|
| Seek bar | Click or drag to jump to a position |
| ▶ / ❚❚ | Play / pause |
| `1x` dropdown | Choose a speed: 0.5x, 0.75x, 1x, 1.25x, 1.5x, 1.75x or 2x |
| ⏭ | Turn auto-next on or off |

### Keyboard shortcuts

Shortcuts are ignored while you are typing in a comment box, a message or any other text field.

| Key | Action |
|---|---|
| `K` | Play / pause |
| `J` / `L` | Rewind / skip forward 5 seconds |
| `N` / `P` | Next / previous reel |
| `M` | Mute / unmute |
| `[` / `]` | Slower / faster |
| `0` | Reset speed to 1x |
| `A` | Turn auto-next on or off |

### Popup

Click the extension icon to enable or disable the extension, turn auto-next on or off, and choose the default speed.

## Project structure

| File | Purpose |
|---|---|
| `manifest.json` | Extension configuration. The content script runs only on `https://www.instagram.com/*`. |
| `icons/` | Extension icons (16, 48 and 128 px) |
| `tools/make_icons.py` | Draws the icons with no dependencies: `python3 tools/make_icons.py icons` |
| `content.js` | Main logic: current reel detection, shortcuts, speed, auto-next and the control bar |
| `content.css` | Styles for the small on-screen notification (toast) |
| `popup.html`, `popup.js` | Settings popup |
| `PRIVACY.md` | Privacy policy |

## How it works

- **Current reel detection:** the extension picks the `<video>` element with the largest visible area in the viewport.
- **Control bar:** it lives in a shadow DOM so Instagram's CSS can't affect it. Clicks on the bar are not passed on to Instagram, so they don't pause the video.
- **Auto-next:** reels loop forever, so the `ended` event never fires. The extension moves on when about 0.3 seconds of the video are left.
- **Moving between reels** (`N`/`P` and auto-next) scrolls the reel container by the height of the video.
- **Mute:** Instagram keeps its own mute state, applies it to every replay and new reel, and reverts a `video.muted` value changed from outside. So the extension mutes and unmutes by clicking Instagram's own mute button instead of setting the video property. That way Instagram's state changes too and carries over to the next reel.
- **Settings** are stored in `chrome.storage.sync`.

## Permissions

- `storage`: saves your settings.
- Host access to `https://www.instagram.com/*`: where the content script runs.

The extension does not send data to any server. See [PRIVACY.md](PRIVACY.md).

## Limitations

- Instagram changes its page structure often. If `N`/`P` or auto-next stop working, the scroll logic in `step()` and `scrollParent()` in `content.js` may need updating.
- The control bar is positioned from the `<video>` element, so it follows the video's size on both the reels page and a single reel page.
- Muting through Instagram's button isn't always followed by the video. In testing on the `/reels/` page, the label changed to "Audio is muted" but `video.muted` sometimes stayed `false`. That is Instagram's own behavior. Unmuting, the main use case, works normally.
- Instagram's mute button is found by its position and icon inside the video area. If Instagram changes its layout, muting from the extension may stop working.
- The mute state is not saved between sessions. Instagram always starts muted, and Chrome doesn't allow unmuting before the user has interacted with the page.

## Troubleshooting

**The control bar doesn't appear.**
1. Reload the extension in `chrome://extensions`, then refresh the Instagram tab.
2. Open the Console (`F12`) and run `document.getElementById('irc-bar')`. A result of `null` means the content script didn't load. Check the **Errors** button on the extension's card.
3. Make sure the mouse is moving over the video.

**Shortcuts don't work.** Make sure focus isn't in a text field and the extension is switched on in the popup.
