import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const raw = JSON.parse(await readFile(new URL('../data/nobel-prizes.json', import.meta.url), 'utf8'));
const editorial = JSON.parse(await readFile(new URL('../data/editorial.json', import.meta.url), 'utf8'));
const total = raw.nobelPrizes.filter((prize) => prize.laureates?.length).length;

const readExplanations = async () => JSON.parse(await readFile(new URL('../data/explanations.json', import.meta.url), 'utf8'));

async function openAtlas(page, query = '?page=browse&view=timeline') {
  await page.goto(`./${query}`);
  await expect(page.locator('#load-state')).toBeHidden();
  await page.evaluate(async () => { await document.fonts.ready; });
  await expect(page.locator('#result-count')).toContainText(`of ${total} prizes`);
}

async function openHome(page) {
  await page.goto('./');
  await expect(page.locator('#load-state')).toBeHidden();
  await page.evaluate(async () => { await document.fonts.ready; });
  await expect(page.locator('#discovery')).toBeVisible();
}

async function openFilters(page) {
  if (!(await page.locator('#filters-panel').isVisible())) await page.locator('#toggle-filters').click();
  await expect(page.locator('#filters-panel')).toBeVisible();
}

async function applyFilters(page) {
  if (page.viewportSize().width < 1000) {
    await page.locator('[data-action="apply-filters"]').click();
    await expect(page.locator('#filters-panel')).toBeHidden();
  }
}

async function chooseFilter(page, selector, value) {
  await openFilters(page);
  if (['#country', '#institution'].includes(selector) && await page.locator('.more-filters').getAttribute('open') === null) {
    await page.locator('.more-filters summary').click();
  }
  await page.locator(selector).selectOption(value);
  await applyFilters(page);
}

async function checkCategory(page, name) {
  await openFilters(page);
  await page.getByRole('checkbox', { name, exact: true }).check();
  await applyFilters(page);
}

async function jumpToSection(page, id) {
  const contents = page.locator('#reader-contents');
  if (await contents.getAttribute('open') === null) await contents.locator('summary').click();
  await contents.locator(`[data-jump="${id}"]`).click();
  await expect(page.locator(`#${id}`)).toBeFocused();
}

async function citedSourceUrls(locator) {
  return locator.locator('.inline-sources a').evaluateAll((links) => links.map((link) => {
    const target = link.dataset.jump || link.hash.slice(1);
    return document.getElementById(target)?.querySelector('a[href^="https://"]')?.href;
  }));
}

async function proseWithoutReferences(locator) {
  return locator.evaluate((element) => {
    const copy = element.cloneNode(true);
    copy.querySelectorAll('.inline-sources').forEach((reference) => reference.remove());
    copy.querySelectorAll('p').forEach((paragraph) => paragraph.append(' '));
    return copy.textContent;
  });
}

async function setYear(page, field, value) {
  await openFilters(page);
  await page.getByLabel(field, { exact: true }).fill(String(value));
  await page.getByLabel(field, { exact: true }).press('Tab');
  await applyFilters(page);
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
  await page.locator('[data-view="catalogue"]').click();
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
  await checkCategory(page, 'Chemistry');
  await expect(page.getByRole('searchbox')).toHaveValue('Marie Curie');
  await setYear(page, 'From', 1909);
  await setYear(page, 'To', 1912);
  await chooseFilter(page, '#country', 'Poland');
  await expect(page.locator('.prize-row')).toHaveCount(1);
  await expect(page.locator('.prize-row[data-prize="1911-chemistry"]')).toBeVisible();
  await page.locator('.prize-row').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const recipientFacts = await page.locator('#prize-content .recipient-facts').first().textContent();
  expect(recipientFacts).toContain('Poland');
  await page.getByRole('button', { name: 'Close prize details' }).click();
  await chooseFilter(page, '#institution', 'Sorbonne University');
  await expect(page.locator('.prize-row')).toHaveCount(1);
  const topicValues = await page.locator('#topic option').evaluateAll((options) => options.map((option) => option.value));
  expect(topicValues).toContain('Atoms & particles');
  await chooseFilter(page, '#topic', 'Atoms & particles');
  await expect(page.locator('.prize-row')).toHaveCount(1);
  await page.reload();
  await openFilters(page);
  await expect(page.getByRole('checkbox', { name: 'Chemistry', exact: true })).toBeChecked();
  await expect(page.locator('#country')).toHaveValue('Poland');
  await expect(page.locator('#institution')).toHaveValue('Sorbonne University');
  await expect(page.getByRole('searchbox')).toHaveValue('Marie Curie');
  await expect(page.locator('.prize-row')).toHaveCount(1);
});

test('multiple categories are a union and clearing filters restores the collection', async ({ page }) => {
  await openAtlas(page);

  await setYear(page, 'From', 1901);
  await setYear(page, 'To', 1901);
  await checkCategory(page, 'Physics');
  await expect(page.locator('.prize-row')).toHaveCount(1);
  await checkCategory(page, 'Chemistry');
  await expect(page.locator('.prize-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove filter Physics', exact: true }).click();
  await expect(page.locator('.prize-row')).toHaveCount(1);
  await openFilters(page);
  await page.locator('[data-action="reset-filter-panel"]').click();
  await applyFilters(page);
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
  await page.locator('.empty-state').getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.locator('#result-count')).toContainText(`${total} of ${total}`);
});

test('every grouping mode works and grouping preserves shared-prize uniqueness', async ({ page }) => {
  await openAtlas(page, '?q=Marie+Curie&view=catalogue');

  for (const mode of ['decade', 'year', 'category', 'topic', 'country', 'institution']) {
    await page.locator('#group').selectOption(mode);
    await expect(page.locator('.prize-group').first()).toBeVisible();
    const groups = await page.locator('.prize-group').evaluateAll((sections) => sections.map((section) => [...section.querySelectorAll('.prize-row')].map((row) => row.dataset.prize)));
    expect(groups.flat()).toContain('1903-physics');
    expect(groups.flat()).toContain('1911-chemistry');
    for (const group of groups) expect(new Set(group).size).toBe(group.length);
    if (['topic', 'country', 'institution'].includes(mode)) await expect(page.locator('.group-note')).toContainText('more than one');
  }
  await page.locator('#group').selectOption('year');
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
  // The redesigned reader makes the complete historical context continuous prose.
  const context = editorial.entries.find((entry) => entry.id === '1962-medicine');
  await expect(dialog.locator('#prize-context')).toContainText(context.impact);
  await expect(dialog.locator('#prize-context')).toContainText(context.detail);
  const sourceHrefs = await dialog.locator('#prize-reading .source-list a[href^="https://"]').evaluateAll((links) => links.map((link) => link.href));
  expect(sourceHrefs.length).toBeGreaterThan(2);
  expect(sourceHrefs.every((href) => href.startsWith('https://'))).toBe(true);
  await expect(dialog.locator('.official-link')).toHaveAttribute('href', 'https://www.nobelprize.org/prizes/medicine/1962/summary/');
  await page.getByRole('button', { name: 'Close prize details' }).click();
  await expect(dialog).toBeHidden();
  expect(new URL(page.url()).searchParams.has('prize')).toBe(false);
});

test('reassessment lenses distinguish overturned claims, harms and disputed credit', async ({ page }) => {
  await openAtlas(page);

  await page.locator('.site-header [data-destination="reassessments"]').click();
  const reassessments = editorial.entries.filter((entry) => entry.reassessment);
  await expect(page.locator('.prize-row')).toHaveCount(reassessments.length);
  await chooseFilter(page, '#lens', 'overturned');
  await expect(page.locator('.prize-row')).toHaveCount(2);
  await expect(page.locator('.prize-row[data-prize="1926-medicine"]')).toBeVisible();
  await page.locator('.prize-row[data-prize="1938-physics"]').click();
  await expect(page.locator('.reassessment-box')).toContainText('remained valid');
  await expect(page.locator('#prize-dialog')).toContainText('From uranium irradiation to nuclear fission');
  await page.getByRole('button', { name: 'Close prize details' }).click();
  await chooseFilter(page, '#lens', 'harmful');
  await page.locator('.prize-row[data-prize="1949-medicine"]').click();
  await expect(page.locator('.reassessment-box')).toContainText('Moniz');
  await expect(page.locator('.reassessment-box')).toContainText('Hess');
  await expect(page.locator('#prize-dialog .recipient')).toHaveCount(2);
  await page.getByRole('button', { name: 'Close prize details' }).click();
  await chooseFilter(page, '#lens', 'credit');
  await expect(page.locator('.prize-row[data-prize="1962-medicine"]')).toBeVisible();
  await expect(page.locator('.prize-row[data-prize="1974-physics"]')).toBeVisible();
});

test('connection graph and evidence selector agree and filters require both endpoints', async ({ page }) => {
  await openAtlas(page, '?view=connections');

  await expect(page.locator('#connection-choice option')).toHaveCount(editorial.connections.length);
  await expect(page.locator('.graph-edge')).toHaveCount(editorial.connections.length);
  await expect(page.locator('.selected-connection .source-list a').first()).toBeVisible();
  await page.locator('.full-map summary').click();
  // The whole labelled node is an interactive target, including its unpainted gaps.
  await page.locator('.graph-node').first().click();
  await expect(page.locator('#prize-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close prize details' }).click();
  await page.getByRole('searchbox').fill('Marie Curie');
  await expect(page.locator('.prize-row')).toHaveCount(2);
  await page.locator('[data-view="connections"]').click();
  await expect(page.locator('#connection-choice option')).toHaveCount(1);
  await page.getByRole('searchbox').fill('Marie Curie 1911');
  await expect(page.locator('.prize-row')).toHaveCount(1);
  await page.locator('[data-view="connections"]').click();
  await expect(page.locator('.empty-state')).toBeVisible();
  await page.getByRole('button', { name: 'Browse matching prizes', exact: true }).click();
  await expect(page.locator('.prize-row')).toHaveCount(1);
});

test('discovery trails support next, previous, leaving the trail and deep links', async ({ page }) => {
  const trail = editorial.trails.find((item) => item.id === 'reading-life');
  await openHome(page);

  await page.locator('[data-trail="reading-life"]').first().click();
  await expect(page.locator('#active-trail')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('trail')).toBe(trail.id);
  await page.locator('.trail-stops [data-prize]').first().click();
  await expect(page.locator('#prize-dialog')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('prize')).toBe(trail.prizeIds[0]);
  await expect(page.locator('.reader-trail-controls [data-trail-step="-1"]')).toBeDisabled();
  await page.locator('.reader-trail-controls [data-trail-step="1"]').click();
  expect(new URL(page.url()).searchParams.get('prize')).toBe(trail.prizeIds[1]);
  expect(await page.locator('#prize-dialog').evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  await page.locator('.reader-trail-controls [data-trail-step="0"]').click();
  expect(new URL(page.url()).searchParams.get('prize')).toBe(trail.prizeIds[0]);
  await page.reload();
  await expect(page.locator('#prize-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close prize details' }).click();
  await page.locator('[data-action="clear-trail"]').click();
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

  await page.locator('.site-header [data-action="about"]').click();
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

  await expect(page.locator('#discovery')).toBeVisible();
  await page.locator('.site-header [data-destination="browse"]').click();
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
  await page.locator('.full-map summary').click();
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
    // A single numbered registry preserves the original explanation and further-reading sources.
    const sources = dialog.locator('#prize-reading .source-list a[href^="https://"]');
    expect(await sources.count()).toBeGreaterThanOrEqual(entry.sources.length);
    expect(await sources.evaluateAll((links) => links.every((link) => link.href.startsWith('https://')))).toBe(true);
    expect(entry.furtherReading?.length).toBeGreaterThanOrEqual(2);
    for (const source of [...entry.sources, ...entry.furtherReading]) {
      const link = sources.filter({ hasText: source.title }).first();
      await expect(link).toHaveCount(1);
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
  for (const target of ['prize-story', 'prize-laureates', 'prize-reading']) await jumpToSection(page, target);
  await dialog.locator('[data-explanation-field="significance"]').scrollIntoViewIfNeeded();
  const lastSource = dialog.locator('.reference-title').last();
  await lastSource.scrollIntoViewIfNeeded();
  await lastSource.focus();
  expect(await dialog.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await expect(page.getByRole('button', { name: 'Close prize details' })).toBeInViewport();
  await expect(dialog.locator('#prize-reading-label')).toHaveText(/2025.*Physics/);
  await expect(dialog.locator('#prize-reading-label')).toBeInViewport();
  expect(await documentFits(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('expanded-shared-prize.png'), fullPage: false });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  expect(new URL(page.url()).searchParams.has('prize')).toBe(false);
  expect(await page.locator('body').evaluate((body) => body.style.overflow)).not.toBe('hidden');
  await opener.click();
  await dialog.locator('.reference-title').last().scrollIntoViewIfNeeded();
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
  await expect(dialog.locator('#prize-reading-label')).toHaveText(/1911.*Chemistry/);
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await expect(dialog.locator('.recipient')).toHaveCount(1);
  await expect(dialog.locator('.prize-explanation')).toBeVisible();
  await page.goto('./?prize=1917-peace');
  await expect(page.locator('#prize-dialog')).toBeVisible();
  await expect(page.locator('#prize-dialog .recipient')).toContainText('1863');
});

test('complete explanations remain distinct from the curated-context and reassessment filters', async ({ page }) => {
  await openAtlas(page);

  await chooseFilter(page, '#lens', 'context');
  await expect(page.locator('#result-count')).toContainText(`${editorial.entries.length} of ${total} prizes`);
  await chooseFilter(page, '#lens', 'reassessed');
  await expect(page.locator('#result-count')).toContainText(`${editorial.entries.filter((entry) => entry.reassessment).length} of ${total} prizes`);
  await chooseFilter(page, '#lens', 'all');
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

    await jumpToSection(page, 'prize-deep-dive');

    await expect(deepDive).toBeFocused();
    for (const section of entry.sections) {
      const heading = deepDive.getByRole('heading', { name: section.heading, exact: true });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
      const sectionElement = heading.locator('..');
      expect(normalizedProse(await proseWithoutReferences(sectionElement))).toContain(normalizedProse(section.body));
      const sourceUrls = section.sourceIds.map((id) => entry.sources.find((source) => source.id === id).url);
      const renderedUrls = await citedSourceUrls(sectionElement);
      expect(renderedUrls.sort()).toEqual([...sourceUrls].sort());
    }
    const glossary = dialog.locator('#prize-terms dl.key-terms');
    await expect(glossary.locator('dt')).toHaveText(entry.terms.map((term) => term.term));
    for (let index = 0; index < entry.terms.length; index++) {
      const term = entry.terms[index];
      const definition = glossary.locator('dt').nth(index).locator('xpath=following-sibling::dd[1]');
      await definition.scrollIntoViewIfNeeded();
      await expect(definition).toBeVisible();
      expect(normalizedProse(await proseWithoutReferences(definition))).toContain(normalizedProse(term.definition));
      const sourceUrls = term.sourceIds.map((id) => entry.sources.find((source) => source.id === id).url);
      const renderedUrls = await citedSourceUrls(definition);
      expect(renderedUrls.sort()).toEqual([...sourceUrls].sort());
    }
    await jumpToSection(page, 'prize-reading');
    for (const disclosure of await dialog.locator('.reference-aliases summary').all()) await disclosure.click();
    for (const link of await dialog.locator('#prize-reading .source-list a[href^="https://"]').all()) {
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
  await jumpToSection(page, 'prize-terms');
  await expect(page.locator('#prize-terms')).toContainText('Uniqueextendeddefinitionneedle');
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
  await jumpToSection(page, 'prize-deep-dive');
  await expect(deepDive).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await deepDive.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  const link = deepDive.locator('.deep-dive-section').first().locator('.inline-sources a').first();
  const targetId = await link.getAttribute('data-jump');
  await expect(link).toHaveAttribute('href', `#${targetId}`);
  await link.click();
  const reference = dialog.locator(`#${targetId}`);
  await expect(reference).toBeFocused();
  const sourceLink = reference.locator('a[href^="https://"]').first();
  await expect(sourceLink).toHaveAttribute('href', firstSource.url);
  const popupPromise = page.waitForEvent('popup');
  await sourceLink.click();
  const evidencePage = await popupPromise;
  await evidencePage.waitForLoadState();
  expect(evidencePage.url()).toBe(firstSource.url);
  expect(await evidencePage.evaluate(() => window.opener)).toBeNull();
  await evidencePage.close();
  await dialog.locator('#prize-terms .key-terms dd').last().scrollIntoViewIfNeeded();
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
  for (const label of ['Heading', 'Body']) await expect(deepDive).toContainText(`${label} ${hostile}`);
  for (const label of ['Term', 'Definition']) await expect(page.locator('#prize-terms')).toContainText(`${label} ${hostile}`);
  await expect(page.locator('#prize-terms img, #prize-terms script')).toHaveCount(0);
  await expect(page.locator('#prize-reading')).toContainText(`Source ${hostile}`);
  await expect(page.locator('#prize-reading img, #prize-reading script')).toHaveCount(0);
  expect(await page.evaluate(() => window.deepDiveInjected)).toBeUndefined();
  expect(await documentFits(page)).toBe(true);
});

test('redesign: the first viewport offers a named prize and a usable reading action', async ({ page }, testInfo) => {
  await openHome(page);

  const featured = page.locator('.feature');
  const title = featured.getByRole('heading').first();
  const readPrize = featured.locator('[data-prize="1978-medicine"]').first();
  await expect(title).toBeInViewport();
  await expect(readPrize).toBeInViewport();
  expect((await readPrize.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole('searchbox')).toBeInViewport();
  await expect(page.locator('#explorer')).toBeHidden();
  expect(await documentFits(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('redesign-discovery.png') });

  await readPrize.click();

  await expect(page.locator('#prize-dialog')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('prize')).toBe('1978-medicine');
  await page.getByRole('button', { name: 'Close prize details' }).click();
  await expect(page.locator('#prize-dialog')).toBeHidden();
  const path = page.locator('.feature-path');
  await expect(path.locator('[data-prize]')).toHaveCount(4);
  const relationButtons = path.locator('[data-connection]');
  await expect(relationButtons).toHaveCount(3);
  for (const button of await relationButtons.all()) {
    const id = await button.getAttribute('data-connection');
    const edge = editorial.connections.find((item) => `${item.from}:${item.to}` === id);
    expect(edge).toBeDefined();
    await expect(button).toContainText(edge.relation);
  }
  expect(await page.locator('.elsewhere-entry').evaluateAll((buttons) => buttons.map((button) => button.dataset.prize.split('-')[1]))).toEqual(['literature', 'peace', 'economics']);
  const connection = page.viewportSize().width < 1000 ? page.locator('.path-next [data-connection]') : relationButtons.first();
  await expect(connection).toBeVisible();
  const connectionId = await connection.getAttribute('data-connection');

  await connection.click();

  await expect(page.locator('#connection-choice')).toHaveValue(connectionId);
  await expect(page.locator('.selected-connection')).toBeInViewport();
});

test('redesign: opening a result flushes a pending search without dismissing the reader', async ({ page }) => {
  await openAtlas(page, '?page=browse&q=Marie+Curie');
  await expect(page.locator('.prize-row')).toHaveCount(2);
  await page.getByRole('searchbox').fill('Marie Curie 1911');

  await page.locator('.prize-row[data-prize="1911-chemistry"]').click();

  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('Marie Curie 1911');
  await expect(page.locator('#prize-dialog')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('prize')).toBe('1911-chemistry');
  await page.getByRole('button', { name: 'Close prize details' }).click();
  await expect(page.locator('#prize-dialog')).toBeHidden();
  await expect(page.getByRole('searchbox')).toHaveValue('Marie Curie 1911');
  await expect(page.locator('.prize-row')).toHaveCount(1);
});

test('redesign: mobile filters apply deliberately, preserve chips and return keyboard focus', async ({ page }) => {
  await openAtlas(page, '?page=browse');
  const mobile = page.viewportSize().width < 1000;
  const panel = page.locator('#filters-panel');
  const toggle = page.locator('#toggle-filters');
  if (mobile) await expect(panel).toBeHidden();
  else await expect(panel).toBeVisible();
  await openFilters(page);
  await page.getByRole('checkbox', { name: 'Chemistry', exact: true }).check();
  if (mobile) await expect(page.locator('#result-count')).toContainText(`${total} of ${total}`);

  await applyFilters(page);

  const chemistryCount = raw.nobelPrizes.filter((prize) => prize.category.en === 'Chemistry' && prize.laureates?.length).length;
  await expect(page.locator('#result-count')).toContainText(`${chemistryCount} of ${total}`);
  await expect(page.getByRole('button', { name: 'Remove filter Chemistry', exact: true })).toBeVisible();
  if (mobile) {
    await expect(toggle).toBeFocused();
    await toggle.click();
    await expect(page.getByRole('checkbox', { name: 'Chemistry', exact: true })).toBeChecked();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(toggle).toBeFocused();
  }
});

test('redesign: every category group is directly reachable and shareable', async ({ page }) => {
  await openAtlas(page, '?page=browse&group=category');
  const group = page.locator('#group-choice');
  const names = ['Physics', 'Chemistry', 'Medicine', 'Literature', 'Peace', 'Economics'];
  for (const name of names) {
    await expect(group.locator(`option[value="${name}"]`)).toHaveCount(1);
    await group.selectOption(name);
    await expect(page.locator('.group-heading h3')).toHaveText(name);
    const categoryLabels = await page.locator('.prize-row .category-label').allTextContents();
    expect(categoryLabels.length).toBeGreaterThan(0);
    expect(categoryLabels.every((label) => label === name)).toBe(true);
    expect(new URL(page.url()).searchParams.get('bucket')).toBe(name);
  }
  await page.reload();
  await expect(group).toHaveValue('Economics');
  await expect(page.locator('.group-heading h3')).toHaveText('Economics');
  await page.goBack();
  await expect(group).toHaveValue('Peace');
});

test('redesign: a trail exposes its reading order and persistent controls at every depth', async ({ page }) => {
  const trail = editorial.trails.find((item) => item.id === 'reading-life');
  await openHome(page);
  await page.locator('[data-trail="reading-life"]').first().click();
  const stops = page.locator('.trail-stops [data-prize]');
  await expect(stops).toHaveCount(trail.prizeIds.length);
  expect(await stops.evaluateAll((buttons) => buttons.map((button) => button.dataset.prize))).toEqual(trail.prizeIds);
  await expect(page.locator('.trail-banner')).toBeInViewport();
  await expect(page.locator('#trail-title')).toBeFocused();
  await stops.first().click();
  const controls = page.locator('.reader-trail-controls');
  const next = controls.locator('[data-trail-step="1"]');
  await expect(controls).toContainText('1 of 6');
  await expect(next).toBeInViewport();
  await jumpToSection(page, 'prize-terms');
  await expect(next).toBeInViewport();

  await next.click();

  expect(new URL(page.url()).searchParams.get('prize')).toBe(trail.prizeIds[1]);
  await expect(controls).toContainText('2 of 6');
  await expect(controls.locator('[data-trail-step="0"]')).toBeInViewport();
  await controls.locator('[data-action="trail-overview"]').click();
  await expect(page.locator('#prize-dialog')).toBeHidden();
  await expect(stops).toHaveCount(6);
});

test('redesign: related-prize Back restores the reading section and the original filtered results', async ({ page }) => {
  await openAtlas(page, '?page=browse&q=Marie+Curie');
  const opener = page.locator('.prize-row[data-prize="1903-physics"]');
  await opener.scrollIntoViewIfNeeded();
  const originalUrl = page.url();
  await opener.click();
  await jumpToSection(page, 'prize-connections');
  const dialog = page.locator('#prize-dialog');
  const originalScroll = await dialog.evaluate((element) => element.scrollTop);
  expect(originalScroll).toBeGreaterThan(100);
  const related = dialog.locator('#prize-connections [data-prize]').first();
  const nextId = await related.getAttribute('data-prize');
  await related.click();
  expect(new URL(page.url()).searchParams.get('prize')).toBe(nextId);

  await page.goBack();

  expect(new URL(page.url()).searchParams.get('prize')).toBe('1903-physics');
  await expect.poll(async () => Math.abs(await dialog.evaluate((element) => element.scrollTop) - originalScroll)).toBeLessThanOrEqual(3);
  await page.getByRole('button', { name: 'Close prize details' }).click();
  await expect(dialog).toBeHidden();
  expect(page.url()).toBe(originalUrl);
  await expect(page.getByRole('searchbox')).toHaveValue('Marie Curie');
  await expect(page.locator('.prize-row')).toHaveCount(2);
  await expect(opener).toBeFocused();
});

test('redesign: destination and trail history return to the prior selected group and filters', async ({ page }) => {
  await openAtlas(page, '?page=browse&q=Marie+Curie&group=year&bucket=1903');
  const originalUrl = page.url();
  await expect(page.locator('.prize-row')).toHaveCount(1);
  await page.locator('.site-header [data-destination="ideas"]').click();
  await page.locator('.trail-library [data-trail="reading-life"]').click();
  await expect(page.locator('.trail-stops [data-prize]')).toHaveCount(6);

  await page.goBack();

  await expect(page.locator('#active-trail')).toBeEmpty();
  expect(new URL(page.url()).searchParams.get('page')).toBe('ideas');
  await page.goBack();
  expect(page.url()).toBe(originalUrl);
  await expect(page.getByRole('searchbox')).toHaveValue('Marie Curie');
  await expect(page.locator('#group-choice')).toHaveValue('1903');
  await expect(page.locator('.prize-row')).toHaveCount(1);
  await expect(page.locator('.prize-row')).toHaveAttribute('data-prize', '1903-physics');
});

test('redesign: returning from outside a directly linked trail opens its overview', async ({ page }) => {
  await openAtlas(page, '?trail=reading-life&prize=1962-medicine');
  await jumpToSection(page, 'prize-connections');
  await page.locator('#prize-connections [data-prize="1901-physics"]').click();
  const trail = page.locator('.reader-trail-controls');
  await expect(trail).toContainText(/outside this trail/i);
  await expect(trail.locator('[data-trail-step]')).toHaveCount(0);

  await trail.locator('.reader-trail-actions [data-action="trail-overview"]').click();

  await expect(page.locator('#prize-dialog')).toBeHidden();
  await expect(page.locator('.trail-stops [data-prize]')).toHaveCount(6);
  expect(new URL(page.url()).searchParams.get('trail')).toBe('reading-life');
  expect(new URL(page.url()).searchParams.has('prize')).toBe(false);
});

test('redesign: browser Back preserves the open map, selected node focus and scroll position', async ({ page }) => {
  await openAtlas(page, '?page=ideas&view=connections');
  await page.locator('.full-map summary').click();
  const map = page.locator('.connection-map');
  const node = page.locator('.graph-node[data-prize="2023-medicine"]');
  await node.scrollIntoViewIfNeeded();
  const position = await map.evaluate((element) => ({ page: window.scrollY, map: element.scrollLeft }));
  if (page.viewportSize().width < 1000) expect(position.map).toBeGreaterThan(0);
  await node.click();
  await expect(page.locator('#prize-dialog')).toBeVisible();

  await page.goBack();

  await expect(page.locator('#prize-dialog')).toBeHidden();
  await expect(page.locator('.full-map')).toHaveAttribute('open', '');
  await expect(node).toBeFocused();
  await expect.poll(async () => Math.abs(await page.evaluate(() => window.scrollY) - position.page)).toBeLessThanOrEqual(3);
  await expect.poll(async () => Math.abs(await map.evaluate((element) => element.scrollLeft) - position.map)).toBeLessThanOrEqual(3);
  await expect(node).toBeInViewport();
});

test('redesign: source references and glossary are local navigable reading destinations', async ({ page }) => {
  await openAtlas(page, '?prize=2025-physics');
  await jumpToSection(page, 'prize-deep-dive');
  const citation = page.locator('.deep-dive-section .inline-sources a').first();
  const sourceId = await citation.getAttribute('data-jump');
  expect(sourceId).toMatch(/^source-\d+$/);
  await expect(citation).toHaveAttribute('href', `#${sourceId}`);

  await citation.click();

  const source = page.locator(`#${sourceId}`);
  await expect(source).toBeFocused();
  await expect(source).toBeInViewport();
  const external = source.locator('a[href^="https://"]').first();
  await expect(external).toHaveAttribute('target', '_blank');
  await expect(external).toHaveAttribute('rel', /noopener/);
  await expect(page.locator('#reader-current-section')).toHaveText('Sources & reading');
  await jumpToSection(page, 'prize-terms');
  await expect(page.locator('#prize-terms .key-terms dt').first()).toBeVisible();
  await expect(page.locator('#reader-current-section')).toHaveText('Key ideas');
  await expect(page.locator('.detail-contents [data-jump="prize-terms"]')).toHaveAttribute('aria-current', 'location');
});

test('redesign: connections lead with adjacent evidence and keep the full map optional', async ({ page }) => {
  await openAtlas(page, '?page=ideas&view=connections');
  const map = page.locator('.full-map');
  await expect(map).not.toHaveAttribute('open');
  await expect(page.locator('.connection-map')).toBeHidden();
  const selector = page.locator('#connection-choice');
  const options = await selector.locator('option').evaluateAll((elements) => elements.map((element) => element.value).filter(Boolean));
  expect(new Set(options).size).toBe(editorial.connections.length);
  const thematic = editorial.connections.find((edge) => edge.relation === 'related idea');
  const builtOn = editorial.connections.find((edge) => edge.relation === 'built on');
  await selector.selectOption(`${thematic.from}:${thematic.to}`);
  const selected = page.locator('.selected-connection');
  await expect(selected.locator('.relation-caption')).toContainText(/thematic/i);
  await expect(selected.locator('.connection-explanation')).not.toBeEmpty();
  expect(await selected.locator('.source-list a').evaluateAll((links) => links.map((link) => link.href))).toEqual(thematic.sources.map((source) => source.url));
  await expect(selected.locator(`[data-prize="${thematic.from}"]`)).toBeVisible();
  await expect(selected.locator(`[data-prize="${thematic.to}"]`)).toBeVisible();
  await map.locator('summary').click();
  await expect(page.locator('.graph-edge')).toHaveCount(editorial.connections.length);
  const thematicLine = map.locator(`[data-connection="${thematic.from}:${thematic.to}"] .graph-edge`);
  const builtLine = map.locator(`[data-connection="${builtOn.from}:${builtOn.to}"] .graph-edge`);
  await expect(thematicLine).toHaveAttribute('stroke-dasharray', /\d/);
  await expect(thematicLine).not.toHaveAttribute('marker-end');
  await expect(builtLine).toHaveAttribute('marker-end', /relation-arrow/);
  await expect(builtLine).not.toHaveAttribute('stroke-dasharray');
});

test('redesign: a single-prize connection search can explicitly include its outside-filter neighbours', async ({ page }) => {
  await openAtlas(page, '?page=ideas&view=connections&q=Marie+Curie+1911');
  await expect(page.locator('.empty-state')).toBeVisible();
  const expand = page.locator('[data-action="expand-connections"]');
  await expect(expand).toBeVisible();

  await expand.click();

  expect(new URL(page.url()).searchParams.get('focus')).toBe('1911-chemistry');
  await expect(page.getByRole('searchbox')).toHaveValue('Marie Curie 1911');
  await expect(page.locator('.selected-connection [data-prize="1911-chemistry"]')).toBeVisible();
  await expect(page.locator('.selected-connection [data-prize="1903-physics"]')).toBeVisible();
  await expect(page.locator('.scope-notice')).toContainText(/outside.*filter/i);
});

test('redesign: reassessments explain curated coverage and show why each prize is included', async ({ page }) => {
  await openHome(page);
  await page.locator('.site-header [data-destination="reassessments"]').click();
  const reassessed = editorial.entries.filter((entry) => entry.reassessment);
  await expect(page.locator('.assessment-intro')).toContainText(String(reassessed.length));
  await expect(page.locator('.assessment-intro')).toContainText(/curated|growing|selection/i);
  await expect(page.locator('.assessment-types [data-lens]:not([data-lens="reassessed"])')).toHaveCount(5);
  await page.locator('.assessment-types [data-lens="overturned"]').click();
  const overturned = reassessed.filter((entry) => entry.reassessment.kind === 'overturned');
  await expect(page.locator('.prize-row')).toHaveCount(overturned.length);
  for (const entry of overturned) {
    await expect(page.locator(`.prize-row[data-prize="${entry.id}"] .row-assessment`)).toContainText(entry.reassessment.title);
    await expect(page.locator(`.prize-row[data-prize="${entry.id}"] .row-description`)).toContainText(entry.reassessment.text);
  }
});

test('redesign: selecting a timeline period provides a named preview and a shareable range', async ({ page }) => {
  await openAtlas(page);
  const periods = await page.locator('#period-choice option').evaluateAll((options) => options.map((option) => ({ text: option.textContent, value: option.value })));
  const sixties = periods.find((option) => option.text.includes('1960'));
  expect(sixties).toBeDefined();

  await page.locator('#period-choice').selectOption(sixties.value);

  const url = new URL(page.url());
  expect(url.searchParams.get('from')).toBe('1960');
  expect(url.searchParams.get('to')).toBe('1969');
  await expect(page.locator('#timeline-selection [data-prize]')).toBeVisible();
  await page.reload();
  await expect(page.locator('#period-choice')).toHaveValue(sixties.value);
  await expect(page.locator('#timeline-selection')).not.toBeEmpty();
});

test('redesign: the 320px reader keeps contents, trail controls and close reachable', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'The narrow mobile viewport is covered once.');
  await page.setViewportSize({ width: 320, height: 740 });
  await openHome(page);
  expect(await documentFits(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('redesign-320-home.png') });
  await page.locator('[data-trail="reading-life"]').first().click();
  await page.locator('.trail-stops [data-prize]').first().click();
  await expect(page.locator('.reader-trail-controls [data-trail-step="1"]')).toBeInViewport();
  await jumpToSection(page, 'prize-terms');
  await expect(page.locator('#reader-contents summary')).toBeInViewport();
  await expect(page.locator('.reader-trail-controls [data-trail-step="1"]')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Close prize details' })).toBeInViewport();
  expect(await page.locator('#prize-dialog').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await documentFits(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('redesign-320-reader.png') });
});
