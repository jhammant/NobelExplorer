import { CATEGORIES, REASSESSMENTS, filterPrizes, searchText, readState, writeState, visibleConnections, relatedConnections, groupPrizes } from './model.js';
import { escape, category, title, edgeId } from './view-helpers.js';
import { about } from './views.js';
import { catalogue, timeline, timelineSelection, connections, ideasIntro, trailLanding, reassessmentIntro } from './explorer-views.js';
import { discovery } from './discovery.js';
import { detail, trailNavigation } from './reader.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const wide = matchMedia('(min-width: 1000px)');
const readerWide = matchMedia('(min-width: 1100px)');
let catalog, lookup, bounds, state, matched = [], limit = 30;
let filtersOpen = wide.matches, toastTimer, searchTimer, readerFrame, positionTimer;
let closingReader = false, pendingReaderOrigin = null;
const HISTORY_VERSION = 2;

function notify(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3600);
}

function defaultState() { return readState('', bounds); }
function selectedTrail() { return catalog.trails.find((trail) => trail.id === state.trail); }
function href(value = state) { const query = writeState(value, bounds); return `${location.pathname}${query ? `?${query}` : ''}`; }
function record() { return history.state?.nobel?.version === HISTORY_VERSION ? history.state.nobel : {}; }

function focusToken(element = document.activeElement) {
  if (!element || element === document.body) return null;
  if (element.id) return { id: element.id };
  for (const key of ['prize', 'destination', 'trail', 'groupChoice', 'connection', 'lens', 'action', 'jump', 'view']) {
    if (element.dataset?.[key] !== undefined) return { key, value: element.dataset[key], classes: [...element.classList], group: element.closest('.prize-group')?.querySelector('h3')?.textContent };
  }
  return null;
}

function restoreFocus(token) {
  if (!token) return false;
  const scope = $('#prize-dialog').open ? $('#prize-dialog') : document;
  const candidates = token.id ? [document.getElementById(token.id)] : [...scope.querySelectorAll('button, a')].filter((element) => element.dataset[token.key] === token.value);
  const visible = candidates.filter((element) => element && scope.contains(element) && element.getClientRects().length);
  const target = visible.find((element) => (token.classes || []).every((name) => element.classList.contains(name)) && (!token.group || element.closest('.prize-group')?.querySelector('h3')?.textContent === token.group)) || visible[0];
  target?.focus({ preventScroll: true });
  return Boolean(target);
}

function disclosureState() {
  return {
    map: $('.full-map')?.open,
    evidence: $('.connection-evidence')?.open,
    trails: $('.trail-chooser')?.open,
    places: $('.more-filters')?.open,
    reader: $('#prize-dialog').open ? [...$('#prize-content').querySelectorAll('details')].map((element) => element.open) : [],
  };
}

function restoreDisclosures(saved) {
  for (const [key, selector] of Object.entries({ map: '.full-map', evidence: '.connection-evidence', trails: '.trail-chooser', places: '.more-filters' })) {
    if (typeof saved?.[key] === 'boolean' && $(selector)) $(selector).open = saved[key];
  }
}

function restoreWorkspaceScroll(position) {
  if ($('.connection-map')) $('.connection-map').scrollLeft = position?.map || 0;
  if ($('.timeline-scroll')) $('.timeline-scroll').scrollLeft = position?.timeline || 0;
}

function rememberPosition() {
  if (!state) return;
  history.replaceState({ nobel: { ...record(), version: HISTORY_VERSION, limit, filtersOpen, position: { page: window.scrollY, reader: $('#prize-dialog').scrollTop, map: $('.connection-map')?.scrollLeft || 0, timeline: $('.timeline-scroll')?.scrollLeft || 0 }, focus: focusToken(), disclosures: disclosureState() } }, '', location.href);
}

function saveEntry(push, extra = {}) {
  const previous = push ? {} : record();
  history[push ? 'pushState' : 'replaceState']({ nobel: { ...previous, version: HISTORY_VERSION, limit, filtersOpen, ...extra } }, '', href());
}

function setFilters(open, focus = false) {
  filtersOpen = open;
  $('#filters-panel').hidden = !open;
  $('#explorer').classList.toggle('filters-open', open);
  $('#toggle-filters').setAttribute('aria-expanded', String(open));
  if (focus) (open ? $('#category-filters input') : $('#toggle-filters'))?.focus({ preventScroll: !open });
}

function populate() {
  $('#category-filters').innerHTML = CATEGORIES.map((cat) => `<label class="category-option" style="--category:${cat.colour}"><input type="checkbox" value="${cat.id}" name="category" aria-label="${cat.name}"><span class="category-dot" aria-hidden="true"></span><span>${cat.name}</span><span class="category-count">${catalog.prizes.filter((prize) => prize.category === cat.id).length}</span></label>`).join('');
  const choices = {
    topic: [...new Set(catalog.prizes.flatMap((prize) => prize.topics))].sort(),
    country: [...new Set(catalog.prizes.flatMap((prize) => prize.recipients.map((person) => person.country)).filter(Boolean))].sort(),
    institution: [...new Set(catalog.prizes.flatMap((prize) => prize.recipients.flatMap((person) => person.affiliations)))].sort(),
  };
  for (const [id, values] of Object.entries(choices)) $(`#${id}`).insertAdjacentHTML('beforeend', values.map((value) => `<option value="${escape(value)}">${escape(value)}</option>`).join(''));
  for (const id of ['year-from', 'year-to']) { $(`#${id}`).min = bounds.min; $(`#${id}`).max = bounds.max; }
  $('#discovery').innerHTML = discovery(catalog, lookup);
  $('#coverage-note').innerHTML = `Official records and explanations for all ${catalog.meta.prizeCount} awards. ${catalog.meta.contextCount} extended historical notes; ${catalog.meta.connectionCount} sourced connections. <button data-action="about">Sources and methodology</button>`;
  $('#about-content').innerHTML = about(catalog.meta);
}

function syncFilters(value = state) {
  $('#year-from').value = value.from;
  $('#year-to').value = value.to;
  for (const id of ['topic', 'lens', 'country', 'institution']) $(`#${id}`).value = value[id];
  $$('[name="category"]').forEach((input) => { input.checked = value.categories.includes(input.value); });
  if (value.country || value.institution) $('.more-filters').open = true;
}

function filterLabels() {
  return [
    ...state.categories.map((id) => ({ key: `category:${id}`, label: category(id).name })),
    ...['q', 'topic', 'country', 'institution'].filter((key) => state[key]).map((key) => ({ key, label: key === 'q' ? `Search: ${state[key]}` : state[key] })),
    ...(state.from !== bounds.min || state.to !== bounds.max ? [{ key: 'years', label: `${state.from}–${state.to}` }] : []),
    ...(state.lens !== 'all' ? [{ key: 'lens', label: REASSESSMENTS[state.lens] || (state.lens === 'context' ? 'Extended historical context' : 'All reassessments') }] : []),
    ...(state.bucket ? [{ key: 'bucket', label: `Group: ${state.bucket}` }] : []),
  ];
}

function render({ controls = true } = {}) {
  const home = state.page === 'discover';
  $('#discovery').hidden = !home;
  $('#explorer').hidden = home;
  $$('.main-nav [data-destination]').forEach((button) => {
    if (button.dataset.destination === state.page) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  if (controls) { $('#search').value = state.q; syncFilters(); }
  for (const id of ['group', 'sort']) $(`#${id}`).value = state[id];
  $$('.view-switch [data-view]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === state.view)));
  $('.group-controls').hidden = state.view === 'connections';
  $('.view-switch').hidden = state.page === 'ideas';
  setFilters(filtersOpen);
  const trail = selectedTrail();
  matched = filterPrizes(catalog.prizes, state);
  if (trail) matched = matched.filter((prize) => trail.prizeIds.includes(prize.id));
  if (state.bucket && !groupPrizes(matched, state.group, state.sort).some(([name]) => name === state.bucket)) state.bucket = '';
  const labels = filterLabels();
  $('#active-filters').innerHTML = labels.map(({ key, label }) => `<button class="filter-chip" data-remove="${escape(key)}" aria-label="Remove filter ${escape(label)}">${escape(label)} <span aria-hidden="true">×</span></button>`).join('');
  $('#filter-count').textContent = labels.filter(({ key }) => key !== 'q' && key !== 'bucket').length ? `(${labels.filter(({ key }) => key !== 'q' && key !== 'bucket').length})` : '';
  $('#result-heading').textContent = state.page === 'reassessments' ? 'Prizes, reconsidered' : state.page === 'ideas' ? 'Follow the ideas' : 'Browse the prizes';
  const recipients = new Set(matched.flatMap((prize) => prize.recipients.map((person) => person.id))).size;
  $('#result-count').textContent = `${matched.length} of ${catalog.meta.prizeCount} prizes · ${recipients.toLocaleString()} ${recipients === 1 ? 'laureate' : 'laureates'} · ${state.from}–${state.to}`;
  $('#collection-intro').innerHTML = state.page === 'ideas' ? ideasIntro(catalog, trail) : state.page === 'reassessments' ? reassessmentIntro(catalog.prizes, state.lens) : '';
  $('#active-trail').innerHTML = trail ? trailLanding(trail, lookup) : '';
  $('#visualisation').innerHTML = '';
  $('#catalogue').innerHTML = '';
  if (home) return;
  const edges = state.focus ? relatedConnections(state.focus, catalog.connections) : visibleConnections(matched, catalog.connections);
  if (!matched.length && !state.focus) {
    $('#catalogue').innerHTML = '<div class="empty-state"><h2>No prizes in this view</h2><p>Try a broader search or remove a filter to keep exploring.</p><button class="primary-button" data-action="reset">Reset filters</button></div>';
  } else if (state.view === 'connections') {
    if (edges.length) $('#visualisation').innerHTML = connections(state.focus ? catalog.prizes : matched, edges, lookup, { min: state.from, max: state.to }, state);
    else $('#visualisation').innerHTML = `<div class="empty-state"><h2>No sourced connections in this view yet</h2><p>Both prizes in a relationship must match your filters. Connections are a growing selection.</p>${matched.length === 1 && relatedConnections(matched[0].id, catalog.connections).length ? '<button class="primary-button" data-action="expand-connections">Show connections to this prize</button><p>Include related prizes outside the current filters.</p>' : ''}<button class="text-button" data-view="catalogue">Browse matching prizes</button></div>`;
  } else {
    if (state.view === 'timeline') $('#visualisation').innerHTML = timeline(matched, { min: state.from, max: state.to }, bounds);
    $('#catalogue').innerHTML = catalogue(matched, state, limit);
  }
}

function hideReader() {
  if ($('#prize-dialog').open) $('#prize-dialog').close();
  document.body.style.overflow = $('#about-dialog').open ? 'hidden' : '';
  document.title = 'Nobel Explorer — The ideas behind the prizes';
}

function normalizeState() {
  for (const key of ['topic', 'country', 'institution']) if (state[key] && ![...$(`#${key}`).options].some((option) => option.value === state[key])) state[key] = '';
  if (!selectedTrail()) state.trail = '';
  if (state.focus && !lookup.has(state.focus)) state.focus = '';
  if (state.connection && !catalog.connections.some((edge) => edgeId(edge) === state.connection)) state.connection = '';
  if (state.page === 'ideas') state.view = 'connections';
  if (state.page === 'reassessments' && !REASSESSMENTS[state.lens] && state.lens !== 'reassessed') state.lens = 'reassessed';
}

function navigate(patch, { push = true, scroll = false, controls = true, focus = null, filterVisibility } = {}) {
  clearTimeout(searchTimer);
  rememberPosition();
  // Changes to a filter or grouping must not discard text entered during the
  // search debounce. Explicit destination/reset patches can still clear it.
  state = { ...state, q: $('#search').value, prize: '', ...patch };
  if (filterVisibility !== undefined) filtersOpen = filterVisibility;
  limit = 30;
  normalizeState();
  hideReader();
  render({ controls });
  saveEntry(push, { depth: 0, origin: null, position: { page: scroll ? 0 : window.scrollY, reader: 0 }, focus: null });
  if (scroll) {
    const target = scroll === 'trail' ? $('#trail-title') : state.page === 'discover' ? $('#discovery h1') : $('#result-heading');
    if (target) { target.tabIndex = -1; target.scrollIntoView({ block: 'start' }); target.focus({ preventScroll: true }); }
    else window.scrollTo(0, 0);
  }
  if (focus) restoreFocus(focus);
}

function destination(page) {
  navigate({ ...defaultState(), page, view: page === 'ideas' ? 'connections' : 'catalogue', lens: page === 'reassessments' ? 'reassessed' : 'all' }, { scroll: true, filterVisibility: wide.matches && page !== 'ideas' });
}

function startTrail(id) {
  if (!catalog.trails.some((trail) => trail.id === id)) return;
  navigate({ ...defaultState(), page: 'ideas', view: 'connections', trail: id }, { scroll: 'trail', filterVisibility: false });
}

function updateReaderSection() {
  if (!$('#prize-dialog').open) return;
  const top = $('.dialog-top').getBoundingClientRect().bottom + ($('#reader-trailbar').getBoundingClientRect().height || 0) + (readerWide.matches ? 20 : ($('.reader-navigation')?.getBoundingClientRect().height || 0) + 12);
  const sections = [...$('#prize-content').querySelectorAll('[data-section-label]')];
  let active = sections[0];
  for (const section of sections) if (section.getBoundingClientRect().top <= top + 24) active = section;
  if (!active) return;
  const current = $('#reader-current-section');
  if (current) current.textContent = active.dataset.sectionLabel;
  $$('#prize-content .detail-contents [data-jump]').forEach((button) => {
    if (button.dataset.jump === active.id) button.setAttribute('aria-current', 'location'); else button.removeAttribute('aria-current');
  });
}

async function showReader(id, saved = {}) {
  const prize = lookup.get(id);
  if (!prize) return;
  const dialog = $('#prize-dialog');
  $('#prize-content').innerHTML = detail(prize, lookup, catalog.connections, selectedTrail());
  $('#reader-trailbar').innerHTML = trailNavigation(prize, selectedTrail(), lookup);
  dialog.classList.toggle('in-trail', Boolean($('#reader-trailbar').textContent.trim()));
  $('#prize-reading-label').textContent = `${prize.year} ${category(prize.category).name}`;
  const backLabel = selectedTrail() ? 'Back to trail' : record().origin?.page === 'discover' ? 'Back to discovery' : 'Back to results';
  $('.reader-back').setAttribute('aria-label', backLabel);
  $('.reader-back').innerHTML = `<span class="reader-back-long">${backLabel}</span><span class="reader-back-short" aria-hidden="true">Back</span>`;
  if (!dialog.open) dialog.showModal();
  document.body.style.overflow = 'hidden';
  if ($('#reader-contents')) $('#reader-contents').open = readerWide.matches;
  if (saved.disclosures?.reader?.length) {
    [...$('#prize-content').querySelectorAll('details')].forEach((element, index) => {
      if (typeof saved.disclosures.reader[index] === 'boolean') element.open = saved.disclosures.reader[index];
    });
    // A restored mobile disclosure must not hide desktop navigation after resizing.
    if (readerWide.matches && $('#reader-contents')) $('#reader-contents').open = true;
  }
  $('#prize-title').tabIndex = -1;
  $('#prize-title').focus({ preventScroll: true });
  dialog.scrollTop = saved.position?.reader || 0;
  document.title = `${prize.year} ${category(prize.category).name}: ${title(prize)} — Nobel Explorer`;
  await document.fonts.ready;
  if (state.prize !== id || !dialog.open) return;
  dialog.scrollTop = saved.position?.reader || 0;
  if (saved.focus) restoreFocus(saved.focus);
  updateReaderSection();
}

async function openPrize(id) {
  if (!lookup.has(id)) { notify('This prize could not be found. Try searching the collection.'); return; }
  if (state.prize === id && $('#prize-dialog').open) return;
  // A row can remain visible while the next search is still debouncing. Commit
  // that search before opening, so its timer cannot later dismiss the reader.
  clearTimeout(searchTimer);
  if (!$('#prize-dialog').open && $('#search').value !== state.q) {
    const opener = focusToken();
    performSearch();
    restoreFocus(opener);
  }
  rememberPosition();
  const previous = record();
  const origin = previous.origin || { url: href({ ...state, prize: '' }), page: state.page, position: previous.position, focus: previous.focus, disclosures: previous.disclosures, limit, filtersOpen, inHistory: !state.prize };
  state.prize = id;
  saveEntry(true, { origin, depth: (previous.depth || 0) + 1, position: { page: window.scrollY, reader: 0 } });
  await showReader(id);
}

function closePrize() {
  if (closingReader) return;
  rememberPosition();
  const saved = record();
  if (saved.depth > 0) {
    closingReader = true;
    // A shared URL can begin inside a reader, with no collection entry behind
    // it. Return through related reads, then replace that initial reader entry
    // with its collection rather than reopening it under a "Back" action.
    if (saved.origin?.inHistory === false) pendingReaderOrigin = saved.origin;
    history.go(-saved.depth);
    return;
  }
  state.prize = '';
  if (state.page === 'discover') state.page = 'browse';
  hideReader();
  render();
  saveEntry(false, { depth: 0, origin: null, position: { page: 0, reader: 0 } });
  $('#result-heading').focus({ preventScroll: true });
  $('#result-heading').scrollIntoView({ block: 'start' });
}

function readFilterForm(changed = '') {
  let from = Math.round(Math.max(bounds.min, Math.min(bounds.max, Number($('#year-from').value) || bounds.min)));
  let to = Math.round(Math.max(bounds.min, Math.min(bounds.max, Number($('#year-to').value) || bounds.max)));
  if (from > to) { if (changed === 'year-to') from = to; else to = from; }
  return { categories: $$('[name="category"]:checked').map((input) => input.value), from, to, ...Object.fromEntries(['topic', 'lens', 'country', 'institution'].map((key) => [key, $(`#${key}`).value])) };
}

function applyFilters(close = false, changed = '') {
  const patch = readFilterForm(changed);
  const page = state.page === 'ideas' ? 'ideas' : patch.lens === 'reassessed' || REASSESSMENTS[patch.lens] ? 'reassessments' : 'browse';
  navigate({ ...patch, page, trail: '', bucket: '', focus: '', connection: '' }, { scroll: close, focus: close ? { id: 'toggle-filters' } : focusToken(), ...(close ? { filterVisibility: false } : {}) });
}

function performSearch() {
  const q = $('#search').value;
  const fromHome = state.page === 'discover';
  navigate({ q, page: state.page === 'reassessments' ? 'reassessments' : 'browse', view: 'catalogue', trail: '', bucket: '', connection: '', focus: '' }, { push: fromHome, controls: false });
}

async function share() {
  if (!$('#prize-dialog').open && $('#search').value !== state.q) performSearch();
  try { await navigator.clipboard.writeText(location.href); notify('Link copied. Your selection is included.'); }
  catch { notify('Copy the address from your browser to share this view.'); }
}

function jumpTo(id) {
  const section = document.getElementById(id);
  if (!section) return;
  if (!readerWide.matches && $('#reader-contents')) $('#reader-contents').open = false;
  section.scrollIntoView({ block: 'start' });
  section.focus({ preventScroll: true });
  updateReaderSection();
}

function keyboardTimeline(event) {
  const button = event.target.closest('.prize-dot');
  if (!button || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const dots = $$('.prize-dot');
  const catIndex = CATEGORIES.findIndex((cat) => cat.id === button.dataset.category);
  const year = Number(button.dataset.year);
  let candidates = dots.filter((dot) => dot.dataset.category === button.dataset.category).sort((a, b) => Number(a.dataset.year) - Number(b.dataset.year));
  let target;
  if (event.key === 'Home') target = candidates[0];
  if (event.key === 'End') target = candidates.at(-1);
  if (event.key === 'ArrowLeft') target = candidates.filter((dot) => Number(dot.dataset.year) < year).at(-1);
  if (event.key === 'ArrowRight') target = candidates.find((dot) => Number(dot.dataset.year) > year);
  if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
    const direction = event.key === 'ArrowUp' ? -1 : 1;
    for (let index = catIndex + direction; index >= 0 && index < CATEGORIES.length; index += direction) {
      candidates = dots.filter((dot) => dot.dataset.category === CATEGORIES[index].id).sort((a, b) => Math.abs(Number(a.dataset.year) - year) - Math.abs(Number(b.dataset.year) - year));
      if (candidates.length) { target = candidates[0]; break; }
    }
  }
  if (target) { button.tabIndex = -1; target.tabIndex = 0; target.focus(); }
}

function bindEvents() {
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('button, a[data-prize], a[data-destination], a[data-connection], a[data-jump]');
    if (!button || !catalog) return;
    if (button.dataset.jump) { event.preventDefault(); jumpTo(button.dataset.jump); return; }
    if (button.dataset.destination) { event.preventDefault(); destination(button.dataset.destination); return; }
    if (button.dataset.prize) { event.preventDefault(); await openPrize(button.dataset.prize); return; }
    if (button.dataset.trail) { startTrail(button.dataset.trail); return; }
    if (button.dataset.connection) {
      event.preventDefault();
      const patch = state.page === 'ideas' ? {} : defaultState();
      navigate({ ...patch, page: 'ideas', view: 'connections', connection: button.dataset.connection }, { scroll: false, filterVisibility: false });
      $('#selected-connection')?.scrollIntoView({ block: 'start' });
      $('#selected-connection')?.focus({ preventScroll: true });
      return;
    }
    if (button.dataset.view) { navigate({ view: button.dataset.view, page: button.dataset.view === 'connections' ? 'ideas' : state.page === 'reassessments' ? 'reassessments' : 'browse', focus: '', connection: '' }, { focus: focusToken(button) }); return; }
    if (button.dataset.topic) { navigate({ ...defaultState(), page: 'browse', topic: button.dataset.topic }, { scroll: true, filterVisibility: wide.matches }); return; }
    if (button.dataset.trailStep !== undefined) { const trail = selectedTrail(); const id = trail?.prizeIds[Number(button.dataset.trailStep)]; if (id) await openPrize(id); return; }
    if (button.dataset.groupChoice !== undefined) { navigate({ bucket: button.dataset.groupChoice }, { focus: focusToken(button) }); return; }
    if (button.dataset.lens) { navigate({ page: 'reassessments', lens: button.dataset.lens, bucket: '', trail: '' }, { focus: focusToken(button) }); return; }
    if (button.dataset.remove) {
      const key = button.dataset.remove;
      const patch = key.startsWith('category:') ? { categories: state.categories.filter((id) => id !== key.slice(9)) }
        : key === 'years' ? { from: bounds.min, to: bounds.max } : { [key]: key === 'lens' ? 'all' : '' };
      if (key === 'lens' && state.page === 'reassessments') patch.page = 'browse';
      navigate({ ...patch, ...(key === 'bucket' ? {} : { bucket: '' }) }); return;
    }
    if (button.id === 'toggle-filters') { setFilters(!filtersOpen, true); return; }
    switch (button.dataset.action) {
      case 'apply-filters': applyFilters(!wide.matches); break;
      case 'close-filters': syncFilters(); setFilters(false, true); break;
      case 'reset-filter-panel': syncFilters(defaultState()); if (wide.matches) applyFilters(); break;
      case 'reset': navigate({ ...defaultState(), page: state.view === 'connections' ? 'ideas' : 'browse', view: state.view }, { scroll: true }); break;
      case 'more': rememberPosition(); limit += 50; $('#catalogue').innerHTML = catalogue(matched, state, limit); saveEntry(false); break;
      case 'clear-trail': navigate({ ...defaultState(), page: 'ideas', view: 'connections' }, { scroll: true, filterVisibility: false }); break;
      case 'expand-connections': if (matched.length === 1) navigate({ focus: matched[0].id, connection: '' }); break;
      case 'clear-connection-focus': navigate({ focus: '', connection: '' }); break;
      case 'surprise': await openPrize(catalog.prizes[Math.floor(Math.random() * catalog.prizes.length)].id); break;
      case 'reassessed': destination('reassessments'); break;
      case 'share': case 'share-prize': await share(); break;
      case 'close-prize': case 'trail-overview': closePrize(); break;
      case 'about': $('#about-dialog').showModal(); document.body.style.overflow = 'hidden'; break;
      case 'close-about': $('#about-dialog').close(); break;
    }
  });
  document.addEventListener('change', (event) => {
    const id = event.target.id;
    if (['group', 'sort'].includes(id)) navigate({ [id]: event.target.value, bucket: '' }, { focus: { id } });
    else if (id === 'group-choice') navigate({ bucket: event.target.value }, { focus: { id } });
    else if (id === 'connection-choice') navigate({ connection: event.target.value }, { focus: { id } });
    else if (id === 'period-choice') {
      if (event.target.value === 'custom') return;
      const decade = Number(event.target.value);
      const range = event.target.value === 'all' ? { from: bounds.min, to: bounds.max } : { from: Math.max(bounds.min, decade), to: Math.min(bounds.max, decade + 9) };
      navigate({ ...range, bucket: '' }, { focus: { id } });
    } else if ($('#filters-panel').contains(event.target)) {
      if (id === 'year-from' || id === 'year-to') {
        const range = readFilterForm(id);
        $('#year-from').value = range.from;
        $('#year-to').value = range.to;
      }
      if (wide.matches) applyFilters(false, id);
    }
  });
  $('#search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(performSearch, 180); });
  for (const name of ['focusin', 'pointerover']) document.addEventListener(name, (event) => {
    const dot = event.target.closest('.prize-dot');
    if (dot && $('#timeline-selection')) $('#timeline-selection').innerHTML = timelineSelection(lookup.get(dot.dataset.prize));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !wide.matches && filtersOpen && !$('#prize-dialog').open && !$('#about-dialog').open) { event.preventDefault(); syncFilters(); setFilters(false, true); return; }
    if (event.key === 'Escape' && !readerWide.matches && $('#prize-dialog').open && $('#reader-contents')?.open) { event.preventDefault(); $('#reader-contents').open = false; $('#reader-contents summary').focus(); return; }
    keyboardTimeline(event);
  });
  $('#prize-dialog').addEventListener('cancel', (event) => { event.preventDefault(); closePrize(); });
  $('#prize-dialog').addEventListener('scroll', () => {
    cancelAnimationFrame(readerFrame);
    readerFrame = requestAnimationFrame(updateReaderSection);
    clearTimeout(positionTimer);
    positionTimer = setTimeout(rememberPosition, 120);
  }, { passive: true });
  $('#about-dialog').addEventListener('close', () => { document.body.style.overflow = $('#prize-dialog').open ? 'hidden' : ''; });
  $('#about-dialog').addEventListener('click', (event) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close();
  });
  window.addEventListener('popstate', async () => {
    clearTimeout(searchTimer);
    closingReader = false;
    if (pendingReaderOrigin) {
      const origin = pendingReaderOrigin;
      pendingReaderOrigin = null;
      state = readState(new URL(origin.url, location.origin).search, bounds);
      state.prize = '';
      if (state.page === 'discover') state.page = 'browse';
      normalizeState();
      limit = origin.limit || 30;
      filtersOpen = origin.filtersOpen ?? wide.matches;
      hideReader();
      render();
      restoreDisclosures(origin.disclosures);
      restoreWorkspaceScroll(origin.position);
      saveEntry(false, { depth: 0, origin: null, position: origin.position, focus: origin.focus });
      const heading = selectedTrail() ? $('#trail-title') : $('#result-heading');
      heading.tabIndex = -1;
      heading.scrollIntoView({ block: 'start' });
      heading.focus({ preventScroll: true });
      return;
    }
    const saved = record();
    state = readState(location.search, bounds);
    normalizeState();
    limit = saved.limit || 30;
    filtersOpen = saved.filtersOpen ?? (wide.matches && state.page !== 'ideas');
    render();
    restoreDisclosures(saved.disclosures);
    restoreWorkspaceScroll(saved.position);
    if (state.prize && lookup.has(state.prize)) await showReader(state.prize, saved);
    else { hideReader(); window.scrollTo(0, saved.position?.page || 0); restoreFocus(saved.focus); }
  });
  window.addEventListener('pagehide', rememberPosition);
  wide.addEventListener('change', () => setFilters(wide.matches && state.page !== 'ideas'));
  readerWide.addEventListener('change', () => { if ($('#reader-contents')) $('#reader-contents').open = readerWide.matches; updateReaderSection(); });
}

async function init() {
  try {
    const response = await fetch(new URL('./data/catalog.json', import.meta.url));
    if (!response.ok) throw new Error(`Data response ${response.status}`);
    catalog = await response.json();
    if (!catalog.prizes?.length || !catalog.meta || !Array.isArray(catalog.connections) || !Array.isArray(catalog.trails)) throw new Error('Invalid catalogue');
    catalog.prizes.forEach((prize) => { prize.search = searchText(prize); });
    lookup = new Map(catalog.prizes.map((prize) => [prize.id, prize]));
    bounds = { min: catalog.meta.minYear, max: catalog.meta.maxYear };
    state = readState(location.search, bounds);
    populate();
    normalizeState();
    const saved = record();
    limit = saved.limit || 30;
    filtersOpen = saved.filtersOpen ?? (wide.matches && state.page !== 'ideas');
    history.scrollRestoration = 'manual';
    bindEvents();
    $('#load-state').hidden = true;
    render();
    restoreDisclosures(saved.disclosures);
    restoreWorkspaceScroll(saved.position);
    saveEntry(false);
    if (state.prize) {
      if (lookup.has(state.prize)) await showReader(state.prize, saved);
      else { state.prize = ''; saveEntry(false); notify('That prize link was not found. You can browse the full collection.'); }
    } else if (saved.position) { window.scrollTo(0, saved.position.page || 0); restoreFocus(saved.focus); }
  } catch (error) {
    console.error('Unable to load Nobel Explorer:', error.message);
    $('#load-state').hidden = false;
    $('#discovery').hidden = true;
    $('#explorer').hidden = true;
    $('#load-state').innerHTML = '<h1>The collection could not be loaded</h1><p>Check your connection and try again.</p><button class="primary-button" id="retry-load">Try again</button>';
    $('#retry-load').addEventListener('click', () => location.reload());
  }
}

init();
