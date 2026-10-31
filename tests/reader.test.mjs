import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCatalog } from '../scripts/catalog.mjs';
import { detail, trailNavigation } from '../site/reader.js';
import { escape, formatCitation } from '../site/view-helpers.js';

const read = async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const inputs = await Promise.all(['nobel-prizes.json', 'laureates.json', 'editorial.json', 'snapshot.json', 'explanations.json', 'deep-dives.json'].map(read));
const catalog = createCatalog(...inputs);
const lookup = new Map(catalog.prizes.map((prize) => [prize.id, prize]));
const normalize = (text) => text.replace(/\s+/g, ' ').trim();
const plainText = (html) => normalize(html.replace(/<\/(?:p|h[1-6]|div|section|dd|dt|blockquote)>/g, ' ').replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (_match, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[entity])));
const render = (prize, edges = catalog.connections) => detail(prize, lookup, edges, null);
const referenceEntries = (html) => [...html.matchAll(/<li id="source-(\d+)"[^>]*>([\s\S]*?)<\/li>/g)];

test('the reader preserves every award explanation, deep section, definition and original citation', () => {
  // Arrange: use the complete validated catalogue, not a short synthetic story.
  const before = JSON.stringify(catalog);

  // Act and assert: paragraph breaks and term links must not lose or alter prose.
  for (const prize of catalog.prizes) {
    const html = render(prize);
    const text = plainText(html);
    for (const field of ['overview', 'background', 'work', 'significance']) {
      assert.ok(text.includes(normalize(prize.explanation[field])), `${prize.id}: ${field}`);
    }
    for (const section of prize.deepDive.sections) {
      assert.ok(text.includes(normalize(section.heading)), `${prize.id}: section heading`);
      assert.ok(text.includes(normalize(section.body)), `${prize.id}: ${section.heading}`);
    }
    for (const term of prize.deepDive.terms) {
      assert.ok(text.includes(normalize(term.term)), `${prize.id}: term`);
      assert.ok(text.includes(normalize(term.definition)), `${prize.id}: definition`);
    }
    for (const person of prize.recipients) {
      if (person.motivation) assert.ok(html.includes(`<blockquote>${formatCitation(person.motivation)}</blockquote>`), `${prize.id}: original citation`);
      for (const value of [person.name, person.fullName, ...person.affiliations].filter(Boolean)) assert.ok(html.includes(escape(value)), `${prize.id}: recipient fact`);
    }
    for (const value of [prize.impact, prize.detail, prize.reassessment?.text].filter(Boolean)) assert.ok(text.includes(normalize(value)), `${prize.id}: editorial context`);
  }
  assert.equal(JSON.stringify(catalog), before, 'Rendering must not mutate the catalogue');
});

test('every local source and contents jump has one destination, including independent glossary navigation', () => {
  const prize = lookup.get('1938-physics');

  const html = render(prize);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const jumps = [...html.matchAll(/data-jump="([^"]+)"/g)].map((match) => match[1]);

  assert.equal(new Set(ids).size, ids.length, 'IDs remain unique across definitions and references');
  for (const id of jumps) assert.equal(ids.filter((value) => value === id).length, 1, `${id}: one destination`);
  assert.match(html, /<button data-jump="prize-terms">Key ideas<\/button>/);
  assert.match(html, /id="prize-terms"[^>]+data-section-label="Key ideas"/);
  assert.match(html, /id="reader-current-section">Overview/);
  assert.match(html, /class="reader-navigation"/);
});

test('references deduplicate URLs while preserving original source labels, attribution and safe external links', () => {
  const prize = lookup.get('2023-medicine');
  const originalSources = [...prize.explanation.sources, ...prize.explanation.furtherReading, ...prize.deepDive.sources, ...prize.sources];

  const html = render(prize, []);
  const entries = referenceEntries(html);

  for (const source of originalSources) {
    const matching = entries.filter((entry) => entry[2].includes(`href="${escape(source.url)}"`));
    assert.equal(matching.length, 1, `${source.title}: one numbered source per URL`);
    assert.ok(matching[0][2].includes(escape(source.title)), `${source.title}: original label retained`);
    assert.match(matching[0][2], /target="_blank" rel="noopener noreferrer"/);
  }
  for (const match of html.matchAll(/<a href="#source-(\d+)" data-jump="source-\1"[^>]*>\[\1\]<\/a>/g)) {
    assert.ok(entries.some((entry) => entry[1] === match[1]), 'Inline number resolves to a numbered entry');
  }
  const firstDeepSource = prize.deepDive.sources.find((source) => source.id === prize.deepDive.sections[0].sourceIds[0]);
  const entry = entries.find((item) => item[2].includes(`href="${escape(firstDeepSource.url)}"`));
  const firstDeepSection = html.match(/<article id="deep-section-1"[\s\S]*?<\/article>/)[0];
  assert.ok(firstDeepSection.includes(`data-jump="source-${entry[1]}"`), 'Section cites its identified evidence');
  assert.ok(entry[2].includes('data-jump="deep-section-1"'), 'Reference returns to its supporting passage');
  assert.match(html, /lecture · Katalin Karikó/);
});

test('long prose becomes complete sentence paragraphs without losing abbreviations, numbers or wording', () => {
  const prize = structuredClone(lookup.get('2023-medicine'));
  const body = 'Dr. Hart described a carefully controlled experiment involving 2.5 units of the material and several groups of observers. The team repeated the observations under the same conditions, recording the result each time and comparing it with the original expectation. Those comparisons provided evidence about the particular question the researchers had set out to examine. However, the result did not answer every question about the material or establish how it would behave in every other situation. Later researchers investigated those limitations with a different method and new measurements. Their work extended the original finding while keeping its experimental boundaries clear.';
  prize.deepDive.sections[0].body = body;

  const html = render(prize, []);
  const section = html.match(/<article id="deep-section-1"[\s\S]*?<\/article>/)[0];

  assert.equal((section.match(/<p>/g) || []).length, 2);
  assert.ok(plainText(section).includes(body));
  assert.ok(section.includes('Dr. Hart'));
  assert.ok(section.includes('2.5 units'));
  assert.match(section, /<p>However,/);
});

test('a glossary term links from its first use and provides a return to that same text', () => {
  const prize = structuredClone(lookup.get('2023-medicine'));
  prize.deepDive.terms[0].term = 'mRNA';

  const html = render(prize, []);

  assert.equal((html.match(/id="term-use-1"/g) || []).length, 1);
  assert.match(html, /id="term-use-1" href="#term-1" data-jump="term-1"/);
  assert.match(html, /class="definition-return" href="#term-use-1" data-jump="term-use-1"/);
  assert.ok(plainText(html).includes(prize.explanation.overview));
});

test('an early or late transition does not leave most of a long section in one paragraph', () => {
  const prize = lookup.get('2023-medicine');

  const html = render(prize, []);
  const section = html.match(/<article id="deep-section-2"[\s\S]*?<\/article>/)[0];
  const renderedParagraphs = [...section.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((match) => plainText(match[1]));

  assert.equal(renderedParagraphs.length, 2);
  for (const paragraph of renderedParagraphs) {
    const words = paragraph.split(/\s+/).length;
    assert.ok(words >= 30 && words <= 70, `${words} words should not dominate this two-paragraph explanation`);
  }
  assert.ok(plainText(section).includes(prize.deepDive.sections[1].body));
});

test('optional explanation layers do not leave dead contents links and official records remain available', () => {
  const prize = structuredClone(lookup.get('1902-literature'));
  delete prize.explanation;
  delete prize.deepDive;
  delete prize.impact;
  delete prize.detail;
  delete prize.sources;

  const html = render(prize, []);

  assert.ok(!html.includes('data-jump="prize-deep-dive"'));
  assert.ok(!html.includes('data-jump="prize-terms"'));
  assert.ok(html.includes('<em>A history of Rome</em>'));
  assert.ok(html.includes('has not yet been added'));
  assert.equal(referenceEntries(html).length, 1);
  assert.ok(referenceEntries(html)[0][2].includes(escape(prize.officialUrl)));
});

test('dynamic reader content is escaped and untrusted links cannot become executable destinations', () => {
  const prize = structuredClone(lookup.get('2023-medicine'));
  const hostile = '<img src=x onerror="alert(1)"> & <script>bad()</script>';
  prize.title = hostile;
  prize.recipients[0].name = hostile;
  prize.recipients[0].motivation = 'For <i>A book</i> & <i onclick="bad()">unsafe</i>';
  prize.deepDive.sections[0].heading = hostile;
  prize.deepDive.sections[0].body = hostile;
  prize.deepDive.terms[0].term = hostile;
  prize.deepDive.terms[0].definition = hostile;
  prize.deepDive.sources[0].title = hostile;

  const html = render(prize, []);

  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script'));
  assert.ok(html.includes(escape(hostile)));
  assert.ok(html.includes('<em>A book</em> &amp; &lt;i onclick='));
  prize.deepDive.sources[0].url = 'javascript:alert(1)';
  assert.throws(() => render(prize, []), /HTTPS/);
});

test('trail controls distinguish first, middle, last and outside-trail reading without inventing a step', () => {
  const trail = catalog.trails.find((item) => item.id === 'reading-life');
  const first = lookup.get(trail.prizeIds[0]);
  const middle = lookup.get(trail.prizeIds[2]);
  const last = lookup.get(trail.prizeIds.at(-1));

  const firstHtml = trailNavigation(first, trail, lookup);
  const middleHtml = trailNavigation(middle, trail, lookup);
  const lastHtml = trailNavigation(last, trail, lookup);
  const outsideHtml = trailNavigation(lookup.get('1993-literature'), trail, lookup);

  assert.match(firstHtml, /Step 1 of 6/);
  assert.match(firstHtml, /data-trail-step="-1" aria-label="Previous prize" disabled/);
  assert.match(middleHtml, /Step 3 of 6/);
  assert.match(middleHtml, /data-trail-step="1"/);
  assert.match(middleHtml, /data-trail-step="3"/);
  assert.match(lastHtml, /data-trail-step="6" aria-label="Next prize" disabled/);
  assert.match(outsideHtml, /outside this trail/);
  assert.match(outsideHtml, /data-action="trail-overview">Return to trail/);
  assert.ok(!outsideHtml.includes('Step '));
  assert.ok(!outsideHtml.includes('data-trail-step'));
  assert.equal(trailNavigation(first, null, lookup), '');
});
