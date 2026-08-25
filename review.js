/* Review page — go through every place and record what is actually there. */

const el = {
  cards: document.getElementById('cards'),
  progress: document.getElementById('progress'),
  search: document.getElementById('search'),
  status: document.getElementById('status'),
  exportBtn: document.getElementById('export'),
  importInput: document.getElementById('import'),
};

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
  li.className = place.reviewed ? 'card card--done' : 'card';

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

  if (!place.address) {
    const warn = document.createElement('p');
    warn.className = 'card__warn';
    warn.textContent = 'No street address in OpenStreetMap — use Street View to find it.';
    li.append(warn);
  }

  const links = document.createElement('div');
  links.className = 'card__links';
  for (const [text, href] of [
    ['Street View', Chishikunem.streetViewUrl(place)],
    ['Google Maps', Chishikunem.mapsUrl(place)],
    ['OpenStreetMap', Chishikunem.osmUrl(place)],
  ]) {
    const a = document.createElement('a');
    a.className = 'btn btn--link';
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = text;
    links.append(a);
  }
  li.append(links);

  const form = document.createElement('div');
  form.className = 'card__form';
  li.append(form);

  const renderForm = () => {
    const review = Chishikunem.readReviews()[place.id] || {};
    form.replaceChildren();

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

    // Only ask the detail questions once a toilet is confirmed.
    if (review.hasToilet === true) {
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

    if (place.reviewed) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'btn btn--quiet';
      clear.textContent = 'Clear my answers';
      clear.addEventListener('click', () => {
        Chishikunem.clearReview(place.id);
        refresh();
      });
      form.append(clear);
    }
  };

  renderForm();
  return li;
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

  el.cards.replaceChildren(...shown
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(card));

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

el.exportBtn.addEventListener('click', () => {
  const reviews = Chishikunem.readReviews();
  const count = Object.keys(reviews).length;
  if (!count) {
    showStatus('Nothing to export yet.');
    return;
  }

  const blob = new Blob([JSON.stringify(reviews, null, 2)], { type: 'application/json' });
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
    Chishikunem.writeReviews({ ...Chishikunem.readReviews(), ...incoming });
    refresh(true);
    showStatus(`Imported ${Object.keys(incoming).length} places.`);
  } catch {
    showStatus('That file could not be read as reviews.');
  }
  el.importInput.value = '';
});

/* ---------- events ---------- */

document.querySelectorAll('input[name="scope"]')
  .forEach((input) => input.addEventListener('change', render));

let searchTimer;
el.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(render, 150);
});

Chishikunem.load((loaded) => { places = loaded; render(); })
  .then((state) => {
    if (state === 'stale') showStatus('Showing saved data — could not reach OpenStreetMap.');
  })
  .catch(() => {
    el.progress.textContent = 'Could not load the places.';
    showStatus('Could not reach OpenStreetMap. Check your connection and reload.', 0);
  });
