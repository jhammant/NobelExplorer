import { CATEGORIES, REASSESSMENTS, filterPrizes, searchText, readState, writeState, visibleConnections } from './model.js';
import { escape, category, timeline, catalogue, connections, detail, about } from './views.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let catalog, lookup, bounds, state, matched = [], limit = 30, toastTimer, searchTimer;
let returnFocus;

function notify(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
}

function saveUrl(push = false) {
  const query = writeState(state, bounds);
  history[push ? 'pushState' : 'replaceState'](null, '', `${location.pathname}${query ? `?${query}` : ''}`);
}

function defaultState() { return readState('', bounds); }

function selectedTrail() { return catalog.trails.find((trail) => trail.id === state.trail); }

function populateFilters() {
  $('#category-filters').innerHTML = CATEGORIES.map((cat) => `<label class="category-option" style="--category:${cat.colour}"><input type="checkbox" value="${cat.id}" name="category" aria-label="${cat.name}"><span class="category-dot"></span><span>${cat.name}</span><span class="category-count">${catalog.prizes.filter((p) => p.category === cat.id).length}</span></label>`).join('');
  const topics = [...new Set(catalog.prizes.flatMap((p) => p.topics))].sort();
  const countries = [...new Set(catalog.prizes.flatMap((p) => p.recipients.map((r) => r.country)).filter(Boolean))].sort();
  const institutions = [...new Set(catalog.prizes.flatMap((p) => p.recipients.flatMap((r) => r.affiliations)))].sort();
  for (const [id, values] of [['topic', topics], ['country', countries], ['institution', institutions]]) {
    $( `#${id}`).insertAdjacentHTML('beforeend', values.map((value) => `<option value="${escape(value)}">${escape(value)}</option>`).join(''));
  }
  for (const id of ['year-from', 'year-to']) { $(`#${id}`).min = bounds.min; $(`#${id}`).max = bounds.max; }
  $('#coverage-years').textContent = `${bounds.min}–${bounds.max}`;
  $('#trail-list').innerHTML = catalog.trails.map((trail) => `<button class="trail-button" data-trail="${escape(trail.id)}"><span class="trail-dot" aria-hidden="true"></span>${escape(trail.title)}<span aria-hidden="true">↗</span></button>`).join('');
  $('#coverage-note').innerHTML = `${catalog.meta.explanationCount === catalog.meta.prizeCount ? `Official records and explanations for all ${catalog.meta.prizeCount} awards.` : `Official records for all ${catalog.meta.prizeCount} awards.`} ${catalog.meta.contextCount} extended historical notes; ${catalog.meta.connectionCount} sourced connections. <button data-action="about">How the atlas is made</button>`;
  $('#about-content').innerHTML = about(catalog.meta);
}

function syncControls() {
  $('#search').value = state.q;
  $('#year-from').value = state.from;
  $('#year-to').value = state.to;
  for (const id of ['topic', 'lens', 'country', 'institution', 'group', 'sort']) $(`#${id}`).value = state[id];
  $$('[name="category"]').forEach((input) => { input.checked = state.categories.includes(input.value); });
  $$('[data-view]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === state.view)));
  $$('.trail-button').forEach((button) => button.classList.toggle('active', button.dataset.trail === state.trail));
  if (state.country || state.institution) $('.more-filters').open = true;
  $('.group-controls').hidden = state.view === 'connections';
}

function activeFilters() {
  const labels = [
    ...state.categories.map((id) => ({ key: `category:${id}`, label: category(id).name })),
    ...['q', 'topic', 'country', 'institution'].filter((key) => state[key]).map((key) => ({ key, label: key === 'q' ? `Search: ${state[key]}` : state[key] })),
    ...(state.from !== bounds.min || state.to !== bounds.max ? [{ key: 'years', label: `${state.from}–${state.to}` }] : []),
    ...(state.lens !== 'all' ? [{ key: 'lens', label: REASSESSMENTS[state.lens] || (state.lens === 'context' ? 'Extended historical context' : 'All reassessments') }] : []),
  ];
  $('#active-filters').innerHTML = labels.map(({ key, label }) => `<button class="filter-chip" data-remove="${escape(key)}" aria-label="Remove filter ${escape(label)}">${escape(label)} <span aria-hidden="true">×</span></button>`).join('');
}

function render({ controls = true, updateUrl = true } = {}) {
  const trail = selectedTrail();
  matched = filterPrizes(catalog.prizes, state);
  if (trail) matched = matched.filter((p) => trail.prizeIds.includes(p.id));
  if (controls) syncControls();
  activeFilters();
  $('#result-heading').textContent = state.lens === 'reassessed' || REASSESSMENTS[state.lens] ? 'Prizes, reconsidered' : trail ? trail.title : 'The Nobel atlas';
  const count = new Set(matched.flatMap((p) => p.recipients.map((r) => r.id))).size;
  $('#result-count').textContent = `${matched.length} of ${catalog.meta.prizeCount} prizes · ${count.toLocaleString()} ${count === 1 ? 'laureate' : 'laureates'} · ${state.from}–${state.to}`;
  $('#active-trail').innerHTML = trail ? `<div class="trail-banner"><div><h3>${escape(trail.title)}</h3><p>${escape(trail.description)}</p><button class="text-button small" style="margin-top:9px" data-prize="${trail.prizeIds[0]}">Start the trail ↗</button></div><button data-action="clear-trail" aria-label="Leave discovery trail">×</button></div>` : '';
  $('#visualisation').innerHTML = '';
  $('#catalogue').innerHTML = '';
  if (!matched.length) {
    $('#catalogue').innerHTML = '<div class="empty-state"><span aria-hidden="true">⌕</span><h3>No prizes in this view</h3><p>Try a broader search, a different year range, or remove a filter to keep exploring.</p><button class="primary-button" data-action="reset">Reset filters</button></div>';
  } else if (state.view === 'connections') {
    const edges = visibleConnections(matched, catalog.connections);
    if (edges.length) $('#visualisation').innerHTML = connections(matched, edges, lookup, { min: state.from, max: state.to });
    else $('#visualisation').innerHTML = '<div class="empty-state"><span aria-hidden="true">✧</span><h3>No sourced connections in this view yet</h3><p>Both prizes in a relationship must match your filters. Broaden the view, follow a discovery trail, or browse these prizes in the catalogue.</p><button class="primary-button" data-view="catalogue">Browse matching prizes</button></div>';
  } else {
    if (state.view === 'timeline') $('#visualisation').innerHTML = timeline(matched, { min: state.from, max: state.to });
    $('#catalogue').innerHTML = catalogue(matched, state, limit);
  }
  if (updateUrl) saveUrl();
}

function update(patch, options = {}) {
  clearTimeout(searchTimer);
  state = { ...state, q: $('#search').value, ...patch };
  limit = 30;
  render(options);
}

function openPrize(id, push = true) {
  const prize = lookup.get(id);
  if (!prize) { notify('This prize could not be found. Try searching the catalogue.'); return; }
  const dialog = $('#prize-dialog');
  if (!dialog.open) returnFocus = document.activeElement;
  state.prize = id;
  $('#prize-content').innerHTML = detail(prize, lookup, catalog.connections, selectedTrail());
  $('#prize-reading-label').textContent = `${prize.year} · ${category(prize.category).name}`;
  saveUrl(push);
  if (!dialog.open) dialog.showModal();
  const heading = $('#prize-title');
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
  dialog.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  document.title = `${prize.year} ${category(prize.category).name}: ${prize.title || prize.recipients.map((p) => p.name).join(', ')} — Nobel Explorer`;
}

function closePrize(updateUrl = true) {
  $('#prize-dialog').close();
  document.body.style.overflow = '';
  state.prize = '';
  if (updateUrl) saveUrl();
  document.title = 'Nobel Explorer — A century of ideas, connected';
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  else { $('#result-heading').tabIndex = -1; $('#result-heading').focus({ preventScroll: true }); }
}

async function share() {
  state.q = $('#search').value;
  saveUrl();
  try {
    await navigator.clipboard.writeText(location.href);
    notify('Link copied. Your filters and selected prize are included.');
  } catch {
    notify('Copy the address from your browser to share this view.');
  }
}

function startTrail(id) {
  const trail = catalog.trails.find((t) => t.id === id);
  if (!trail) return;
  state = { ...defaultState(), trail: id, view: 'connections' };
  limit = 30;
  render();
  $('#explorer').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function keyboardTimeline(event) {
  const button = event.target.closest('.prize-dot');
  if (!button || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const dots = $$('.prize-dot');
  const catIndex = CATEGORIES.findIndex((c) => c.id === button.dataset.category);
  const year = Number(button.dataset.year);
  let candidates = dots.filter((dot) => dot.dataset.category === button.dataset.category).sort((a, b) => Number(a.dataset.year) - Number(b.dataset.year));
  let target;
  if (event.key === 'Home') target = candidates[0];
  if (event.key === 'End') target = candidates.at(-1);
  if (event.key === 'ArrowLeft') target = candidates.filter((dot) => Number(dot.dataset.year) < year).at(-1);
  if (event.key === 'ArrowRight') target = candidates.find((dot) => Number(dot.dataset.year) > year);
  if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
    const direction = event.key === 'ArrowUp' ? -1 : 1;
    for (let i = catIndex + direction; i >= 0 && i < CATEGORIES.length; i += direction) {
      candidates = dots.filter((dot) => dot.dataset.category === CATEGORIES[i].id).sort((a, b) => Math.abs(Number(a.dataset.year) - year) - Math.abs(Number(b.dataset.year) - year));
      if (candidates.length) { target = candidates[0]; break; }
    }
  }
  if (target) { button.tabIndex = -1; target.tabIndex = 0; target.focus(); }
}

function bindEvents() {
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('button, a[data-prize]');
    if (!button || !catalog) return;
    if (button.dataset.jump) {
      const section = document.getElementById(button.dataset.jump);
      if (section) { section.scrollIntoView({ block: 'start' }); section.focus({ preventScroll: true }); }
      return;
    }
    if (button.dataset.prize) { event.preventDefault(); openPrize(button.dataset.prize); return; }
    if (button.dataset.view) { update({ view: button.dataset.view }); return; }
    if (button.dataset.trail) { startTrail(button.dataset.trail); return; }
    if (button.dataset.topic) { closePrize(false); state = { ...defaultState(), topic: button.dataset.topic }; limit = 30; render(); $('#explorer').scrollIntoView({ block: 'start' }); return; }
    if (button.dataset.trailStep) { const trail = selectedTrail(); if (trail) openPrize(trail.prizeIds[Number(button.dataset.trailStep)]); return; }
    if (button.dataset.remove) {
      const key = button.dataset.remove;
      const patch = key.startsWith('category:') ? { categories: state.categories.filter((c) => c !== key.slice(9)) }
        : key === 'years' ? { from: bounds.min, to: bounds.max } : { [key]: key === 'lens' ? 'all' : '' };
      update(patch); return;
    }
    switch (button.dataset.action) {
      case 'reset': state = { ...defaultState(), view: state.view, prize: state.prize }; limit = 30; render(); break;
      case 'more': limit += 50; $('#catalogue').innerHTML = catalogue(matched, state, limit); break;
      case 'clear-trail': update({ trail: '' }); break;
      case 'surprise': {
        const candidates = catalog.prizes.filter((p) => p.summary);
        openPrize(candidates[Math.floor(Math.random() * candidates.length)].id); break;
      }
      case 'reassessed': state = { ...defaultState(), lens: 'reassessed', view: 'catalogue' }; limit = 30; render(); $('#explorer').scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
      case 'share': case 'share-prize': await share(); break;
      case 'close-prize': closePrize(); break;
      case 'about': $('#about-dialog').showModal(); document.body.style.overflow = 'hidden'; break;
      case 'close-about': $('#about-dialog').close(); document.body.style.overflow = ''; break;
      case 'retry': location.reload(); break;
    }
  });
  $('#search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => update({ q: $('#search').value }, { controls: false }), 150); });
  for (const id of ['topic', 'lens', 'country', 'institution', 'group', 'sort']) $(`#${id}`).addEventListener('change', (event) => update({ [id]: event.target.value }));
  $('#category-filters').addEventListener('change', () => update({ categories: $$('[name="category"]:checked').map((c) => c.value) }));
  for (const key of ['from', 'to']) $(`#year-${key}`).addEventListener('change', (event) => {
    const value = Math.round(Math.max(bounds.min, Math.min(bounds.max, Number(event.target.value) || bounds[key === 'from' ? 'min' : 'max'])));
    update(key === 'from' ? { from: value, to: Math.max(value, state.to) } : { to: value, from: Math.min(value, state.from) });
  });
  document.addEventListener('keydown', keyboardTimeline);
  $('#prize-dialog').addEventListener('cancel', (event) => { event.preventDefault(); closePrize(); });
  $('#about-dialog').addEventListener('close', () => { document.body.style.overflow = $('#prize-dialog').open ? 'hidden' : ''; });
  for (const id of ['prize-dialog', 'about-dialog']) $(`#${id}`).addEventListener('click', (event) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      if (id === 'prize-dialog') closePrize(); else $('#about-dialog').close();
    }
  });
  window.addEventListener('popstate', () => {
    state = readState(location.search, bounds);
    limit = 30;
    render({ updateUrl: false });
    if (state.prize && lookup.has(state.prize)) openPrize(state.prize, false); else closePrize(false);
  });
}

async function init() {
  try {
    const response = await fetch(new URL('./data/catalog.json', import.meta.url));
    if (!response.ok) throw new Error(`Data response ${response.status}`);
    catalog = await response.json();
    if (!catalog.prizes?.length || !catalog.meta || !Array.isArray(catalog.connections) || !Array.isArray(catalog.trails)) throw new Error('Invalid catalogue');
    catalog.prizes.forEach((p) => { p.search = searchText(p); });
    lookup = new Map(catalog.prizes.map((p) => [p.id, p]));
    bounds = { min: catalog.meta.minYear, max: catalog.meta.maxYear };
    state = readState(location.search, bounds);
    populateFilters();
    for (const key of ['topic', 'country', 'institution']) if (state[key] && ![...$(`#${key}`).options].some((o) => o.value === state[key])) state[key] = '';
    if (!selectedTrail()) state.trail = '';
    bindEvents();
    $('#load-state').hidden = true;
    render();
    if (state.prize) {
      if (lookup.has(state.prize)) openPrize(state.prize, false);
      else { state.prize = ''; saveUrl(); notify('That prize link was not found. The full atlas is available below.'); }
    }
  } catch (error) {
    console.error('Unable to load Nobel Explorer:', error.message);
    $('#load-state').innerHTML = '<h3>The atlas could not be loaded</h3><p>Check your connection and try again.</p><button class="primary-button" id="retry-load">Try again</button>';
    $('#retry-load').addEventListener('click', () => location.reload());
    $('#result-count').textContent = 'Prize data is temporarily unavailable.';
    $('#trail-list').textContent = '';
  }
}

init();
