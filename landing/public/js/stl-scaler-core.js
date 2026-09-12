// Pure, DOM-free binary STL parsing/scaling/writing logic.
//
// Binary STL layout (little-endian throughout):
//   80 bytes  — header (free-form, usually ignored)
//    4 bytes  — uint32 triangle count N
//   N × 50 bytes, each:
//      12 bytes — normal (3 × float32: x, y, z)
//      36 bytes — 3 vertices (3 × float32 each: x, y, z)
//       2 bytes — attribute byte count (uint16, written as 0 here)
//
// All data is kept as plain typed arrays / objects, never touching the DOM,
// so this module can be unit-tested with node:test exactly like
// materials-selector.js.

const HEADER_BYTES = 80;
const TRIANGLE_COUNT_BYTES = 4;
const FLOATS_PER_TRIANGLE = 12; // 3 normal + 3×3 vertex components
const BYTES_PER_TRIANGLE = FLOATS_PER_TRIANGLE * 4 + 2; // 48 + 2 attribute bytes = 50

/**
 * Binary STL can legally start with the literal bytes "solid" in its
 * (otherwise free-form) 80-byte header, which is also how an ASCII STL file
 * begins — so a text match alone isn't reliable. Disambiguate by checking
 * whether the declared triangle count actually accounts for the rest of the
 * buffer's length; if it doesn't, this is real ASCII text, not a
 * coincidentally-named binary header.
 * @param {ArrayBuffer} buffer
 * @returns {boolean}
 */
export function isAsciiStl(buffer) {
  if (buffer.byteLength < HEADER_BYTES + TRIANGLE_COUNT_BYTES) {
    // Too small to even hold a binary header + count — cannot be a valid
    // binary STL, but also too small to usefully call "ASCII". Treat as
    // not-ASCII here; parseBinarySTL will reject it for being too small.
    return false;
  }

  const startBytes = new Uint8Array(buffer, 0, 5);
  let startText = '';
  for (const byte of startBytes) startText += String.fromCharCode(byte);
  if (startText.toLowerCase() !== 'solid') return false;

  const dataView = new DataView(buffer);
  const declaredCount = dataView.getUint32(HEADER_BYTES, true);
  const expectedSize = HEADER_BYTES + TRIANGLE_COUNT_BYTES + declaredCount * BYTES_PER_TRIANGLE;
  return buffer.byteLength !== expectedSize;
}

/**
 * @typedef {Object} StlData
 * @property {Uint8Array} header - the original (or a zeroed) 80-byte header
 * @property {number} triangleCount
 * @property {Float32Array} normals - length triangleCount * 3
 * @property {Float32Array} vertices - length triangleCount * 9 (3 vertices × xyz)
 */

/**
 * @param {ArrayBuffer} buffer
 * @returns {StlData}
 */
export function parseBinarySTL(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError('parseBinarySTL expects an ArrayBuffer.');
  }
  if (buffer.byteLength < HEADER_BYTES + TRIANGLE_COUNT_BYTES) {
    throw new Error('File is too small to be a binary STL file.');
  }
  if (isAsciiStl(buffer)) {
    throw new Error('This looks like an ASCII STL file. Only binary STL files are supported — re-export as binary STL from your slicer or CAD tool.');
  }

  const dataView = new DataView(buffer);
  const header = new Uint8Array(buffer.slice(0, HEADER_BYTES));
  const triangleCount = dataView.getUint32(HEADER_BYTES, true);

  const expectedSize = HEADER_BYTES + TRIANGLE_COUNT_BYTES + triangleCount * BYTES_PER_TRIANGLE;
  if (buffer.byteLength < expectedSize) {
    throw new Error('File is truncated or is not a valid binary STL file.');
  }

  const normals = new Float32Array(triangleCount * 3);
  const vertices = new Float32Array(triangleCount * 9);

  let offset = HEADER_BYTES + TRIANGLE_COUNT_BYTES;
  for (let t = 0; t < triangleCount; t += 1) {
    normals[t * 3] = dataView.getFloat32(offset, true);
    normals[t * 3 + 1] = dataView.getFloat32(offset + 4, true);
    normals[t * 3 + 2] = dataView.getFloat32(offset + 8, true);
    offset += 12;

    for (let component = 0; component < 9; component += 1) {
      vertices[t * 9 + component] = dataView.getFloat32(offset, true);
      offset += 4;
    }

    // Attribute byte count — unused by virtually every slicer, skipped.
    offset += 2;
  }

  return { header, triangleCount, normals, vertices };
}

/**
 * @param {Float32Array} vertices - length triangleCount * 9
 * @returns {{ min: {x:number,y:number,z:number}, max: {x:number,y:number,z:number}, size: {x:number,y:number,z:number} }}
 */
export function computeBoundingBox(vertices) {
  if (vertices.length === 0) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 } };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i];
    const y = vertices[i + 1];
    const z = vertices[i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
  };
}

/**
 * Uniform per-axis scale factors for a "scale by percentage" input.
 * @param {number} percent - e.g. 200 for 200%
 * @returns {{x:number,y:number,z:number}}
 */
export function scaleFactorsFromPercent(percent) {
  const factor = percent / 100;
  return { x: factor, y: factor, z: factor };
}

/**
 * Given the model's current size and a new value typed into one of the
 * width/depth/height fields with "keep proportions" ticked, returns the
 * resulting target size for all three axes, scaled uniformly by the ratio
 * the edited axis implies.
 * @param {{x:number,y:number,z:number}} originalSize
 * @param {'x'|'y'|'z'} editedAxis
 * @param {number} editedValue
 * @returns {{x:number,y:number,z:number}}
 */
export function applyLockedProportions(originalSize, editedAxis, editedValue) {
  const originalOnAxis = originalSize[editedAxis];
  const ratio = originalOnAxis === 0 ? 0 : editedValue / originalOnAxis;
  return {
    x: originalSize.x * ratio,
    y: originalSize.y * ratio,
    z: originalSize.z * ratio,
  };
}

/**
 * @param {{x:number,y:number,z:number}} originalSize
 * @param {{x:number,y:number,z:number}} targetSize
 * @returns {{x:number,y:number,z:number}}
 */
export function computeScaleFactors(originalSize, targetSize) {
  const axisFactor = (axis) => (originalSize[axis] === 0 ? 1 : targetSize[axis] / originalSize[axis]);
  return { x: axisFactor('x'), y: axisFactor('y'), z: axisFactor('z') };
}

function subtractVec(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function crossVec(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalizeVec(v) {
  const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (length === 0) return [0, 0, 0];
  return [v[0] / length, v[1] / length, v[2] / length];
}

/**
 * Recomputes a triangle's normal from its three vertices via the cross
 * product of two edge vectors, normalized to unit length.
 * @param {[number,number,number]} v1
 * @param {[number,number,number]} v2
 * @param {[number,number,number]} v3
 * @returns {[number,number,number]}
 */
export function computeTriangleNormal(v1, v2, v3) {
  const edge1 = subtractVec(v2, v1);
  const edge2 = subtractVec(v3, v1);
  return normalizeVec(crossVec(edge1, edge2));
}

/**
 * Scales every vertex by the given per-axis factors. Uniform scaling leaves
 * a triangle's normal direction unchanged, so the original (already unit)
 * normals are reused; non-uniform (per-axis) scaling shears the geometry, so
 * normals are recomputed from the scaled vertices instead of being reused —
 * otherwise the resulting file would carry stale shading/orientation data.
 * @param {StlData} data
 * @param {{x:number,y:number,z:number}} factors
 * @returns {StlData}
 */
export function scaleStlData(data, factors) {
  const { header, triangleCount, normals, vertices } = data;
  const scaledVertices = new Float32Array(vertices.length);

  for (let i = 0; i < vertices.length; i += 3) {
    scaledVertices[i] = vertices[i] * factors.x;
    scaledVertices[i + 1] = vertices[i + 1] * factors.y;
    scaledVertices[i + 2] = vertices[i + 2] * factors.z;
  }

  const isUniform = factors.x === factors.y && factors.y === factors.z;
  let scaledNormals;

  if (isUniform) {
    scaledNormals = normals.slice();
  } else {
    scaledNormals = new Float32Array(normals.length);
    for (let t = 0; t < triangleCount; t += 1) {
      const base = t * 9;
      const v1 = [scaledVertices[base], scaledVertices[base + 1], scaledVertices[base + 2]];
      const v2 = [scaledVertices[base + 3], scaledVertices[base + 4], scaledVertices[base + 5]];
      const v3 = [scaledVertices[base + 6], scaledVertices[base + 7], scaledVertices[base + 8]];
      const [nx, ny, nz] = computeTriangleNormal(v1, v2, v3);
      scaledNormals[t * 3] = nx;
      scaledNormals[t * 3 + 1] = ny;
      scaledNormals[t * 3 + 2] = nz;
    }
  }

  return { header, triangleCount, normals: scaledNormals, vertices: scaledVertices };
}

/**
 * Rebuilds a binary STL ArrayBuffer from parsed/scaled STL data.
 * @param {StlData} data
 * @returns {ArrayBuffer}
 */
export function buildBinarySTL({ header, triangleCount, normals, vertices }) {
  const bufferSize = HEADER_BYTES + TRIANGLE_COUNT_BYTES + triangleCount * BYTES_PER_TRIANGLE;
  const buffer = new ArrayBuffer(bufferSize);
  const dataView = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (header) {
    bytes.set(header.subarray(0, HEADER_BYTES), 0);
  }
  dataView.setUint32(HEADER_BYTES, triangleCount, true);

  let offset = HEADER_BYTES + TRIANGLE_COUNT_BYTES;
  for (let t = 0; t < triangleCount; t += 1) {
    dataView.setFloat32(offset, normals[t * 3], true);
    dataView.setFloat32(offset + 4, normals[t * 3 + 1], true);
    dataView.setFloat32(offset + 8, normals[t * 3 + 2], true);
    offset += 12;

    for (let component = 0; component < 9; component += 1) {
      dataView.setFloat32(offset, vertices[t * 9 + component], true);
      offset += 4;
    }

    dataView.setUint16(offset, 0, true); // attribute byte count — always zero
    offset += 2;
  }

  return buffer;
}
