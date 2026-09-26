<div align="center">

# snapnote

**Label, file, and find your Windows screenshots without changing how you take them.**

[![Latest release](https://img.shields.io/github/v/release/EpicAryan/snapnote?label=latest&color=0ea5e9)](https://github.com/EpicAryan/snapnote/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![Platform: Windows](https://img.shields.io/badge/platform-Windows%2010%2F11-blue)

**[⬇ Download the latest installer for Windows (64-bit)](https://github.com/EpicAryan/snapnote/releases/latest/download/snapnote-x64-setup.exe)**

</div>

---

Keep pressing `Win+Shift+S`. snapnote watches your Screenshots folder, shows a small toast for each new capture, and lets you give it a label, notes, tags, and a folder in one keystroke. Files stay ordinary PNGs on your disk, renamed to `2026-09-26 your-label.png` and moved where you said. Everything else lives in a small local database, so later you open the library from the tray and search by any word you typed.

No account, no cloud, no telemetry.

## Features

- **Zero-friction capture.** Uses the Windows Snipping Tool you already have. The toast appears as soon as the file lands.
- **Label, notes, tags, folder.** `Ctrl+Shift+L` opens the label popup for the newest screenshot. The toast also offers your recent labels as one-click chips, each remembering the folder it went to last time.
- **Files stay yours.** Screenshots remain plain files in folders you chose. Uninstall snapnote and nothing is locked away.
- **A library that behaves like Explorer.** Search across labels, notes and tags; a sidebar with folders and tags and live counts; Ctrl/Shift multi-select; right-click menus; full keyboard control; a preview lightbox.
- **Bring files in.** Paste an image or files copied in Explorer (`Ctrl+V`), or drag them into the window.
- **Copy out.** `Ctrl+C` puts the file and its pixels on the clipboard, so Explorer, chat apps and image editors all accept it.
- **Safe delete.** Deletes go to the Recycle Bin and can be undone from the library for ten seconds.
- **Stays in sync.** Files you move or delete outside snapnote are re-checked whenever the library is focused, and every minute while it is open.

## Install

**Requirements:** Windows 10 or 11, 64-bit. The WebView2 runtime, which Windows 11 ships with; the installer fetches it on Windows 10 if it is missing.

1. Download **[snapnote-x64-setup.exe](https://github.com/EpicAryan/snapnote/releases/latest/download/snapnote-x64-setup.exe)** from the [latest release](https://github.com/EpicAryan/snapnote/releases/latest).
2. Run it. The installer is not code-signed yet, so Windows SmartScreen may show "Windows protected your PC". Click **More info**, then **Run anyway**.
3. Pick an install folder, or keep the default. snapnote starts, sits in the system tray, and is set to start with Windows (you can turn that off in Settings).
4. Take a screenshot with `Win+Shift+S`. When the toast appears, press `Ctrl+Shift+L` or click it.

**Updating.** Run the new installer over the old one. It upgrades in place; your library is untouched.

**Uninstalling.** Use *Settings › Apps* or `uninstall.exe` in the install folder. Your screenshots are ordinary files and stay where they are. The library database stays in `%LOCALAPPDATA%\snapnote`; delete that folder if you want a clean slate.

## Using it

| Where | What |
|---|---|
| Toast (bottom right) | Click to label. Click a recent label chip to apply it and its folder in one go. Hover to pause the countdown. |
| Label popup | Label, notes, tags, destination folder. `Enter` saves, `Esc` cancels, `Ctrl+Enter` saves from inside Notes. *Browse…* picks a new folder and remembers it as a destination. |
| Tray icon | Left-click labels the newest screenshot. Right-click for Library, Settings, Quit. |
| Library | Search, sidebar filters, cards, details pane. Right-click a card, or press `?` for every shortcut. |

Keyboard in the library: arrows, `Home`/`End`, `PageUp`/`PageDown` move; `Shift` extends the selection, `Ctrl+click` toggles, `Ctrl+A` selects all; `Enter` opens, `Space` previews, `F2` edits, `Delete` deletes (with Undo), `Ctrl+C` copies, `Ctrl+V` pastes, `/` searches, `Esc` closes.

### Where things live

| Item | Location |
|---|---|
| Watched folder | Your Pictures › Screenshots folder (OneDrive-aware). Change it in Settings. |
| Library database | `%LOCALAPPDATA%\snapnote\snapnote.db` (SQLite) |
| Thumbnail cache | `%LOCALAPPDATA%\snapnote\thumbs` (safe to clear from Settings) |
| Program files | The install folder you chose |

## Build from source

Prerequisites (Windows):

- [Node.js](https://nodejs.org) 20 or newer
- [Rust](https://rustup.rs) stable with the MSVC toolchain
- Visual Studio Build Tools with the *Desktop development with C++* workload (MSVC compiler and a Windows 10/11 SDK)
- WebView2 runtime (present on Windows 11)

```powershell
git clone https://github.com/EpicAryan/snapnote.git
cd snapnote
npm install
npm run tauri dev          # run with hot reload
```

Tests and a release build:

```powershell
npx vitest run             # frontend tests
cd src-tauri
cargo test --workspace     # Rust tests (core crate and app)
cd ..
npm run tauri build        # installer at src-tauri\target\release\bundle\nsis\
```

### Layout

```
src/                 React + TypeScript front end (library, popup, toast windows)
src-tauri/core/      Rust core crate: database, search, file moves, watcher (no Tauri)
src-tauri/src/       Tauri app: windows, tray, hotkey, commands, clipboard
```

## Contributing

Bug reports, ideas and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the setup, the conventions, and how to open a PR. In short: fork, branch from `main`, keep the tests green, open a pull request against `main` using the template.

## Roadmap

- OCR so the text inside screenshots becomes searchable
- Favourites and pinning
- Undo for older delete batches, not only the last one

## License

snapnote is released under the [MIT License](LICENSE). You may use, copy, modify and redistribute it, including commercially, as long as the copyright and license notice stay with the code. If you build something on top of it, a visible credit linking back to this repository is appreciated.

Copyright © 2026 Aryan Kumar
