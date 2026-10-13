import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const files = [
  'manifest.json', 'popup.css', 'popup.html', 'preview.css',
  'preview.html', 'src/content.js', 'src/format.js', 'src/html.js',
  'src/markdown.js', 'src/popup.js', 'src/preview.js'
];

test('runtime-only Chrome ZIP is deterministic, complete, and extractable', () => {
  const build = () => execFileSync(process.execPath, ['scripts/package.mjs'], {cwd:root});
  build();
  const target = join(root, 'dist', 'gptconvertor-0.1.0.zip');
  const zip = readFileSync(target);
  build();
  const rebuild = readFileSync(target);
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest(zip), digest(rebuild), 'release ZIP should be byte-for-byte reproducible');

  const endOffset = zip.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
  assert.ok(endOffset > 0, 'ZIP end record should be present');
  const count = zip.readUInt16LE(endOffset + 10);
  let pos = zip.readUInt32LE(endOffset + 16);
  const names = [];
  for (let index = 0; index < count; index++) {
    assert.equal(zip.readUInt32LE(pos), 0x02014b50, 'central directory signature');
    const nameLength = zip.readUInt16LE(pos + 28);
    const extraLength = zip.readUInt16LE(pos + 30);
    const commentLength = zip.readUInt16LE(pos + 32);
    const filename = zip.subarray(pos + 46, pos + 46 + nameLength).toString('utf8');
    names.push(filename);
    assert.equal(zip.readUInt16LE(pos + 10), 0, 'stored without compression');
    const start = zip.readUInt32LE(pos + 42);
    assert.equal(zip.readUInt32LE(start), 0x04034b50);
    const dataOffset = start + 30 + zip.readUInt16LE(start + 26) +
      zip.readUInt16LE(start + 28);
    const length = zip.readUInt32LE(pos + 24);
    assert.deepEqual(zip.subarray(dataOffset, dataOffset + length),
      readFileSync(join(root, filename)));
    pos += 46 + nameLength + extraLength + commentLength;
  }
  assert.deepEqual(names, files);
  assert.ok(!names.some(name => name.startsWith('tests/') ||
    name.startsWith('node_modules/') || name.includes('package-lock')));
});
