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
