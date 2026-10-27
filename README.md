# PureCut AI — In-Browser Neural Background Remover ✂️

A 100% client-side, zero-backend background removal web application running deep neural network inference directly in your web browser via **WebAssembly** and **ONNX Runtime Web**.

> **Privacy Guarantee**: Photos never leave your computer. All processing happens entirely inside your browser's client-side sandbox. No servers, no accounts, and no API keys required.

---

## 🚀 Quick Start / How to Run Locally

Because modern web browsers block WebAssembly and ES Modules over the `file://` protocol due to CORS security policies, run a simple local web server:

### Option 1: Python (Pre-installed on most systems)
```bash
# In the project directory (D:\FullStack-Project\RemoveBGApp):
python -m http.server 3000
```
Then visit `http://localhost:3000` in your browser.

### Option 2: Node.js (npx serve)
```bash
npx serve . -l 3000
```
Then visit `http://localhost:3000` in your browser.

### Option 3: VS Code Live Server
1. Install the **Live Server** extension in Visual Studio Code.
2. Right-click `index.html` and click **"Open with Live Server"**.

---

## 🛠️ Architecture & Technology Choices

### Why Plain HTML5 + CSS3 + Modern JavaScript (ES Modules)?
- **Zero Build Toolchain**: No `node_modules` bloating, no bundlers (Webpack/Vite) to configure or troubleshoot.
- **Instant Deployment**: Pure static files ready to be hosted on GitHub Pages, Cloudflare Pages, Vercel, or Netlify with zero build steps.
- **Full Control over Web Worker & Canvas Compositing**: Direct access to browser APIs (`CanvasRenderingContext2D`, `crypto.randomUUID()`, `ClipboardItem`, and `URL.revokeObjectURL()`).

### Libraries Used (Loaded via CDN)
1. **`@imgly/background-removal@1.5.7`** (jsDelivr pinned ESM):
   - Executes ISNet neural networks locally via WebAssembly ONNX Runtime.
   - Offloaded to a dedicated Web Worker so the main browser thread stays fluid and responsive.
   - Pinned asset path: `https://staticimgly.com/@imgly/background-removal-data/1.5.7/dist/`.
2. **`JSZip@3.10.1`** (Cloudflare CDN):
   - Fast client-side zip file generation for batch multi-image queues.

---

## ✨ Features Checklist

- [x] **Drag-and-Drop & File Picker**: Supports JPG, PNG, and WebP up to 10 MB with format & size validation.
- [x] **Paste from Clipboard (`Ctrl+V`)**: Seamlessly paste screenshots and copied images directly into the browser.
- [x] **Progress & Status Feedback**: Visual progress bar tracking model download and inference stages.
- [x] **First-Time Model Caching**: Explicit note explaining the one-time ~44MB model download; subsequent runs run from local cache.
- [x] **Before / After Draggable Split View**: Interactive slider with touch, mouse, and keyboard navigation over a transparency checkerboard.
- [x] **Background Customization**:
  - Transparent mode (default checkerboard pattern).
  - 8 curated studio preset colors (White, Off-white, Charcoal, Ocean Blue, Emerald, Chroma Green, etc.).
  - Custom HTML5 hex color picker.
  - Custom background image uploader with remove toggle.
- [x] **Full-Resolution Export**:
  - **Download PNG**: Preserves original image dimensions and transparency.
  - **Download JPG**: Renders onto selected background color at 100% original dimensions.
  - **Copy to Clipboard**: Copies the cutout directly into your clipboard.
- [x] **Multi-Image Batch Queue**: Queue multiple photos sequentially, inspect status, and click **"Download All (ZIP)"**.
- [x] **Memory Leak Prevention**: Systematic revocation of `blob:` object URLs (`URL.revokeObjectURL`).
- [x] **Responsive & Accessible**: Dark/Light mode toggle (with system preference detection and localStorage persistence), ARIA labels, and keyboard controls.
