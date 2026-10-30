import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAll } from '../scripts/fetch-data.mjs';

test('rewrites the Nobel API legacy HTTP pagination host to the public HTTPS endpoint', async () => {
  const calls = [];
  const pages = [
    { laureates: [{ id: '1' }], meta: { count: 2 }, links: { next: 'http://nobel-external-api-app.azurewebsites.net/2.1/laureates?offset=1&limit=1' } },
    { laureates: [{ id: '2' }], meta: { count: 2 }, links: {} },
  ];
  const fetcher = async (url) => { calls.push(url); return { ok: true, json: async () => pages.shift() }; };

  const result = await fetchAll('laureates', 'laureates', fetcher);

  assert.deepEqual(result.laureates.map((p) => p.id), ['1', '2']);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((url) => url.startsWith('https://api.nobelprize.org/')));
  assert.equal(result.links.next, undefined);
});

test('rejects off-origin pagination before making another request', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return { ok: true, json: async () => ({ laureates: [{ id: '1' }], meta: { count: 2 }, links: { next: 'https://example.org/private' } }) }; };

  await assert.rejects(fetchAll('laureates', 'laureates', fetcher), /Unexpected pagination URL/);

  assert.equal(calls, 1);
});

test('rejects repeated pages and truncated collections', async () => {
  const loop = async () => ({ ok: true, json: async () => ({ laureates: [{ id: '1' }], links: { next: 'http://api.nobelprize.org/2.1/laureates?limit=1000&sort=asc' } }) });
  const incomplete = async () => ({ ok: true, json: async () => ({ laureates: [{ id: '1' }], meta: { count: 2 }, links: {} }) });

  await assert.rejects(fetchAll('laureates', 'laureates', loop), /Unexpected pagination URL/);
  await assert.rejects(fetchAll('laureates', 'laureates', incomplete), /pagination incomplete/);
});

test('fails clearly on upstream errors', async () => {
  const fetcher = async () => ({ ok: false, status: 503 });

  await assert.rejects(fetchAll('nobelPrizes', 'nobelPrizes', fetcher), /HTTP 503; existing snapshot retained/);
});
