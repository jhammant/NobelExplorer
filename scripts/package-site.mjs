import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

async function readTree(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...await readTree(join(directory, entry.name), `${name}/`));
    else files.push([name, await readFile(join(directory, entry.name))]);
  }
  return files;
}

export async function packageSite({ source, destination, catalog }) {
  const files = [...await readTree(source), ['data/catalog.json', Buffer.from(JSON.stringify(catalog))]];
  const html = files.find(([name]) => name === 'index.html')?.[1].toString();
  if (!html) throw new Error('Static site is missing index.html');
  files.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const hash = createHash('sha256');
  for (const [name, body] of files) hash.update(`${name}\0${body.length}\0`).update(body);
  const version = hash.digest('hex').slice(0, 20);
  const assetDirectory = `assets/${version}`;

  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const [name, body] of files) {
    // Keep the original public URLs available; the page uses one versioned tree.
    const publicPath = join(destination, name);
    await mkdir(dirname(publicPath), { recursive: true });
    await writeFile(publicPath, body);
    if (name !== 'index.html') {
      const assetPath = join(destination, assetDirectory, name);
      await mkdir(dirname(assetPath), { recursive: true });
      await writeFile(assetPath, body);
    }
  }

  // Only resource tags change. Navigation and shared prize URLs stay at the root.
  const versionedHtml = html.replace(/(<(?:link|script)\b[^>]*?\b(?:href|src)=")\.\//g, `$1./${assetDirectory}/`);
  await writeFile(join(destination, 'index.html'), versionedHtml);
  await writeFile(join(destination, '.nojekyll'), '');
  return version;
}
