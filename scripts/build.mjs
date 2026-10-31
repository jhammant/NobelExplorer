import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createCatalog } from './catalog.mjs';
import { packageSite } from './package-site.mjs';

const read = async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const [prizes, laureates, editorial, snapshot, explanations, deepDives] = await Promise.all(['nobel-prizes.json', 'laureates.json', 'editorial.json', 'snapshot.json', 'explanations.json', 'deep-dives.json'].map(read));
const catalog = createCatalog(prizes, laureates, editorial, snapshot, explanations, deepDives);
await packageSite({
  source: fileURLToPath(new URL('../site/', import.meta.url)),
  destination: fileURLToPath(new URL('../dist/', import.meta.url)),
  catalog,
});
console.log(`Built ${catalog.meta.prizeCount} prizes, ${catalog.meta.laureateCount} laureates, ${catalog.meta.explanationCount} explanations, ${catalog.meta.deepDiveCount} deep dives, ${catalog.meta.contextCount} context notes and ${catalog.meta.connectionCount} connections.`);
