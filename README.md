<div align="center">

# 🪣 R2 Manager

**A modern, desktop GUI client for Cloudflare R2 and S3-compatible object storage.**

[![Status: Alpha](https://img.shields.io/badge/status-alpha%20%2F%20experimental-orange?style=flat-square)](#-work-in-progress--alpha-status)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-44-47848F?style=flat-square&logo=electron&logoColor=white)](#)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](#)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](#)

<p align="center">
  Manage multiple accounts, browse buckets, upload whole directory trees, and inspect objects with live presigned URLs.
</p>

</div>

---

> [!WARNING]
> ### ⚠️ Work in Progress / Alpha Status
> This software is currently in active development (**Alpha**). Some features may have rough edges, occasional bugs, or unexpected behavior. Use with caution in production environments, and please feel free to report issues or submit PRs!

---

## 🌟 Highlights

- **Multiple Account Profiles** — Native presets for Cloudflare R2, AWS S3, MinIO, Backblaze B2, Wasabi, DigitalOcean Spaces, or custom S3 endpoints.
- **Bucket-Scoped Tokens & Sub-Paths** — Automatic fallback for R2 tokens without account-level `ListBuckets` permission, plus support for path scoping (e.g. `assets/images/`).
- **Object Browser** — Virtualized list handling thousands of keys, folder breadcrumbs, in-folder search, and grid view.
- **Transfers** — Multi-file and directory uploads with multipart support + live progress tracking; downloads streamed straight to disk.
- **Object Inspector** — Size, MIME types, ETag, storage class, custom metadata, and one-click presigned URL generation.
- **Security-First Credential Storage** — Credentials encrypted at rest using machine-bound AES-256-GCM / OS keychain; secret keys never cross into the renderer process.
- **Keyboard-Driven** — Full command palette (`⌘K` / `Ctrl+K`) and keyboard navigation.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>⌘ K</kbd> / <kbd>Ctrl + K</kbd> | Open Command Palette |
| <kbd>⌘ U</kbd> / <kbd>Ctrl + U</kbd> | Upload files |
| <kbd>⌘ ⇧ D</kbd> / <kbd>Ctrl + Shift + D</kbd> | Download selection |
| <kbd>⌘ ⌫</kbd> / <kbd>Ctrl + Backspace</kbd> | Delete selection |
| <kbd>⌘ \`</kbd> / <kbd>Ctrl + \`</kbd> | Toggle sidebar |
| <kbd>Backspace</kbd> | Go up one folder |
| <kbd>↑</kbd> <kbd>↓</kbd> / <kbd>↵</kbd> | Navigate and run commands in the palette |
| <kbd>Space</kbd> | Toggle selection in file list |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v20+ recommended)
- **Yarn Berry** (`yarn@4.x`)

### Installation & Development

```bash
# Clone the repository
git clone https://github.com/SAM-AEL/r2-manager.git
cd r2-manager

# Install dependencies
yarn install

# Start in development mode with hot reload
yarn dev

# Run test suite
yarn test

# Build for production
yarn build

# Package standalone installers
yarn dist
```

---

## ☁️ Connecting Cloudflare R2

1. Open your **Cloudflare Dashboard → R2 → Manage R2 API Tokens**.
2. Create an API token with **Object Read & Write** permissions.
3. In R2 Manager, click **Connect an account → Cloudflare R2**.
4. Enter your **Account ID** (the endpoint automatically becomes `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`).
5. Paste your **Access Key ID** and **Secret Access Key**, then click **Test connection**.

> [!TIP]
> **Bucket-Scoped Tokens:** If your token only has access to a specific bucket, enter the bucket name directly in the **Bucket** field. The app will probe the bucket with `HeadBucket` instead of requiring account-wide `ListBuckets` permission.

---

## 🏗️ Architecture

```
src/
├── main/               # Electron Main process
│   ├── index.ts        # App lifecycle, hardened BrowserWindow & CSP
│   ├── ipc/            # Typed IPC handlers with sender validation
│   ├── s3/             # S3 client factory, operations, transfer queue
│   ├── store.ts        # Settings & profiles persistence (atomic writes)
│   └── vault.ts        # Machine-bound AES-256-GCM key derivation & storage
├── preload/            # Context bridge with isolated IPC API
├── renderer/           # React 19 UI
│   ├── components/     # Virtualized file table, inspector, dialogs
│   ├── store/          # Zustand state management
│   └── hooks/          # Keyboard shortcuts & action bindings
└── shared/             # Shared TypeScript types and IPC channel contracts
```

---

## 🤝 Contributing

Contributions, bug reports, and suggestions are welcome! Because this project is in **Alpha**, feel free to open an issue or pull request to help improve stability and features.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
