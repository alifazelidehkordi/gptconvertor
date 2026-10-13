// Build a deterministic, runtime-only ZIP compatible with Chrome "Load unpacked".
// No dependencies, shell utilities, network access, or generated secrets are required.
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const files = [
  'manifest.json',
  'popup.css',
  'popup.html',
  'preview.css',
  'preview.html',
  'src/content.js',
  'src/format.js',
  'src/html.js',
  'src/markdown.js',
  'src/popup.js',
  'src/preview.js'
];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(entries) {
  const local = [], central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const filename = Buffer.from(name, 'utf8');
    if (name.startsWith('/') || name.includes('..') || name.includes('\\')) {
      throw Error('Invalid archive path: ' + name);
    }
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6); // General purpose flags
    localHeader.writeUInt16LE(0, 8); // Store, no compression
    localHeader.writeUInt16LE(0, 10); // Stable DOS time
    localHeader.writeUInt16LE(33, 12); // 1980-01-01
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(filename.length, 26);
    localHeader.writeUInt16LE(0, 28);
    local.push(localHeader, filename, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(0x0314, 4); // Created by Unix, ZIP v2.0
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(33, 14);
    entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(filename.length, 28);
    entry.writeUInt16LE(0, 30);
    entry.writeUInt16LE(0, 32);
    entry.writeUInt16LE(0, 34);
    entry.writeUInt16LE(0, 36);
    entry.writeUInt32LE(0o100644 << 16, 38);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, filename);
    offset += localHeader.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3 || manifest.version !== pkg.version) {
  throw Error('Package and Chrome manifest versions must agree (Manifest V3 required).');
}
const entries = files.map(file => [file, readFileSync(join(root, file))]);
const archive = zipStore(entries);
mkdirSync(join(root, 'dist'), {recursive:true});
const output = join(root, 'dist', 'gptconvertor-' + pkg.version + '.zip');
writeFileSync(output, archive);
console.log('Wrote ' + output + ' (' + entries.length + ' runtime files, ' + archive.length + ' bytes)');
