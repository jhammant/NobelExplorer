import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCatalog } from '../scripts/catalog.mjs';
import { detail } from '../site/views.js';

const read = async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const inputs = await Promise.all(['nobel-prizes.json', 'laureates.json', 'editorial.json', 'snapshot.json'].map(read));
const catalog = createCatalog(...inputs);
const lookup = new Map(catalog.prizes.map((prize) => [prize.id, prize]));

test('literature citations render official book-title italics without changing the record', () => {
  const prize = lookup.get('1902-literature');
  const original = prize.recipients[0].motivation;

  const html = detail(prize, lookup, [], null);

  assert.ok(html.includes('<em>A history of Rome</em>'));
  assert.ok(!html.includes('&lt;I&gt;'));
  assert.equal(prize.recipients[0].motivation, original);
});

test('citation formatting permits only plain italics and escapes executable markup', () => {
  const prize = structuredClone(lookup.get('1902-literature'));
  prize.recipients[0].motivation = 'For <i>A book</i> & <img src=x onerror="alert(1)"> <i onclick="alert(1)">unsafe</i>';

  const html = detail(prize, lookup, [], null);

  assert.ok(html.includes('<em>A book</em> &amp;'));
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  assert.ok(html.includes('&lt;i onclick=&quot;alert(1)&quot;&gt;'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<i onclick'));
});
