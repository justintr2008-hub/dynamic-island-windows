# Dynamic Island

The iPhone's Dynamic Island for your laptop: a spring-animated pill at the edge of the screen that shows what is happening right now: Claude Code sessions (with Allow/Deny and Continue Session right in the pill), music, downloads, timers, screenshots, the clipboard, your mic and camera, and system events.

**[Download Dynamic-Island.exe](https://github.com/justintr2008-hub/dynamic-island-windows/releases/latest/download/Dynamic-Island.exe)** for Windows, or **[Dynamic-Island.dmg](https://github.com/justintr2008-hub/dynamic-island-windows/releases/latest/download/Dynamic-Island.dmg)** for Mac (always the newest version)

Built on [Island](https://github.com/cutsandedges21/windows-dynamic-island). This version adds:

- **Cards that grow out of the island**, like holding the iPhone's: hover it (or let a Claude chat finish) and the pill itself grows into the card, then shrinks back into it.
- **A music card** with the album art, a scrubber you can click to jump through the song, and back / play-pause / forward.
- **Claude Status**: every Claude session as a dot on the island (Claude Code, the Claude app and Claude in Chrome), with its progress, and a card listing them all. Nothing else to install. A session turns purple while a shell it started is still running (Claude Code's "1 shell"), with a bar once that command has been timed before.
- **A Glass look with a Clear ↔ Tinted slider**, like iOS Liquid Glass.

## Run it

**Windows 10 or 11**

1. Download `Dynamic-Island.exe` (link above) and double-click it. That one file is the whole app: no installer, nothing else to download, and it keeps itself up to date (Settings › Startup › Update automatically). The exe is not code-signed, so the first time Windows may say it protected your PC: click **More info › Run anyway**.
2. The island appears at the top centre of your main display. The first time, a short setup asks what you use the PC for, fills the Control Center from your answers, and offers a Local AI model picked for your PC's memory and graphics (`docs/ONBOARDING.md`). Settings › Run setup again repeats it.
3. Right-click the island for positions, Do not disturb and Activities. The tray icon has the same, plus your Claude sessions.

**Mac** (early: some activities say "Coming to Mac")

1. Download `Dynamic-Island.dmg` (link above), open it and drag Island into Applications.
2. The first time, right-click Island in Applications › **Open** › **Open** (it is not signed with an Apple developer ID).
3. If macOS says Island "is damaged", run `xattr -cr /Applications/Island.app` in Terminal and open it again.

## Use it

| Do | What happens |
|---|---|
| Hover the island | It grows into a card for what you point at (the song, your Claude sessions, …) and shrinks back when you move away |
| Click it | It opens to its widest |
| Click anywhere else | It goes back to its resting size |
| Scroll on it | Moves to the next thing that is happening, one per scroll |
| Right-click it | Positions (top, right, bottom, left), Activities, Settings, and Quiet at the far end. While Quiet is on, a small moon shows on the pill |
| `Alt+Shift+Space` | Open or close the island |
| `Alt+Shift+A` | Activities window |
| `Alt+Shift+1`–`9`, `Alt+Shift+0` | Switch to a Claude session / the one that needs you (if Usage Clip isn't holding them) |

On the left or right edge the island stands vertical. Text stays upright.

**Settings › Appearance** sets the pill colour (Black, White, Matte white, Matte black, Glass). With Glass, a **Clear ↔ Tinted** slider sets how see-through it is: Clear shows the desktop through it, Tinted frosts it over.

## Claude Code

Everything Usage Clip shows is here: plan limits with the pace tick, tokens this week, every running session with its status, closed chats (reopen them), and Claude app chats. Usage Clip's readings are reused while it runs, so the two apps don't fight over the usage API.

Turn on the hooks for the rest: **Activities › Claude Code › Install hooks…**. You see the exact change to `%USERPROFILE%\.claude\settings.json` first, a dated backup is made, and your own hooks stay. Then:

- **Permission requests** show in the island with **Deny / Allow**. Clicking outside the island hands the question back to the terminal.
- **Claude finished** shows with **Continue**. Type your next prompt in the pill and it goes to the same session:
  - editor chats (VS Code, Cursor, Windsurf) open with your prompt through the extension's own link;
  - terminal chats get the prompt typed into their console;
  - closed chats resume with `claude --resume` in a minimized console, and show up live again.

## Activities

**Activities** (tray, right-click menu, or `Alt+Shift+A`) is where you choose what the island shows. Drag cards between High, Medium, Low and Available, flip behaviours (Auto-show, Persistent, Interactive, Interrupt), and drag the three width handles to resize the island live.

**Local AI › Models** lists this PC's specs and every model Island can download, with the one that suits the PC marked Recommended: download, switch, cancel or delete them there.

Other programs can push their own activities: see `docs/ACTIVITY-API.md`.

## Build it

```sh
npm install
npm test               # Vitest: engine + Usage Clip's own tests on the copied logic
npm run dev            # the island in a normal browser with demo data
npm run app            # the real app with live reload
npm run release        # release\Island.exe, the one file to hand out (the hook relay is built into it)
```

To publish a release: bump the version (`package.json`, `Cargo.toml`, `src-tauri/tauri.conf.json`), then push a tag, e.g. `git tag v0.2.9` and `git push mine v0.2.9`. GitHub builds `Dynamic-Island.exe` and `Dynamic-Island.dmg` and publishes them (`.github/workflows/release.yml`); installed copies update themselves.

The Rust build cache goes to `%LOCALAPPDATA%\windows-dynamic-island\target`, outside OneDrive. Logs: `%LOCALAPPDATA%\Island\island.log`.

More: `docs/ARCHITECTURE.md` (how it works), `docs/SPEC.md` (the product spec), `docs/STATUS.md` (build log).
