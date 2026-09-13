import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGcodeFooter } from '../src/slicer/gcodeParser.js';

test('full well-formed footer with model + support weight extracts all four fields', () => {
  const gcode = [
    '; some other comment',
    '; filament used [g] = 12.34, 1.20',
    '; filament used [mm] = 456.70, 12.30',
    '; estimated printing time (normal mode) = 1h 23m 45s',
  ].join('\n');
  const result = parseGcodeFooter(gcode);
  assert.ok(result);
  assert.equal(result!.weightGrams, 12.34);
  assert.equal(result!.supportWeightGrams, 1.2);
  assert.equal(result!.filamentLengthMm, 456.7);
  assert.equal(result!.printTimeHours, 1 + 23 / 60 + 45 / 3600);
});

test('footer with only model weight (no comma) has supportWeightGrams 0', () => {
  const gcode = [
    '; filament used [g] = 12.34',
    '; filament used [mm] = 456.70',
    '; estimated printing time (normal mode) = 1h 23m 45s',
  ].join('\n');
  const result = parseGcodeFooter(gcode);
  assert.ok(result);
  assert.equal(result!.supportWeightGrams, 0);
});

test('footer missing the time line entirely returns null', () => {
  const gcode = [
    '; filament used [g] = 12.34, 1.20',
    '; filament used [mm] = 456.70, 12.30',
  ].join('\n');
  assert.equal(parseGcodeFooter(gcode), null);
});

test('"1h 23m 45s" duration is converted to fractional hours correctly', () => {
  const gcode = [
    '; filament used [g] = 1',
    '; filament used [mm] = 1',
    '; estimated printing time (normal mode) = 1h 23m 45s',
  ].join('\n');
  const result = parseGcodeFooter(gcode);
  assert.equal(result!.printTimeHours, 1 + 23 / 60 + 45 / 3600);
});

test('"45s" duration only is converted to fractional hours correctly', () => {
  const gcode = [
    '; filament used [g] = 1',
    '; filament used [mm] = 1',
    '; estimated printing time (normal mode) = 45s',
  ].join('\n');
  const result = parseGcodeFooter(gcode);
  assert.equal(result!.printTimeHours, 45 / 3600);
});

test('a completely unrelated text blob returns null', () => {
  assert.equal(parseGcodeFooter('hello world, this is not gcode at all'), null);
});
