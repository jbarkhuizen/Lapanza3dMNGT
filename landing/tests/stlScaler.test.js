import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBinarySTL,
  computeBoundingBox,
  scaleFactorsFromPercent,
  applyLockedProportions,
  computeScaleFactors,
  computeTriangleNormal,
  scaleStlData,
  buildBinarySTL,
} from '../public/js/stl-scaler-core.js';

const HEADER_BYTES = 80;

/**
 * Hand-builds a binary STL ArrayBuffer for a single arbitrary triangle,
 * writing every field by hand via DataView — deliberately independent of
 * buildBinarySTL, so parsing is verified against the raw wire format rather
 * than against this module's own writer.
 */
function handBuildSingleTriangleStl({ normal, v1, v2, v3 }) {
  const buffer = new ArrayBuffer(HEADER_BYTES + 4 + 50);
  const view = new DataView(buffer);

  // Header (80 bytes) is left as zeros — explicitly fine per the STL format.
  view.setUint32(HEADER_BYTES, 1, true); // triangle count

  let offset = HEADER_BYTES + 4;
  for (const component of normal) {
    view.setFloat32(offset, component, true);
    offset += 4;
  }
  for (const vertex of [v1, v2, v3]) {
    for (const component of vertex) {
      view.setFloat32(offset, component, true);
      offset += 4;
    }
  }
  view.setUint16(offset, 0, true); // attribute byte count

  return buffer;
}

test('parsing a hand-constructed binary STL recovers the correct vertex count and bounding box', () => {
  const buffer = handBuildSingleTriangleStl({
    normal: [0, 0, 1],
    v1: [0, 0, 0],
    v2: [10, 0, 0],
    v3: [0, 20, 5],
  });

  const data = parseBinarySTL(buffer);

  assert.equal(data.triangleCount, 1);
  assert.equal(data.vertices.length, 9); // 1 triangle × 3 vertices × xyz
  assert.deepEqual(Array.from(data.normals), [0, 0, 1]);

  const bbox = computeBoundingBox(data.vertices);
  assert.deepEqual(bbox.min, { x: 0, y: 0, z: 0 });
  assert.deepEqual(bbox.max, { x: 10, y: 20, z: 5 });
  assert.deepEqual(bbox.size, { x: 10, y: 20, z: 5 });
});

test('scaling by 200% doubles every coordinate', () => {
  const buffer = handBuildSingleTriangleStl({
    normal: [0, 0, 1],
    v1: [1, 2, 3],
    v2: [4, 5, 6],
    v3: [7, 8, 9],
  });
  const data = parseBinarySTL(buffer);

  const factors = scaleFactorsFromPercent(200);
  assert.deepEqual(factors, { x: 2, y: 2, z: 2 });

  const scaled = scaleStlData(data, factors);
  assert.deepEqual(
    Array.from(scaled.vertices),
    Array.from(data.vertices).map((component) => component * 2),
  );
});

test('setting an exact width with proportions locked scales depth/height by the same factor', () => {
  const originalSize = { x: 10, y: 20, z: 5 };

  // User types 20mm into the width (x) field with "keep proportions" ticked
  // — a 2x factor — depth (y) and height (z) must scale by the same 2x.
  const targetSize = applyLockedProportions(originalSize, 'x', 20);
  assert.deepEqual(targetSize, { x: 20, y: 40, z: 10 });

  const factors = computeScaleFactors(originalSize, targetSize);
  assert.equal(factors.x, 2);
  assert.equal(factors.y, 2);
  assert.equal(factors.z, 2);
});

test('rebuilding a scaled STL back to a binary buffer and re-parsing it round-trips to the expected scaled vertices', () => {
  const buffer = handBuildSingleTriangleStl({
    normal: [0, 0, 1],
    v1: [1, 1, 1],
    v2: [2, 2, 2],
    v3: [3, 3, 3],
  });
  const data = parseBinarySTL(buffer);

  const factors = scaleFactorsFromPercent(150);
  const scaled = scaleStlData(data, factors);
  const rebuiltBuffer = buildBinarySTL(scaled);

  const reparsed = parseBinarySTL(rebuiltBuffer);
  assert.equal(reparsed.triangleCount, 1);
  const expected = Array.from(data.vertices).map((component) => component * 1.5);
  for (let i = 0; i < expected.length; i += 1) {
    assert.ok(Math.abs(reparsed.vertices[i] - expected[i]) < 1e-5);
  }
});

test('a non-uniform (per-axis) scale produces a different (correctly recomputed) triangle normal than the original', () => {
  // Neither edge of this triangle lies purely along one coordinate axis, so
  // stretching only x actually tilts the surface — unlike an axis-aligned
  // triangle (e.g. one edge exactly along x), where scaling that same axis
  // only rescales the cross product's magnitude and its *normalized*
  // direction comes out unchanged (a trap the first draft of this test fell
  // into).
  const v1 = [0, 0, 0];
  const v2 = [1, 1, 0];
  const v3 = [1, 0, 1];
  const originalNormal = computeTriangleNormal(v1, v2, v3);

  const buffer = handBuildSingleTriangleStl({ normal: originalNormal, v1, v2, v3 });
  const data = parseBinarySTL(buffer);

  // Non-uniform: stretch x by 3, leave y and z alone.
  const factors = { x: 3, y: 1, z: 1 };
  const scaled = scaleStlData(data, factors);
  const scaledNormal = Array.from(scaled.normals);

  assert.notDeepEqual(scaledNormal, Array.from(originalNormal));

  // The recomputed normal must actually match cross(edge1, edge2) of the
  // scaled vertices, normalized — not just "be different".
  const expectedNormal = computeTriangleNormal([0, 0, 0], [3, 1, 0], [3, 0, 1]);
  for (let i = 0; i < 3; i += 1) {
    assert.ok(Math.abs(scaledNormal[i] - expectedNormal[i]) < 1e-6);
  }
});

test('a uniform scale reuses the original normal unchanged', () => {
  const buffer = handBuildSingleTriangleStl({
    normal: [0.267, 0.535, 0.802], // an arbitrary unit-ish vector
    v1: [0, 0, 0],
    v2: [1, 0, 0],
    v3: [0, 1, 0],
  });
  const data = parseBinarySTL(buffer);

  const scaled = scaleStlData(data, { x: 4, y: 4, z: 4 });
  assert.deepEqual(Array.from(scaled.normals), Array.from(data.normals));
});

test('parseBinarySTL rejects an ASCII STL file with a clear error', () => {
  // Padded well past the 84-byte binary header+count size so the ASCII
  // disambiguation logic (declared triangle count vs. actual buffer size)
  // has enough bytes to work with, rather than tripping the "too small" path.
  const asciiText =
    'solid exported-from-a-slicer\n' +
    'facet normal 0 0 1\n' +
    'outer loop\n' +
    'vertex 0 0 0\n' +
    'vertex 1 0 0\n' +
    'vertex 0 1 0\n' +
    'endloop\n' +
    'endfacet\n' +
    'endsolid exported-from-a-slicer\n';
  const bytes = new TextEncoder().encode(asciiText);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

  assert.ok(buffer.byteLength > 84);
  assert.throws(() => parseBinarySTL(buffer), /ASCII/);
});
