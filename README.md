# snapnote

Label, file, and find your Windows screenshots without changing how you take them.

Take a screenshot with Win+Shift+S as usual. snapnote notices the saved file and shows a
small toast. Press Ctrl+Shift+L (or click it) to add a label, notes, and pick a destination
folder. The file is renamed to `YYYY-MM-DD your-label.png` and moved where you said. Later,
open the library from the tray and search by any word in the label or notes.

Everything is local: one SQLite file and a thumbnail cache under `%LOCALAPPDATA%\snapnote`.

## Develop (Windows PowerShell)

Prerequisites: Node 20+, Rust (rustup, MSVC toolchain), Visual Studio Build Tools with the
C++ compiler and a Windows SDK, WebView2 runtime (present on Windows 11).

    cd C:\dev\snapnote
    npm install
    npm run tauri dev        # runs the app with hot reload
    npm test                 # frontend tests (Vitest)
    cd src-tauri; cargo test --workspace   # Rust tests (core crate + app)

Design spec: `docs/superpowers/specs/2026-09-26-snapnote-design.md`.
Implementation plan: `docs/superpowers/plans/2026-09-26-snapnote-v1.md`.
Release checklist: `docs/smoke-checklist.md`.
