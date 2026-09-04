/* Review page — go through every place and record what is actually there. */

const el = {
  cards: document.getElementById('cards'),
  progress: document.getElementById('progress'),
  search: document.getElementById('search'),
  status: document.getElementById('status'),
  exportBtn: document.getElementById('export'),
  copyBtn: document.getElementById('copy'),
  importInput: document.getElementById('import'),
  addBtn: document.getElementById('add'),
  addHint: document.getElementById('addHint'),
  map: document.getElementById('map'),
  layout: document.getElementById('layout'),
  viewList: document.getElementById('viewList'),
  viewMap: document.getElementById('viewMap'),
  find: document.getElementById('find'),
  findGo: document.getElementById('findGo'),
  findResults: document.getElementById('findResults'),
};

const SELECTED_KEY = 'chishikunem:selected:v1';

const map = L.map(el.map, { zoomControl: true }).setView([40.1830, 44.5140], 14);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const layer = L.layerGroup().addTo(map);
const markers = new Map();

/* The place being worked on. Kept in storage so a reload puts you back where
 * you were rather than at the top of a list of a hundred. */
let selectedId = localStorage.getItem(SELECTED_KEY) || null;
let addMode = false;

let places = [];
let statusTimer;
// Cards on screen right now. Answering a question must not yank the card out
// from under you, so these stay put until the filters change again.
let pinned = new Set();

function showStatus(message, ms = 4000) {
  el.status.textContent = message;
  el.status.hidden = false;
  clearTimeout(statusTimer);
  if (ms) statusTimer = setTimeout(() => { el.status.hidden = true; }, ms);
}

function scope() {
  return document.querySelector('input[name="scope"]:checked').value;
}

function matchesSearch(place) {
  const term = el.search.value.trim().toLowerCase();
  return !term || place.name.toLowerCase().includes(term);
}

function matchesScope(place) {
  const only = scope();
  if (only === 'todo') return !place.reviewed;
  if (only === 'done') return place.reviewed;
  return true;
}

function visiblePlaces() {
  return places.filter((place) => matchesSearch(place)
    && (matchesScope(place) || pinned.has(place.id)));
}

/* ---------- one answer row: Yes / No / Not sure ---------- */

function answerRow(place, field, review, onChange) {
  const row = document.createElement('div');
  row.className = 'answer';

  const label = document.createElement('span');
  label.className = 'answer__label';
  label.textContent = field.label;
  row.append(label);

  const group = document.createElement('div');
  group.className = 'answer__buttons';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', `${field.label} at ${place.name}`);

  const current = review[field.key];
  const options = [[true, 'Yes'], [false, 'No'], [null, 'Not sure']];

  for (const [value, text] of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'answer__btn';
    button.textContent = text;
    // `current` is undefined before any answer, so match null explicitly.
    const chosen = value === null ? current == null : current === value;
    if (chosen) button.classList.add('is-on');
    button.setAttribute('aria-pressed', String(chosen));

    button.addEventListener('click', () => onChange(field.key, value));
    group.append(button);
  }

  row.append(group);
  return row;
}

/* ---------- one place ---------- */

function card(place) {
  const li = document.createElement('li');
  const classes = ['card'];
  if (place.reviewed) classes.push('card--done');
  if (place.id === selectedId) classes.push('card--current');
  li.className = classes.join(' ');
  li.dataset.id = place.id;

  /* Touching the card at all makes it the current place — answering a question
   * about somewhere is the clearest possible statement that it is the one you
   * are looking at. Controls keep working; this only rides along. */
  li.addEventListener('click', () => select(place.id, { fly: true }), true);

  const head = document.createElement('div');
  head.className = 'card__head';

  const name = document.createElement('h2');
  name.className = 'card__name';
  name.textContent = place.name;
  head.append(name);

  if (place.reviewed) {
    const badge = document.createElement('span');
    badge.className = 'card__badge';
    badge.textContent = 'Reviewed';
    head.append(badge);
  }
  li.append(head);

  const meta = document.createElement('p');
  meta.className = 'card__meta';
  const bits = [
    place.isToilet ? 'Public toilet' : place.cuisine,
    place.address || `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`,
    place.hours,
  ].filter(Boolean);
  meta.textContent = bits.join(' · ');
  li.append(meta);

  if (!place.address && !Chishikunem.isAdded(place.id)) {
    const warn = document.createElement('p');
    warn.className = 'card__warn';
    warn.textContent = 'No street address in OpenStreetMap — use Street View to find it.';
    li.append(warn);
  }

  const links = document.createElement('div');
  links.className = 'card__links';
  const linkList = [
    ['Street View', Chishikunem.streetViewUrl(place)],
    ['Google Maps', Chishikunem.mapsUrl(place)],
  ];
  // A place you dropped yourself has no OpenStreetMap page to open.
  if (!Chishikunem.isAdded(place.id)) linkList.push(['OpenStreetMap', Chishikunem.osmUrl(place)]);
  for (const [text, href] of linkList) {
    const a = document.createElement('a');
    a.className = 'btn btn--link';
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = text;
    links.append(a);
  }
  li.append(links);

  /* You typed this name, so you can fix it. Saved as you type, like the note
   * field, because a half-typed name that vanishes on reload is worse than no
   * name at all. */
  if (Chishikunem.isAdded(place.id)) {
    const rename = document.createElement('input');
    rename.className = 'card__rename';
    rename.type = 'text';
    rename.value = place.name;
    rename.placeholder = 'What is this place called?';
    rename.setAttribute('aria-label', 'Name of this place');
    let renameTimer;
    rename.addEventListener('input', () => {
      clearTimeout(renameTimer);
      renameTimer = setTimeout(() => {
        Chishikunem.updateAdded(place.id, { name: rename.value.trim() || 'New place' });
        place.name = rename.value.trim() || 'New place';
        const marker = markers.get(place.id);
        if (marker) marker.setTooltipContent(place.name);
        name.textContent = place.name;
      }, 400);
    });
    li.append(rename);
  }

  const form = document.createElement('div');
  form.className = 'card__form';
  li.append(form);

  const renderForm = () => {
    const review = Chishikunem.readReviews()[place.id] || {};
    form.replaceChildren();

    /* Removed from the map. The card stays here rather than vanishing, so a
     * mistaken tap can be undone — and so the questions are not sitting there
     * inviting answers about a place that is no longer listed. */
    if (place.deleted) {
      const gone = document.createElement('p');
      gone.className = 'card__gone';
      gone.textContent = 'Removed from the map.';

      const undo = document.createElement('button');
      undo.type = 'button';
      undo.className = 'btn btn--quiet';
      undo.textContent = 'Put it back';
      undo.addEventListener('click', () => {
        Chishikunem.saveReview(place.id, { deleted: false });
        refresh();
      });

      form.append(gone, undo);
      return;
    }

    const onChange = (key, value) => {
      const saved = Chishikunem.saveReview(place.id, { [key]: value });
      // Answering "no toilet" makes the rest of the questions moot.
      if (key === 'hasToilet' && value === false) {
        for (const f of Chishikunem.FIELDS.slice(1)) {
          if (saved[f.key] !== undefined) Chishikunem.saveReview(place.id, { [f.key]: null });
        }
      }
      refresh();
    };

    const [first, ...rest] = Chishikunem.FIELDS;
    form.append(answerRow(place, first, review, onChange));

    /* Only ask the detail questions once there is a toilet to describe.
     * `place.hasToilet` is the merged answer, so a dedicated public toilet
     * qualifies straight away — it does not need you to confirm that a toilet
     * is a toilet before you can say whether it is free. Answering "No" or
     * "Not sure" pulls it back to false/null and folds these away again. */
    if (place.hasToilet === true) {
      for (const field of rest) {
        form.append(answerRow(place, field, review, onChange));
      }

      const note = document.createElement('textarea');
      note.className = 'card__note';
      note.rows = 2;
      note.placeholder = 'Note (floor, code, who to ask…)';
      note.value = review.note || '';
      note.setAttribute('aria-label', `Note about ${place.name}`);
      let noteTimer;
      note.addEventListener('input', () => {
        clearTimeout(noteTimer);
        noteTimer = setTimeout(() => {
          Chishikunem.saveReview(place.id, { note: note.value });
          showStatus('Note saved.', 1500);
        }, 400);
      });
      form.append(note);
    }

    const buttons = document.createElement('div');
    buttons.className = 'card__buttons';

    // Only offer this when there is something of yours to clear — a place can
    // also be marked reviewed by a published confirmation you cannot undo.
    if (Object.keys(review).length) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'btn btn--quiet';
      clear.textContent = 'Clear my answers';
      clear.addEventListener('click', () => {
        Chishikunem.clearReview(place.id);
        refresh();
      });
      buttons.append(clear);
    }

    /* For a place that should not be on the map at all — shut down, mapped
     * twice, or never a place you could use a toilet in. Answering the
     * questions cannot say that: "no toilet" is a fact about a real place. */
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn--danger';
    remove.textContent = Chishikunem.isAdded(place.id) ? 'Delete this place' : 'Remove from the map';
    remove.addEventListener('click', () => {
      // One you added yourself is yours to delete outright — there is no
      // OpenStreetMap entry underneath that would come back next load.
      if (Chishikunem.isAdded(place.id)) {
        Chishikunem.removeAdded(place.id);
        Chishikunem.clearReview(place.id);
        places = places.filter((p) => p.id !== place.id);
        if (selectedId === place.id) select(null);
        showStatus(`${place.name} deleted.`);
        render();
        return;
      }
      Chishikunem.saveReview(place.id, { deleted: true });
      showStatus(`${place.name} removed. Open it again to put it back.`);
      refresh();
    });
    buttons.append(remove);

    form.append(buttons);
  };

  renderForm();
  return li;
}

/* ---------- map ---------- */

function pinIcon(place, current) {
  const size = current ? 34 : place.isToilet ? 28 : 24;
  const classes = ['pin'];
  if (place.isToilet) classes.push('pin--public');
  classes.push(place.reviewed ? 'pin--reviewed' : 'pin--todo');
  if (current) classes.push('pin--current');
  const colour = place.free === true ? 'var(--free)' : 'var(--unknown)';

  return L.divIcon({
    className: 'pin-wrap',
    html: `<span class="${classes.join(' ')}" style="color:${colour};width:${size}px;height:${size}px">`
      + `<svg width="${Math.round(size * 0.62)}" height="${Math.round(size * 0.62)}" `
      + 'viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
      + '<use href="#toilet"></use></svg></span>',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function drawMap(shown) {
  layer.clearLayers();
  markers.clear();
  for (const place of shown) {
    const marker = L.marker([place.lat, place.lon], {
      icon: pinIcon(place, place.id === selectedId),
      // The one being worked on sits above its neighbours.
      zIndexOffset: place.id === selectedId ? 1000 : 0,
    });
    marker.bindTooltip(place.name, { direction: 'top', offset: [0, -8] });
    marker.on('click', () => select(place.id, { fly: true, scroll: true }));
    marker.addTo(layer);
    markers.set(place.id, marker);
  }
}

/* Move to a place and make it obvious which one it is: the pin grows and the
 * card gets a ring. Selecting is deliberately cheap — no reload, no re-sort. */
function select(id, { fly = false, scroll = false } = {}) {
  const previous = selectedId;
  selectedId = id;
  try {
    if (id) localStorage.setItem(SELECTED_KEY, id);
    else localStorage.removeItem(SELECTED_KEY);
  } catch {
    // Storage blocked — selection just will not survive a reload.
  }

  for (const other of [previous, id]) {
    if (!other) continue;
    const place = places.find((p) => p.id === other);
    const marker = markers.get(other);
    if (place && marker) {
      marker.setIcon(pinIcon(place, other === id));
      marker.setZIndexOffset(other === id ? 1000 : 0);
    }
    const li = el.cards.querySelector(`[data-id="${CSS.escape(other)}"]`);
    if (li) li.classList.toggle('card--current', other === id);
  }

  const place = places.find((p) => p.id === id);
  /* On a phone the map is hidden behind the List/Map switch, so its container
   * is 0x0 and Leaflet cannot work out where to fly — it ends up computing
   * NaN. Remember the intent and carry it out when the map is on screen. */
  if (place && fly) {
    if (mapIsVisible()) flyToPlace(place);
    else pendingFly = id;
  }
  if (place && scroll) {
    const li = el.cards.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (li) li.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

const mapIsVisible = () => el.map.offsetParent !== null && map.getSize().x > 0;

function flyToPlace(place) {
  map.flyTo([place.lat, place.lon], Math.max(map.getZoom(), 17), { duration: 0.6 });
}

// Set when you pick a place while the map is off screen.
let pendingFly = null;

/* ---------- adding a place ---------- */

function setAddMode(on) {
  addMode = on;
  el.addBtn.setAttribute('aria-pressed', String(on));
  el.addBtn.textContent = on ? 'Cancel' : 'Add a place';
  el.addHint.hidden = !on;
  el.map.classList.toggle('is-adding', on);
  // The map is the thing to tap now, so on a phone show it.
  if (on) showView('map');
}

map.on('click', (event) => {
  if (!addMode) return;
  const { lat, lng } = event.latlng;
  const id = Chishikunem.addPlace({ name: 'New place', lat, lon: lng });
  setAddMode(false);

  const element = { type: 'added', id: id.slice('added/'.length), lat, lon: lng, tags: { name: 'New place' } };
  const place = Chishikunem.normalise(element);
  Chishikunem.applyReviews([place]);
  places.push(place);

  selectedId = id;
  render();
  select(id, { fly: true, scroll: true });
  showView('list');
  // Straight into the name box: naming it is the first thing you want to do,
  // and hunting for the field was the main complaint about adding.
  const field = el.cards.querySelector(`[data-id="${CSS.escape(id)}"] .card__rename`);
  if (field) { field.focus(); field.select(); }
  showStatus('Added. Type its name, then answer the questions.');
});

/* ---------- finding a spot on the map ---------- */

/* Dropping a pin is only useful if you can get the map to the right street
 * first, and scrolling there by hand across a city is hopeless. This asks
 * Nominatim — the same search behind openstreetmap.org — biased to Yerevan,
 * and moves the map to whatever you pick. */

let findTimer;

async function runFind() {
  const term = el.find.value.trim();
  if (term.length < 3) {
    el.findResults.hidden = true;
    return;
  }
  el.findGo.textContent = '…';
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6'
      + '&accept-language=en&countrycodes=am'
      // Yerevan and a wide margin, so a street name does not match another city.
      + '&viewbox=44.34,40.26,44.64,40.05&bounded=1'
      + `&q=${encodeURIComponent(term)}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    showResults(await response.json());
  } catch {
    el.findResults.hidden = true;
    showStatus('Could not reach the search. Try again in a moment.');
  } finally {
    el.findGo.textContent = 'Find';
  }
}

function showResults(list) {
  el.findResults.replaceChildren();
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'findresults__empty';
    li.textContent = `Nothing found for “${el.find.value.trim()}”.`;
    el.findResults.append(li);
    el.findResults.hidden = false;
    return;
  }

  for (const hit of list) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'findresults__hit';
    button.textContent = hit.display_name;
    button.addEventListener('click', () => {
      el.findResults.hidden = true;
      el.find.value = hit.display_name.split(',')[0];
      showView('map');
      // The map may have been hidden until a moment ago, so let it measure
      // itself before being told where to go.
      setTimeout(() => {
        map.invalidateSize();
        map.setView([Number(hit.lat), Number(hit.lon)], 18);
        if (!addMode) setAddMode(true);
        showStatus('Now tap the map where the toilet is.');
      }, 80);
    });
    li.append(button);
    el.findResults.append(li);
  }
  el.findResults.hidden = false;
}

/* ---------- list / map on a phone ---------- */

function showView(which) {
  el.layout.classList.toggle('is-list', which === 'list');
  el.layout.classList.toggle('is-map', which === 'map');
  el.viewList.classList.toggle('is-on', which === 'list');
  el.viewMap.classList.toggle('is-on', which === 'map');
  el.viewList.setAttribute('aria-pressed', String(which === 'list'));
  el.viewMap.setAttribute('aria-pressed', String(which === 'map'));
  // Leaflet needs telling when its container changes size — and once it can
  // measure itself, any move we could not make earlier happens now.
  if (which === 'map') {
    setTimeout(() => {
      map.invalidateSize();
      const place = places.find((p) => p.id === (pendingFly || selectedId));
      if (place && pendingFly) flyToPlace(place);
      pendingFly = null;
    }, 60);
  }
}

/* ---------- render ---------- */

function refresh(repin = false) {
  // Re-apply saved answers so `reviewed` and the merged facts stay current.
  for (const place of places) place.reviewed = false;
  Chishikunem.applyReviews(places);
  render(repin);
}

function render(repin = true) {
  // Changing a filter rebuilds the set; answering a question does not.
  if (repin) {
    pinned = new Set(places.filter((p) => matchesScope(p) && matchesSearch(p)).map((p) => p.id));
  }

  const shown = visiblePlaces();
  const done = places.filter((p) => p.reviewed).length;

  el.progress.textContent = places.length
    ? `${done} of ${places.length} reviewed · showing ${shown.length}`
    : 'No places loaded.';

  /* Answering a question rebuilds every card, which throws the list back to the
   * top. You are almost always part-way down and part-way through a place, so
   * put the scroll back where you left it. */
  const scroll = el.cards.scrollTop;

  el.cards.replaceChildren(...shown
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(card));

  el.cards.scrollTop = scroll;

  drawMap(shown);

  if (!shown.length && places.length) {
    const empty = document.createElement('p');
    empty.className = 'panel__note';
    empty.textContent = scope() === 'todo'
      ? 'Everything here is reviewed. Nice work.'
      : 'Nothing matches.';
    el.cards.replaceChildren(empty);
  }
}

/* ---------- export / import ---------- */

/* Everything you have recorded, as one blob of text.
 *
 * Nothing here reaches the outside world on its own: there is no server behind
 * this site, so an answer stays in this browser until it is carried out by
 * hand. Copying beats downloading when you are on a phone and the next step is
 * pasting it into a chat. */
function collected() {
  const reviews = Chishikunem.readReviews();
  const added = Chishikunem.readAdded();
  return { count: Object.keys(reviews).length + Object.keys(added).length, payload: { reviews, added } };
}

el.copyBtn.addEventListener('click', async () => {
  const { count, payload } = collected();
  if (!count) {
    showStatus('Nothing to copy yet — answer something first.');
    return;
  }
  const text = JSON.stringify(payload);

  try {
    await navigator.clipboard.writeText(text);
    showStatus(`Copied ${count} places. Paste it into the chat.`);
    return;
  } catch {
    // Clipboard refused — older browser, or the page is not on a secure origin.
  }

  // Fall back to something you can select by hand rather than failing silently.
  const box = document.createElement('textarea');
  box.className = 'copybox';
  box.readOnly = true;
  box.value = text;
  box.setAttribute('aria-label', 'Your answers, ready to copy');
  el.cards.prepend(box);
  box.focus();
  box.select();
  showStatus('Could not reach the clipboard — select this text and copy it.', 0);
});

el.exportBtn.addEventListener('click', () => {
  const reviews = Chishikunem.readReviews();
  const added = Chishikunem.readAdded();
  const count = Object.keys(reviews).length + Object.keys(added).length;
  if (!count) {
    showStatus('Nothing to export yet.');
    return;
  }

  // Both halves in one file: the answers, and the places that only exist
  // because you dropped them on the map.
  const blob = new Blob([JSON.stringify({ reviews, added }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chishikunem-reviews.json';
  a.click();
  URL.revokeObjectURL(url);
  showStatus(`Exported ${count} places.`);
});

el.importInput.addEventListener('change', async () => {
  const file = el.importInput.files?.[0];
  if (!file) return;

  try {
    const incoming = JSON.parse(await file.text());
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      throw new Error('not a review file');
    }
    // Older exports were a bare map of answers; newer ones have both halves.
    const reviews = incoming.reviews && typeof incoming.reviews === 'object'
      ? incoming.reviews : incoming;
    const added = incoming.added && typeof incoming.added === 'object' ? incoming.added : {};
    Chishikunem.writeReviews({ ...Chishikunem.readReviews(), ...reviews });
    Chishikunem.writeAdded({ ...Chishikunem.readAdded(), ...added });
    loadDistrict();
    showStatus(`Imported ${Object.keys(reviews).length + Object.keys(added).length} places.`);
  } catch {
    showStatus('That file could not be read as reviews.');
  }
  el.importInput.value = '';
});

/* ---------- events ---------- */

document.querySelectorAll('input[name="scope"]')
  .forEach((input) => input.addEventListener('change', render));

el.addBtn.addEventListener('click', () => setAddMode(!addMode));

el.findGo.addEventListener('click', runFind);
el.find.addEventListener('input', () => {
  clearTimeout(findTimer);
  if (!el.find.value.trim()) { el.findResults.hidden = true; return; }
  findTimer = setTimeout(runFind, 500);
});
el.find.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); clearTimeout(findTimer); runFind(); }
});
el.viewList.addEventListener('click', () => showView('list'));
el.viewMap.addEventListener('click', () => showView('map'));

// Escape backs out of adding, which is the only mode this page has.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && addMode) setAddMode(false);
});

let searchTimer;
el.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(render, 150);
});

/* What is worth walking to and answering for.
 *
 * No address means it cannot be found again in Street View, so there is
 * nothing useful to check.
 *
 * A toilet you have to pay for is somebody else's list — this map is only for
 * free ones, so a paid toilet can never reach it however it is answered, and
 * checking one is wasted effort. They are dropped here rather than left in the
 * queue to be worked through for nothing.
 *
 * The cost of that: `fee=yes` is OpenStreetMap's word, and the queue was the
 * one place a wrong fee tag could be put right. If one of these is actually
 * free, give it `free: true` in confirmed.js — those are applied before this
 * filter runs, so it comes straight back into the queue and onto the map. */
const reviewable = (loaded) => loaded.filter((place) =>
  Chishikunem.isAdded(place.id) || (place.address && place.free !== false));

/* ---------- district ---------- */

/* Put you back on the place you were last working on. Only once per load, and
 * only if it is still in the list — a remembered id for something now filtered
 * out should not drag the map somewhere with nothing on it. */
let restored = false;

function restoreSelection() {
  if (restored) return;
  restored = true;
  if (!selectedId) return;
  const place = places.find((p) => p.id === selectedId);
  if (!place) { selectedId = null; return; }
  select(selectedId, { fly: true, scroll: true });
}

function loadDistrict() {
  places = [];
  el.progress.textContent = 'Loading…';

  Chishikunem.load((loaded) => { places = reviewable(loaded); render(); restoreSelection(); })
    .then((state) => {
      // You switched away mid-request; a newer load owns the screen now.
      if (state === 'abandoned') return;
      if (state === 'stale') showStatus('Showing saved data — could not reach OpenStreetMap.');
    })
    .catch(() => {
      el.progress.textContent = 'Could not load the places.';
      showStatus('Could not reach OpenStreetMap. Check your connection and reload.', 0);
    });
}

loadDistrict();
