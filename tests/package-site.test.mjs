import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { packageSite } from '../scripts/package-site.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'nobel-site-package-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, 'site');
  const destination = join(directory, 'dist');
  await mkdir(join(source, 'fonts'), { recursive: true });
  const files = {
    'index.html': '<link rel="icon" href="./favicon.svg"><link rel="stylesheet" href="./styles.css"><script type="module" src="./app.js"></script><a href="./">Home</a><a href="?prize=1911-chemistry">Prize</a>',
    'app.js': 'import { value } from "./model.js"; fetch(new URL("./data/catalog.json", import.meta.url));',
    'model.js': 'export const value = 1;',
    'styles.css': '@font-face { src: url("./fonts/reader.woff2"); }',
    'fonts/reader.woff2': Buffer.from([0, 255, 19, 42]),
    'favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  };
  await Promise.all(Object.entries(files).map(([name, body]) => writeFile(join(source, name), body)));
  return { source, destination, catalog: { prizes: [{ id: '1911-chemistry' }] }, files };
}

test('published HTML loads a complete matching asset tree without changing navigation URLs', async (t) => {
  const { files, ...options } = await fixture(t);

  const version = await packageSite(options);
  const html = await readFile(join(options.destination, 'index.html'), 'utf8');
  const references = [...html.matchAll(/<(?:link|script)\b[^>]*?(?:href|src)="([^"]+)"/g)].map((match) => match[1]);

  assert.match(version, /^[a-f0-9]{20}$/);
  assert.deepEqual(references, ['favicon.svg', 'styles.css', 'app.js'].map((name) => `./assets/${version}/${name}`));
  assert.ok(html.includes('<a href="./">Home</a>'));
  assert.ok(html.includes('<a href="?prize=1911-chemistry">Prize</a>'));
  for (const [name, body] of Object.entries(files).filter(([name]) => name !== 'index.html')) {
    assert.deepEqual(await readFile(join(options.destination, 'assets', version, name)), Buffer.from(body), name);
    assert.deepEqual(await readFile(join(options.destination, name)), Buffer.from(body), `Original URL: ${name}`);
  }
  const catalog = await readFile(join(options.destination, 'assets', version, 'data/catalog.json'), 'utf8');
  assert.deepEqual(JSON.parse(catalog), options.catalog);
  assert.equal(catalog, await readFile(join(options.destination, 'data/catalog.json'), 'utf8'));
  assert.equal(await readFile(join(options.destination, '.nojekyll'), 'utf8'), '');
});

test('the asset version is reproducible and changes for markup, nested modules, styles, fonts and data', async (t) => {
  const { files, ...options } = await fixture(t);
  const initial = await packageSite(options);
  assert.equal(await packageSite(options), initial);

  for (const name of ['index.html', 'model.js', 'styles.css', 'fonts/reader.woff2']) {
    await writeFile(join(options.source, name), Buffer.concat([Buffer.from(files[name]), Buffer.from('changed')]));
    assert.notEqual(await packageSite(options), initial, `${name} must invalidate the whole asset tree`);
    await writeFile(join(options.source, name), files[name]);
  }
  assert.equal(await packageSite(options), initial, 'Restoring identical input restores identical URLs');
  assert.notEqual(await packageSite({ ...options, catalog: { prizes: [] } }), initial, 'Data changes invalidate the asset tree');
});
