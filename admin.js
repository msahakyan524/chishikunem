/* The queue: everything people have sent in, and the two buttons that decide
 * what happens to it.
 *
 * This page is only a convenient window onto the database. It is not what
 * keeps anyone out — the rules in supabase-setup.sql do that, and they are
 * checked again on the server for every row this page reads or writes. Somebody
 * who opens admin.html without being in the `admins` table sees an empty list
 * and gets an error on anything they try, which is exactly right.
 */
(function () {
  const FIELDS = [
    { key: 'hasToilet', label: 'Has a toilet' },
    { key: 'free', label: 'Free to use' },
    { key: 'wheelchair', label: 'Wheelchair accessible' },
    { key: 'baby', label: 'Baby changing table' },
    { key: 'unisex', label: 'Gender-neutral' },
    { key: 'noAsk', label: 'No need to ask anyone' },
  ];

  const el = {
    list: document.getElementById('adminList'),
    count: document.getElementById('adminCount'),
    status: document.getElementById('status'),
    tabs: [...document.querySelectorAll('[data-status]')],
  };

  let status = 'pending';
  let statusTimer = 0;

  function showStatus(message, ms = 5000) {
    el.status.textContent = message;
    el.status.hidden = false;
    clearTimeout(statusTimer);
    if (ms) statusTimer = setTimeout(() => { el.status.hidden = true; }, ms);
  }

  const said = (value) => (value === true ? 'Yes' : value === false ? 'No' : 'Not sure');

  function when(iso) {
    const then = new Date(iso);
    const days = Math.floor((Date.now() - then.getTime()) / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days} days ago`;
    return then.toLocaleDateString();
  }

  /* What the map says about this place right now, so an answer can be read as
   * a change rather than in isolation. confirmed.js is the published baseline
   * that ships with the site; anything already approved sits on top of it. */
  function currentFacts(placeId, approved) {
    const shipped = (typeof CHISHIKUNEM_CONFIRMED !== 'undefined' && CHISHIKUNEM_CONFIRMED[placeId]) || {};
    return { ...shipped, ...(approved[placeId] || {}) };
  }

  /* One answer, as a row she can still change before publishing it.
   *
   * Being able to edit matters: most submissions are right about one thing and
   * guessing about another, and the choice should not be all-or-nothing
   * between publishing a guess and throwing away a good answer. */
  function answerRow(field, proposed, current, editable, onPick) {
    const row = document.createElement('div');
    row.className = 'answer';

    const label = document.createElement('span');
    label.className = 'answer__label';
    label.textContent = field.label;

    const was = current[field.key];
    if (was !== undefined && was !== proposed[field.key]) {
      const from = document.createElement('span');
      from.className = 'admin__was';
      from.textContent = `now: ${said(was)}`;
      label.append(' ', from);
    }

    if (!editable) {
      const value = document.createElement('span');
      value.className = 'admin__value';
      value.textContent = said(proposed[field.key]);
      row.append(label, value);
      return row;
    }

    const group = document.createElement('div');
    group.className = 'answer__buttons';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', field.label);

    for (const [value, text] of [[true, 'Yes'], [false, 'No'], [null, 'Not sure']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'answer__btn';
      button.textContent = text;
      const on = proposed[field.key] === value;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', String(on));
      button.addEventListener('click', () => {
        // Unpicking drops the key entirely, so approving publishes nothing
        // about a question she does not want to answer either.
        if (on) delete proposed[field.key];
        else proposed[field.key] = value;
        onPick();
      });
      group.append(button);
    }

    row.append(label, group);
    return row;
  }

  function card(row, approved, refresh) {
    const li = document.createElement('li');
    li.className = 'card';

    /* The place name is the group heading above, so the card leads with who
     * sent this one instead of repeating it on every card. */
    const head = document.createElement('div');
    head.className = 'card__head';

    if (row.status !== 'pending') {
      const badge = document.createElement('span');
      badge.className = 'card__badge';
      badge.textContent = row.status === 'approved' ? 'Published' : 'Turned down';
      head.append(badge);
    }

    const meta = document.createElement('p');
    meta.className = 'card__meta';
    // A password account's address is only a username with a made-up domain
    // stuck on the end; show the name somebody actually chose.
    const from = Cloud.displayName({ email: row.user_email });
    meta.textContent = `${from} · ${when(row.created_at)} · ${row.place_id}`;

    const links = document.createElement('div');
    links.className = 'card__links';
    if (row.place_lat && row.place_lon) {
      const osm = document.createElement('a');
      osm.className = 'btn btn--link';
      osm.href = `https://www.openstreetmap.org/?mlat=${row.place_lat}&mlon=${row.place_lon}#map=19/${row.place_lat}/${row.place_lon}`;
      osm.target = '_blank';
      osm.rel = 'noopener';
      osm.textContent = 'OpenStreetMap';
      const street = document.createElement('a');
      street.className = 'btn btn--link';
      street.href = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${row.place_lat},${row.place_lon}`;
      street.target = '_blank';
      street.rel = 'noopener';
      street.textContent = 'Street View';
      links.append(osm, street);
    }

    li.append(head, meta, links);

    const editable = row.status === 'pending';
    const proposed = { ...(row.facts || {}) };
    const current = currentFacts(row.place_id, approved);

    const answers = document.createElement('div');
    answers.className = 'card__form';
    li.append(answers);

    const answered = () => FIELDS.filter((f) => f.key in proposed);

    function drawAnswers() {
      answers.textContent = '';
      const list = answered();
      if (!list.length) {
        const none = document.createElement('p');
        none.className = 'detail__muted';
        none.textContent = 'No answers — a note or a photo only.';
        answers.append(none);
        return;
      }
      for (const field of list) {
        answers.append(answerRow(field, proposed, current, editable, drawAnswers));
      }
    }
    drawAnswers();

    if (row.note) {
      const quote = document.createElement('p');
      quote.className = 'detail__note';
      quote.textContent = row.note;
      li.append(quote);
    }

    /* A pending photo lives in a private bucket, so it needs a signed URL that
     * only this browser can use, and only for the next hour. */
    if (row.photo_path) {
      const shot = document.createElement('div');
      shot.className = 'shots';
      const hint = document.createElement('p');
      hint.className = 'shots__hint';
      hint.textContent = 'Loading the photo…';
      shot.append(hint);
      li.append(shot);
      Cloud.pendingPhotoUrl(row.photo_path).then((url) => {
        shot.textContent = '';
        if (!url) { hint.textContent = 'That photo could not be loaded.'; shot.append(hint); return; }
        const img = document.createElement('img');
        img.className = 'shots__img';
        img.src = url;
        img.loading = 'lazy';
        img.alt = `Photo sent for ${row.place_name || row.place_id}`;
        shot.append(img);
      });
    }

    if (!editable) {
      if (row.admin_note) {
        const why = document.createElement('p');
        why.className = 'card__meta';
        why.textContent = `Your note: ${row.admin_note}`;
        li.append(why);
      }
      return li;
    }

    const why = document.createElement('input');
    why.type = 'text';
    why.className = 'card__rename';
    why.placeholder = 'Note to yourself (optional)';

    const buttons = document.createElement('div');
    buttons.className = 'card__buttons';

    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'btn btn--go';
    approve.textContent = 'Publish this';

    const reject = document.createElement('button');
    reject.type = 'button';
    reject.className = 'btn btn--danger';
    reject.textContent = 'Turn down';

    async function run(action, working, done) {
      approve.disabled = true;
      reject.disabled = true;
      showStatus(working, 0);
      const { error } = await action();
      if (error) {
        approve.disabled = false;
        reject.disabled = false;
        showStatus(error.message || 'That did not work.', 0);
        return;
      }
      showStatus(done);
      refresh();
    }

    approve.addEventListener('click', () => run(
      () => Cloud.approve(row, { facts: proposed, note: row.note, adminNote: why.value }),
      'Publishing…',
      `${row.place_name || row.place_id} is on the map.`,
    ));

    reject.addEventListener('click', () => run(
      () => Cloud.decide(row.id, 'rejected', why.value),
      'Turning it down…',
      'Turned down. Nothing changed on the map.',
    ));

    buttons.append(approve, reject);
    li.append(why, buttons);
    return li;
  }

  async function draw() {
    /* This page is the way in, so when it cannot work it has to say what is
     * missing rather than sit blank. Both of these are states she will
     * actually hit, not defensive filler. */
    if (!Cloud.enabled) {
      el.count.textContent = 'Not connected yet. This page will let you sign in and read '
        + 'what people have sent as soon as the two Supabase keys are in cloud-config.js.';
      el.list.textContent = '';
      return;
    }
    if (!Cloud.user()) {
      el.count.textContent = 'Sign in above with your email to read the suggestions.';
      el.list.textContent = '';
      return;
    }
    if (!Cloud.isAdmin()) {
      el.count.textContent = 'This account cannot review submissions.';
      el.list.textContent = '';
      return;
    }

    el.count.textContent = 'Loading…';
    const [{ data, error }, approved] = await Promise.all([Cloud.queue(status), Cloud.publicFacts()]);
    el.list.textContent = '';

    if (error) { el.count.textContent = error.message || 'Could not load the queue.'; return; }

    if (!data.length) {
      el.count.textContent = status === 'pending'
        ? 'Nothing waiting. All caught up.'
        : 'Nothing here yet.';
      return;
    }

    /* Grouped by place, not by arrival time.
     *
     * Three people describing the same toilet is one decision to make with all
     * three in front of you, not three unrelated cards scattered down the list
     * with other places in between. Places are ordered by whoever has been
     * waiting longest, so nothing sinks to the bottom and stays there. */
    const byPlace = new Map();
    for (const row of data) {
      if (!byPlace.has(row.place_id)) byPlace.set(row.place_id, []);
      byPlace.get(row.place_id).push(row);
    }

    const word = data.length === 1 ? 'submission' : 'submissions';
    const places = byPlace.size === 1 ? 'place' : 'places';
    el.count.textContent = `${data.length} ${word} across ${byPlace.size} ${places}.`;

    for (const [placeId, rows] of byPlace) {
      const group = document.createElement('li');
      group.className = 'admin__group';

      const head = document.createElement('h2');
      head.className = 'admin__place';
      head.textContent = rows[0].place_name || placeId;
      if (rows.length > 1) {
        const many = document.createElement('span');
        many.className = 'admin__many';
        many.textContent = `${rows.length} about this one`;
        head.append(' ', many);
      }

      const inner = document.createElement('ul');
      inner.className = 'admin__list';
      for (const row of rows) inner.append(card(row, approved, draw));

      group.append(head, inner);
      el.list.append(group);
    }
  }

  for (const tab of el.tabs) {
    tab.addEventListener('click', () => {
      status = tab.dataset.status;
      for (const other of el.tabs) other.classList.toggle('is-on', other === tab);
      draw();
    });
  }

  ChishikunemAccount.start();
  if (window.Cloud && Cloud.enabled) {
    Cloud.onChange(draw);
    Cloud.ready().then(draw);
  } else {
    draw();
  }
})();
