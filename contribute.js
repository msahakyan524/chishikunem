/* "Tell us about this one" — the block a visitor sees inside a place's detail
 * panel once there is a backend to send to.
 *
 * It is deliberately not the same thing as the owner's own editor. Her edits
 * land on the map immediately because she is the one publishing it; a
 * visitor's answers go into a queue and change nothing until she says so.
 * Same questions, different destination.
 *
 * Self-contained on purpose: app.js calls `block(place)` and appends whatever
 * comes back. Delete this file and the map is exactly what it was.
 */
window.ChishikunemContribute = (function () {
  /* data.js declares `Chishikunem` with `const`, which in a classic script is
   * script-scoped and never becomes a property of `window` — so testing for
   * `window.Chishikunem` finds nothing and quietly yields no questions at all.
   * `typeof` is the check that actually works here. */
  const FIELDS = () => (typeof Chishikunem === 'undefined' ? [] : Chishikunem.FIELDS);

  /* Nothing is pre-selected.
   *
   * The obvious design is to start every question on "Not sure", and it is a
   * trap: it looks answered, so a single stray tap files a report that says
   * nothing at all. Unanswered questions are left out of what gets sent, and
   * "Not sure" only appears if somebody deliberately chose it — it means "I
   * looked and could not tell", which is worth knowing. */
  const CHOICES = [[true, 'Yes'], [false, 'No'], [null, 'Not sure']];

  function answerRow(field, state, onPick) {
    const row = document.createElement('div');
    row.className = 'answer';

    const label = document.createElement('span');
    label.className = 'answer__label';
    label.textContent = field.label;

    const group = document.createElement('div');
    group.className = 'answer__buttons';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', field.label);

    for (const [value, text] of CHOICES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'answer__btn';
      button.textContent = text;
      const chosen = field.key in state && state[field.key] === value;
      button.classList.toggle('is-on', chosen);
      button.setAttribute('aria-pressed', String(chosen));
      button.addEventListener('click', () => {
        // Pressing the answer you already gave takes it back, so a mistake
        // does not have to be sent just because it was tapped once.
        if (chosen) delete state[field.key];
        else state[field.key] = value;
        onPick();
      });
      group.append(button);
    }

    row.append(label, group);
    return row;
  }

  function shell(title) {
    const box = document.createElement('section');
    box.className = 'suggest';
    const h = document.createElement('h3');
    h.className = 'suggest__title';
    h.textContent = title;
    box.append(h);
    return box;
  }

  function signedOutBlock() {
    const box = shell('Know this place?');
    const p = document.createElement('p');
    p.className = 'suggest__lead';
    p.textContent = 'Sign in with your email and tell us what is actually there. '
      + 'Every answer is checked before it reaches the map.';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--go btn--wide';
    button.textContent = 'Sign in to help';
    button.addEventListener('click', () => ChishikunemAccount.open());
    box.append(p, button);
    return box;
  }

  function waitingBlock(count) {
    const p = document.createElement('p');
    p.className = 'suggest__waiting';
    p.textContent = count === 1
      ? 'You have already sent an answer for this place. It is waiting to be checked.'
      : `You have sent ${count} answers for this place. They are waiting to be checked.`;
    return p;
  }

  function form(place) {
    const box = shell('Tell us about this one');

    const lead = document.createElement('p');
    lead.className = 'suggest__lead';
    lead.textContent = 'Answer only what you know for certain. Anything you leave '
      + 'blank stays as it is.';
    box.append(lead);

    const state = {};
    const rows = document.createElement('div');
    box.append(rows);

    const note = document.createElement('textarea');
    note.className = 'card__note';
    note.rows = 2;
    note.placeholder = 'Anything else worth knowing (floor, code, who to ask…)';

    /* The browser's own file control is a 22px grey box that looks nothing
     * like the rest of the page and is too small to hit with a thumb. The
     * input is kept — it is what actually opens the camera roll — but hidden
     * inside a label styled as one of our buttons, with the chosen file named
     * beside it so you can tell something was picked. */
    const photoRow = document.createElement('div');
    photoRow.className = 'suggest__photo';

    const pick = document.createElement('label');
    pick.className = 'btn suggest__pick';
    pick.append('Add a photo');

    const photo = document.createElement('input');
    photo.type = 'file';
    photo.accept = 'image/*';
    photo.className = 'suggest__file';
    pick.append(photo);

    const picked = document.createElement('span');
    picked.className = 'suggest__filename';
    picked.textContent = 'Optional';

    photoRow.append(pick, picked);

    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'btn btn--go btn--wide';
    send.textContent = 'Send for checking';

    const said = document.createElement('p');
    said.className = 'suggest__msg';
    said.setAttribute('role', 'status');
    said.setAttribute('aria-live', 'polite');

    /* Something has to have been said before this can be sent. Without the
     * guard the button is happy to file a completely blank report, which
     * costs the reviewer a slot in the queue and tells her nothing. */
    function worthSending() {
      return Object.keys(state).length > 0 || note.value.trim() !== '' || photo.files.length > 0;
    }

    function redraw() {
      rows.textContent = '';
      for (const field of FIELDS()) {
        // The rest of the questions only make sense once there is a toilet —
        // either because this visitor just said so, or because the map
        // already knows it.
        const hasOne = 'hasToilet' in state ? state.hasToilet === true : place.hasToilet === true;
        if (field.key !== 'hasToilet' && !hasOne) continue;
        rows.append(answerRow(field, state, redraw));
      }
      send.disabled = !worthSending();
    }

    note.addEventListener('input', () => { send.disabled = !worthSending(); });
    photo.addEventListener('change', () => {
      picked.textContent = photo.files[0] ? photo.files[0].name : 'Optional';
      send.disabled = !worthSending();
    });

    send.addEventListener('click', async () => {
      send.disabled = true;
      said.textContent = 'Sending…';
      said.classList.remove('suggest__msg--bad');
      const { error } = await Cloud.submit({
        place,
        facts: state,
        note: note.value,
        file: photo.files[0] || null,
      });
      if (error) {
        said.textContent = error.message || 'That did not send. Try again in a moment.';
        said.classList.add('suggest__msg--bad');
        send.disabled = false;
        return;
      }
      box.textContent = '';
      const done = document.createElement('p');
      done.className = 'suggest__waiting';
      done.textContent = 'Thank you — sent. It will appear on the map once it has been checked.';
      box.append(done);
    });

    redraw();
    box.append(note, photoRow, send, said);
    return box;
  }

  /* Called by app.js while it builds a detail panel. Returns an element to
   * append, or null when there is nothing to add — no backend configured, or
   * the panel belongs to a place that has been removed. */
  function block(place) {
    if (!window.Cloud || !Cloud.enabled || !place || place.deleted) return null;
    if (!Cloud.user()) return signedOutBlock();

    const box = form(place);

    /* What you sent before arrives after the panel is already on screen. It
     * is a note above the form rather than a replacement for it: a second
     * visit often means you have learned one more thing. */
    Cloud.mine(place.id).then(({ data }) => {
      const waiting = (data || []).filter((row) => row.status === 'pending');
      if (waiting.length && box.isConnected) box.insertBefore(waitingBlock(waiting.length), box.children[1]);
    });

    return box;
  }

  /* ---------- what has been said about this one ---------- */

  const said = (v) => (v === true ? 'Yes' : v === false ? 'No' : 'Not sure');

  function when(iso) {
    const then = new Date(iso);
    const days = Math.floor((Date.now() - then.getTime()) / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days} days ago`;
    return then.toLocaleDateString();
  }

  function entry(row, onDecided) {
    const li = document.createElement('li');
    li.className = `said said--${row.status}`;

    const who = document.createElement('p');
    who.className = 'said__who';
    who.textContent = `${Cloud.displayName({ email: row.user_email })} · ${when(row.created_at)}`;
    if (row.status !== 'pending') {
      const tag = document.createElement('span');
      tag.className = 'said__state';
      tag.textContent = row.status === 'approved' ? 'kept' : 'turned down';
      who.append(' ', tag);
    }
    li.append(who);

    // Their comment is the part worth reading first, so it leads.
    if (row.note) {
      const quote = document.createElement('p');
      quote.className = 'said__note';
      quote.textContent = row.note;
      li.append(quote);
    }

    const answered = Object.entries(row.facts || {});
    if (answered.length) {
      const labels = new Map(FIELDS().map((f) => [f.key, f.label]));
      const ul = document.createElement('ul');
      ul.className = 'said__facts';
      for (const [key, value] of answered) {
        const item = document.createElement('li');
        item.className = 'tag';
        item.textContent = `${labels.get(key) || key}: ${said(value)}`;
        ul.append(item);
      }
      li.append(ul);
    }

    if (row.photo_path) {
      const shot = document.createElement('div');
      shot.className = 'shots';
      li.append(shot);
      // Pending photos live in a private bucket, so they need a signed URL.
      Cloud.pendingPhotoUrl(row.photo_path).then((url) => {
        if (!url || !shot.isConnected) return;
        const img = document.createElement('img');
        img.className = 'shots__img';
        img.src = url;
        img.loading = 'lazy';
        img.alt = 'Photo sent with this suggestion';
        shot.append(img);
      });
    }

    if (row.status !== 'pending') return li;

    const buttons = document.createElement('div');
    buttons.className = 'card__buttons';

    const keep = document.createElement('button');
    keep.type = 'button';
    keep.className = 'btn btn--go';
    keep.textContent = 'Keep this';

    const drop = document.createElement('button');
    drop.type = 'button';
    drop.className = 'btn btn--danger';
    drop.textContent = 'Turn down';

    const note = document.createElement('p');
    note.className = 'said__msg';
    note.setAttribute('role', 'status');

    async function run(action, working) {
      keep.disabled = true;
      drop.disabled = true;
      note.textContent = working;
      const { error } = await action();
      if (error) {
        keep.disabled = false;
        drop.disabled = false;
        note.textContent = error.message || 'That did not work.';
        return;
      }
      onDecided();
    }

    keep.addEventListener('click', () => run(() => Cloud.approve(row), 'Keeping…'));
    drop.addEventListener('click', () => run(() => Cloud.decide(row.id, 'rejected'), 'Turning down…'));

    buttons.append(keep, drop);
    li.append(buttons, note);
    return li;
  }

  /* The admin's view of one place: every suggestion and comment left on it,
   * with the two decisions right there. Deciding from the map matters —
   * judging "is there really a baby table here" is far easier looking at the
   * pin and the photos than from a list sorted by arrival time. */
  function thread(place, onChanged) {
    if (!window.Cloud || !Cloud.enabled || !Cloud.isAdmin() || !place) return null;

    const box = document.createElement('section');
    box.className = 'said__box';

    const title = document.createElement('h3');
    title.className = 'suggest__title';
    title.textContent = 'What people have said';

    const status = document.createElement('p');
    status.className = 'detail__muted';
    status.textContent = 'Looking…';

    box.append(title, status);

    Cloud.forPlace(place.id).then(({ data, error }) => {
      if (!box.isConnected) return;
      if (error) { status.textContent = error.message || 'Could not load these.'; return; }
      if (!data.length) { status.textContent = 'Nothing yet for this place.'; return; }

      status.remove();
      const ul = document.createElement('ul');
      ul.className = 'said__list';
      for (const row of data) ul.append(entry(row, onChanged));
      box.append(ul);

      const waiting = data.filter((r) => r.status === 'pending').length;
      if (waiting) {
        const count = document.createElement('p');
        count.className = 'said__count';
        count.textContent = waiting === 1 ? '1 waiting for you.' : `${waiting} waiting for you.`;
        box.insertBefore(count, ul);
      }
    });

    return box;
  }

  /* ---------- out of five ---------- */

  /* Five little mascots instead of five stars, because it is that kind of
   * map. The drawing is the same for a point earned and one not — only the
   * colour changes, so the row keeps its shape and the eye reads the score
   * off the length of the brown run rather than counting shapes. */
  function poop(filled) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', filled ? 'score__poop is-on' : 'score__poop');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-poopstar');
    svg.append(use);
    return svg;
  }

  /* "I've peed here" — a private mark, kept in its own table that nobody
   * else can read, not even the owner of the map. It sits with the score
   * because both answer the same question: what did you make of this one. */
  function beenHereButton(place, onChange) {
    const can = Cloud.can ? Cloud.can() : { visits: true };
    if (!can.visits || !Cloud.user()) return null;

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn score__been';

    function paint() {
      const been = Cloud.hasVisited(place.id);
      b.classList.toggle('is-on', been);
      b.setAttribute('aria-pressed', String(been));
      b.textContent = been ? '\u2713 You have peed here' : "I've peed here";
    }

    b.addEventListener('click', async () => {
      b.disabled = true;
      const { error } = await Cloud.setVisited(place, !Cloud.hasVisited(place.id));
      b.disabled = false;
      if (error) { b.textContent = error.message || 'That did not save.'; return; }
      paint();
      if (onChange) onChange();
    });

    // The list of visits may not have been fetched yet on a fresh page.
    Cloud.visits().then(() => { if (b.isConnected) paint(); });
    paint();
    return b;
  }

  function scoreBlock(place, onVisitChange) {
    if (!window.Cloud || !Cloud.enabled || !place) return null;
    const can = Cloud.can ? Cloud.can() : { ratings: true, visits: true };
    if (!can.ratings && !can.visits) return null;

    const box = document.createElement('section');
    box.className = 'score';

    const been = beenHereButton(place, onVisitChange);

    if (!can.ratings) {
      // No scores table yet, but the private mark still works on its own.
      if (!been) return null;
      box.append(been);
      return box;
    }

    const title = document.createElement('h3');
    title.className = 'suggest__title';
    title.textContent = 'How was it?';

    const row = document.createElement('div');
    row.className = 'score__row';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', `Score ${place.name || 'this place'} out of five`);

    const said = document.createElement('p');
    said.className = 'score__said';

    box.append(title, row, said);

    let mine = 0;

    /* The five buttons are built once and only re-tinted afterwards.
     *
     * An earlier version rebuilt the row on every hover, which destroyed the
     * button under the pointer mid-gesture: the pointer never "left" anything,
     * so the preview stuck, and a click could land on an element that had
     * already been replaced. Toggling a class on buttons that stay put is both
     * simpler and the only version that actually works. */
    const buttons = [];
    for (let n = 1; n <= 5; n += 1) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'score__btn';
      b.setAttribute('aria-label', `${n} out of 5`);
      b.append(poop(false));

      b.addEventListener('click', async () => {
        if (!Cloud.user()) { ChishikunemAccount.open(); return; }
        // Pressing the score you already gave takes it back.
        const next = mine === n ? 0 : n;
        said.textContent = 'Saving…';
        const { error } = await Cloud.rate(place, next);
        if (error) { said.textContent = error.message || 'That did not save.'; return; }
        load();
      });

      /* Hovering previews what pressing would give, which is what a hand
       * expects from a row of stars anywhere else. */
      b.addEventListener('pointerenter', () => paint(n));
      b.addEventListener('focus', () => paint(n));
      b.addEventListener('blur', () => paint(mine));

      buttons.push(b);
      row.append(b);
    }

    function paint(showing) {
      buttons.forEach((b, i) => {
        const on = i < showing;
        b.firstChild.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(mine === i + 1));
      });
    }

    row.addEventListener('pointerleave', () => paint(mine));

    function load() {
      Cloud.ratings(place.id).then((r) => {
        if (!box.isConnected) return;
        /* The scores table may not exist yet — the first read is what finds
         * out. Take the whole block away rather than leave a row of buttons
         * that cannot save anything. */
        if (Cloud.can && !Cloud.can().ratings) { box.remove(); return; }
        mine = r.mine;
        paint(r.mine);

        if (!r.count) {
          said.textContent = Cloud.user()
            ? 'Nobody has scored this yet — you can be first.'
            : 'Nobody has scored this yet.';
          return;
        }
        const people = r.count === 1 ? '1 person' : `${r.count} people`;
        const own = r.mine ? ` · you gave it ${r.mine}` : '';
        said.textContent = `${r.average.toFixed(1)} out of 5, from ${people}${own}`;
      });
    }

    paint(0);
    load();
    if (been) box.append(been);
    return box;
  }

  /* ---------- comments ---------- */

  /* Talk under a place, public the moment it is written.
   *
   * Not the same thing as the suggestion form above it. A suggestion is a
   * claim about the map and waits to be checked; a comment is somebody
   * saying what it was like, and goes straight up. Everyone can read them,
   * signed in or not — that is the point of them.
   *
   * Nothing here can be edited afterwards, by anyone. The database has no
   * update rule for comments at all, so the only choices are to write one or
   * for the owner to take it down. */
  function avatarFor(row) {
    if (row.avatar_url) {
      const img = document.createElement('img');
      img.className = 'talk__face';
      img.src = row.avatar_url;
      img.alt = '';
      img.loading = 'lazy';
      // A picture that will not load should leave the initial behind, not a
      // broken icon.
      img.addEventListener('error', () => img.replaceWith(initialFor(row)));
      return img;
    }
    return initialFor(row);
  }

  function initialFor(row) {
    const dot = document.createElement('span');
    dot.className = 'talk__face talk__face--letter';
    dot.setAttribute('aria-hidden', 'true');
    dot.textContent = (row.username || '?').charAt(0).toUpperCase();
    return dot;
  }

  /* One vote per person, and pressing the same one again takes it back. The
   * counts are shown even to somebody signed out — they are public — but the
   * buttons only do anything once you have an account. */
  function voteRow(row, place, reload) {
    const bar = document.createElement('div');
    bar.className = 'talk__votes';

    /* Voting and replying each need something in the database that may not be
     * there yet. Rather than show buttons that answer with an error, leave
     * them out until the database can carry them. */
    const can = Cloud.can ? Cloud.can() : { votes: true, replies: true };
    if (!can.votes && !can.replies) return bar;

    for (const [vote, label, symbol] of (can.votes
      ? [[1, 'Like', '\u25b2'], [-1, 'Dislike', '\u25bc']] : [])) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'talk__vote';
      const on = row.mine === vote;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', `${label}, ${vote === 1 ? row.up : row.down} so far`);
      b.textContent = `${symbol} ${vote === 1 ? row.up : row.down}`;
      b.addEventListener('click', async () => {
        if (!Cloud.user()) { ChishikunemAccount.open(); return; }
        b.disabled = true;
        // Pressing the one already chosen means "take it back".
        await Cloud.react(row.id, on ? 0 : vote);
        reload();
      });
      bar.append(b);
    }

    if (can.replies && Cloud.user() && !row.parent_id) {
      const reply = document.createElement('button');
      reply.type = 'button';
      reply.className = 'talk__vote talk__reply';
      reply.textContent = 'Reply';
      reply.addEventListener('click', () => openReply(row, place, bar, reload));
      bar.append(reply);
    }

    return bar;
  }

  function openReply(row, place, after, reload) {
    if (after.parentElement.querySelector('.talk__replybox')) return;

    const box = document.createElement('div');
    box.className = 'talk__replybox';

    const write = document.createElement('textarea');
    write.className = 'card__note';
    write.rows = 2;
    write.maxLength = 500;
    write.placeholder = `Reply to ${row.username}`;

    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'btn btn--go btn--wide';
    send.textContent = 'Reply';

    const said = document.createElement('p');
    said.className = 'suggest__msg';
    said.setAttribute('role', 'status');

    send.addEventListener('click', async () => {
      send.disabled = true;
      said.textContent = 'Posting…';
      const { error } = await Cloud.postComment(place, write.value, row.id);
      if (error) {
        said.textContent = error.message || 'That did not post.';
        said.classList.add('suggest__msg--bad');
        send.disabled = false;
        return;
      }
      reload();
    });

    box.append(write, send, said);
    after.insertAdjacentElement('afterend', box);
    write.focus();
  }

  function commentRow(row, place, reload, depth = 0) {
    const li = document.createElement('li');
    li.className = depth ? 'talk talk--reply' : 'talk';

    const head = document.createElement('div');
    head.className = 'talk__head';

    const who = document.createElement('span');
    who.className = 'talk__who';
    who.textContent = row.username;

    const at = document.createElement('span');
    at.className = 'talk__when';
    at.textContent = when(row.created_at);

    head.append(avatarFor(row), who, at);

    const body = document.createElement('p');
    body.className = 'talk__body';
    body.textContent = row.body;

    li.append(head, body, voteRow(row, place, reload));

    if (Cloud.isAdmin()) {
      const bin = document.createElement('button');
      bin.type = 'button';
      bin.className = 'btn btn--danger';
      bin.textContent = 'Remove';
      bin.addEventListener('click', async () => {
        bin.disabled = true;
        const { error } = await Cloud.removeComment(row.id);
        if (error) { bin.disabled = false; return; }
        reload();
      });
      li.append(bin);
    }

    if (row.replies && row.replies.length) {
      const kids = document.createElement('ul');
      kids.className = 'talk__list talk__kids';
      for (const kid of row.replies) kids.append(commentRow(kid, place, reload, depth + 1));
      li.append(kids);
    }

    return li;
  }

  function commentsBlock(place) {
    if (!window.Cloud || !Cloud.enabled || !place) return null;

    const box = document.createElement('section');
    box.className = 'talk__box';

    const title = document.createElement('h3');
    title.className = 'suggest__title';
    title.textContent = 'Comments';

    const status = document.createElement('p');
    status.className = 'detail__muted';
    status.textContent = 'Loading…';

    const list = document.createElement('ul');
    list.className = 'talk__list';

    box.append(title, status, list);

    function load() {
      Cloud.comments(place.id).then(({ data, error }) => {
        if (!box.isConnected) return;
        list.textContent = '';
        if (error) { status.textContent = 'Could not load the comments.'; return; }
        if (!data.length) {
          status.textContent = 'Nothing said about this one yet.';
          return;
        }
        status.textContent = '';
        status.hidden = true;
        for (const row of data) list.append(commentRow(row, place, load));
      });
    }
    load();

    /* Signed out, the comments are still worth reading — so they are shown,
     * with an invitation rather than a form. */
    if (!Cloud.user()) {
      const ask = document.createElement('button');
      ask.type = 'button';
      ask.className = 'btn btn--wide';
      ask.textContent = 'Sign in to leave a comment';
      ask.addEventListener('click', () => ChishikunemAccount.open());
      box.append(ask);
      return box;
    }

    const write = document.createElement('textarea');
    write.className = 'card__note';
    write.rows = 2;
    write.maxLength = 500;
    write.placeholder = 'What was it like?';

    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'btn btn--go btn--wide';
    send.textContent = 'Post';
    send.disabled = true;

    const said = document.createElement('p');
    said.className = 'suggest__msg';
    said.setAttribute('role', 'status');
    said.setAttribute('aria-live', 'polite');

    write.addEventListener('input', () => { send.disabled = !write.value.trim(); });

    send.addEventListener('click', async () => {
      send.disabled = true;
      said.textContent = 'Posting…';
      said.classList.remove('suggest__msg--bad');
      const { error } = await Cloud.postComment(place, write.value);
      if (error) {
        said.textContent = error.message || 'That did not post.';
        said.classList.add('suggest__msg--bad');
        send.disabled = false;
        return;
      }
      write.value = '';
      said.textContent = '';
      status.hidden = false;
      load();
    });

    // Their own picture, changed from here rather than from a settings page
    // nobody would find.
    const pick = document.createElement('label');
    pick.className = 'btn talk__pick';
    pick.append('Change my picture');
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.className = 'suggest__file';
    pick.append(file);
    file.addEventListener('change', async () => {
      if (!file.files[0]) return;
      said.textContent = 'Saving your picture…';
      const { error } = await Cloud.setAvatar(file.files[0]);
      said.textContent = error ? (error.message || 'That picture did not save.') : 'Picture saved.';
      said.classList.toggle('suggest__msg--bad', Boolean(error));
      if (!error) load();
    });

    box.append(write, send, pick, said);
    return box;
  }

  return { block, thread, commentsBlock, scoreBlock };
})();
