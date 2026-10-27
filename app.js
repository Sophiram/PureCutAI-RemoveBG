/**
 * PureCut AI — In-Browser Neural Background Removal
 * 
 * Powered by @imgly/background-removal (ONNX / WebAssembly)
 * All inference runs 100% locally in the browser with zero server communication.
 */

import { removeBackground } from 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.7/+esm';

// ============================================================================
// Constants & Configuration
// ============================================================================
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB limit
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Pinned CDN asset configuration for @imgly/background-removal
const IMGLY_CONFIG = {
  publicPath: 'https://staticimgly.com/@imgly/background-removal-data/1.5.7/dist/',
  model: 'medium', // Default to High Quality FP16 (~88MB) for sharp edge preservation & hair details
  device: 'cpu', // 'cpu' (WASM multi-threading) ensures universal browser compatibility
};

// ============================================================================
// State Management
// ============================================================================
const state = {
  // Model quality selection ('medium' | 'large' | 'small')
  selectedModel: 'medium',

  // Current active image details
  activeItem: null,
  activeOriginalUrl: null,
  activeRawCutoutBlob: null,
  activeCutoutUrl: null,
  activeCutoutBlob: null,
  activeOriginalImage: null,
  activeRawCutoutImage: null,
  
  // Custom background settings
  bgMode: 'transparent', // 'transparent' | 'color' | 'image'
  bgColor: '#ffffff',
  bgImageUrl: null,
  bgImageElement: null,

  // Live Edge Refinement parameters
  refinement: {
    defringe: 0,  // Erode border to strip color halos (0 - 4px)
    feather: 0,   // Gaussian blur radius on alpha edge (0 - 6px)
    threshold: 0  // Low-alpha cutoff percentage (0 - 40%)
  },

  // Batch queue: Array of { id, file, originalUrl, cutoutUrl, cutoutBlob, status, dimensions }
  queue: [],
  isProcessingBatch: false,

  // Slider position (0 - 100)
  sliderPercent: 50,
  isDraggingSlider: false,

  // Memory cleanup tracking
  activeObjectUrls: new Set()
};

// ============================================================================
// DOM Elements
// ============================================================================
const elements = {
  themeToggle: document.getElementById('themeToggle'),
  heroSection: document.getElementById('heroSection'),
  uploadSection: document.getElementById('uploadSection'),
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('fileInput'),
  browseBtn: document.getElementById('browseBtn'),
  toggleUrlInputBtn: document.getElementById('toggleUrlInputBtn'),
  urlInputBox: document.getElementById('urlInputBox'),
  imageUrlInput: document.getElementById('imageUrlInput'),
  loadUrlBtn: document.getElementById('loadUrlBtn'),
  toastError: document.getElementById('toastError'),
  toastMessage: document.getElementById('toastMessage'),
  toastClose: document.getElementById('toastClose'),

  // Model Selection
  aiModelRadios: document.querySelectorAll('input[name="aiModelChoice"]'),

  processingSection: document.getElementById('processingSection'),
  processingTitle: document.getElementById('processingTitle'),
  processingStatus: document.getElementById('processingStatus'),
  progressBar: document.getElementById('progressBar'),
  progressBarFill: document.getElementById('progressBarFill'),
  progressPercentage: document.getElementById('progressPercentage'),

  editorSection: document.getElementById('editorSection'),
  currentFileName: document.getElementById('currentFileName'),
  fileResolution: document.getElementById('fileResolution'),
  currentModelBadge: document.getElementById('currentModelBadge'),
  reprocessBtn: document.getElementById('reprocessBtn'),
  resetBtn: document.getElementById('resetBtn'),

  comparisonStage: document.getElementById('comparisonStage'),
  customBgLayer: document.getElementById('customBgLayer'),
  layerBefore: document.getElementById('layerBefore'),
  layerAfter: document.getElementById('layerAfter'),
  imageBefore: document.getElementById('imageBefore'),
  imageAfter: document.getElementById('imageAfter'),
  sliderDivider: document.getElementById('sliderDivider'),

  // Background controls
  bgOptTransparent: document.getElementById('bgOptTransparent'),
  colorPresetChips: document.querySelectorAll('.color-preset-chip'),
  customColorPicker: document.getElementById('customColorPicker'),
  customColorHex: document.getElementById('customColorHex'),
  bgImageInput: document.getElementById('bgImageInput'),
  removeBgImageBtn: document.getElementById('removeBgImageBtn'),

  // Edge Refinement sliders
  defringeSlider: document.getElementById('defringeSlider'),
  defringeVal: document.getElementById('defringeVal'),
  featherSlider: document.getElementById('featherSlider'),
  featherVal: document.getElementById('featherVal'),
  thresholdSlider: document.getElementById('thresholdSlider'),
  thresholdVal: document.getElementById('thresholdVal'),
  resetRefinementBtn: document.getElementById('resetRefinementBtn'),

  // Export controls
  downloadPngBtn: document.getElementById('downloadPngBtn'),
  downloadJpgBtn: document.getElementById('downloadJpgBtn'),
  copyClipboardBtn: document.getElementById('copyClipboardBtn'),

  // Batch queue
  batchSection: document.getElementById('batchSection'),
  batchCount: document.getElementById('batchCount'),
  batchGrid: document.getElementById('batchGrid'),
  downloadAllZipBtn: document.getElementById('downloadAllZipBtn'),
};

// ============================================================================
// Helper Utilities & Memory Management
// ============================================================================

/**
 * Creates an ObjectURL and tracks it to prevent memory leaks
 */
function createSafeObjectURL(blob) {
  const url = URL.createObjectURL(blob);
  state.activeObjectUrls.add(url);
  return url;
}

/**
 * Revokes all managed ObjectURLs to release client memory
 */
function cleanupObjectURLs() {
  state.activeObjectUrls.forEach(url => URL.revokeObjectURL(url));
  state.activeObjectUrls.clear();
}

/**
 * Displays a friendly error toast banner
 */
function showError(message) {
  elements.toastMessage.textContent = message;
  elements.toastError.hidden = false;
  elements.toastError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideError() {
  elements.toastError.hidden = true;
}

/**
 * Loads an image from a URL into an HTMLImageElement
 */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error('Failed to load image preview: ' + err));
    img.src = url;
  });
}

// ============================================================================
// Theme Initialization & Handling
// ============================================================================
function initTheme() {
  const savedTheme = localStorage.getItem('purecut_theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }

  elements.themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('purecut_theme', newTheme);
  });
}

// ============================================================================
// File Validation & Upload Handling
// ============================================================================
function validateFile(file) {
  if (!file) {
    return { valid: false, error: 'No file selected.' };
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { 
      valid: false, 
      error: `"${file.name}" has an unsupported format. Please use JPG, PNG, or WEBP.` 
    };
  }
  if (file.size > MAX_FILE_SIZE) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return { 
      valid: false, 
      error: `"${file.name}" is ${sizeMb} MB. Maximum allowed image size is 10 MB.` 
    };
  }
  return { valid: true };
}

/**
 * Processes incoming files from drop, picker, or clipboard
 */
async function handleFiles(fileList) {
  hideError();
  const files = Array.from(fileList);
  if (files.length === 0) return;

  // Validate each file
  const validFiles = [];
  for (const file of files) {
    const val = validateFile(file);
    if (!val.valid) {
      showError(val.error);
      return;
    }
    validFiles.push(file);
  }

  if (validFiles.length === 1 && state.queue.length === 0) {
    // Single image flow
    const file = validFiles[0];
    const item = {
      id: crypto.randomUUID(),
      file,
      name: file.name,
      originalUrl: createSafeObjectURL(file),
      cutoutUrl: null,
      cutoutBlob: null,
      status: 'pending',
      width: 0,
      height: 0
    };
    state.queue = [item];
    state.activeItem = item;
    processItem(item);
  } else {
    // Multi-image batch flow
    const newItems = validFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      originalUrl: createSafeObjectURL(file),
      cutoutUrl: null,
      cutoutBlob: null,
      status: 'pending',
      width: 0,
      height: 0
    }));

    state.queue.push(...newItems);
    renderBatchGrid();
    elements.batchSection.hidden = false;

    if (!state.isProcessingBatch) {
      processNextInBatch();
    }
  }
}

// ============================================================================
// Core Neural Background Removal Processing
// ============================================================================

/**
 * Processes a single image item through the WASM neural network
 */
async function processItem(item) {
  item.status = 'processing';
  updateBatchItemCard(item);

  // Transition UI to processing view
  elements.uploadSection.hidden = true;
  elements.editorSection.hidden = true;
  elements.processingSection.hidden = false;
  elements.processingTitle.textContent = `Processing "${item.name}"...`;
  elements.processingStatus.textContent = 'Initializing neural model...';
  updateProgress(5);

  try {
    // Load original image to inspect dimensions
    const originalImg = await loadImage(item.originalUrl);
    item.width = originalImg.naturalWidth;
    item.height = originalImg.naturalHeight;

    // Configure model progress callback with selected precision (medium FP16 default)
    const currentModel = state.selectedModel || 'medium';
    const config = {
      ...IMGLY_CONFIG,
      model: currentModel,
      progress: (key, current, total) => {
        let percent = 0;
        if (total > 0) {
          percent = Math.min(Math.round((current / total) * 100), 99);
        }
        
        if (key.includes('model') || key.includes('onnx')) {
          elements.processingStatus.textContent = `Downloading ${currentModel.toUpperCase()} AI model (${percent}%)... Cached after first run.`;
          updateProgress(percent);
        } else if (key.includes('wasm')) {
          elements.processingStatus.textContent = `Loading WebAssembly runtime (${percent}%)...`;
          updateProgress(percent);
        } else {
          elements.processingStatus.textContent = `Neural segmenting with ${currentModel.toUpperCase()} precision (${percent}%)...`;
          updateProgress(percent);
        }
      }
    };

    elements.processingStatus.textContent = `Removing background with ${currentModel.toUpperCase()} precision...`;
    
    // Execute inference inside Web Worker directly on uncompressed source
    const cutoutBlob = await removeBackground(item.file, config);

    // Save results
    item.cutoutBlob = cutoutBlob;
    item.cutoutUrl = createSafeObjectURL(cutoutBlob);
    item.status = 'completed';
    item.model = currentModel;

    updateProgress(100);
    elements.processingStatus.textContent = 'Complete!';

    // Display in editor if this item is the active one
    if (state.activeItem === item || !state.activeItem) {
      await displayInEditor(item, originalImg);
    }

    updateBatchItemCard(item);
  } catch (err) {
    console.error('Background removal error:', err);
    item.status = 'error';
    updateBatchItemCard(item);
    
    elements.processingSection.hidden = true;
    elements.uploadSection.hidden = false;
    showError('Background removal failed: ' + (err.message || 'Please check your connection and try again.'));
  }
}

/**
 * Sequential processing for multi-image queue
 */
async function processNextInBatch() {
  const pendingItem = state.queue.find(item => item.status === 'pending');
  if (!pendingItem) {
    state.isProcessingBatch = false;
    return;
  }

  state.isProcessingBatch = true;
  await processItem(pendingItem);
  processNextInBatch();
}

/**
 * Downscales an oversized image onto an offscreen canvas
 */
function createOptimizedBlob(img, maxDim) {
  return new Promise((resolve) => {
    let width = img.naturalWidth;
    let height = img.naturalHeight;

    if (width > height) {
      if (width > maxDim) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      }
    } else {
      if (height > maxDim) {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

function updateProgress(percent) {
  elements.progressBarFill.style.width = `${percent}%`;
  elements.progressBar.setAttribute('aria-valuenow', percent);
  elements.progressPercentage.textContent = `${percent}%`;
}

// ============================================================================
// Result Viewer & Comparison Slider
// ============================================================================

/**
 * Populates the comparison editor with the processed result
 */
async function displayInEditor(item, originalImg) {
  state.activeItem = item;
  state.activeOriginalImage = originalImg;
  state.activeCutoutBlob = item.cutoutBlob;
  state.activeCutoutUrl = item.cutoutUrl;

  try {
    const rawCutoutImg = await loadImage(item.cutoutUrl);
    state.activeRawCutoutImage = rawCutoutImg;
  } catch (e) {
    console.warn('Could not load raw cutout img:', e);
  }

  elements.currentFileName.textContent = item.name;
  elements.fileResolution.textContent = `${item.width} × ${item.height} px`;

  const modelLabels = {
    medium: '🌟 High Quality (FP16)',
    large: '💎 Ultra (FP32)',
    small: '⚡ Fast (8-bit)'
  };
  elements.currentModelBadge.textContent = modelLabels[item.model || state.selectedModel] || 'High Quality (FP16)';

  elements.imageBefore.src = item.originalUrl;
  elements.imageAfter.src = item.cutoutUrl;

  // Apply any active edge refinements
  applyRefinementPipeline();

  // Reset comparison slider to 50%
  setSliderPosition(50);

  // Transition UI
  elements.processingSection.hidden = true;
  elements.uploadSection.hidden = true;
  elements.editorSection.hidden = false;
  elements.editorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Applies live edge refinement filters:
 * 1. Background Cleanup (Threshold)
 * 2. Defringe / Choke (Morphological erosion)
 * 3. Smooth & Feather (Edge softening)
 */
function applyRefinementPipeline() {
  if (!state.activeItem || !state.activeRawCutoutImage) return;

  const rawImg = state.activeRawCutoutImage;
  const width = rawImg.naturalWidth;
  const height = rawImg.naturalHeight;

  const { defringe, feather, threshold } = state.refinement;

  // If no adjustments, display raw cutout directly
  if (defringe === 0 && feather === 0 && threshold === 0) {
    elements.imageAfter.src = state.activeItem.cutoutUrl;
    state.activeCutoutBlob = state.activeItem.cutoutBlob;
    state.activeCutoutUrl = state.activeItem.cutoutUrl;
    return;
  }

  // Create processing canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Draw raw cutout
  ctx.drawImage(rawImg, 0, 0, width, height);

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const totalPixels = width * height;

  // 1. Threshold cutoff (wipes out faint translucent background noise)
  const alphaCutoff = Math.round((threshold / 100) * 255);
  if (alphaCutoff > 0) {
    for (let i = 0; i < totalPixels; i++) {
      const aIdx = i * 4 + 3;
      if (data[aIdx] < alphaCutoff) {
        data[aIdx] = 0;
      }
    }
  }

  // 2. Defringe / Choke (Morphological erosion on alpha channel)
  if (defringe > 0) {
    const alphaCopy = new Uint8Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      alphaCopy[i] = data[i * 4 + 3];
    }

    const radius = defringe;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const currentAlpha = alphaCopy[idx];
        if (currentAlpha === 0) continue;

        let minNeighbor = currentAlpha;
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            if (dx * dx + dy * dy <= radius * radius) {
              const nAlpha = alphaCopy[ny * width + nx];
              if (nAlpha < minNeighbor) {
                minNeighbor = nAlpha;
              }
            }
          }
        }
        data[idx * 4 + 3] = minNeighbor;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // 3. Smooth & Feather
  if (feather > 0) {
    const featherCanvas = document.createElement('canvas');
    featherCanvas.width = width;
    featherCanvas.height = height;
    const fCtx = featherCanvas.getContext('2d');
    fCtx.filter = `blur(${feather}px)`;
    fCtx.drawImage(canvas, 0, 0);

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(featherCanvas, 0, 0);
  }

  // Convert refined canvas back into blob
  canvas.toBlob((blob) => {
    if (blob) {
      if (state.activeCutoutUrl && state.activeCutoutUrl !== state.activeItem.cutoutUrl) {
        URL.revokeObjectURL(state.activeCutoutUrl);
      }
      state.activeCutoutBlob = blob;
      state.activeCutoutUrl = createSafeObjectURL(blob);
      elements.imageAfter.src = state.activeCutoutUrl;
    }
  }, 'image/png');
}

/**
 * Updates the comparison split slider position
 */
function setSliderPosition(percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  state.sliderPercent = clamped;

  elements.layerBefore.style.clipPath = `polygon(0 0, ${clamped}% 0, ${clamped}% 100%, 0 100%)`;
  elements.sliderDivider.style.left = `${clamped}%`;
  elements.comparisonStage.setAttribute('aria-valuenow', Math.round(clamped));
}

function handleSliderMove(clientX) {
  const rect = elements.comparisonStage.getBoundingClientRect();
  const offsetX = clientX - rect.left;
  const percent = (offsetX / rect.width) * 100;
  setSliderPosition(percent);
}

function initSliderEvents() {
  const stage = elements.comparisonStage;

  const onPointerDown = (e) => {
    state.isDraggingSlider = true;
    handleSliderMove(e.clientX || (e.touches && e.touches[0].clientX));
  };

  const onPointerMove = (e) => {
    if (!state.isDraggingSlider) return;
    handleSliderMove(e.clientX || (e.touches && e.touches[0].clientX));
  };

  const onPointerUp = () => {
    state.isDraggingSlider = false;
  };

  // Mouse & touch events
  stage.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);

  stage.addEventListener('touchstart', onPointerDown, { passive: true });
  window.addEventListener('touchmove', onPointerMove, { passive: true });
  window.addEventListener('touchend', onPointerUp);

  // Keyboard accessibility
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      setSliderPosition(state.sliderPercent - 5);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      setSliderPosition(state.sliderPercent + 5);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSliderPosition(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setSliderPosition(100);
    }
  });
}

// ============================================================================
// Background Customizer
// ============================================================================
function initBackgroundControls() {
  const bgLayer = elements.customBgLayer;

  // Transparent background
  elements.bgOptTransparent.addEventListener('click', () => {
    state.bgMode = 'transparent';
    setActiveBgChip(elements.bgOptTransparent);
    bgLayer.style.backgroundColor = 'transparent';
    bgLayer.style.backgroundImage = '';
  });

  // Color preset chips
  elements.colorPresetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const color = chip.getAttribute('data-color');
      applySolidColor(color, chip);
    });
  });

  // Custom color input picker
  elements.customColorPicker.addEventListener('input', (e) => {
    const color = e.target.value;
    applySolidColor(color, null);
  });

  // Custom background image upload
  elements.bgImageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const bgUrl = createSafeObjectURL(file);
    state.bgMode = 'image';
    state.bgImageUrl = bgUrl;
    state.bgImageElement = await loadImage(bgUrl);

    clearActiveBgChips();
    elements.removeBgImageBtn.hidden = false;

    bgLayer.style.backgroundColor = 'transparent';
    bgLayer.style.backgroundImage = `url("${bgUrl}")`;
    bgLayer.style.backgroundSize = 'contain';
    bgLayer.style.backgroundRepeat = 'no-repeat';
    bgLayer.style.backgroundPosition = 'center';
  });

  // Remove custom background image
  elements.removeBgImageBtn.addEventListener('click', () => {
    elements.bgImageInput.value = '';
    elements.removeBgImageBtn.hidden = true;
    state.bgImageUrl = null;
    state.bgImageElement = null;
    elements.bgOptTransparent.click();
  });
}

function applySolidColor(color, chipElement) {
  state.bgMode = 'color';
  state.bgColor = color;
  state.bgImageUrl = null;
  state.bgImageElement = null;

  elements.customBgLayer.style.backgroundImage = 'none';
  elements.customBgLayer.style.backgroundColor = color;
  elements.customColorPicker.value = color;
  elements.customColorHex.textContent = color.toUpperCase();
  elements.removeBgImageBtn.hidden = true;

  clearActiveBgChips();
  if (chipElement) {
    chipElement.classList.add('active');
  }
}

function setActiveBgChip(activeChip) {
  clearActiveBgChips();
  if (activeChip) activeChip.classList.add('active');
}

function clearActiveBgChips() {
  elements.bgOptTransparent.classList.remove('active');
  elements.colorPresetChips.forEach(c => c.classList.remove('active'));
}

// ============================================================================
// Full-Resolution Offscreen Canvas Rendering & Downloads
// ============================================================================

/**
 * Composites the cutout and selected background at original image resolution
 */
async function renderFullResolutionCanvas() {
  if (!state.activeItem || !state.activeCutoutBlob) {
    throw new Error('No active cutout available to export.');
  }

  const { width, height } = state.activeItem;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 1. Draw Background
  if (state.bgMode === 'color') {
    ctx.fillStyle = state.bgColor;
    ctx.fillRect(0, 0, width, height);
  } else if (state.bgMode === 'image' && state.bgImageElement) {
    // Fit custom background image to cover or contain
    const bgImg = state.bgImageElement;
    ctx.drawImage(bgImg, 0, 0, width, height);
  }

  // 2. Draw Processed Cutout Foreground (at full resolution, including any live edge refinements)
  const cutoutImg = await loadImage(state.activeCutoutUrl || state.activeItem.cutoutUrl);
  ctx.drawImage(cutoutImg, 0, 0, width, height);

  return canvas;
}

/**
 * Triggers browser download of a blob
 */
function downloadBlob(blob, filename) {
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}

function initDownloadHandlers() {
  // Download PNG (Transparent or composited)
  elements.downloadPngBtn.addEventListener('click', async () => {
    try {
      const baseName = (state.activeItem?.name || 'cutout').replace(/\.[^/.]+$/, '');
      const canvas = await renderFullResolutionCanvas();
      
      canvas.toBlob((blob) => {
        if (blob) {
          downloadBlob(blob, `${baseName}-purecut.png`);
        }
      }, 'image/png');
    } catch (err) {
      showError('Export failed: ' + err.message);
    }
  });

  // Download JPG (with background color; defaults to white if transparent)
  elements.downloadJpgBtn.addEventListener('click', async () => {
    try {
      const baseName = (state.activeItem?.name || 'cutout').replace(/\.[^/.]+$/, '');
      const { width, height } = state.activeItem;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // JPG requires a solid background because it has no alpha channel
      if (state.bgMode === 'color') {
        ctx.fillStyle = state.bgColor;
      } else if (state.bgMode === 'image' && state.bgImageElement) {
        ctx.drawImage(state.bgImageElement, 0, 0, width, height);
      } else {
        // Transparent mode fallback for JPG: clean studio white
        ctx.fillStyle = '#FFFFFF';
      }
      ctx.fillRect(0, 0, width, height);

      // Draw cutout on top (including any live refinements)
      const cutoutImg = await loadImage(state.activeCutoutUrl || state.activeItem.cutoutUrl);
      ctx.drawImage(cutoutImg, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (blob) {
          downloadBlob(blob, `${baseName}-purecut.jpg`);
        }
      }, 'image/jpeg', 0.95);
    } catch (err) {
      showError('Export failed: ' + err.message);
    }
  });

  // Copy Cutout to Clipboard
  elements.copyClipboardBtn.addEventListener('click', async () => {
    try {
      if (!navigator.clipboard || !window.ClipboardItem) {
        showError('Clipboard copy is not supported in this browser.');
        return;
      }
      const canvas = await renderFullResolutionCanvas();
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        const originalText = elements.copyClipboardBtn.innerHTML;
        elements.copyClipboardBtn.innerHTML = '<span>✓ Copied!</span>';
        setTimeout(() => {
          elements.copyClipboardBtn.innerHTML = originalText;
        }, 2000);
      }, 'image/png');
    } catch (err) {
      showError('Failed to copy to clipboard: ' + err.message);
    }
  });
}

// ============================================================================
// Batch Processing Queue & ZIP Export
// ============================================================================
function renderBatchGrid() {
  elements.batchCount.textContent = state.queue.length;
  elements.batchGrid.innerHTML = '';

  state.queue.forEach(item => {
    const card = document.createElement('div');
    card.className = `batch-card ${state.activeItem === item ? 'active' : ''}`;
    card.id = `batch-card-${item.id}`;

    card.innerHTML = `
      <div class="batch-thumb-wrap">
        <img src="${item.cutoutUrl || item.originalUrl}" alt="${item.name}">
      </div>
      <div class="batch-card-info">
        <span class="batch-card-name" title="${item.name}">${item.name}</span>
        <span class="batch-status-badge status-${item.status}">${item.status}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      if (item.status === 'completed') {
        loadImage(item.originalUrl).then(img => {
          document.querySelectorAll('.batch-card').forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          displayInEditor(item, img);
        });
      }
    });

    elements.batchGrid.appendChild(card);
  });
}

function updateBatchItemCard(item) {
  const card = document.getElementById(`batch-card-${item.id}`);
  if (!card) {
    renderBatchGrid();
    return;
  }

  const badge = card.querySelector('.batch-status-badge');
  if (badge) {
    badge.className = `batch-status-badge status-${item.status}`;
    badge.textContent = item.status;
  }

  const img = card.querySelector('img');
  if (img && item.cutoutUrl) {
    img.src = item.cutoutUrl;
  }
}

/**
 * Packages all completed cutouts into a single ZIP archive
 */
async function initBatchZipExport() {
  elements.downloadAllZipBtn.addEventListener('click', async () => {
    if (!window.JSZip) {
      showError('JSZip library failed to load.');
      return;
    }

    const completedItems = state.queue.filter(i => i.status === 'completed' && i.cutoutBlob);
    if (completedItems.length === 0) {
      showError('No completed cutouts to export yet.');
      return;
    }

    elements.downloadAllZipBtn.disabled = true;
    const originalText = elements.downloadAllZipBtn.innerHTML;
    elements.downloadAllZipBtn.innerHTML = '<span>Creating ZIP...</span>';

    try {
      const zip = new window.JSZip();

      for (let i = 0; i < completedItems.length; i++) {
        const item = completedItems[i];
        const baseName = item.name.replace(/\.[^/.]+$/, '');
        zip.file(`${baseName}-nobg.png`, item.cutoutBlob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(zipBlob, `purecut-batch-${Date.now()}.zip`);
    } catch (err) {
      showError('Failed to create ZIP: ' + err.message);
    } finally {
      elements.downloadAllZipBtn.disabled = false;
      elements.downloadAllZipBtn.innerHTML = originalText;
    }
  });
}

/**
 * Fetches an image from an HTTP/HTTPS URL and forwards it into the processing pipeline
 */
async function fetchImageFromUrl(url) {
  hideError();
  try {
    elements.uploadSection.hidden = true;
    elements.processingSection.hidden = false;
    elements.processingTitle.textContent = 'Fetching image from URL...';
    elements.processingStatus.textContent = 'Connecting...';
    updateProgress(10);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const contentType = blob.type || 'image/jpeg';
    
    // Extract filename from URL or default
    let fileName = 'web-image.jpg';
    try {
      const pathname = new URL(url).pathname;
      const extracted = pathname.substring(pathname.lastIndexOf('/') + 1);
      if (extracted && extracted.includes('.')) {
        fileName = extracted;
      }
    } catch (_) {}

    const file = new File([blob], fileName, { type: contentType });
    
    // Pass into standard pipeline
    handleFiles([file]);
  } catch (err) {
    console.error('URL Fetch Error:', err);
    elements.processingSection.hidden = true;
    elements.uploadSection.hidden = false;
    showError(
      'Could not load this image URL directly (often due to cross-origin CORS security on the image host). ' +
      'Tip: Right-click the image on the web page -> choose "Copy Image", then come back here and press Ctrl+V!'
    );
  }
}

// ============================================================================
// Drag & Drop, File Input & Clipboard Events
// ============================================================================
function initUploadEvents() {
  const dropzone = elements.dropzone;
  const fileInput = elements.fileInput;
  const browseBtn = elements.browseBtn;

  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropzone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  });

  // Drag and Drop
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      handleFiles(dt.files);
    }
  });

  // URL Input Toggle & Fetching
  elements.toggleUrlInputBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = elements.urlInputBox.hidden;
    elements.urlInputBox.hidden = !isHidden;
    if (elements.urlInputBox.hidden) {
      elements.toggleUrlInputBtn.textContent = '+ Or load from image URL';
    } else {
      elements.toggleUrlInputBtn.textContent = '– Hide URL input';
      elements.imageUrlInput.focus();
    }
  });

  elements.urlInputBox.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  elements.loadUrlBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const url = elements.imageUrlInput.value.trim();
    if (url) {
      fetchImageFromUrl(url);
    } else {
      showError('Please enter a valid image URL.');
    }
  });

  elements.imageUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      elements.loadUrlBtn.click();
    }
  });

  // Paste from Clipboard (Ctrl+V anywhere on page: supports both images & image URLs)
  window.addEventListener('paste', async (e) => {
    const clipboardData = e.clipboardData || e.originalEvent?.clipboardData;
    if (!clipboardData) return;

    // 1. Direct image binary in clipboard
    const items = clipboardData.items;
    const files = [];
    if (items) {
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }

    if (files.length > 0) {
      handleFiles(files);
      return;
    }

    // 2. URL string in clipboard
    const pastedText = clipboardData.getData('text')?.trim();
    if (pastedText && /^https?:\/\/.+/i.test(pastedText)) {
      fetchImageFromUrl(pastedText);
    }
  });

  // Error toast dismissal
  elements.toastClose.addEventListener('click', hideError);

  // Reset button ("Try Another Image")
  elements.resetBtn.addEventListener('click', () => {
    resetApp();
  });
}

function initModelSelection() {
  elements.aiModelRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.selectedModel = e.target.value;
      document.querySelectorAll('.quality-radio').forEach(lbl => lbl.classList.remove('active'));
      e.target.closest('.quality-radio')?.classList.add('active');
    });
  });

  // Reprocess button in top editor toolbar
  elements.reprocessBtn.addEventListener('click', () => {
    if (state.activeItem) {
      processItem(state.activeItem);
    }
  });
}

function initRefinementControls() {
  // Defringe / Choke slider
  elements.defringeSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    state.refinement.defringe = val;
    elements.defringeVal.textContent = `${val}px`;
    applyRefinementPipeline();
  });

  // Smooth & Feather slider
  elements.featherSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    state.refinement.feather = val;
    elements.featherVal.textContent = `${val}px`;
    applyRefinementPipeline();
  });

  // Background threshold cleanup slider
  elements.thresholdSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    state.refinement.threshold = val;
    elements.thresholdVal.textContent = `${val}%`;
    applyRefinementPipeline();
  });

  // Reset tuning adjustments button
  elements.resetRefinementBtn.addEventListener('click', () => {
    state.refinement = { defringe: 0, feather: 0, threshold: 0 };
    elements.defringeSlider.value = 0;
    elements.defringeVal.textContent = '0px';
    elements.featherSlider.value = 0;
    elements.featherVal.textContent = '0px';
    elements.thresholdSlider.value = 0;
    elements.thresholdVal.textContent = '0%';
    applyRefinementPipeline();
  });
}

/**
 * Resets application state and returns to upload screen
 */
function resetApp() {
  cleanupObjectURLs();
  state.activeItem = null;
  state.activeOriginalUrl = null;
  state.activeCutoutUrl = null;
  state.activeCutoutBlob = null;
  state.activeOriginalImage = null;
  state.activeRawCutoutImage = null;
  state.refinement = { defringe: 0, feather: 0, threshold: 0 };
  state.queue = [];
  state.isProcessingBatch = false;

  elements.defringeSlider.value = 0;
  elements.defringeVal.textContent = '0px';
  elements.featherSlider.value = 0;
  elements.featherVal.textContent = '0px';
  elements.thresholdSlider.value = 0;
  elements.thresholdVal.textContent = '0%';

  elements.fileInput.value = '';
  elements.imageUrlInput.value = '';
  elements.urlInputBox.hidden = true;
  elements.toggleUrlInputBtn.textContent = '+ Or load from image URL';
  elements.bgImageInput.value = '';
  elements.removeBgImageBtn.hidden = true;
  elements.batchSection.hidden = true;
  elements.editorSection.hidden = true;
  elements.processingSection.hidden = true;
  elements.uploadSection.hidden = false;
  elements.bgOptTransparent.click();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================================
// Application Bootstrap
// ============================================================================
function initApp() {
  initTheme();
  initUploadEvents();
  initModelSelection();
  initRefinementControls();
  initSliderEvents();
  initBackgroundControls();
  initDownloadHandlers();
  initBatchZipExport();

  // Check WebAssembly capability
  if (typeof WebAssembly !== 'object' || typeof WebAssembly.instantiate !== 'function') {
    showError('Your browser does not support WebAssembly, which is required for in-browser AI processing.');
  }
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
