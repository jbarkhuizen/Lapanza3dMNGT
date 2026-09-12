// DOM wiring for the STL Scaler page. All of the actual parse/scale/rebuild
// logic lives in stl-scaler-core.js as plain, DOM-free functions so it can
// be unit-tested the same way materials-selector.js is; this file only
// reads the file, drives the form, and builds elements with
// document.createElement/.textContent/.appendChild — no template strings of
// markup, ever.
import {
  parseBinarySTL,
  computeBoundingBox,
  scaleFactorsFromPercent,
  applyLockedProportions,
  computeScaleFactors,
  scaleStlData,
  buildBinarySTL,
} from './stl-scaler-core.js';

const dropzone = document.getElementById('stl-dropzone');
const fileInput = document.getElementById('stl-file-input');
const errorEl = document.getElementById('stl-error');
const panel = document.getElementById('stl-panel');
const fileNameEl = document.getElementById('stl-file-name');
const originalDimsEl = document.getElementById('stl-original-dims');

const modePercentRadio = document.getElementById('stl-mode-percent');
const modeExactRadio = document.getElementById('stl-mode-exact');
const percentFields = document.getElementById('stl-percent-fields');
const exactFields = document.getElementById('stl-exact-fields');
const percentInput = document.getElementById('stl-percent-input');
const lockProportionsInput = document.getElementById('stl-lock-proportions');
const widthInput = document.getElementById('stl-width-input');
const depthInput = document.getElementById('stl-depth-input');
const heightInput = document.getElementById('stl-height-input');
const scaleBtn = document.getElementById('stl-scale-btn');
const resultEl = document.getElementById('stl-result');
const resultDimsEl = document.getElementById('stl-result-dims');
const downloadLink = document.getElementById('stl-download-link');

/** @type {{ data: import('./stl-scaler-core.js').StlData, originalSize: {x:number,y:number,z:number}, fileBaseName: string } | null} */
let loaded = null;
let lastObjectUrl = null;

function formatMm(value) {
  return `${Math.round(value * 100) / 100}mm`;
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.textContent = '';
  errorEl.hidden = true;
}

function setMode(mode) {
  const isPercent = mode === 'percent';
  percentFields.hidden = !isPercent;
  exactFields.hidden = isPercent;
}

modePercentRadio.addEventListener('change', () => {
  if (modePercentRadio.checked) setMode('percent');
});
modeExactRadio.addEventListener('change', () => {
  if (modeExactRadio.checked) setMode('exact');
});

function populateExactFields() {
  if (!loaded) return;
  widthInput.value = String(Math.round(loaded.originalSize.x * 100) / 100);
  depthInput.value = String(Math.round(loaded.originalSize.y * 100) / 100);
  heightInput.value = String(Math.round(loaded.originalSize.z * 100) / 100);
}

function handleDimensionInput(axis, input) {
  input.addEventListener('input', () => {
    if (!loaded || !lockProportionsInput.checked) return;
    const value = Number(input.value);
    if (!Number.isFinite(value) || value <= 0) return;
    const target = applyLockedProportions(loaded.originalSize, axis, value);
    if (axis !== 'x') widthInput.value = String(Math.round(target.x * 100) / 100);
    if (axis !== 'y') depthInput.value = String(Math.round(target.y * 100) / 100);
    if (axis !== 'z') heightInput.value = String(Math.round(target.z * 100) / 100);
  });
}

handleDimensionInput('x', widthInput);
handleDimensionInput('y', depthInput);
handleDimensionInput('z', heightInput);

function renderLoadedFile(file, data) {
  const boundingBox = computeBoundingBox(data.vertices);
  loaded = { data, originalSize: boundingBox.size, fileBaseName: file.name.replace(/\.stl$/i, '') };

  fileNameEl.textContent = file.name;
  originalDimsEl.textContent =
    `${data.triangleCount.toLocaleString()} triangles — ` +
    `${formatMm(boundingBox.size.x)} × ${formatMm(boundingBox.size.y)} × ${formatMm(boundingBox.size.z)} (W × D × H)`;

  populateExactFields();
  percentInput.value = '100';

  panel.hidden = false;
  resultEl.hidden = true;
  if (lastObjectUrl) {
    URL.revokeObjectURL(lastObjectUrl);
    lastObjectUrl = null;
  }
}

async function handleFile(file) {
  clearError();
  if (!file) return;

  if (!/\.stl$/i.test(file.name)) {
    showError('Please choose a .stl file.');
    return;
  }

  let buffer;
  try {
    buffer = await file.arrayBuffer();
  } catch (err) {
    showError('Could not read that file.');
    return;
  }

  try {
    const data = parseBinarySTL(buffer);
    if (data.triangleCount === 0) {
      showError('That STL file has no triangles to scale.');
      return;
    }
    renderLoadedFile(file, data);
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Could not parse that STL file.');
  }
}

fileInput.addEventListener('change', () => {
  handleFile(fileInput.files && fileInput.files[0]);
});

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    fileInput.click();
  }
});
dropzone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropzone.classList.add('stl-dropzone--active');
});
dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('stl-dropzone--active');
});
dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropzone.classList.remove('stl-dropzone--active');
  const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  handleFile(file);
});

function resolveScaleFactors() {
  if (!loaded) return null;

  if (modePercentRadio.checked) {
    const percent = Number(percentInput.value);
    if (!Number.isFinite(percent) || percent <= 0) {
      showError('Enter a scale percentage greater than 0.');
      return null;
    }
    return scaleFactorsFromPercent(percent);
  }

  const targetSize = {
    x: Number(widthInput.value),
    y: Number(depthInput.value),
    z: Number(heightInput.value),
  };
  if (![targetSize.x, targetSize.y, targetSize.z].every((value) => Number.isFinite(value) && value > 0)) {
    showError('Enter width, depth and height greater than 0.');
    return null;
  }
  return computeScaleFactors(loaded.originalSize, targetSize);
}

scaleBtn.addEventListener('click', () => {
  clearError();
  if (!loaded) {
    showError('Choose an STL file first.');
    return;
  }

  const factors = resolveScaleFactors();
  if (!factors) return;

  const scaled = scaleStlData(loaded.data, factors);
  const outputBuffer = buildBinarySTL(scaled);
  const blob = new Blob([outputBuffer], { type: 'model/stl' });

  if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
  lastObjectUrl = URL.createObjectURL(blob);

  const scaledBoundingBox = computeBoundingBox(scaled.vertices);
  resultDimsEl.textContent =
    `Scaled to ${formatMm(scaledBoundingBox.size.x)} × ${formatMm(scaledBoundingBox.size.y)} × ${formatMm(scaledBoundingBox.size.z)} (W × D × H)`;

  downloadLink.href = lastObjectUrl;
  downloadLink.download = `${loaded.fileBaseName}-scaled.stl`;
  resultEl.hidden = false;
});
