/* Chishikunem — map of toilets in Kentron, Yerevan.
 *
 * Places come from OpenStreetMap via data.js; anything confirmed on the review
 * page overrides what OSM says.
 */

const el = {
  map: document.getElementById('map'),
  list: document.getElementById('list'),
  count: document.getElementById('count'),
  search: document.getElementById('search'),
  status: document.getElementById('status'),
  locate: document.getElementById('locate'),
  detail: document.getElementById('detail'),
  detailTitle: document.getElementById('detailTitle'),
  detailBody: document.getElementById('detailBody'),
  detailClose: document.getElementById('detailClose'),
  scrim: document.getElementById('scrim'),
  layout: document.getElementById('layout'),
  viewMap: document.getElementById('viewMap'),
  viewList: document.getElementById('viewList'),
  download: document.getElementById('download'),
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

/* ---------- filtering ---------- */

function activeFilters() {
  return [...document.querySelectorAll('.chip input:checked')]
    .map((input) => input.dataset.filter);
}

function matches(place, key) {
  if (key === 'paid') return place.free === false;
  return place[key] === true;
}

/* The map only shows toilets somebody has actually confirmed: a dedicated
 * public toilet, or a venue confirmed to have one. A venue nobody has checked
 * is a guess, and sending someone across town on a guess is worse than showing
 * them nothing — those live on the review page until they are confirmed.
 *
 * "No need to ask" stays a baseline rather than a chip: we drop places known to
 * fail it, rather than demanding proof they pass. */
function meetsBaseline(place) {
  if (place.hasToilet !== true) return false;
  if (place.noAsk === false) return false;
  // An unreviewed public toilet is a dot on a street with no name and nothing
  // to recognise it by. It waits on the review page until somebody looks.
  if (place.isToilet && !place.reviewed) return false;
  return true;
}

function visiblePlaces() {
  const filters = activeFilters();
  const term = el.search.value.trim().toLowerCase();

  return places.filter((place) => {
    if (!meetsBaseline(place)) return false;
    if (term && !place.name.toLowerCase().includes(term)) return false;
    // A checked chip means "confirmed yes" — unknowns are excluded on purpose,
    // so nobody travels somewhere on a guess.
    return filters.every((key) => matches(place, key));
  });
}

/* ---------- rendering ---------- */

function colourOf(place) {
  if (place.free === true) return 'var(--free)';
  if (place.free === false) return 'var(--paid)';
  return 'var(--unknown)';
}

// A toilet glyph tinted by price, on a chip so it stays legible over map tiles.
function pinIcon(place) {
  const size = place.isToilet ? 32 : 26;
  const classes = ['pin'];
  if (place.isToilet) classes.push('pin--public');
  if (place.reviewed) classes.push('pin--reviewed');
  const style = `color:${colourOf(place)};width:${size}px;height:${size}px`;

  return L.divIcon({
    className: 'pin-wrap',
    // width/height/fill are set as attributes too, so a stale stylesheet can
    // never blow the glyph up to the SVG default of 300x150 in default black.
    html: `<span class="${classes.join(' ')}" style="${style}">`
      + `<svg width="${Math.round(size * 0.62)}" height="${Math.round(size * 0.62)}" `
      + `viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">`
      + '<use href="#toilet"></use></svg></span>',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2)],
  });
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function factsOf(place) {
  const facts = [];
  if (place.free === true) facts.push(['Free', 'free']);
  if (place.free === false) facts.push(['Paid', 'paid']);
  if (place.hasToilet === true && !place.isToilet) facts.push(['Toilet confirmed', '']);
  if (place.wheelchair === true) facts.push(['Wheelchair', '']);
  else if (place.wheelchairLimited) facts.push(['Wheelchair: limited', '']);
  if (place.baby === true) facts.push(['Baby table', '']);
  if (place.unisex === true) facts.push(['Gender-neutral', '']);
  // Everything on the map is meant to be walk-in; this marks the ones proven so.
  if (place.noAsk === true) facts.push(['Walk-in confirmed', 'free']);
  return facts;
}

/* ---------- detail panel ---------- */

let openPlaceId = null;

function section(title) {
  const h = document.createElement('h3');
  h.className = 'detail__h';
  h.textContent = title;
  return h;
}

function photoBlock(place) {
  const wrap = document.createElement('div');
  const photos = Chishikunem.photosFor(place);

  if (photos.length) {
    wrap.className = 'shots';
    photos.forEach((src, i) => {
      const img = document.createElement('img');
      img.className = 'shots__img';
      img.src = src;
      img.alt = `${place.name} — photo ${i + 1}`;
      img.loading = 'lazy';
      // A dead path should not leave a broken-image icon sitting in the panel.
      img.addEventListener('error', () => img.remove());
      wrap.append(img);
    });
    return wrap;
  }

  wrap.className = 'shots shots--empty';
  const p = document.createElement('p');
  p.className = 'shots__hint';
  p.textContent = 'No photo here yet. Open the place on Google or Yandex to see theirs.';
  wrap.append(p);
  return wrap;
}

function linkRow(place) {
  const row = document.createElement('div');
  row.className = 'detail__links';

  for (const [text, href, strong] of [
    ['Photos on Google', Chishikunem.mapsUrl(place), true],
    ['Photos on Yandex', Chishikunem.yandexUrl(place), true],
    ['Street View', Chishikunem.streetViewUrl(place), false],
    ['OpenStreetMap', Chishikunem.osmUrl(place), false],
  ]) {
    const a = document.createElement('a');
    a.className = strong ? 'btn btn--link btn--go' : 'btn btn--link';
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = text;
    row.append(a);
  }
  return row;
}

function factList(place) {
  const facts = factsOf(place);
  if (!facts.length) {
    const p = document.createElement('p');
    p.className = 'detail__muted';
    p.textContent = 'Nobody has checked the details here yet.';
    return p;
  }

  const ul = document.createElement('ul');
  ul.className = 'detail__facts';
  for (const [label, variant] of facts) {
    const li = document.createElement('li');
    li.className = variant ? `tag tag--${variant}` : 'tag';
    li.textContent = label;
    ul.append(li);
  }
  return ul;
}

function openDetail(place) {
  openPlaceId = place.id;
  el.detailTitle.textContent = place.name;
  el.detailBody.replaceChildren();

  const name = document.createElement('h2');
  name.className = 'detail__name';
  name.textContent = place.name;
  el.detailBody.append(name);

  const meta = [
    place.isToilet ? 'Public toilet' : place.cuisine,
    place.near && `near ${place.near}`,
    place.address,
    place.hours,
  ].filter(Boolean);
  if (meta.length) {
    const p = document.createElement('p');
    p.className = 'detail__meta';
    p.textContent = meta.join(' · ');
    el.detailBody.append(p);
  }

  el.detailBody.append(photoBlock(place), linkRow(place));

  el.detailBody.append(section('What is there'), factList(place));

  if (place.note) {
    const note = document.createElement('p');
    note.className = 'detail__note';
    note.textContent = place.note;
    el.detailBody.append(section('Note'), note);
  }

  const foot = document.createElement('p');
  foot.className = 'detail__muted detail__id';
  foot.textContent = place.reviewed
    ? `Checked in person · ${place.id}`
    : `Not checked in person yet · ${place.id}`;
  el.detailBody.append(foot);

  el.detail.classList.add('is-open');
  el.scrim.classList.add('is-on');
  el.detailBody.scrollTop = 0;
  el.detailClose.focus();
}

function closeDetail() {
  openPlaceId = null;
  el.detail.classList.remove('is-open');
  el.scrim.classList.remove('is-on');
}

/* ---------- map / list switch ---------- */

// Matches the breakpoint in styles.css where the two panes stop sharing a row.
const onePaneAtATime = window.matchMedia('(max-width: 859px)');

function setView(view) {
  const isMap = view === 'map';
  el.layout.classList.toggle('is-map', isMap);
  el.layout.classList.toggle('is-list', !isMap);
  el.viewMap.classList.toggle('is-on', isMap);
  el.viewList.classList.toggle('is-on', !isMap);
  el.viewMap.setAttribute('aria-pressed', String(isMap));
  el.viewList.setAttribute('aria-pressed', String(!isMap));

  // Leaflet measures its container on creation; if the map was display:none it
  // has stale dimensions and renders grey tiles until told to re-measure.
  if (isMap) map.invalidateSize();
}

function showPlace(place) {
  // Tapping a list row on a phone should reveal the pin, not just the panel.
  if (onePaneAtATime.matches) setView('map');
  map.flyTo([place.lat, place.lon], Math.max(map.getZoom(), 17), { duration: 0.6 });
  openDetail(place);
}

function render() {
  const shown = visiblePlaces();

  layer.clearLayers();
  markers = new Map();

  for (const place of shown) {
    const marker = L.marker([place.lat, place.lon], {
      icon: pinIcon(place),
      title: place.name,
      riseOnHover: true,
    });
    marker.on('click', () => openDetail(place));
    marker.addTo(layer);
    markers.set(place.id, marker);
  }

  const toilets = shown.filter((p) => p.isToilet).length;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  el.count.textContent = shown.length
    ? `${plural(shown.length, 'place')} · ${plural(toilets, 'public toilet')}`
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
  if (place.near) {
    const near = document.createElement('span');
    near.className = 'item__near';
    near.textContent = ` near ${place.near}`;
    name.append(near);
  }

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

  button.addEventListener('click', () => showPlace(place));

  li.append(button);
  return li;
}

/* ---------- status ---------- */

function showStatus(message, ms = 5000) {
  el.status.textContent = message;
  el.status.hidden = false;
  clearTimeout(statusTimer);
  if (ms) statusTimer = setTimeout(() => { el.status.hidden = true; }, ms);
}

/* ---------- events ---------- */

el.viewMap.addEventListener('click', () => setView('map'));
el.viewList.addEventListener('click', () => setView('list'));

// Rotating the phone, or crossing the breakpoint, changes the map's box.
window.addEventListener('resize', () => map.invalidateSize());

el.detailClose.addEventListener('click', closeDetail);
el.scrim.addEventListener('click', closeDetail);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && openPlaceId) closeDetail();
});

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

el.download.addEventListener('click', () => {
  if (!places.length) return showStatus('Still loading the places — try again in a moment.');
  const rows = ChishikunemSheet.download(places);
  showStatus(`Downloaded ${rows} toilets as chishikunem-toilets.xlsx`);
});

Chishikunem.load((loaded) => { places = loaded; render(); })
  .then((state) => {
    if (state === 'stale') showStatus('Showing saved data — could not reach OpenStreetMap.');
  })
  .catch(() => {
    el.count.textContent = 'Could not load the map data.';
    showStatus('Could not reach OpenStreetMap. Check your connection and reload.', 0);
  });
