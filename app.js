/* Chishikunem — toilets in Kentron, Yerevan.
 *
 * Data comes live from OpenStreetMap via Overpass, cached in localStorage for a
 * week. Nothing is hard-coded, so the map stays correct as OSM improves.
 */

// Kentron district, plus a thin margin. [south, west, north, east]
const BBOX = [40.1580, 44.4930, 40.2010, 44.5350];

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const CACHE_KEY = 'chishikunem:osm:v1';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

const QUERY = `[out:json][timeout:60];
(
  nwr["amenity"="fast_food"]["name"](${BBOX.join(',')});
  nwr["amenity"="toilets"](${BBOX.join(',')});
);
out center tags;`;

const el = {
  map: document.getElementById('map'),
  list: document.getElementById('list'),
  count: document.getElementById('count'),
  search: document.getElementById('search'),
  status: document.getElementById('status'),
  locate: document.getElementById('locate'),
};

let places = [];
let markers = new Map();
let statusTimer;

/* ---------- map ---------- */

const map = L.map(el.map, { zoomControl: true })
  .setView([40.1830, 44.5140], 15);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const layer = L.layerGroup().addTo(map);

/* ---------- tag helpers ---------- */

// OSM tags are free text; anything we do not recognise stays `null` = unknown.
function tri(value, yes, no) {
  if (value == null) return null;
  if (yes.includes(value)) return true;
  if (no.includes(value)) return false;
  return null;
}

function normalise(element) {
  const t = element.tags || {};
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (lat == null || lon == null) return null;

  const isToilet = t.amenity === 'toilets';

  // A venue describes its toilet with `toilets:*`; a public toilet uses the
  // plain keys, because the whole feature *is* the toilet.
  const fee = isToilet ? t.fee : t['toilets:fee'];
  const wheel = isToilet ? t.wheelchair : (t['toilets:wheelchair'] ?? t.wheelchair);
  const unisex = isToilet ? t.unisex : (t['toilets:unisex'] ?? t.unisex);
  const access = isToilet ? t.access : t['toilets:access'];

  const free = tri(fee, ['no'], ['yes']);

  return {
    id: `${element.type}/${element.id}`,
    name: t.name || t['name:en'] || (isToilet ? 'Public toilet' : 'Unnamed place'),
    lat,
    lon,
    isToilet,
    cuisine: t.cuisine ? t.cuisine.split(';')[0].replace(/_/g, ' ') : '',
    hours: t.opening_hours || '',
    // A dedicated public toilet always has a toilet; a venue must say so.
    hasToilet: isToilet ? true : tri(t.toilets, ['yes'], ['no']),
    free,
    paid: free === null ? null : !free,
    wheelchair: tri(wheel, ['yes', 'designated'], ['no']),
    wheelchairLimited: wheel === 'limited',
    baby: tri(t.changing_table, ['yes'], ['no']),
    unisex: tri(unisex, ['yes'], ['no']),
    // "No need to ask": open to anyone, not just paying customers.
    noAsk: tri(access, ['yes', 'public'], ['customers', 'private', 'permissive', 'no']),
  };
}

/* ---------- loading ---------- */

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.at > CACHE_TTL) return null;
    return cached.elements;
  } catch {
    return null;
  }
}

function writeCache(elements) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), elements }));
  } catch {
    // Storage full or blocked — the map works fine without a cache.
  }
}

async function fetchElements() {
  let lastError;
  for (const endpoint of ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: QUERY }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (!Array.isArray(json.elements)) throw new Error('unexpected response');
      return json.elements;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('no endpoint reachable');
}

async function load() {
  const cached = readCache();
  if (cached) {
    places = cached.map(normalise).filter(Boolean);
    render();
  }

  try {
    const elements = await fetchElements();
    writeCache(elements);
    places = elements.map(normalise).filter(Boolean);
    render();
  } catch (error) {
    if (cached) {
      showStatus('Showing saved data — could not reach OpenStreetMap.');
    } else {
      el.count.textContent = 'Could not load the map data.';
      showStatus('Could not reach OpenStreetMap. Check your connection and reload.', 0);
    }
  }
}

function showStatus(message, ms = 5000) {
  el.status.textContent = message;
  el.status.hidden = false;
  clearTimeout(statusTimer);
  if (ms) statusTimer = setTimeout(() => { el.status.hidden = true; }, ms);
}

/* ---------- filtering ---------- */

function activeFilters() {
  return [...document.querySelectorAll('.chip input:checked')]
    .map((input) => input.dataset.filter);
}

function visiblePlaces() {
  const filters = activeFilters();
  const term = el.search.value.trim().toLowerCase();

  return places.filter((place) => {
    if (term && !place.name.toLowerCase().includes(term)) return false;
    // A checked chip means "confirmed yes" — unknowns are excluded on purpose,
    // so nobody travels somewhere on a guess.
    return filters.every((key) => place[key] === true);
  });
}

/* ---------- rendering ---------- */

function colourOf(place) {
  if (place.free === true) return 'var(--free)';
  if (place.free === false) return 'var(--paid)';
  return 'var(--unknown)';
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function factsOf(place) {
  const facts = [];
  if (place.free === true) facts.push(['Free', 'free']);
  if (place.free === false) facts.push(['Paid', 'paid']);
  if (place.hasToilet === true && !place.isToilet) facts.push(['Toilet confirmed', '']);
  if (place.hasToilet === false) facts.push(['No toilet', '']);
  if (place.wheelchair === true) facts.push(['Wheelchair', '']);
  else if (place.wheelchairLimited) facts.push(['Wheelchair: limited', '']);
  if (place.baby === true) facts.push(['Baby table', '']);
  if (place.unisex === true) facts.push(['Gender-neutral', '']);
  if (place.noAsk === true) facts.push(['No need to ask', '']);
  return facts;
}

function popupHtml(place) {
  const facts = factsOf(place);
  const meta = [place.isToilet ? 'Public toilet' : place.cuisine, place.hours]
    .filter(Boolean).map(escapeHtml).join(' · ');

  const list = facts.length
    ? `<ul>${facts.map((f) => `<li>${escapeHtml(f[0])}</li>`).join('')}</ul>`
    : '<p>Nothing checked here yet.</p>';

  const osmUrl = `https://www.openstreetmap.org/${place.id}`;

  return `<h2>${escapeHtml(place.name)}</h2>
    ${meta ? `<p>${meta}</p>` : ''}
    ${list}
    <p style="margin-top:8px"><a href="${osmUrl}" target="_blank" rel="noopener">Fix on OpenStreetMap</a></p>`;
}

function render() {
  const shown = visiblePlaces();

  layer.clearLayers();
  markers = new Map();

  for (const place of shown) {
    const marker = L.circleMarker([place.lat, place.lon], {
      radius: place.isToilet ? 9 : 6,
      color: place.isToilet ? '#16191d' : colourOf(place),
      weight: place.isToilet ? 3 : 1,
      fillColor: colourOf(place),
      fillOpacity: place.isToilet ? 1 : 0.85,
    });
    marker.bindPopup(popupHtml(place));
    marker.addTo(layer);
    markers.set(place.id, marker);
  }

  const toilets = shown.filter((p) => p.isToilet).length;
  el.count.textContent = shown.length
    ? `${shown.length} places · ${toilets} public toilets`
    : 'Nothing matches these filters.';

  el.list.replaceChildren(...shown
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(listItem));
}

function listItem(place) {
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'item';

  const top = document.createElement('div');
  top.className = 'item__top';

  const name = document.createElement('span');
  name.className = 'item__name';
  name.textContent = place.name;

  const kind = document.createElement('span');
  kind.className = 'item__kind';
  kind.textContent = place.isToilet ? 'Public toilet' : place.cuisine;

  top.append(name, kind);
  button.append(top);

  const facts = factsOf(place);
  if (facts.length) {
    const tags = document.createElement('div');
    tags.className = 'item__tags';
    for (const [label, variant] of facts) {
      const tag = document.createElement('span');
      tag.className = variant ? `tag tag--${variant}` : 'tag';
      tag.textContent = label;
      tags.append(tag);
    }
    button.append(tags);
  }

  button.addEventListener('click', () => {
    map.flyTo([place.lat, place.lon], 18, { duration: 0.6 });
    markers.get(place.id)?.openPopup();
  });

  li.append(button);
  return li;
}

/* ---------- events ---------- */

document.querySelectorAll('.chip input')
  .forEach((input) => input.addEventListener('change', render));

let searchTimer;
el.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(render, 150);
});

el.locate.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showStatus('Your browser cannot share your location.');
    return;
  }
  showStatus('Finding you…');
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      map.flyTo([latitude, longitude], 17, { duration: 0.6 });
      L.circleMarker([latitude, longitude], {
        radius: 8, color: '#1b4ed8', weight: 3, fillColor: '#fff', fillOpacity: 1,
      }).addTo(map).bindPopup('You are here');
      el.status.hidden = true;
    },
    () => showStatus('Could not get your location.'),
    { enableHighAccuracy: true, timeout: 10000 },
  );
});

load();
