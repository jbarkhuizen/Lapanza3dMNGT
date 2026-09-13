import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateStlBuffer } from '../src/slicer/stlValidator.js';

const HEADER_BYTES = 80;
const TRIANGLE_COUNT_BYTES = 4;
const BYTES_PER_TRIANGLE = 50; // 12 (normal) + 36 (3 vertices) + 2 (attribute count)

// Builds a minimal well-formed binary STL buffer with `triangleCount`
// triangles, all zero-filled geometry (only the count/size matter to the
// validator, not the actual coordinates).
function buildBinaryStlBuffer(triangleCount: number): Buffer {
  const size = HEADER_BYTES + TRIANGLE_COUNT_BYTES + triangleCount * BYTES_PER_TRIANGLE;
  const buffer = Buffer.alloc(size); // zero-filled header, avoids accidentally spelling "solid"
  buffer.writeUInt32LE(triangleCount, HEADER_BYTES);
  return buffer;
}

test('valid minimal binary STL (single triangle) passes with triangleCount 1', () => {
  const buffer = buildBinaryStlBuffer(1);
  const result = validateStlBuffer(buffer);
  assert.equal(result.triangleCount, 1);
  assert.deepEqual(result.boundingBoxMm, { x: 0, y: 0, z: 0 });
});

test('truncated buffer throws a truncated-file message', () => {
  // Declares 5 triangles but the buffer only actually holds the header+count.
  const buffer = Buffer.alloc(HEADER_BYTES + TRIANGLE_COUNT_BYTES);
  buffer.writeUInt32LE(5, HEADER_BYTES);
  assert.throws(() => validateStlBuffer(buffer), /truncated|not a valid binary STL/i);
});

test('ASCII STL text (declared count does not match buffer length) throws the ASCII-unsupported message', () => {
  const text = `solid ascii-test-model\n${'facet normal 0 0 0\n'.repeat(10)}endsolid ascii-test-model\n`;
  const buffer = Buffer.from(text, 'utf-8');
  assert.throws(() => validateStlBuffer(buffer), /ASCII STL/i);
});

test('valid binary STL whose header claims more than 2,000,000 triangles throws the too-complex message', () => {
  const buffer = buildBinaryStlBuffer(2_000_001);
  assert.throws(() => validateStlBuffer(buffer), /too complex to slice/i);
});
