# Contributing to snapnote

Thanks for taking the time. This page covers the setup, the conventions, and how to get a change merged.

## Ways to help

- **Report a bug.** Open an issue with the *Bug report* template. Include your Windows version, the snapnote version (the installer file name, or *Settings › Apps* in Windows), and the steps to reproduce.
- **Suggest a feature.** Open an issue with the *Feature request* template. Say what you were trying to do, not only the solution you have in mind.
- **Send a pull request.** Small, focused changes are easiest to review. For anything larger than a bug fix, open an issue first so we can agree on the approach.

## Ground rules

- Windows is the only supported platform for now. Keep platform-specific code behind `#[cfg(windows)]` with a stub for other targets, so the crate still compiles elsewhere.
- Screenshots are the user's files. Never delete a file outright (use the Recycle Bin), never move one without recording where it went, never read file contents in bulk (OneDrive placeholders must stay in the cloud).
- No telemetry, no network calls.
- Every behaviour change comes with a test. The core crate has no Tauri dependency on purpose, so most logic can be tested there.

## Setup

Prerequisites: Node.js 20+, Rust stable (MSVC toolchain), Visual Studio Build Tools with the C++ workload and a Windows SDK, WebView2 runtime.

```powershell
git clone https://github.com/<you>/snapnote.git
cd snapnote
npm install
npm run tauri dev
```

The three windows (library, popup, toast) are separate Vite pages under `src/windows`. The front end talks to Rust through the `Commands` interface in `src/lib/commands.ts`; `commands.mock.ts` is an in-memory implementation used by the tests, so most UI work can be developed and tested without Tauri.

## Running the checks

```powershell
npx tsc --noEmit -p tsconfig.json   # types
npx vitest run                      # front end
cd src-tauri
cargo test --workspace              # core crate and app
cargo build                         # must be warning-free
```

All of these must pass before a pull request is opened.

## Making a change

1. Fork the repository and create a branch from `main`: `git checkout -b feat/short-name` or `fix/short-name`.
2. Write the failing test first when you can, then the code.
3. Keep commits focused. Commit messages use `type(scope): summary` in the imperative, for example `fix(library): keep the selection after a refresh`. The body explains *why*.
4. Update `README.md` if the change affects how the app is installed or used.
5. Open a pull request against `main` and fill in the template. Describe what changed, why, and how you verified it. Add a screenshot or a short clip for UI changes.

A maintainer reviews the PR, may ask for changes, and merges it. Releases are cut from `main` by tagging a version; the installer attached to the release is built with `npm run tauri build`.

## Project layout

```
src/
  lib/                 Commands interface, Tauri bindings, in-memory mock, shared helpers
  components/          Reusable UI (context menu, tag input, destination select)
  windows/library/     Library window: grid, sidebar, details pane, lightbox, settings
  windows/popup/       Label popup
  windows/toast/       Toast shown after a capture
src-tauri/
  core/                Rust core crate: SQLite store, FTS search, moves, watcher, thumbnails
  src/                 Tauri app: windows, tray, hotkey, commands, clipboard, undo
  migrations/          SQL migrations applied by user_version
```

## Reporting security issues

If you find something that could expose a user's files or data, open an issue titled "Security" without the details, and a maintainer will get in touch for the specifics.
