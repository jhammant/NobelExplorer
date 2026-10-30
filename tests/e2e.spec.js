import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const raw = JSON.parse(await readFile(new URL('../data/nobel-prizes.json', import.meta.url), 'utf8'));
const editorial = JSON.parse(await readFile(new URL('../data/editorial.json', import.meta.url), 'utf8'));
const total = raw.nobelPrizes.filter((prize) => prize.laureates?.length).length;

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
  const institution = await page.locator('#prize-content .recipient-meta').first().textContent();
  expect(institution).toContain('Poland');
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
  await dialog.getByText('Go a little deeper', { exact: true }).click();
  await expect(dialog.locator('.detail-disclosure').first()).toHaveAttribute('open', '');
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
  await expect(page.locator('.prize-row')).toHaveCount(1);
  await expect(page.locator('.prize-row')).toHaveAttribute('data-prize', '1926-medicine');
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
