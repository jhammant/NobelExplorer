import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { fetchAll } from './fetch-data.mjs';

const [prizes, laureates] = await Promise.all([fetchAll('nobelPrizes', 'nobelPrizes'), fetchAll('laureates', 'laureates')]);
const directory = new URL('../data/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const [filename, data, key] of [['nobel-prizes.json', prizes, 'nobelPrizes'], ['laureates.json', laureates, 'laureates']]) {
  const previous = JSON.parse(await readFile(new URL(filename, directory), 'utf8'));
  if (data[key].length < previous[key].length) throw new Error(`Refusing a shrinking ${key} dataset: review the upstream response first.`);
}
const files = [['nobel-prizes.json', prizes], ['laureates.json', laureates], ['snapshot.json', { retrievedAt: new Date().toISOString(), source: 'https://api.nobelprize.org/2.1/', prizeRecords: prizes.nobelPrizes.length, laureateRecords: laureates.laureates.length }]];
for (const [filename, data] of files) await writeFile(new URL(`${filename}.tmp`, directory), `${JSON.stringify(data, null, 2)}\n`);
for (const [filename] of files) await rename(new URL(`${filename}.tmp`, directory), new URL(filename, directory));
console.log(`Refreshed ${prizes.nobelPrizes.length} prize records and ${laureates.laureates.length} laureates. Run npm run check before publishing.`);
