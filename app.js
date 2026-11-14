'use strict';
/* Lineup — local event finder. No build step, no server. */

const CATEGORIES = [
  { id: 'concerts', label: 'Concerts', soon: true, icon: '🎤', c1: '#ff3d81', c2: '#7c5cff', q: { classificationName: 'Music' } },
  { id: 'sports', label: 'Sports', icon: '🏟️', c1: '#00b36b', c2: '#0a7bff', q: { classificationName: 'Sports' } },
  { id: 'comedy-theater', label: 'Comedy & Theater', icon: '🎭', c1: '#ff8a00', c2: '#e0245e', q: { classificationName: 'Arts & Theatre' } },
  { id: 'food-drink', label: 'Food & Drink', icon: '🍴', c1: '#f9a602', c2: '#d9381e', q: { keyword: 'food' } },
  { id: 'conventions', label: 'Conventions & Expos', icon: '🎟️', c1: '#6a5cff', c2: '#00c2d1', q: { keyword: 'convention' } },
  { id: 'festivals', label: 'Festivals', icon: '🎆', c1: '#c13bff', c2: '#ff5e7e', q: { keyword: 'festival' } },
  { id: 'family', label: 'Family', icon: '🧸', c1: '#22c1c3', c2: '#7bd36b', q: { keyword: 'family' } },
  { id: 'free', label: 'Free & Public', icon: '🆓', c1: '#2ee59d', c2: '#0a8f6e', q: { keyword: 'free' } }
];
const catById = id => CATEGORIES.find(c => c.id === id);

// Sellers we treat as verified: official box offices, or resellers with a buyer guarantee.
const VERIFIED = ['Ticketmaster', 'AXS', 'SeatGeek', 'StubHub', 'Vivid Seats'];
const SEARCH_LINKS = {
  'AXS': q => 'https://www.axs.com/search?q=' + q,
  'SeatGeek': q => 'https://seatgeek.com/search?search=' + q,
  'StubHub': q => 'https://www.stubhub.com/secure/search?q=' + q,
  'Vivid Seats': q => 'https://www.vividseats.com/search?searchTerm=' + q
};

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : '');
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
};
const state = { events: new Map(), loc: null };
const keys = () => ({ tm: store.get('lineup.tm') || '', sg: store.get('lineup.sg') || '' });
const hasTM = () => !!keys().tm;
const DEFAULT_LOC = { type: 'geo', lat: 38.627, lon: -90.199, label: 'St. Louis area' };

function money(n, cur = 'USD') {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n); }
  catch { return '$' + n; }
}
function startDate(ev) {
  const [y, m, d] = ev.date.split('-').map(Number);
  const [h, mi] = (ev.time || '').split(':').map(Number);
  return ev.time ? new Date(y, m - 1, d, h, mi) : new Date(y, m - 1, d);
}
function fmtDate(ev) {
  const d = startDate(ev);
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(d);
  return ev.time ? day + ' · ' + new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d) : day;
}
function priceInfo(ev) {
  if (!ev.price) return { kind: 'unknown', badge: '<span class="badge">Price: check site</span>', text: 'Check site' };
  if (ev.price.max === 0) return { kind: 'free', badge: '<span class="badge free">Free</span>', text: 'Free' };
  const text = ev.price.min === ev.price.max ? money(ev.price.min, ev.price.currency) : 'from ' + money(ev.price.min, ev.price.currency);
  return { kind: 'paid', badge: '<span class="badge paid">Paid · ' + esc(text) + '</span>', text };
}
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- location ---------- */
function loadLoc() { try { state.loc = JSON.parse(store.get('lineup.loc')); } catch { state.loc = null; } }
function setLoc(loc) {
  state.loc = loc; store.set('lineup.loc', JSON.stringify(loc));
  $('#locinput').value = loc.label || '';
}
function parseLoc(text) {
  const t = text.trim(); if (!t) return null;
  if (/^\d{5}$/.test(t)) return { type: 'zip', zip: t, label: t };
  const [city, st] = t.split(',').map(s => s.trim());
  const o = { type: 'city', city, label: t };
  if (st && /^[a-z]{2}$/i.test(st)) o.state = st.toUpperCase();
  return o;
}
function locParams(loc) {
  const p = {};
  if (!loc) return p;
  if (loc.type === 'geo') { p.latlong = loc.lat + ',' + loc.lon; p.radius = 50; p.unit = 'miles'; }
  else if (loc.type === 'zip') { p.postalCode = loc.zip; p.countryCode = 'US'; p.radius = 50; p.unit = 'miles'; }
  else { p.city = loc.city; if (loc.state) p.stateCode = loc.state; }
  return p;
}

/* ---------- data: Ticketmaster ---------- */
function normalizeTM(e, cat) {
  const v = e._embedded?.venues?.[0];
  const pr = e.priceRanges?.[0];
  const img = (e.images || []).filter(i => i.ratio === '16_9').sort((a, b) => b.width - a.width)[0];
  const ev = {
    id: 'tm_' + e.id, cat, source: 'tm', title: e.name,
    date: e.dates?.start?.localDate, time: e.dates?.start?.localTime || null,
    venue: v?.name || 'Venue TBA', city: [v?.city?.name, v?.state?.stateCode].filter(Boolean).join(', '),
    image: safeUrl(img?.url), url: safeUrl(e.url),
    price: pr ? { min: pr.min, max: pr.max, currency: pr.currency || 'USD' } : null,
    status: e.dates?.status?.code, info: e.info || e.pleaseNote || ''
  };
  ev.icon = catById(cat)?.icon || '🎟️';
  return ev;
}
async function tmFetch(path, params) {
  const url = new URL('https://app.ticketmaster.com/discovery/v2/' + path);
  Object.entries({ apikey: keys().tm, ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url);
  if (r.status === 401) throw new Error('Ticketmaster rejected the key. Check it in Settings (⚙️).');
  if (r.status === 429) throw new Error('Too many requests right now. Wait a few seconds and try again.');
  if (!r.ok) throw new Error('Could not load events (error ' + r.status + ').');
  return r.json();
}
/* ---------- data: local files (sports schedules + weekly curated search) ---------- */
let localCache;
async function loadLocal() {
  if (localCache) return localCache;
  const today = new Date(); const t0 = `${today.getFullYear()}-${p2(today.getMonth() + 1)}-${p2(today.getDate())}`;
  const files = await Promise.all(['data/sports.json', 'data/curated.json'].map(f =>
    fetch(f + '?t=' + Math.floor(Date.now() / 600000)).then(r => (r.ok ? r.json() : { events: [] })).catch(() => ({ events: [] }))));
  localCache = files.flatMap(f => f.events || []).filter(e => e.date && e.title && e.date >= t0)
    .map(e => ({ source: 'local', icon: catById(e.cat)?.icon, price: null, ...e, url: safeUrl(e.url) }));
  return localCache;
}
async function fetchCategory(cat) {
  const local = (await loadLocal()).filter(e => e.cat === cat.id);
  if (!hasTM()) return local;
  try {
    const data = await tmFetch('events.json', { size: 40, sort: 'date,asc', ...cat.q, ...locParams(state.loc || DEFAULT_LOC) });
    const seen = new Set();
    const tm = (data._embedded?.events || []).map(e => normalizeTM(e, cat.id)).filter(e => e.date && !seen.has(e.id) && seen.add(e.id));
    return [...local, ...tm];
  } catch (e) { if (!local.length) throw e; return local; }
}
async function getEvent(id) {
  if (state.events.has(id)) return state.events.get(id);
  const loc = (await loadLocal()).find(e => e.id === id);
  if (loc) return loc;
  if (id.startsWith('tm_') && hasTM()) {
    const ev = normalizeTM(await tmFetch('events/' + encodeURIComponent(id.slice(3)) + '.json', {}), 'concerts');
    state.events.set(id, ev); return ev;
  }
  return null;
}

/* ---------- price comparison ---------- */
async function seatGeekLookup(ev) {
  const sg = keys().sg; if (!sg || ev.source === 'demo') return null;
  const d = ev.date;
  const next = new Date(startDate(ev)); next.setDate(next.getDate() + 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
  const u = new URL('https://api.seatgeek.com/2/events');
  Object.entries({ client_id: sg, q: ev.title, 'datetime_local.gte': d, 'datetime_local.lte': end, per_page: 1 }).forEach(([k, v]) => u.searchParams.set(k, v));
  try {
    const r = await fetch(u); if (!r.ok) return null;
    const hit = (await r.json()).events?.[0];
    if (!hit) return null;
    return { name: 'SeatGeek', price: hit.stats?.lowest_price ?? null, verified: true, url: safeUrl(hit.url) };
  } catch { return null; }
}
function buildVendors(ev, sgResult) {
  const list = [];
  {
    list.push({ name: 'Ticketmaster', price: ev.price?.min ?? null, verified: true, url: ev.url });
    if (sgResult) list.push(sgResult);
  }
  const q = encodeURIComponent(ev.title);
  Object.keys(SEARCH_LINKS).forEach(name => {
    if (!list.some(v => v.name === name)) list.push({ name, price: null, verified: true, url: SEARCH_LINKS[name](q), search: true });
  });
  return list;
}
function compareHtml(ev, sgResult, sgPending) {
  const vendors = buildVendors(ev, sgResult);
  const priced = vendors.filter(v => v.price != null).sort((a, b) => a.price - b.price);
  const unpriced = vendors.filter(v => v.price == null);
  const best = priced.find(v => v.verified && VERIFIED.some(n => v.name.startsWith(n)));
  const cur = ev.price?.currency || 'USD';
  const row = v => {
    const isBest = v === best, link = safeUrl(v.url);
    return `<div class="vendor${isBest ? ' best' : ''}">
      <div><div class="vname">${esc(v.name)}</div>
      ${isBest ? '<span class="badge ok">✅ Best verified price</span>' : v.verified ? '<span class="badge ok">Verified seller</span>' : '<span class="badge bad">⚠️ Not verified — be careful</span>'}</div>
      <div>${v.price != null ? `<span class="vprice">${money(v.price, cur)}</span>` : '<span class="muted">Check price</span>'}
      ${link ? ` <a class="btn small${isBest ? '' : ' ghost'}" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${v.search ? 'Search' : 'Buy'} ↗</a>` : ''}</div></div>`;
  };
  return `<div class="compare"><h2>Compare prices</h2>
    ${[...priced, ...unpriced].map(row).join('')}
    ${sgPending ? '<p class="note">Checking SeatGeek…</p>' : ''}
    <p class="note">Prices are the lowest listed and can change at checkout (fees, taxes). "Verified" means an official box office or a reseller with a buyer guarantee. Always check the web address before you pay.</p></div>`;
}

/* ---------- calendar & share ---------- */
const p2 = n => String(n).padStart(2, '0');
const local = d => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}T${p2(d.getHours())}${p2(d.getMinutes())}00`;
const dateOnly = d => local(d).slice(0, 8);
function calTimes(ev) {
  const s = startDate(ev), e = new Date(s);
  if (ev.time) { e.setHours(e.getHours() + 3); return { allDay: false, s: local(s), e: local(e) }; }
  e.setDate(e.getDate() + 1); return { allDay: true, s: dateOnly(s), e: dateOnly(e) };
}
function googleCalUrl(ev) {
  const t = calTimes(ev);
  const u = new URL('https://calendar.google.com/calendar/render');
  u.searchParams.set('action', 'TEMPLATE'); u.searchParams.set('text', ev.title);
  u.searchParams.set('dates', t.s + '/' + t.e);
  u.searchParams.set('location', [ev.venue, ev.city].filter(Boolean).join(', '));
  u.searchParams.set('details', ev.url ? 'Tickets/info: ' + ev.url : 'Found with Lineup');
  return u.toString();
}
function downloadIcs(ev) {
  const t = calTimes(ev), esc2 = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lineup//EN', 'BEGIN:VEVENT', `UID:${ev.id}@lineup`,
    'DTSTAMP:' + new Date().toISOString().replace(/[-:]|\.\d+/g, ''),
    t.allDay ? 'DTSTART;VALUE=DATE:' + t.s : 'DTSTART:' + t.s, t.allDay ? 'DTEND;VALUE=DATE:' + t.e : 'DTEND:' + t.e,
    'SUMMARY:' + esc2(ev.title), 'LOCATION:' + esc2([ev.venue, ev.city].filter(Boolean).join(', ')),
    'DESCRIPTION:' + esc2(ev.url || 'Found with Lineup'), 'END:VEVENT', 'END:VCALENDAR'];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  a.download = ev.title.replace(/[^\w]+/g, '-').slice(0, 40) + '.ics';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Calendar file downloaded');
}
async function shareEvent(ev) {
  const data = { title: ev.title, text: `${ev.title} — ${fmtDate(ev)} at ${ev.venue}`, url: ev.url || location.href };
  if (navigator.share) {
    try { await navigator.share(data); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(`${data.text}\n${data.url}`); toast('Copied to clipboard'); }
  catch { prompt('Copy this link:', data.url); }
}

/* ---------- views ---------- */
const app = () => $('#app');
const demoBanner = () => '';
function viewHome() {
  document.title = 'Lineup — find events near you';
  app().innerHTML = `<h1>What are you in the mood for?</h1>
    <p class="muted">Events in the St. Louis, MO area. New listings are added every week.</p>
    ${demoBanner()}
    <div class="tiles">${CATEGORIES.map(c => c.soon
      ? `<div class="tile soon" style="--c1:${c.c1};--c2:${c.c2}" aria-disabled="true"><span class="ic" aria-hidden="true">${c.icon}</span>${esc(c.label)}<span class="soonbadge">Coming soon</span></div>`
      : `<a class="tile" style="--c1:${c.c1};--c2:${c.c2}" href="#/c/${c.id}"><span class="ic" aria-hidden="true">${c.icon}</span>${esc(c.label)}</a>`).join('')}</div>`;
}
function cardHtml(ev) {
  const cat = catById(ev.cat) || {};
  const pi = priceInfo(ev);
  return `<a class="card" href="#/e/${encodeURIComponent(ev.id)}">
    <div class="img" style="--c1:${cat.c1 || '#3a2a6a'};--c2:${cat.c2 || '#ff3d81'}">${ev.image ? `<img src="${esc(ev.image)}" alt="" loading="lazy">` : `<span aria-hidden="true">${esc(ev.icon || '🎟️')}</span>`}</div>
    <div class="body"><div class="date">${esc(fmtDate(ev))}</div><div class="title">${esc(ev.title)}</div>
    <div class="venue">${esc(ev.venue)}${ev.city ? ' · ' + esc(ev.city) : ''}</div>
    <div class="badges">${pi.badge}${ev.status === 'cancelled' ? '<span class="badge bad">Cancelled</span>' : ''}</div></div></a>`;
}
async function viewCategory(id, sort = 'date') {
  const cat = catById(id); if (!cat) return viewHome();
  document.title = cat.label + ' — Lineup';
  if (cat.soon) {
    app().innerHTML = `<a class="crumb" href="#/">← All categories</a><h1>${cat.icon} ${esc(cat.label)}</h1><div class="state"><p><b>Coming soon</b></p><p>Concert listings and verified-seller price comparison are on the way.</p></div>`;
    return;
  }
  app().innerHTML = `<a class="crumb" href="#/">← All categories</a><h1>${cat.icon} ${esc(cat.label)}</h1><div class="state"><div class="spin"></div>Loading events…</div>`;
  let events;
  try { events = await fetchCategory(cat); }
  catch (e) {
    if (location.hash !== '#/c/' + id && !location.hash.startsWith('#/c/' + id + '?')) return;
    app().innerHTML = `<a class="crumb" href="#/">← All categories</a><h1>${cat.icon} ${esc(cat.label)}</h1><div class="banner err">${esc(e.message || 'Something went wrong.')} <a href="#/c/${id}" onclick="route();return false">Try again</a></div>`;
    return;
  }
  if (!location.hash.startsWith('#/c/' + id)) return; // user navigated away while loading
  events.forEach(e => state.events.set(e.id, e));
  if (sort === 'price') events.sort((a, b) => (a.price ? a.price.min : 1e9) - (b.price ? b.price.min : 1e9));
  else events.sort((a, b) => startDate(a) - startDate(b));
  app().innerHTML = `<a class="crumb" href="#/">← All categories</a><h1>${cat.icon} ${esc(cat.label)}</h1>
    <p class="muted">${events.length} event${events.length === 1 ? '' : 's'}</p>${demoBanner()}
    <div class="toolbar"><span></span><label class="muted">Sort <select id="sortsel"><option value="date"${sort === 'date' ? ' selected' : ''}>Soonest</option><option value="price"${sort === 'price' ? ' selected' : ''}>Lowest price</option></select></label></div>
    ${events.length ? `<div class="list">${events.map(cardHtml).join('')}</div>` : '<div class="state"><p><b>No events yet</b></p><p>We\'re adding more St. Louis events every week. Check back soon!</p></div>'}`;
  $('#sortsel')?.addEventListener('change', e => viewCategory(id, e.target.value));
}
async function viewEvent(id) {
  app().innerHTML = '<div class="state"><div class="spin"></div>Loading…</div>';
  let ev;
  try { ev = await getEvent(id); } catch (e) { ev = null; }
  if (!ev) { app().innerHTML = '<a class="crumb" href="#/">← Home</a><div class="state">That event could not be found. It may have ended.</div>'; return; }
  document.title = ev.title + ' — Lineup';
  state.events.set(ev.id, ev);
  const cat = catById(ev.cat) || {}, pi = priceInfo(ev), link = safeUrl(ev.url);
  const showCompare = pi.kind !== 'free' && ev.source === 'tm';
  const sgWanted = showCompare && !!keys().sg;
  app().innerHTML = `<a class="crumb" href="#/c/${esc(ev.cat)}">← ${esc(cat.label || 'Back')}</a>
    <div class="hero"><div class="img" style="--c1:${cat.c1 || '#3a2a6a'};--c2:${cat.c2 || '#ff3d81'}">${ev.image ? `<img src="${esc(ev.image)}" alt="">` : `<span aria-hidden="true">${esc(ev.icon || '🎟️')}</span>`}</div></div>
    <div class="date">${esc(fmtDate(ev))}</div><h1>${esc(ev.title)}</h1>
    <div class="venue">📍 ${esc(ev.venue)}${ev.city ? ' · ' + esc(ev.city) : ''}</div>
    <div class="badges">${pi.badge}${ev.status === 'cancelled' ? '<span class="badge bad">Cancelled</span>' : ''}</div>
    ${ev.info ? `<p class="muted">${esc(ev.info).slice(0, 400)}</p>` : ''}
    ${demoBanner()}
    <div class="actions">
      <a class="btn" href="${esc(googleCalUrl(ev))}" target="_blank" rel="noopener noreferrer">📅 Google Calendar</a>
      <button class="btn ghost" data-act="ics">⬇️ Apple / Outlook (.ics)</button>
      <button class="btn ghost" data-act="share">🔗 Share</button>
      ${link ? `<a class="btn ghost" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Official site ↗</a>` : ''}
    </div>
    <div id="compare">${showCompare ? compareHtml(ev, null, sgWanted) : ''}</div>`;
  app().querySelector('[data-act=ics]').onclick = () => downloadIcs(ev);
  app().querySelector('[data-act=share]').onclick = () => shareEvent(ev);
  if (sgWanted) seatGeekLookup(ev).then(r => { const box = $('#compare'); if (box && location.hash === '#/e/' + encodeURIComponent(id)) box.innerHTML = compareHtml(ev, r, false); });
}

/* ---------- router & wiring ---------- */
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [kind, rest] = h.split('/');
  window.scrollTo(0, 0);
  if (kind === 'c') viewCategory(decodeURIComponent(rest || ''));
  else if (kind === 'e') viewEvent(decodeURIComponent(rest || ''));
  else viewHome();
}
window.addEventListener('hashchange', route);

$('#locform').addEventListener('submit', e => {
  e.preventDefault();
  const loc = parseLoc($('#locinput').value);
  if (!loc) return toast('Type a city or ZIP first');
  setLoc(loc); route();
});
$('#geobtn').addEventListener('click', () => {
  if (!navigator.geolocation) return toast('Location not available on this device');
  toast('Finding you…');
  navigator.geolocation.getCurrentPosition(
    p => { setLoc({ type: 'geo', lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), label: 'my location' }); route(); },
    () => toast('Could not get location — type a city instead'),
    { timeout: 10000, maximumAge: 600000 });
});
const dlg = $('#settings');
$('#settingsbtn').addEventListener('click', () => { $('#tmkey').value = keys().tm; $('#sgkey').value = keys().sg; dlg.showModal(); });
dlg.addEventListener('close', () => {
  if (dlg.returnValue === 'save') {
    const tm = $('#tmkey').value.trim(), sg = $('#sgkey').value.trim();
    tm ? store.set('lineup.tm', tm) : store.del('lineup.tm'); sg ? store.set('lineup.sg', sg) : store.del('lineup.sg');
    toast('Saved'); route();
  } else if (dlg.returnValue === 'clear') { store.del('lineup.tm'); store.del('lineup.sg'); toast('Keys cleared'); route(); }
});

loadLoc();
if (state.loc) $('#locinput').value = state.loc.label || '';
route();
