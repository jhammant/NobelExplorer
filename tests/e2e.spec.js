import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const raw = JSON.parse(await readFile(new URL('../data/nobel-prizes.json', import.meta.url), 'utf8'));
const editorial = JSON.parse(await readFile(new URL('../data/editorial.json', import.meta.url), 'utf8'));
const total = raw.nobelPrizes.filter((prize) => prize.laureates?.length).length;

const readExplanations = async () => JSON.parse(await readFile(new URL('../data/explanations.json', import.meta.url), 'utf8'));

async function openAtlas(page, query = '') {
  await page.goto(`./${query}`);
  await expect(page.locator('#load-state')).toBeHidden();
  await expect(page.locator('#result-count')).toContainText(`of ${total} prizes`);
}

async function setYear(page, field, value) {
  await page.getByLabel(field, { exact: true }).fill(String(value));
  await page.getByLabel(field, { exact: true }).press('Tab');
}

async function documentFits(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !test.info().title.includes('failed data fetch')) errors.push(message.text());
  });
  test.info().annotations.push({ type: 'browser-errors', description: 'All uncaught exceptions and unexpected console errors are checked after the journey.' });
  page.__qaErrors = errors;
});

test.afterEach(async ({ page }) => {
  expect(page.__qaErrors).toEqual([]);
});

test('all awards are available in timeline and catalogue pagination', async ({ page }) => {
  await openAtlas(page);

  await expect(page.locator('#result-count')).toContainText(`${total} of ${total} prizes`);
  await expect(page.locator('.category-option')).toHaveCount(6);
  await expect(page.locator('.prize-dot')).toHaveCount(total);
  await expect(page.locator('.prize-row')).toHaveCount(30);
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  await expect(page.locator('.timeline-panel')).toHaveCount(0);
  await page.getByRole('button', { name: /^Show more/ }).click();
  await expect(page.locator('.prize-row')).toHaveCount(80);
  while (await page.getByRole('button', { name: /^Show more/ }).count()) {
    await page.getByRole('button', { name: /^Show more/ }).click();
  }
  await expect(page.locator('.prize-row')).toHaveCount(total);
  const ids = await page.locator('.prize-row').evaluateAll((rows) => rows.map((row) => row.dataset.prize));
  expect(new Set(ids).size).toBe(total);
});

test('search finds repeat winners and accent-insensitive names', async ({ page }) => {
  await openAtlas(page);

  await page.getByRole('searchbox').fill('Marie Curie');
  await expect(page.locator('.prize-row')).toHaveCount(2);
  await expect(page.locator('.prize-row[data-prize="1903-physics"]')).toBeVisible();
  await expect(page.locator('.prize-row[data-prize="1911-chemistry"]')).toBeVisible();
  await page.getByRole('searchbox').fill('Schrodinger');
  await expect(page.locator('.prize-row[data-prize="1933-physics"]')).toBeVisible();
  await expect(page.locator('#result-count')).toContainText('1 of');
});

test('category, year, topic, country and institution filters intersect', async ({ page }) => {
  await openAtlas(page);

  await page.getByRole('searchbox').fill('Marie Curie');
  await page.getByRole('checkbox', { name: 'Chemistry', exact: true }).check();
  await setYear(page, 'From', 1909);
  await setYear(page, 'To', 1912);
  await page.getByText('Places & institutions', { exact: true }).click();
  await page.getByLabel('Birth / founding country').selectOption('Poland');
  await expect(page.locator('.prize-row')).toHaveCount(1);
  await expect(page.locator('.prize-row[data-prize="1911-chemistry"]')).toBeVisible();
  await page.locator('.prize-row').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const recipientFacts = await page.locator('#prize-content .recipient-facts').first().textContent();
  expect(recipientFacts).toContain('Poland');
  await page.getByRole('button', { name: 'Close prize details' }).click();
  await page.getByLabel('Institution at award').selectOption('Sorbonne University');
  await expect(page.locator('.prize-row')).toHaveCount(1);
  const topicValues = await page.locator('#topic option').evaluateAll((options) => options.map((option) => option.value));
  expect(topicValues).toContain('Atoms & particles');
  await page.getByRole('combobox', { name: 'Topic', exact: true }).selectOption('Atoms & particles');
  await expect(page.locator('.prize-row')).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Chemistry', exact: true })).toBeChecked();
  await expect(page.getByLabel('Birth / founding country')).toHaveValue('Poland');
  await expect(page.getByLabel('Institution at award')).toHaveValue('Sorbonne University');
  await expect(page.locator('.prize-row')).toHaveCount(1);
});

test('multiple categories are a union and clearing filters restores the collection', async ({ page }) => {
  await openAtlas(page);

  await setYear(page, 'From', 1901);
  await setYear(page, 'To', 1901);
  await page.getByRole('checkbox', { name: 'Physics', exact: true }).check();
  await expect(page.locator('.prize-row')).toHaveCount(1);
  await page.getByRole('checkbox', { name: 'Chemistry', exact: true }).check();
  await expect(page.locator('.prize-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove filter Physics', exact: true }).click();
  await expect(page.locator('.prize-row')).toHaveCount(1);
  await page.locator('#reset-filters').click();
  await expect(page.locator('#result-count')).toContainText(`${total} of ${total}`);
  await expect(page.locator('#active-filters')).toBeEmpty();
});

test('numeric ranges clamp and an empty search provides a working reset', async ({ page }) => {
  await openAtlas(page);

  await setYear(page, 'From', 9999);
  await expect(page.getByLabel('From', { exact: true })).toHaveValue('2026');
  await expect(page.getByLabel('To', { exact: true })).toHaveValue('2026');
  await setYear(page, 'To', 1901);
  await expect(page.getByLabel('From', { exact: true })).toHaveValue('1901');
  await page.getByRole('searchbox').fill('no-such-prize-xyz');
  await expect(page.locator('.empty-state')).toBeVisible();
  await expect(page.locator('.prize-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.locator('#result-count')).toContainText(`${total} of ${total}`);
});

test('every grouping mode works and grouping preserves shared-prize uniqueness', async ({ page }) => {
  await openAtlas(page, '?q=Marie+Curie&view=catalogue');

  for (const mode of ['decade', 'year', 'category', 'topic', 'country', 'institution']) {
    await page.getByLabel('Group by').selectOption(mode);
    await expect(page.locator('.prize-group').first()).toBeVisible();
    const groups = await page.locator('.prize-group').evaluateAll((sections) => sections.map((section) => [...section.querySelectorAll('.prize-row')].map((row) => row.dataset.prize)));
    expect(groups.flat()).toContain('1903-physics');
    expect(groups.flat()).toContain('1911-chemistry');
    for (const group of groups) expect(new Set(group).size).toBe(group.length);
    if (['topic', 'country', 'institution'].includes(mode)) await expect(page.locator('.catalogue-heading p')).toContainText('more than one');
  }
  await page.getByLabel('Group by').selectOption('year');
  await page.getByLabel('Sort by year').selectOption('oldest');
  await expect(page.locator('.group-heading h3').first()).toHaveText('1903');
  await page.getByLabel('Sort by year').selectOption('newest');
  await expect(page.locator('.group-heading h3').first()).toHaveText('1911');
});

test('prize details show complete recipient citations, context and source links', async ({ page }) => {
  await openAtlas(page, '?prize=1962-medicine');
  const dialog = page.locator('#prize-dialog');

  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.recipient')).toHaveCount(3);
  await expect(dialog.locator('.recipient blockquote')).toHaveCount(3);
  await expect(dialog.locator('.reassessment-box')).toBeVisible();
  await expect(dialog.locator('.reassessment-box')).toContainText('Franklin');
  await expect(dialog.locator('.reassessment-box')).toContainText('1958');
  const deeperContext = dialog.locator('details').filter({ has: page.getByText('Go a little deeper', { exact: true }) });
  await expect(deeperContext).toHaveAttribute('open', '');
  await dialog.getByText('Go a little deeper', { exact: true }).click();
  await expect(deeperContext).not.toHaveAttribute('open', '');
  await dialog.getByText('Go a little deeper', { exact: true }).click();
  await expect(deeperContext).toHaveAttribute('open', '');
  const sourceHrefs = await dialog.locator('.source-list a').evaluateAll((links) => links.map((link) => link.href));
  expect(sourceHrefs.length).toBeGreaterThan(2);
  expect(sourceHrefs.every((href) => href.startsWith('https://'))).toBe(true);
  await expect(dialog.locator('.official-link')).toHaveAttribute('href', 'https://www.nobelprize.org/prizes/medicine/1962/summary/');
  await page.getByRole('button', { name: 'Close prize details' }).click();
  await expect(dialog).toBeHidden();
  expect(new URL(page.url()).searchParams.has('prize')).toBe(false);
});

test('reassessment lenses distinguish overturned claims, harms and disputed credit', async ({ page }) => {
  await openAtlas(page);

  await page.getByRole('button', { name: 'Explore the debates', exact: true }).click();
  const reassessments = editorial.entries.filter((entry) => entry.reassessment);
  await expect(page.locator('.prize-row')).toHaveCount(reassessments.length);
  await page.getByLabel('Look closer').selectOption('overturned');
  await expect(page.locator('.prize-row')).toHaveCount(2);
  await expect(page.locator('.prize-row[data-prize="1926-medicine"]')).toBeVisible();
  await page.locator('.prize-row[data-prize="1938-physics"]').click();
  await expect(page.locator('.reassessment-box')).toContainText('remained valid');
  await expect(page.locator('#prize-dialog')).toContainText('From uranium irradiation to nuclear fission');
  await page.getByRole('button', { name: 'Close prize details' }).click();
  await page.getByLabel('Look closer').selectOption('harmful');
  await page.locator('.prize-row[data-prize="1949-medicine"]').click();
  await expect(page.locator('.reassessment-box')).toContainText('Moniz');
  await expect(page.locator('.reassessment-box')).toContainText('Hess');
  await expect(page.locator('#prize-dialog .recipient')).toHaveCount(2);
  await page.getByRole('button', { name: 'Close prize details' }).click();
  await page.getByLabel('Look closer').selectOption('credit');
  await expect(page.locator('.prize-row[data-prize="1962-medicine"]')).toBeVisible();
  await expect(page.locator('.prize-row[data-prize="1974-physics"]')).toBeVisible();
});

test('connection graph and evidence list agree and filters require both endpoints', async ({ page }) => {
  await openAtlas(page, '?view=connections');

  await expect(page.locator('.connection-entry')).toHaveCount(editorial.connections.length);
  await expect(page.locator('.graph-edge')).toHaveCount(editorial.connections.length);
  await page.locator('.connection-entry details summary').first().click();
  await expect(page.locator('.connection-entry details').first().locator('a').first()).toBeVisible();
  // The whole labelled node is an interactive target, including its unpainted gaps.
  await page.locator('.graph-node').first().click();
  await expect(page.locator('#prize-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close prize details' }).click();
  await page.getByRole('searchbox').fill('Marie Curie');
  await expect(page.locator('.connection-entry')).toHaveCount(1);
  await page.getByRole('searchbox').fill('Marie Curie 1911');
  await expect(page.locator('.empty-state')).toBeVisible();
  await page.getByRole('button', { name: 'Browse matching prizes', exact: true }).click();
  await expect(page.locator('.prize-row')).toHaveCount(1);
});

test('discovery trails support next, previous, leaving the trail and deep links', async ({ page }) => {
  const trail = editorial.trails.find((item) => item.id === 'reading-life');
  await openAtlas(page);

  await page.locator('[data-trail="reading-life"]').click();
  await expect(page.locator('#active-trail')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('trail')).toBe(trail.id);
  await page.locator('#active-trail [data-prize]').click();
  await expect(page.locator('#prize-dialog')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('prize')).toBe(trail.prizeIds[0]);
  await expect(page.getByRole('button', { name: '← Previous prize', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Next prize →', exact: true }).click();
  expect(new URL(page.url()).searchParams.get('prize')).toBe(trail.prizeIds[1]);
  expect(await page.locator('#prize-dialog').evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  await page.getByRole('button', { name: '← Previous prize', exact: true }).click();
  expect(new URL(page.url()).searchParams.get('prize')).toBe(trail.prizeIds[0]);
  await page.reload();
  await expect(page.locator('#prize-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close prize details' }).click();
  await page.getByRole('button', { name: 'Leave discovery trail', exact: true }).click();
  await expect(page.locator('#active-trail')).toBeEmpty();
  await expect(page.locator('#result-count')).toContainText(`${total} of ${total}`);
});

test('browser back and forward restore the previous prize and its filtered view', async ({ page }) => {
  await openAtlas(page, '?q=Marie+Curie&view=catalogue');
  await page.locator('.prize-row[data-prize="1911-chemistry"]').click();
  await page.getByRole('button', { name: 'Close prize details' }).click();
  await page.locator('.prize-row[data-prize="1903-physics"]').click();

  await page.goBack();
  await expect(page.locator('#prize-dialog')).toBeHidden();
  await expect(page.getByRole('searchbox')).toHaveValue('Marie Curie');
  await expect(page.locator('.prize-row')).toHaveCount(2);
  await page.goForward();
  await expect(page.locator('#prize-dialog')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('prize')).toBe('1903-physics');
  await page.reload();
  await expect(page.locator('#prize-dialog')).toBeVisible();
  await expect(page.getByRole('searchbox')).toHaveValue('Marie Curie');
});

test('keyboard timeline moves between years and categories and modal returns focus', async ({ page }) => {
  await openAtlas(page);
  const first = page.locator('.prize-dot[tabindex="0"]');
  await first.focus();
  const firstYear = Number(await first.getAttribute('data-year'));
  await page.keyboard.press('ArrowRight');
  let active = page.locator('.prize-dot:focus');
  expect(Number(await active.getAttribute('data-year'))).toBeGreaterThan(firstYear);
  await page.keyboard.press('ArrowDown');
  active = page.locator('.prize-dot:focus');
  await expect(active).toHaveAttribute('data-category', 'chemistry');
  await page.keyboard.press('Home');
  await expect(page.locator('.prize-dot:focus')).toHaveAttribute('data-year', '1901');
  await page.keyboard.press('End');
  const selectedId = await page.locator('.prize-dot:focus').getAttribute('data-prize');
  await page.keyboard.press('Enter');
  await expect(page.locator('#prize-dialog')).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.locator('#prize-dialog').evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#prize-dialog')).toBeHidden();
  await expect(page.locator('.prize-dot:focus')).toHaveAttribute('data-prize', selectedId);
});

test('sharing copies a URL that reconstructs the selected view and prize', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openAtlas(page, '?q=Marie+Curie&view=catalogue&prize=1911-chemistry');
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(copied).searchParams.get('prize')).toBe('1911-chemistry');
  expect(new URL(copied).searchParams.get('q')).toBe('Marie Curie');
  const secondPage = await context.newPage();
  await secondPage.goto(copied);
  await expect(secondPage.locator('#prize-dialog')).toBeVisible();
  await expect(secondPage.getByRole('searchbox')).toHaveValue('Marie Curie');
  await secondPage.close();
});

test('methodology dialog explains coverage and closes with Escape', async ({ page }) => {
  await openAtlas(page);

  await page.getByRole('button', { name: 'About the data', exact: true }).click();
  await expect(page.locator('#about-dialog')).toBeVisible();
  await expect(page.locator('#about-content')).toContainText(String(total));
  await expect(page.locator('#about-content')).toContainText('birthplace');
  await expect(page.locator('#about-content')).toContainText('award years');
  await page.keyboard.press('Escape');
  await expect(page.locator('#about-dialog')).toBeHidden();
  expect(await page.locator('body').evaluate((body) => body.style.overflow)).not.toBe('hidden');
});

test('failed data fetch gives a working retry and no uncaught exception', async ({ page }) => {
  let attempts = 0;
  await page.route('**/data/catalog.json', async (route) => {
    attempts++;
    if (attempts === 1) await route.fulfill({ status: 503, body: 'Unavailable' });
    else await route.continue();
  });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Try again', exact: true }).click();

  await expect(page.locator('#result-count')).toContainText(`${total} of ${total}`);
  await expect(page.locator('#load-state')).toBeHidden();
  expect(attempts).toBe(2);
});

test('layout stays inside the viewport for the timeline, graph and prize detail', async ({ page }, testInfo) => {
  await openAtlas(page);
  expect(await documentFits(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('atlas-top.png'), fullPage: false });
  await page.locator('#explorer').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('atlas-explorer.png'), fullPage: false });
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  expect(await documentFits(page)).toBe(true);
  await page.locator('.connection-map').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('atlas-connections.png'), fullPage: false });
  await page.locator('.graph-node circle').first().click();
  expect(await documentFits(page)).toBe(true);
  const dialog = await page.locator('#prize-dialog').boundingBox();
  expect(dialog.x).toBeGreaterThanOrEqual(0);
  expect(dialog.x + dialog.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  await page.screenshot({ path: testInfo.outputPath('atlas-detail.png'), fullPage: false });
});

for (const [categoryName, id] of [
  ['Physics', '1902-physics'], ['Chemistry', '1901-chemistry'], ['Medicine', '1901-medicine'],
  ['Literature', '1901-literature'], ['Peace', '1902-peace'], ['Economics', '1969-economics'],
]) {
  test(`previously sparse ${categoryName} prize now has a full readable explanation`, async ({ page }) => {
    const data = await readExplanations();
    const entry = data.entries.find((item) => item.id === id);
    expect(entry).toBeDefined();
    expect(editorial.entries.some((item) => item.id === id)).toBe(false);
    await openAtlas(page, `?prize=${id}`);

    const dialog = page.locator('#prize-dialog');
    await expect(dialog.locator('.prize-explanation')).toBeVisible();
    await expect(dialog.locator('.editorial-gap')).toHaveCount(0);
    for (const field of ['overview', 'background', 'work', 'significance']) {
      const section = dialog.locator(`[data-explanation-field="${field}"]`);
      await expect(section).toHaveCount(1);
      await section.scrollIntoViewIfNeeded();
      await expect(section).toBeVisible();
      // Check complete rendering without freezing generated editorial wording.
      await expect(section).toHaveText(entry[field]);
    }
    const sources = dialog.locator('.explanation-sources a');
    expect(await sources.count()).toBeGreaterThanOrEqual(entry.sources.length);
    expect(await sources.evaluateAll((links) => links.every((link) => link.href.startsWith('https://')))).toBe(true);
    const furtherReading = dialog.locator('.further-reading a');
    expect(entry.furtherReading?.length).toBeGreaterThanOrEqual(2);
    await expect(furtherReading).toHaveCount(entry.furtherReading.length);
    for (const source of entry.furtherReading) {
      const link = furtherReading.filter({ hasText: source.title });
      await expect(link).toHaveAttribute('href', source.url);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', /noopener/);
    }
    expect(await documentFits(page)).toBe(true);
    await page.getByRole('button', { name: 'Close prize details' }).click();
    await expect(dialog).toBeHidden();
  });
}

test('long shared-prize reading preserves all recipients and scrolls back to a working close control', async ({ page }, testInfo) => {
  const id = '2025-physics';
  const official = raw.nobelPrizes.find((prize) => prize.awardYear === '2025' && prize.category.en === 'Physics');
  await openAtlas(page, '?from=2025&to=2025&categories=physics&view=catalogue');
  const opener = page.locator(`.prize-row[data-prize="${id}"]`);
  await opener.click();
  const dialog = page.locator('#prize-dialog');

  await expect(dialog.locator('.recipient')).toHaveCount(official.laureates.length);
  for (const recipient of official.laureates) await expect(dialog).toContainText((recipient.knownName || recipient.orgName).en);
  await expect(dialog.locator('.recipient blockquote')).toHaveCount(official.laureates.length);
  await expect(dialog.locator('.prize-explanation')).toBeVisible();
  for (const [button, target] of [['The story', '#prize-story'], ['Laureates & citation', '#prize-laureates'], ['Sources & reading', '#prize-reading']]) {
    await dialog.getByRole('navigation', { name: 'On this prize page' }).getByRole('button', { name: button, exact: true }).click();
    await expect(dialog.locator(target)).toBeFocused();
  }
  await dialog.locator('[data-explanation-field="significance"]').scrollIntoViewIfNeeded();
  const lastSource = dialog.locator('.explanation-sources a').last();
  await lastSource.scrollIntoViewIfNeeded();
  await lastSource.focus();
  expect(await dialog.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await expect(page.getByRole('button', { name: 'Close prize details' })).toBeInViewport();
  await expect(dialog.locator('#prize-reading-label')).toHaveText('2025 · Physics');
  await expect(dialog.locator('#prize-reading-label')).toBeInViewport();
  expect(await documentFits(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('expanded-shared-prize.png'), fullPage: false });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  expect(new URL(page.url()).searchParams.has('prize')).toBe(false);
  expect(await page.locator('body').evaluate((body) => body.style.overflow)).not.toBe('hidden');
  await opener.click();
  await dialog.locator('.explanation-sources a').last().scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Close prize details' }).click();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('expanded recipient details show life dates and navigate genuine repeat awards', async ({ page }) => {
  await openAtlas(page, '?prize=1903-physics');
  const dialog = page.locator('#prize-dialog');
  const marie = dialog.locator('.recipient').filter({ hasText: 'Marie Curie' });

  await expect(marie).toHaveCount(1);
  await expect(marie).toContainText('1867');
  await expect(marie).toContainText('1934');
  const repeatLink = marie.locator('[data-prize="1911-chemistry"]');
  await expect(repeatLink).toHaveCount(1);
  await repeatLink.click();
  expect(new URL(page.url()).searchParams.get('prize')).toBe('1911-chemistry');
  await expect(dialog.locator('#prize-reading-label')).toHaveText('1911 · Chemistry');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await expect(dialog.locator('.recipient')).toHaveCount(1);
  await expect(dialog.locator('.prize-explanation')).toBeVisible();
  await page.goto('./?prize=1917-peace');
  await expect(page.locator('#prize-dialog')).toBeVisible();
  await expect(page.locator('#prize-dialog .recipient')).toContainText('1863');
});

test('complete explanations remain distinct from the curated-context and reassessment filters', async ({ page }) => {
  await openAtlas(page);

  await page.getByLabel('Look closer').selectOption('context');
  await expect(page.locator('#result-count')).toContainText(`${editorial.entries.length} of ${total} prizes`);
  await page.getByLabel('Look closer').selectOption('reassessed');
  await expect(page.locator('#result-count')).toContainText(`${editorial.entries.filter((entry) => entry.reassessment).length} of ${total} prizes`);
  await page.getByLabel('Look closer').selectOption('all');
  await expect(page.locator('#result-count')).toContainText(`${total} of ${total} prizes`);
});

test('a phrase from the new background is discoverable through the live search control', async ({ page }) => {
  const data = await readExplanations();
  const entry = data.entries.find((item) => item.id === '1902-physics');
  const words = entry.background.match(/[\p{L}\p{N}-]+/gu).filter((word) => word.length >= 5).slice(0, 3);
  expect(words.length).toBe(3);
  await openAtlas(page, '?view=catalogue');

  await page.getByRole('searchbox').fill(words.join(' '));

  const matchingPrize = page.locator(`.prize-row[data-prize="${entry.id}"]`);
  const showMore = page.getByRole('button', { name: /^Show more/ });
  while (!(await matchingPrize.count()) && await showMore.count()) await showMore.click();
  await expect(matchingPrize).toBeVisible();
  await matchingPrize.click();
  await expect(page.locator('#prize-dialog [data-explanation-field="background"]')).toBeVisible();
});

const readDeepDives = async () => JSON.parse(await readFile(new URL('../data/deep-dives.json', import.meta.url), 'utf8'));
const normalizedProse = (value) => value.replace(/\s+/g, ' ').trim();

for (const [categoryName, id] of [
  ['Physics', '2025-physics'], ['Chemistry', '1952-chemistry'], ['Medicine', '2023-medicine'],
  ['Literature', '1954-literature'], ['Peace', '1964-peace'], ['Economics', '1969-economics'],
]) {
  test(`${categoryName} deep dive exposes every section and term with the right supporting sources`, async ({ page }) => {
    const data = await readDeepDives();
    const entry = data.entries.find((item) => item.id === id);
    expect(entry).toBeDefined();
    await openAtlas(page, `?prize=${id}`);
    const dialog = page.locator('#prize-dialog');
    const deepDive = dialog.locator('#prize-deep-dive');

    await dialog.getByRole('navigation', { name: 'On this prize page' }).getByRole('button', { name: 'In more detail', exact: true }).click();

    await expect(deepDive).toBeFocused();
    for (const section of entry.sections) {
      const heading = deepDive.getByRole('heading', { name: section.heading, exact: true });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
      const sectionElement = heading.locator('..');
      expect(normalizedProse(await sectionElement.innerText())).toContain(normalizedProse(section.body));
      const sourceUrls = section.sourceIds.map((id) => entry.sources.find((source) => source.id === id).url);
      const renderedUrls = await sectionElement.locator('a').evaluateAll((links) => links.map((link) => link.href));
      expect(renderedUrls.sort()).toEqual([...sourceUrls].sort());
    }
    const glossary = deepDive.locator('dl.key-terms');
    await expect(glossary.locator('dt')).toHaveText(entry.terms.map((term) => term.term));
    for (let index = 0; index < entry.terms.length; index++) {
      const term = entry.terms[index];
      const definition = glossary.locator('dt').nth(index).locator('xpath=following-sibling::dd[1]');
      await definition.scrollIntoViewIfNeeded();
      await expect(definition).toBeVisible();
      expect(normalizedProse(await definition.innerText())).toContain(normalizedProse(term.definition));
      const sourceUrls = term.sourceIds.map((id) => entry.sources.find((source) => source.id === id).url);
      const renderedUrls = await definition.locator('a').evaluateAll((links) => links.map((link) => link.href));
      expect(renderedUrls.sort()).toEqual([...sourceUrls].sort());
    }
    await deepDive.locator('summary').click();
    for (const link of await deepDive.locator('a').all()) {
      await expect(link).toHaveAttribute('href', /^https:\/\//);
      await expect(link).toHaveAccessibleName(/\S/);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', /noopener/);
    }
    expect(await documentFits(page)).toBe(true);
    await page.getByRole('button', { name: 'Close prize details' }).click();
    await expect(dialog).toBeHidden();
  });
}

test('live search indexes deep-dive text and glossary definitions loaded from the catalogue', async ({ page }) => {
  const id = '1952-chemistry';
  await page.route('**/data/catalog.json', async (route) => {
    const response = await route.fetch();
    const catalog = await response.json();
    const prize = catalog.prizes.find((item) => item.id === id);
    prize.deepDive.sections[0].body += ' Uniqueextendedbodyneedle.';
    prize.deepDive.terms[0].definition += ' Uniqueextendeddefinitionneedle.';
    await route.fulfill({ response, json: catalog });
  });
  await openAtlas(page, '?view=catalogue');

  for (const query of ['Uniqueextendedbodyneedle', 'Uniqueextendeddefinitionneedle']) {
    await page.getByRole('searchbox').fill(query);
    await expect(page.locator('.prize-row')).toHaveCount(1);
    await expect(page.locator('.prize-row')).toHaveAttribute('data-prize', id);
  }
  await page.locator('.prize-row').click();
  await page.getByRole('navigation', { name: 'On this prize page' }).getByRole('button', { name: 'In more detail', exact: true }).click();
  await expect(page.locator('#prize-deep-dive')).toContainText('Uniqueextendeddefinitionneedle');
});

test('extended reading preserves keyboard focus, opens cited evidence and closes from the glossary', async ({ page, context }, testInfo) => {
  const id = '2025-physics';
  const data = await readDeepDives();
  const entry = data.entries.find((item) => item.id === id);
  const firstSource = entry.sources.find((source) => source.id === entry.sections[0].sourceIds[0]);
  await context.route(firstSource.url, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Evidence navigation probe</title><p>Source destination reached.</p>' }));
  await openAtlas(page, '?from=2025&to=2025&categories=physics&view=catalogue');
  const opener = page.locator(`.prize-row[data-prize="${id}"]`);
  await opener.click();
  const dialog = page.locator('#prize-dialog');
  const deepDive = dialog.locator('#prize-deep-dive');
  await dialog.getByRole('navigation', { name: 'On this prize page' }).getByRole('button', { name: 'In more detail', exact: true }).click();
  await expect(deepDive).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await deepDive.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  const link = deepDive.locator('.deep-dive-section').first().locator('.inline-sources a').first();
  await expect(link).toHaveAttribute('href', firstSource.url);
  const popupPromise = page.waitForEvent('popup');
  await link.click();
  const evidencePage = await popupPromise;
  await evidencePage.waitForLoadState();
  expect(evidencePage.url()).toBe(firstSource.url);
  expect(await evidencePage.evaluate(() => window.opener)).toBeNull();
  await evidencePage.close();
  await deepDive.locator('.key-terms dd').last().scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: 'Close prize details' })).toBeInViewport();
  expect(await dialog.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  expect(await documentFits(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('extended-glossary.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.click();
  await dialog.locator('.key-terms dd').last().scrollIntoViewIfNeeded();
  await dialog.getByRole('button', { name: 'Close prize details' }).click();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('model-generated deep-dive prose remains text when it contains executable-looking markup', async ({ page }) => {
  const id = '1952-chemistry';
  const hostile = '<img src=x onerror="window.deepDiveInjected=true"> <script>window.deepDiveInjected=true</script>';
  await page.route('**/data/catalog.json', async (route) => {
    const response = await route.fetch();
    const catalog = await response.json();
    const entry = catalog.prizes.find((item) => item.id === id).deepDive;
    entry.sections[0].heading = `Heading ${hostile}`;
    entry.sections[0].body = `Body ${hostile}`;
    entry.terms[0].term = `Term ${hostile}`;
    entry.terms[0].definition = `Definition ${hostile}`;
    entry.sources[0].title = `Source ${hostile}`;
    await route.fulfill({ response, json: catalog });
  });
  await openAtlas(page, `?prize=${id}`);
  const deepDive = page.locator('#prize-deep-dive');

  await expect(deepDive.locator('img, script')).toHaveCount(0);
  for (const label of ['Heading', 'Body', 'Term', 'Definition']) await expect(deepDive).toContainText(`${label} ${hostile}`);
  expect(await page.evaluate(() => window.deepDiveInjected)).toBeUndefined();
  expect(await documentFits(page)).toBe(true);
});
