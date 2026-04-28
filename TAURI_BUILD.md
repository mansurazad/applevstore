# Apple Store POS — Tauri Desktop Build Guide

Lovable Cloud sync + IndexedDB offline storage already work in the web app.
Tauri wraps the same React/Vite build into a native Windows / macOS / Linux app.

## 1. One-time setup (on your local machine)

### Install Rust

```bash
# macOS / Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Windows (PowerShell)
winget install Rustlang.Rustup
```

Then restart the terminal and verify:
```bash
rustc --version
cargo --version
```

### Install platform build tools

| OS | Required |
|----|----------|
| **Windows** | [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) + WebView2 (preinstalled on Win11) |
| **macOS** | `xcode-select --install` |
| **Linux** | `sudo apt install libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev` |

### Install Tauri CLI

```bash
npm install --save-dev @tauri-apps/cli@^2
```

## 2. Generate app icons (one-time)

```bash
npx tauri icon ./public/lovable-uploads/3926e988-d85b-4bf1-8f3e-71bdbe4a2e70.png
```

This populates `src-tauri/icons/` with all required sizes & formats.

## 3. Add convenience scripts to `package.json`

Add inside `"scripts"`:

```json
"tauri": "tauri",
"tauri:dev": "tauri dev",
"tauri:build": "tauri build"
```

## 4. Run in dev mode

```bash
npm run tauri:dev
```

This opens a native window pointing at the local Vite dev server. Hot reload works.

## 5. Build production installers

```bash
npm run tauri:build
```

Output locations:

| Platform | File |
|----------|------|
| Windows  | `src-tauri/target/release/bundle/msi/Apple Store_1.0.0_x64_en-US.msi` |
| Windows  | `src-tauri/target/release/bundle/nsis/Apple Store_1.0.0_x64-setup.exe` |
| macOS    | `src-tauri/target/release/bundle/dmg/Apple Store_1.0.0_aarch64.dmg` |
| Linux    | `src-tauri/target/release/bundle/appimage/apple-store-pos_1.0.0_amd64.AppImage` |
| Linux    | `src-tauri/target/release/bundle/deb/apple-store-pos_1.0.0_amd64.deb` |

## 6. Multi-user / Offline behavior in desktop app

- Each authenticated user gets an isolated IndexedDB inside the WebView (`applestore_<userId>`).
- Sync engine runs every 60 s plus on reconnect/login (same as web).
- Sync errors are stored locally and visible via the **"X টি ত্রুটি"** badge in the POS / Dashboard headers — clicking opens a list with **"পুনরায় চেষ্টা"** button.
- Stock validation works fully offline using the local DB; sale completion is blocked if requested quantity exceeds local stock.
- POS invoices are rendered entirely from local data — no network round-trip after checkout.

## 7. Auto-update (optional, later)

Tauri 2 supports built-in updater via signed releases. To enable:
1. Generate signing keys: `npx tauri signer generate`
2. Add `updater` block to `tauri.conf.json` with your update endpoint.
3. Host signed `latest.json` + bundles on a static URL.

Skip this until you have a release distribution channel.

## 8. Troubleshooting

- **Blank window on Windows**: install [Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).
- **Build fails on Linux with `webkit2gtk` missing**: install the dev package shown above.
- **macOS "app is damaged"**: codesign + notarize, or `xattr -cr "/Applications/Apple Store.app"`.