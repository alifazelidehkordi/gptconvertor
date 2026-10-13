import test from 'node:test';
import assert from 'node:assert/strict';
import {safeFilename, escapeHtml} from '../src/format.js';

test('safe filenames strip filesystem delimiters', () => {
  assert.equal(safeFilename('my:Chat/Study?'), 'myChatStudy');
});
test('empty title gets a default', () => {
  assert.equal(safeFilename(''), 'chatgpt-export');
});
test('escapeHtml protects heading text', () => {
  assert.equal(escapeHtml('<script>"&'), '&lt;script&gt;&quot;&amp;');
});

test('export notices combine incomplete scan, missing turns and warnings safely', async () => {
  const {exportNotices, normalizePaperSize} = await import('../src/format.js');
  assert.deepEqual(exportNotices({
    scan:{complete:false,reason:'Stopped at step limit'},
    captureSummary:{requested:4,captured:2,missing:2},
    warnings:['One message changed','One message changed']
  }),[
    'Conversation scan incomplete: Stopped at step limit',
    'Incomplete capture: 2 of 4 selected messages exported (2 missing).',
    'One message changed'
  ]);
  assert.equal(normalizePaperSize('Letter'), 'Letter');
  assert.equal(normalizePaperSize('A4'), 'A4');
  assert.equal(normalizePaperSize('Letter; color:red'), 'A4');
});
