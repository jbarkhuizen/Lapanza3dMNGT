// Server-side STL upload validation, ported (not reinvented) from
// landing/public/js/stl-scaler-core.js -- same byte-layout logic, same
// constants, adapted to operate on a Node Buffer/ArrayBuffer and typed in
// TS instead of JSDoc. See docs/superpowers/specs/2026-09-13-slicer-integration-design.md.

// Binary STL layout (little-endian throughout):
//   80 bytes  — header (free-form, usually ignored)
//    4 bytes  — uint32 triangle count N
//   N × 50 bytes, each:
//      12 bytes — normal (3 × float32: x, y, z)
//      36 bytes — 3 vertices (3 × float32 each: x, y, z)
//       2 bytes — attribute byte count (uint16, written as 0 here)

const HEADER_BYTES = 80;
const TRIANGLE_COUNT_BYTES = 4;
const FLOATS_PER_TRIANGLE = 12; // 3 normal + 3×3 vertex components
const BYTES_PER_TRIANGLE = FLOATS_PER_TRIANGLE * 4 + 2; // 48 + 2 attribute bytes = 50

export interface StlData {
  header: Uint8Array;
  triangleCount: number;
  normals: Float32Array;
  vertices: Float32Array;
}

/**
 * Binary STL can legally start with the literal bytes "solid" in its
 * (otherwise free-form) 80-byte header, which is also how an ASCII STL file
 * begins — so a text match alone isn't reliable. Disambiguate by checking
 * whether the declared triangle count actually accounts for the rest of the
 * buffer's length; if it doesn't, this is real ASCII text, not a
 * coincidentally-named binary header.
 */
export function isAsciiStl(buffer: ArrayBuffer): boolean {
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

export function parseBinarySTL(buffer: ArrayBuffer): StlData {
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

export interface BoundingBox {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
}

export function computeBoundingBox(vertices: Float32Array): BoundingBox {
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

export interface StlValidationResult {
  triangleCount: number;
  boundingBoxMm: { x: number; y: number; z: number };
}

const MAX_TRIANGLE_COUNT = 2_000_000;

export function validateStlBuffer(buffer: Buffer): StlValidationResult {
  // Buffer.buffer.slice() is typed ArrayBuffer | SharedArrayBuffer (Node's
  // Buffer can back onto either) but parseBinarySTL requires a genuine
  // ArrayBuffer — copy into a fresh one rather than widening that type.
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  // parseBinarySTL throws a user-facing Error message for: too-small buffer,
  // ASCII STL (unsupported), and truncated/corrupt binary STL — all three
  // propagate as-is to the route, which reports them as 400s.
  const parsed = parseBinarySTL(arrayBuffer);
  if (parsed.triangleCount > MAX_TRIANGLE_COUNT) {
    throw new Error(`Model is too complex to slice (${parsed.triangleCount.toLocaleString()} triangles, limit ${MAX_TRIANGLE_COUNT.toLocaleString()}).`);
  }
  const box = computeBoundingBox(parsed.vertices);
  return { triangleCount: parsed.triangleCount, boundingBoxMm: box.size };
}
