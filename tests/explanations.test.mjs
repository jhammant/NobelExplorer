import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCatalog } from '../scripts/catalog.mjs';
import { filterPrizes, searchText } from '../site/model.js';
import { detail, escape } from '../site/views.js';

const read = async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const [rawPrizes, rawLaureates, editorial, snapshot] = await Promise.all(['nobel-prizes.json', 'laureates.json', 'editorial.json', 'snapshot.json'].map(read));
const categories = {
  Physics: 'physics', Chemistry: 'chemistry', 'Physiology or Medicine': 'medicine',
  Literature: 'literature', Peace: 'peace', 'Economic Sciences': 'economics',
};
const awardId = (prize) => `${prize.awardYear}-${categories[prize.category.en]}`;
const awarded = rawPrizes.nobelPrizes.filter((prize) => prize.laureates?.length);
const prizeIds = awarded.map(awardId);
const editorialIds = new Set(editorial.entries.map((entry) => entry.id));
const plainId = prizeIds.find((id) => !editorialIds.has(id));
const fields = ['title', 'overview', 'background', 'work', 'significance'];
const syntheticExplanations = {
  updated: '2026-10-30',
  entries: awarded.map((prize) => ({
    id: awardId(prize),
    title: `Explanation title for ${awardId(prize)}`,
    overview: `An accessible overview of the work recognised in the ${prize.awardYear} award.`,
    background: `Historical setting for ${awardId(prize)}, including the problem that earlier researchers had left unresolved.`,
    work: `This account distinguishes the recognised work from its background and explains the contribution of the recipients.`,
    significance: `The result mattered because it changed how researchers could investigate the problem in this field.`,
    sources: [{ title: 'Official award record', url: `https://www.nobelprize.org/prizes/${categories[prize.category.en] === 'economics' ? 'economic-sciences' : categories[prize.category.en]}/${prize.awardYear}/summary/` }],
  })),
};
const build = (explanations = syntheticExplanations) => createCatalog(rawPrizes, rawLaureates, editorial, snapshot, explanations);
const modified = (change) => {
  const data = structuredClone(syntheticExplanations);
  change(data);
  return data;
};

test('bundled explanations cover every awarded prize exactly once with substantial distinct fields and sources', async () => {
  const explanations = await read('explanations.json');

  assert.ok(explanations.updated, 'The explanation collection records an update date');
  assert.equal(explanations.entries.length, awarded.length);
  assert.deepEqual([...new Set(explanations.entries.map((entry) => entry.id))].sort(), [...prizeIds].sort());
  for (const entry of explanations.entries) {
    for (const field of fields) assert.ok(typeof entry[field] === 'string' && entry[field].trim().length > 0, `${entry.id}: missing ${field}`);
    assert.equal(new Set(['overview', 'background', 'work', 'significance'].map((key) => entry[key].trim())).size, 4, `${entry.id}: explanation sections should not repeat the same text`);
    assert.ok(entry.sources?.length, `${entry.id}: supporting sources required`);
    for (const source of entry.sources) {
      assert.ok(source.title?.trim(), `${entry.id}: source has a readable title`);
      assert.equal(new URL(source.url).protocol, 'https:', `${entry.id}: source must use HTTPS`);
    }
  }
});

test('the complete explanation collection is included in the built catalogue', async () => {
  const explanations = await read('explanations.json');
  const catalog = build(explanations);

  assert.equal(catalog.meta.explanationCount, awarded.length);
  assert.equal(catalog.prizes.length, awarded.length);
  for (const prize of catalog.prizes) {
    assert.deepEqual(prize.explanation, explanations.entries.find((entry) => entry.id === prize.id));
  }
});

test('explanations enrich uncurated titles and summaries without replacing curated commentary', () => {
  const catalog = build();
  const ordinary = catalog.prizes.find((prize) => prize.id === plainId);
  const explanation = syntheticExplanations.entries.find((entry) => entry.id === plainId);

  assert.equal(ordinary.title, explanation.title);
  assert.equal(ordinary.summary, explanation.overview);
  for (const entry of editorial.entries) {
    const prize = catalog.prizes.find((item) => item.id === entry.id);
    assert.equal(prize.title, entry.title);
    assert.equal(prize.summary, entry.summary);
    assert.equal(prize.detail, entry.detail);
    assert.deepEqual(prize.reassessment, entry.reassessment);
  }
});

test('full explanations do not inflate the curated context lens or reassessment coverage', () => {
  const catalog = build();
  const curated = filterPrizes(catalog.prizes, { lens: 'context' });

  assert.equal(catalog.meta.explanationCount, 639);
  assert.equal(catalog.meta.contextCount, editorial.entries.length);
  assert.equal(curated.length, editorial.entries.length);
  assert.deepEqual(curated.map((prize) => prize.id).sort(), [...editorialIds].sort());
  assert.equal(filterPrizes(catalog.prizes, { lens: 'reassessed' }).length, editorial.entries.filter((entry) => entry.reassessment).length);
});

test('new background, work and significance text is searchable with and without a cached index', () => {
  const data = modified((value) => {
    const entry = value.entries.find((entry) => entry.id === plainId);
    entry.background += ' Uniquebackgroundneedle.';
    entry.work += ' Uniqueworkneedle.';
    entry.significance += ' Uniquesignificanceneedle.';
  });
  const catalog = build(data);
  const cached = catalog.prizes.map((prize) => ({ ...prize, search: searchText(prize) }));

  for (const term of ['Uniquebackgroundneedle', 'Uniqueworkneedle', 'Uniquesignificanceneedle']) {
    assert.deepEqual(filterPrizes(catalog.prizes, { q: term }).map((prize) => prize.id), [plainId]);
    assert.deepEqual(filterPrizes(cached, { q: term }).map((prize) => prize.id), [plainId]);
  }
});

test('all explanation fields and evidence render for both ordinary and curated prizes', () => {
  const catalog = build();
  const lookup = new Map(catalog.prizes.map((prize) => [prize.id, prize]));

  for (const id of [plainId, editorial.entries[0].id]) {
    const prize = lookup.get(id);
    const explanation = syntheticExplanations.entries.find((entry) => entry.id === id);
    const html = detail(prize, lookup, catalog.connections, null);
    for (const field of ['overview', 'background', 'work', 'significance']) assert.ok(html.includes(escape(explanation[field])), `${id}: ${field} must be readable in the prize panel`);
    assert.ok(html.includes('prize-explanation'));
    assert.ok(html.includes('explanation-sources'));
    assert.ok(html.includes(escape(explanation.sources[0].url)));
    assert.ok(!html.includes('has not yet been added'), `${id}: complete explanations must not display the previous missing-content notice`);
  }
});

test('explanation prose and source titles are escaped rather than becoming markup', () => {
  const hostile = '<img src=x onerror="alert(1)"> & unsafe text';
  const data = modified((value) => {
    const entry = value.entries.find((entry) => entry.id === plainId);
    for (const field of fields) entry[field] = `${field}: ${hostile}`;
    entry.sources[0].title = `Source: ${hostile}`;
  });
  const catalog = build(data);
  const lookup = new Map(catalog.prizes.map((prize) => [prize.id, prize]));
  const html = detail(lookup.get(plainId), lookup, [], null);

  assert.ok(!html.includes('<img'));
  assert.ok(html.includes(escape(hostile)));
  assert.ok(html.includes(escape(`Source: ${hostile}`)));
});

test('provided explanation collections fail fast if any awarded prize is missing', () => {
  const incomplete = modified((value) => value.entries.pop());

  assert.throws(() => build(incomplete), /explanation|missing|coverage/i);
  assert.throws(() => build({ updated: '2026-10-30', entries: [] }), /explanation|missing|coverage/i);
});

test('duplicate and unknown explanation IDs cannot silently override or disappear', () => {
  const duplicate = modified((value) => value.entries.push(structuredClone(value.entries[0])));
  const unknown = modified((value) => value.entries.push({ ...value.entries[0], id: '9999-physics' }));

  assert.throws(() => build(duplicate), /duplicate|explanation|id/i);
  assert.throws(() => build(unknown), /invalid|unknown|explanation|id/i);
});

test('blank explanatory fields and missing evidence cannot pass a production build', () => {
  for (const field of fields) {
    const blank = modified((value) => { value.entries[0][field] = '  '; });
    assert.throws(() => build(blank), /missing|invalid|explanation|required/i, `Blank ${field} must be rejected`);
  }
  const noSources = modified((value) => { value.entries[0].sources = []; });
  assert.throws(() => build(noSources), /source|evidence|explanation|required/i);
});

test('explanation sources reject executable or malformed URLs', () => {
  for (const url of ['javascript:alert(1)', 'https://', 'http://www.nobelprize.org/']) {
    const invalid = modified((value) => { value.entries[0].sources[0].url = url; });
    assert.throws(() => build(invalid), /source|url|https|invalid|explanation/i, `${url} must be rejected`);
  }
});

test('recipient metadata and original award motivations remain intact for every award', () => {
  const catalog = build();
  const people = new Map(rawLaureates.laureates.map((person) => [person.id, person]));

  for (const original of awarded) {
    const prize = catalog.prizes.find((item) => item.id === awardId(original));
    assert.equal(prize.recipients.length, original.laureates.length);
    for (const recipient of prize.recipients) {
      const person = people.get(recipient.id);
      const citation = original.laureates.find((item) => item.id === recipient.id);
      assert.equal(recipient.motivation, citation.motivation?.en || '');
      assert.equal(recipient.portion, citation.portion);
      if (person.fullName?.en) assert.equal(recipient.fullName, person.fullName.en, `${prize.id}/${recipient.id}: full name`);
      for (const kind of ['birth', 'death', 'founded']) {
        if (person[kind]?.date) assert.equal(recipient[kind]?.date, person[kind].date, `${prize.id}/${recipient.id}: ${kind} date`);
        if (person[kind]?.place?.locationString?.en) assert.equal(recipient[kind]?.place, person[kind].place.locationString.en, `${prize.id}/${recipient.id}: ${kind} place`);
      }
    }
  }
});

test('repeat-award navigation refers only to awards held by the same recipient', () => {
  const catalog = build();
  const people = new Map(rawLaureates.laureates.map((person) => [person.id, person]));

  for (const prize of catalog.prizes) {
    for (const recipient of prize.recipients) {
      const expected = [...new Set(people.get(recipient.id).nobelPrizes.map(awardId).filter((id) => id !== prize.id))].sort();
      assert.deepEqual([...(recipient.otherPrizes || [])].sort(), expected, `${prize.id}/${recipient.name}: other prizes`);
      assert.equal(new Set(recipient.otherPrizes || []).size, (recipient.otherPrizes || []).length);
    }
  }
});

test('people can be found by the full names shown in their expanded profiles', () => {
  const catalog = build();
  const prize = catalog.prizes.find((item) => item.recipients.some((person) => person.fullName === 'Adolf Friedrich Johann Butenandt'));

  assert.ok(prize, 'The official snapshot contains the expanded full name of Adolf Butenandt');
  assert.ok(filterPrizes(catalog.prizes, { q: 'Adolf Friedrich Johann Butenandt' }).some((item) => item.id === prize.id));
});

test('recipient-specific further reading resolves only to recipients of that award', () => {
  const id = awardId(awarded[0]);
  const recipientId = awarded[0].laureates[0].id;
  const valid = modified((value) => {
    value.entries.find((entry) => entry.id === id).furtherReading = [{ title: 'Laureate biography', url: 'https://www.nobelprize.org/', kind: 'biography', recipientId }];
  });
  const catalog = build(valid);
  assert.equal(catalog.prizes.find((prize) => prize.id === id).explanation.furtherReading[0].recipientId, recipientId);
  const invalid = structuredClone(valid);
  invalid.entries.find((entry) => entry.id === id).furtherReading[0].recipientId = 'nonexistent-person';
  assert.throws(() => build(invalid), /recipient|laureate|reading|explanation|invalid/i);
});

test('real further-reading links have readable labels and valid recipient associations', async () => {
  const explanations = await read('explanations.json');
  const catalog = build(explanations);

  for (const prize of catalog.prizes) {
    for (const source of prize.explanation.furtherReading || []) {
      assert.ok(source.title?.trim(), `${prize.id}: further-reading label`);
      assert.ok(source.kind?.trim(), `${prize.id}: further-reading kind`);
      assert.equal(new URL(source.url).protocol, 'https:');
      if (source.recipientId) assert.ok(prize.recipients.some((recipient) => recipient.id === source.recipientId), `${prize.id}: further-reading recipient`);
    }
  }
});
