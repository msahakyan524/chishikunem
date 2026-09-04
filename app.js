/* Chishikunem — map of toilets in Yerevan, one district at a time.
 *
 * Places come from OpenStreetMap via data.js; anything confirmed on the review
 * page overrides what OSM says.
 */

const el = {
  map: document.getElementById('map'),
  list: document.getElementById('list'),
  count: document.getElementById('count'),
  showUnchecked: document.getElementById('showUnchecked'),
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
let loading = true;

// Where you are, [lat, lon], once you share it — and how far we list from it.
const RADIUS_M = 1000;
let here = null;
let watchId = null;
let hereMarker = null;
let hereCircle = null;

/* ---------- map ---------- */

const map = L.map(el.map, { zoomControl: true })
  .setView([40.1830, 44.5140], 15);

/* Street names in Latin letters.
 *
 * OpenStreetMap's own tiles label Yerevan in Armenian only, which is no use
 * to somebody who cannot read it — and this map is largely for visitors.
 * Esri's street map prints both, "Մաշտոցի պողոտա Mashtots poghota", and
 * needs no key. It is not a translation: names are transliterated, so a
 * street is spelled as it sounds rather than turned into English words.
 *
 * Swapping back is this one URL. The places themselves are named in the list
 * either way — that text comes from our own data, not from the tiles. */
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19,
  attribution: 'Tiles &copy; Esri · places from &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const layer = L.layerGroup().addTo(map);

/* ---------- filtering ---------- */

function activeFilters() {
  // Only the fact chips. "Show unchecked" widens the list rather than
  // narrowing it, so it is deliberately not one of these.
  return [...document.querySelectorAll('.chip input[data-filter]:checked')]
    .map((input) => input.dataset.filter);
}

const showUnchecked = () => el.showUnchecked.checked;

function matches(place, key) {
  return place[key] === true;
}

/* A bakery or a coffee shop is a counter, not somewhere you use a toilet, so
 * whole categories are ruled out the way takeaway kiosks already are.
 *
 * `amenity=cafe` is deliberately NOT in here. OpenStreetMap hangs that tag on
 * plenty of places that are nothing like a coffee shop — a doughnut hall, two
 * Tashir Pizza branches and a SAS food court among the ones added by hand — so
 * using it would quietly delete places that were asked for by name. */
const SKIP_KINDS = new Set(['bakery', 'pastry', 'coffee', 'deli']);
const SKIP_CUISINE = /coffee|cake|bakery|pastry/i;

/* What the map is for: places somebody has been to and answered for, that are
 * actually worth walking to. Anything still waiting to be checked is kept back
 * until "Show unchecked" asks for it. */
function meetsBaseline(place) {
  // Removed by hand on the review page.
  if (place.deleted) return false;
  // Nobody has stood in front of it yet.
  if (!place.reviewed && !showUnchecked()) return false;
  // A confirmed "no" is still a no. Once somebody has looked and found no
  // toilet, the place comes off rather than lingering as a maybe.
  if (place.hasToilet === false) return false;
  /* This map is only for free toilets, so being free is a requirement rather
   * than a filter. A confirmed price is out, and so is a place somebody
   * checked without recording the cost — "nobody wrote it down" is not "free".
   *
   * The exception is a place nobody has checked at all: those only appear
   * under "Show unchecked", already labelled as unverified, and holding them
   * to a standard nobody has applied to them yet would empty that view. */
  if (place.free === false) return false;
  if (place.reviewed && place.free !== true) return false;
  // Bakeries and coffee shops are not what this map is for.
  if (SKIP_KINDS.has(place.kind) || (place.cuisine && SKIP_CUISINE.test(place.cuisine))) return false;
  /* Having to ask is not a reason to hide a place. It usually just means
   * somewhere more presentable than a fast-food counter, and holding it
   * against them took twenty checked, free toilets off the map — most of the
   * work done so far. They show, tagged "Ask first", and you decide.
   *
   * (This is the rule that once read: drop it unless the toilet is step-free.
   * Putting that back is one line, if it turns out to be wanted after all.) */
  return true;
}

/* Metres between two points. A district is small enough that treating a degree
 * of longitude as constant is accurate to well under a metre here. */
function metresBetween(a, b) {
  const dy = (a[0] - b[0]) * 111320;
  const dx = (a[1] - b[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

function distanceOf(place) {
  return here ? metresBetween(here, [place.lat, place.lon]) : null;
}

function visiblePlaces() {
  const filters = activeFilters();
  const term = el.search.value.trim().toLowerCase();

  return places.filter((place) => {
    if (!meetsBaseline(place)) return false;
    if (term && !place.name.toLowerCase().includes(term)) return false;
    // Once we know where you are, only what you could actually walk to.
    if (here && metresBetween(here, [place.lat, place.lon]) > RADIUS_M) return false;
    // A checked chip means "confirmed yes" — unknowns are excluded on purpose,
    // so nobody travels somewhere on a guess.
    return filters.every((key) => matches(place, key));
  });
}

/* ---------- rendering ---------- */

/* A pin is the same glossy bead as the icons on the buttons, with the toilet
 * glyph in the middle.
 *
 * The two shades answer the question you actually have when looking at a map
 * of toilets: is this a proper public toilet, or a shop that will let you use
 * theirs? Dark bead means public. Pale bead means somewhere with a door and
 * staff. Nothing here is tinted by price any more — everything on this map is
 * free, so a colour for it would say nothing. */
function pinIcon(place) {
  const size = place.isToilet ? 34 : 27;
  const classes = ['pin'];
  if (place.isToilet) classes.push('pin--public');
  classes.push(place.reviewed ? 'pin--reviewed' : 'pin--todo');

  const bead = place.isToilet ? 'aq-slate' : 'aq-pearl';
  const glyph = place.isToilet ? '#ffffff' : '#39414d';

  return L.divIcon({
    className: 'pin-wrap',
    /* Sized in attributes as well as CSS, so a stale stylesheet can never blow
     * the glyph up to the SVG default of 300x150. The <use> carries its own
     * width and height for the same reason: without them the symbol scales to
     * the whole viewport instead of sitting inside the bead. */
    html: `<span class="${classes.join(' ')}" style="width:${size}px;height:${size}px">`
      + `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">`
      + `<circle cx="16" cy="16" r="14.4" fill="url(#${bead})"/>`
      + '<ellipse cx="16" cy="10.4" rx="10.4" ry="6.4" fill="url(#aq-gloss)"/>'
      + `<g fill="${glyph}"><use href="#toilet" x="8" y="8.8" width="16" height="16"></use></g>`
      + '<circle cx="16" cy="16" r="14.4" fill="none" stroke="#000" stroke-opacity=".42" stroke-width="1.3"/>'
      + '</svg></span>',
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
  // Said first and plainly, because everything below it is unconfirmed too:
  // OpenStreetMap's tags, not somebody standing in the doorway.
  if (!place.reviewed) facts.push(['Not checked yet', 'todo']);
  // No "Free" tag: every checked place here is free, so the label would sit on
  // every row saying nothing. The page says it once, at the top.
  if (place.hasToilet === true && !place.isToilet) facts.push(['Toilet confirmed', '']);
  if (place.wheelchair === true) facts.push(['Wheelchair', '']);
  else if (place.wheelchairLimited) facts.push(['Wheelchair: limited', '']);
  if (place.baby === true) facts.push(['Baby table', '']);
  if (place.unisex === true) facts.push(['Gender-neutral', '']);
  if (place.noAsk === true) facts.push(['Walk-in confirmed', 'free']);
  // The other half of that answer, and the one you want before walking in:
  // there is a toilet, but it is not simply open to the street.
  else if (place.noAsk === false) facts.push(['Ask first', 'ask']);
  return facts;
}

/* ---------- detail panel ---------- */

let openPlaceId = null;

/* Whether the editing section is folded open. Kept out here because every
 * answer rebuilds the panel, and an editor that snapped shut after each tap
 * would make you reopen it for every one of the six questions. */
let editorOpen = false;

/* One of the glossy beads from the sprite in the page. SVG lives in its own
 * namespace, so these cannot be built with createElement like everything
 * else here. */
function icon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'ico');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', `#${name}`);
  svg.append(use);
  return svg;
}

function section(title) {
  const h = document.createElement('h3');
  h.className = 'detail__h';
  h.textContent = title;
  return h;
}

function shotImg(src, alt) {
  const img = document.createElement('img');
  img.className = 'shots__img';
  img.src = src;
  img.alt = alt;
  img.loading = 'lazy';
  // A dead path should not leave a broken-image icon sitting in the panel.
  img.addEventListener('error', () => img.closest('figure, .shots')?.remove?.() ?? img.remove());
  return img;
}

function photoBlock(place) {
  const wrap = document.createElement('div');
  wrap.className = 'shots';
  const own = Chishikunem.photosFor(place);

  // A photo somebody added by hand is of the toilet itself. Nothing beats it.
  if (own.length) {
    own.forEach((src, i) => wrap.append(shotImg(src, `${place.name} — photo ${i + 1}`)));
    return wrap;
  }

  /* Otherwise fetch a street-level photo of this exact spot. It arrives after
   * the panel is already on screen, so the panel starts by saying it is
   * looking and swaps in whatever comes back. */
  const hint = document.createElement('p');
  hint.className = 'shots__hint';
  hint.textContent = 'Looking for a photo of this spot…';
  wrap.classList.add('shots--empty');
  wrap.append(hint);

  Chishikunem.streetPhotos(place).then((shots) => {
    // The panel may have been closed or moved on while the fetch was in flight.
    if (!wrap.isConnected) return;
    if (!shots.length) {
      hint.textContent = 'No photo of this street yet. The links below open Google and Yandex.';
      return;
    }
    wrap.classList.remove('shots--empty');
    hint.remove();
    for (const shot of shots) {
      const fig = document.createElement('figure');
      fig.className = 'shots__fig';
      fig.append(shotImg(shot.src, `The street outside ${place.name}`));
      const cap = document.createElement('figcaption');
      cap.className = 'shots__cap';
      /* Said plainly: this is the street, not the loo, and it may be a few
       * years old. Somebody expecting a photo of the cubicle should not have
       * to work that out for themselves. */
      const where = shot.metres <= 15 ? 'Outside the door' : `The street ${shot.metres} m away`;
      cap.textContent = [where, shot.year, 'photo by KartaView'].filter(Boolean).join(' · ');
      fig.append(cap);
      wrap.append(fig);
    }
  });

  return wrap;
}

function linkRow(place) {
  const row = document.createElement('div');
  row.className = 'detail__links';

  // [label, href, filled, full width]
  for (const [text, href, strong, wide] of [
    ['Photos on Google', Chishikunem.mapsUrl(place), true, false],
    ['Photos on Yandex', Chishikunem.yandexUrl(place), true, false],
    ['Street View', Chishikunem.streetViewUrl(place), false, false],
    ['OpenStreetMap', Chishikunem.osmUrl(place), false, false],
    ['Suggest a correction', Chishikunem.correctionUrl(place), false, true],
  ]) {
    const a = document.createElement('a');
    a.className = strong ? 'btn btn--link btn--go' : 'btn btn--link';
    if (wide) a.classList.add('btn--wide');
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

/* ---------- editing, right here on the map ---------- */

/* The review page is the proper tool for working through a list. This is for
 * the other case: you are looking at a place on the map and one fact is wrong.
 *
 * Answers are saved in this browser, exactly like the review page, and travel
 * in the same export — so an edit made here is not lost and is not published
 * until it is carried across by hand. */

function answerRow(place, field, review, onChange) {
  const row = document.createElement('div');
  row.className = 'answer';

  const label = document.createElement('span');
  label.className = 'answer__label';
  label.textContent = field.label;

  const group = document.createElement('div');
  group.className = 'answer__buttons';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', `${field.label} at ${place.name}`);

  const current = review[field.key];
  for (const [value, text] of [[true, 'Yes'], [false, 'No'], [null, 'Not sure']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'answer__btn';
    button.textContent = text;
    // `current` is undefined before any answer, so match null explicitly.
    const chosen = value === null ? current == null : current === value;
    if (chosen) button.classList.add('is-on');
    button.setAttribute('aria-pressed', String(chosen));
    // Tagged so focus can be put back on this exact button after the rebuild.
    button.dataset.field = field.key;
    button.dataset.value = String(value);
    button.addEventListener('click', () => onChange(field.key, value));
    group.append(button);
  }

  row.append(label, group);
  return row;
}

/* An edit changes the pin, the list row and the panel at once.
 *
 * The panel stays open regardless of what the answer did to the map. Saying
 * "no toilet" or "paid" takes the pin off, but you are usually part-way
 * through a place and have more to record — closing the window on you, and
 * losing the way back, is the wrong end of that trade. You decide when you are
 * finished with a place. */
function redrawAfterEdit(id) {
  for (const p of places) p.reviewed = false;
  Chishikunem.applyReviews(places);
  render();
  const still = places.find((p) => p.id === id);
  if (still) openDetail(still, { restore: true });
  else closeDetail();
}

function editBlock(place) {
  const wrap = document.createElement('div');
  wrap.className = 'edit';
  const review = Chishikunem.readReviews()[place.id] || {};

  /* Show the answer the map is actually giving, not just the part of it you
   * typed. A place confirmed in confirmed.js would otherwise sit here reading
   * "Not sure" under a panel that says "Free · Toilet confirmed". */
  const current = {};
  for (const field of Chishikunem.FIELDS) current[field.key] = place[field.key];

  const onChange = (key, value) => {
    const saved = Chishikunem.saveReview(place.id, { [key]: value });
    // Saying "no toilet" makes the rest of the questions moot.
    if (key === 'hasToilet' && value === false) {
      for (const f of Chishikunem.FIELDS.slice(1)) {
        if (saved[f.key] !== undefined) Chishikunem.saveReview(place.id, { [f.key]: null });
      }
    }
    redrawAfterEdit(place.id);
    // Answering rebuilds the panel, which would otherwise drop focus onto the
    // body and make a keyboard user start tabbing from the top again.
    const again = el.detailBody.querySelector(
      `.answer__btn[data-field="${key}"][data-value="${String(value)}"]`);
    if (again) again.focus();
    showStatus('Saved in this browser. Export from the review page to publish it.');
  };

  for (const field of Chishikunem.FIELDS) {
    if (field.key !== 'hasToilet' && place.hasToilet !== true) continue;
    wrap.append(answerRow(place, field, current, onChange));
  }

  const buttons = document.createElement('div');
  buttons.className = 'card__buttons';

  if (Object.keys(review).length) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'btn btn--quiet';
    clear.textContent = 'Clear my answers';
    clear.addEventListener('click', () => {
      Chishikunem.clearReview(place.id);
      redrawAfterEdit(place.id);
    });
    buttons.append(clear);
  }

  /* For a place that should not be here at all — shut down, mapped twice, or
   * never somewhere you could use a toilet. Answering the questions cannot say
   * that: "no toilet" is a fact about a real place. */
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn btn--danger';
  remove.textContent = Chishikunem.isAdded(place.id) ? 'Delete this place' : 'Remove from the map';
  remove.addEventListener('click', () => {
    if (Chishikunem.isAdded(place.id)) {
      // One you dropped yourself is yours to delete outright — there is no
      // OpenStreetMap entry underneath that would come back next load.
      Chishikunem.removeAdded(place.id);
      Chishikunem.clearReview(place.id);
      places = places.filter((p) => p.id !== place.id);
      closeDetail();
      render();
      showStatus(`${place.name} deleted.`);
      return;
    }
    Chishikunem.saveReview(place.id, { deleted: true });
    redrawAfterEdit(place.id);
    showStatus(`${place.name} removed. Find it again on the review page to put it back.`);
  });
  buttons.append(remove);

  wrap.append(buttons);
  return wrap;
}

function openDetail(place, { restore = false } = {}) {
  // Opening a different place starts folded; coming back to the same one after
  // an edit keeps whatever state it was in.
  if (place.id !== openPlaceId) editorOpen = false;
  const scroll = restore ? el.detailBody.scrollTop : 0;

  openPlaceId = place.id;
  el.detailTitle.textContent = place.name;
  el.detailBody.replaceChildren();

  const name = document.createElement('h2');
  name.className = 'detail__name';
  name.textContent = place.name;
  el.detailBody.append(name);

  /* The address is the thing people want to look at, so it is the thing you
   * can click: it scrolls down to the photo of the place. The photo block is
   * always there — it either holds a picture, or says one is still being
   * looked for, or says there is none — so this always has somewhere to go. */
  const meta = document.createElement('p');
  meta.className = 'detail__meta';
  const before = [place.isToilet ? 'Public toilet' : place.cuisine,
                  place.near && `near ${place.near}`].filter(Boolean);
  if (before.length) meta.append(document.createTextNode(`${before.join(' · ')} · `));

  if (place.address) {
    const look = document.createElement('a');
    look.className = 'detail__address';
    look.append(icon('i-camera'), place.address);
    look.title = 'See a photo of this place';
    look.href = '#';
    look.addEventListener('click', (event) => {
      event.preventDefault();
      const shots = el.detailBody.querySelector('.shots');
      if (shots) shots.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    meta.append(look);
  }
  if (place.hours) meta.append(document.createTextNode(` · ${place.hours}`));
  if (meta.childNodes.length) el.detailBody.append(meta);

  el.detailBody.append(photoBlock(place), linkRow(place));

  el.detailBody.append(section('What is there'), factList(place));

  if (place.note) {
    const note = document.createElement('p');
    note.className = 'detail__note';
    note.textContent = place.note;
    el.detailBody.append(section('Note'), note);
  }

  /* Two different ways to change what this panel says, and only ever one of
   * them on screen.
   *
   * "Fix what this says" edits the map on the spot, so once there is a
   * backend it belongs to whoever is publishing the map. Everyone else gets
   * the suggestion form below, which sends the same answers to the queue
   * instead. With no backend configured nothing has changed: the editor is
   * simply there, as it has always been. */
  const mayEditDirectly = !window.Cloud || !Cloud.enabled || Cloud.isAdmin();

  if (mayEditDirectly) {
    const edit = document.createElement('details');
    edit.className = 'detail__edit';
    edit.open = editorOpen;
    edit.addEventListener('toggle', () => { editorOpen = edit.open; });
    const summary = document.createElement('summary');
    summary.textContent = 'Fix what this says';
    edit.append(summary, editBlock(place));
    el.detailBody.append(edit);
  } else if (window.ChishikunemContribute) {
    const suggest = ChishikunemContribute.block(place);
    if (suggest) el.detailBody.append(suggest);
  }

  /* An admin also gets everything people have said about this place, with the
   * keep/turn-down buttons on each. Deciding here rather than only in the
   * queue means the pin, the photos and the claim are all on screen at once.
   * A decision changes what the map says, so the panel is rebuilt after one. */
  if (window.ChishikunemContribute) {
    const talk = ChishikunemContribute.thread(place, () => refreshCloudFacts(place.id));
    if (talk) el.detailBody.append(talk);

    // The score, then the comments: both public, both readable signed out.
    const score = ChishikunemContribute.scoreBlock(place);
    if (score) el.detailBody.append(score);

    const chat = ChishikunemContribute.commentsBlock(place);
    if (chat) el.detailBody.append(chat);
  }

  const foot = document.createElement('p');
  foot.className = 'detail__muted detail__id';
  foot.textContent = place.reviewed
    ? `Checked in person · ${place.id}`
    : `Not checked in person yet · ${place.id}`;
  el.detailBody.append(foot);

  el.detail.classList.add('is-open');
  el.scrim.classList.add('is-on');
  el.detailBody.scrollTop = scroll;
  // Only grab focus when the panel is newly opened. Doing it after every
  // answer would yank you out of the questions and onto the Close button.
  if (!restore) el.detailClose.focus();
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

/* Why the list is empty, in the visitor's terms — "nothing here at all" is not
 * the same as "your filters are too tight", and the two need different answers. */
function emptyMessage() {
  if (loading) return 'Loading…';
  if (!places.some(meetsBaseline)) {
    // Empty because everything here is still waiting to be checked is a
    // different problem, and it has a button.
    const waiting = !showUnchecked() && places.some((p) => !p.reviewed && !p.deleted
      && p.hasToilet !== false && p.free !== false);
    return waiting
      ? `Nothing checked in ${Chishikunem.district().name} yet — turn on “Show unchecked”.`
      : `No toilets found in ${Chishikunem.district().name}.`;
  }
  if (here) return 'Nothing within 1 km matches.';
  return 'Nothing matches these filters.';
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
  const within = here ? ' · within 1 km' : '';
  el.count.textContent = shown.length
    ? `${plural(shown.length, 'place')} · ${plural(toilets, 'public toilet')}${within}`
    : emptyMessage();

  /* Places you can walk straight into come first, A-Z; the ones where you have
   * to ask follow, also A-Z. Both are worth listing, but if you are looking for
   * a toilet right now the ones with no conversation attached are the ones you
   * want at the top. */
  const askLast = (a, b) =>
    (a.noAsk === false) - (b.noAsk === false) || a.name.localeCompare(b.name);

  el.list.replaceChildren(...shown.slice().sort(askLast).map(listItem));
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
  const away = distanceOf(place);
  kind.textContent = away === null
    ? (place.isToilet ? 'Public toilet' : place.cuisine)
    : (away < 1000 ? `${Math.round(away / 10) * 10} m` : `${(away / 1000).toFixed(1)} km`);

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

/* ---------- live location ---------- */

function drawHere(first) {
  if (!hereMarker) {
    hereMarker = L.circleMarker(here, {
      radius: 8, color: '#1b4ed8', weight: 3, fillColor: '#fff', fillOpacity: 1,
    }).addTo(map).bindPopup('You are here');
    hereCircle = L.circle(here, {
      radius: RADIUS_M, color: '#1b4ed8', weight: 1, opacity: .5, fillOpacity: .05,
    }).addTo(map);
  } else {
    hereMarker.setLatLng(here);
    hereCircle.setLatLng(here);
  }
  if (first) map.flyTo(here, 15, { duration: 0.6 });
}

function stopLocating() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  here = null;
  if (hereMarker) { hereMarker.remove(); hereMarker = null; }
  if (hereCircle) { hereCircle.remove(); hereCircle = null; }
  el.locate.textContent = 'Use my location';
  el.locate.setAttribute('aria-pressed', 'false');
  render();
}

el.locate.addEventListener('click', () => {
  if (watchId !== null) {
    stopLocating();
    showStatus('Showing the whole district again.');
    return;
  }
  if (!navigator.geolocation) {
    showStatus('Your browser cannot share your location.');
    return;
  }
  showStatus('Finding you…');
  // Watching, not a one-off read, so the list follows you as you walk.
  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const first = here === null;
      here = [position.coords.latitude, position.coords.longitude];
      drawHere(first);
      el.locate.textContent = 'Stop';
      el.locate.setAttribute('aria-pressed', 'true');
      el.status.hidden = true;
      render();
      // On a phone the list is behind the Map/List switch, so the 1 km list
      // would otherwise be filtered perfectly and never seen.
      if (first && onePaneAtATime.matches) setView('list');
    },
    /* One message for three quite different problems used to hide the
     * commonest one: the permission was refused at some point and the browser
     * has quietly remembered, so it now fails instantly and for good. That is
     * fixable in two taps, but only if somebody says so. */
    (error) => {
      stopLocating();
      if (error.code === error.PERMISSION_DENIED) {
        showStatus('Location is blocked for this site. Tap the padlock beside the '
          + 'address, allow Location, then press the button again.', 0);
      } else if (error.code === error.TIMEOUT) {
        showStatus('Still looking and getting nowhere. Indoors this can take a '
          + 'while — try again near a window, or outside.', 0);
      } else {
        showStatus('Your device would not say where it is. On a laptop this is '
          + 'often switched off in the system settings.', 0);
      }
    },
    /* Twenty seconds, because a laptop with no GPS falls back to working it
     * out from wi-fi, which is not quick. `maximumAge` lets it answer with a
     * fix from the last minute rather than starting cold every time. */
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
  );
});

el.download.addEventListener('click', () => {
  if (!places.length) return showStatus('Still loading the places — try again in a moment.');
  /* The same places the map is showing, not every place loaded. Handing over
   * the raw list put paid toilets, bakeries and places taken off by hand into
   * the spreadsheet, none of which belong on this map. Search and the fact
   * chips are left out of it: those are a momentary view, not what the map is. */
  const rows = ChishikunemSheet.download(places.filter(meetsBaseline));
  showStatus(`Downloaded ${rows} toilets as chishikunem-${Chishikunem.district().id}.xlsx`);
});

/* ---------- district ---------- */

function fitDistrict() {
  const [south, west, north, east] = Chishikunem.district().bbox;
  map.fitBounds([[south, west], [north, east]]);
}

/* The district box is far wider than the part of it anyone has mapped, so
 * opening on the box buries every pin in one clump in the middle. Fit to the
 * places themselves instead — once, on the first load, so it never yanks the
 * view back while you are panning around. */
let fitted = false;

function fitPlaces() {
  if (fitted) return;
  const shown = places.filter(meetsBaseline);
  if (!shown.length) return;
  fitted = true;
  map.fitBounds(shown.map((p) => [p.lat, p.lon]), { padding: [32, 32] });
}

function loadDistrict() {
  loading = true;
  places = [];
  closeDetail();
  render();

  Chishikunem.load((loaded) => {
    loading = false;
    places = loaded;
    render();
    fitPlaces();
  })
    .then((state) => {
      // You switched away mid-request; a newer load owns the screen now.
      if (state === 'abandoned') return;
      loading = false;
      render();
      if (state === 'stale') showStatus('Showing saved data — could not reach OpenStreetMap.');
    })
    .catch(() => {
      loading = false;
      el.count.textContent = 'Could not load the map data.';
      showStatus('Could not reach OpenStreetMap. Check your connection and reload.', 0);
    });
}

fitDistrict();
loadDistrict();

/* ---------- accounts and approved answers ---------- */

/* Re-read what has been approved and lay it back over the map.
 *
 * Called once on load, and again after a decision taken from the detail
 * panel — keeping something has to change what the panel says about the
 * place, or the answer would sit there looking unpublished until a reload. */
function refreshCloudFacts(reopenId) {
  if (!window.Cloud || !Cloud.enabled) return;
  Cloud.publicFacts().then((facts) => {
    Chishikunem.setCloudFacts(facts);
    for (const p of places) p.reviewed = false;
    Chishikunem.applyReviews(places);
    render();
    const id = reopenId || openPlaceId;
    if (!id) return;
    const again = places.find((p) => p.id === id);
    if (again) openDetail(again, { restore: true });
    // Approving "no toilet" or "paid" takes a place off this map entirely,
    // so the panel it was showing has to close rather than sit there empty.
    else closeDetail();
  });
}

/* All optional. With no backend configured `Cloud.enabled` is false, none of
 * this runs, and the map is the same static page it was. */
if (window.Cloud && Cloud.enabled) {
  ChishikunemAccount.start();

  /* Approved answers are fetched alongside the OpenStreetMap load rather than
   * before it: the map should draw at its usual speed and take the corrections
   * when they land, not sit blank waiting for them. */
  refreshCloudFacts();

  /* Signing in or out changes what the open panel should offer — the
   * suggestion form, or the owner's own editor. Redraw the one on screen, and
   * take the private review tool out of the top bar for everyone else. */
  const reviewLink = document.getElementById('reviewLink');
  const scopeChip = document.getElementById('scopeChip');

  /* "Show unchecked" brings in places nobody has verified, which is a working
   * view rather than something to hand a visitor: they would be reading
   * guesses off a map whose whole point is that somebody went and looked. */
  function gateOwnerTools() {
    const mine = Cloud.isAdmin();
    if (reviewLink) reviewLink.hidden = !mine;
    if (!scopeChip) return;
    scopeChip.hidden = !mine;
    // Left ticked and then hidden, it would go on widening the map for
    // somebody who can no longer see why.
    if (!mine && el.showUnchecked.checked) {
      el.showUnchecked.checked = false;
      render();
    }
  }

  Cloud.onChange(() => {
    gateOwnerTools();
    if (!openPlaceId) return;
    const again = places.find((p) => p.id === openPlaceId);
    if (again) openDetail(again, { restore: true });
  });

  // Hidden until the admin check answers, rather than shown and snatched away.
  if (reviewLink) reviewLink.hidden = true;
  if (scopeChip) scopeChip.hidden = true;
}
