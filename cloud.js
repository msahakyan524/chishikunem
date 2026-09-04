/* Everything this site does over the network that is not a map tile.
 *
 * Signing in, sending a suggestion, and — for the one account listed in the
 * `admins` table — reading the queue and deciding what gets published.
 *
 * The whole module is dormant unless cloud-config.js has been filled in.
 * `Cloud.enabled` is false, every call returns a "not configured" error
 * instead of throwing, and the pages that use it simply do not draw their
 * buttons. That is deliberate: the published site must keep working while the
 * backend does not exist yet.
 *
 * Nothing here is trusted. A visitor can edit this file in their own browser
 * and call anything in it with any argument they like. The rules that
 * actually hold — you may only insert your own submission, it is always
 * pending, only an admin may approve — live in supabase-setup.sql and are
 * enforced by the database.
 */
window.Cloud = (function () {
  const config = window.CHISHIKUNEM_CLOUD || {};
  const enabled = Boolean(config.url && config.anonKey && window.supabase);

  const PENDING_BUCKET = 'pending';
  const PUBLIC_BUCKET = 'photos';
  const AVATAR_BUCKET = 'avatars';

  // A photo straight off a phone is several megabytes of something nobody
  // needs at full size. Shrinking it in the browser keeps uploads quick on a
  // Yerevan mobile connection and the storage bill at zero.
  const MAX_EDGE = 1600;
  const JPEG_QUALITY = 0.82;
  const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

  const db = enabled
    ? window.supabase.createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The magic link comes back to the page with the session in the URL;
        // this is what picks it up and then tidies the address bar.
        detectSessionInUrl: true,
      },
    })
    : null;

  const off = { message: 'The backend is not set up yet.' };

  let user = null;
  let admin = false;
  let settled = false;
  let settling = null;
  const listeners = new Set();

  function announce() {
    for (const fn of listeners) {
      try { fn(user, admin); } catch (error) { console.error(error); }
    }
  }

  /* Whether you are an admin is answered by the database, not by this file.
   * `is_admin()` reads the `admins` table with the caller's email, so the
   * answer cannot be faked from the console — and even if it were, every
   * admin-only table policy asks the same question again server-side. */
  async function refreshAdmin() {
    if (!user) { admin = false; return; }
    const { data, error } = await db.rpc('is_admin');
    admin = !error && data === true;
  }

  async function settle() {
    const { data } = await db.auth.getSession();
    user = data.session?.user || null;
    await refreshAdmin();
    settled = true;
    announce();
  }

  /* Resolves once the stored session has been read back and the admin check
   * has answered. Pages await this before drawing, so the header does not
   * flash "Sign in" at somebody who is already signed in. */
  function ready() {
    if (!enabled) return Promise.resolve();
    if (settled) return Promise.resolve();
    if (!settling) settling = settle();
    return settling;
  }

  if (enabled) {
    db.auth.onAuthStateChange(async (event, session) => {
      const next = session?.user || null;
      const changed = next?.id !== user?.id;
      user = next;
      if (changed || !settled) await refreshAdmin();
      settled = true;
      announce();
    });
  }

  /* ---------- accounts ---------- */

  /* Usernames and passwords, with no email anywhere.
   *
   * Supabase only knows how to key an account on an email address, so a
   * username is turned into one: `maria` becomes `maria@chishikunem.invalid`.
   * `.invalid` is reserved by RFC 2606 precisely for this — it can never be
   * registered by anybody and can never receive mail, so the address is a
   * name and nothing else. It also means Supabase's unique-email rule gives
   * us unique usernames for free, with no second table to keep in step.
   *
   * The point of all this is that nothing is ever emailed: no confirmation,
   * no magic link, no waiting, and no running into the two-emails-an-hour
   * limit. You type a name and a password and you are in.
   *
   * The cost, stated plainly: a forgotten password cannot be emailed back.
   * It has to be reset from the Supabase dashboard, or the person makes
   * another account. For a toilet map that is the right trade. */
  const USER_DOMAIN = 'chishikunem.invalid';

  const emailFor = (username) => `${username}@${USER_DOMAIN}`;

  // The name to show for an account. Password accounts carry the synthetic
  // domain, which nobody should ever have to look at.
  function displayName(user) {
    const email = (user && user.email) || '';
    if (!email) return 'someone';
    return email.endsWith(`@${USER_DOMAIN}`) ? email.slice(0, -(USER_DOMAIN.length + 1)) : email;
  }

  /* Deliberately narrow. A username ends up inside an email address, so
   * anything that would need escaping there is refused rather than mangled
   * quietly into a different account than the one somebody typed. */
  function checkUsername(name) {
    const clean = String(name || '').trim().toLowerCase();
    if (clean.length < 3) return { error: 'Pick a username of at least 3 letters.' };
    if (clean.length > 20) return { error: 'That username is too long — 20 letters at most.' };
    if (!/^[a-z0-9_-]+$/.test(clean)) {
      return { error: 'Usernames can use letters, numbers, - and _ only.' };
    }
    return { clean };
  }

  function checkPassword(password) {
    const value = String(password || '');
    // Supabase itself refuses under 6; 8 is the floor worth asking for.
    if (value.length < 8) return { error: 'Use a password of at least 8 characters.' };
    return { value };
  }

  const GENDERS = ['f', 'm', 'other', 'unsaid'];

  async function signUp(username, password, gender) {
    if (!enabled) return { error: off };
    const name = checkUsername(username);
    if (name.error) return { error: { message: name.error } };
    const pass = checkPassword(password);
    if (pass.error) return { error: { message: pass.error } };
    const answer = GENDERS.includes(gender) ? gender : 'unsaid';

    const { data, error } = await db.auth.signUp({
      email: emailFor(name.clean),
      password: pass.value,
      options: { data: { username: name.clean } },
    });

    if (error) {
      if (/already registered|already exists/i.test(error.message || '')) {
        return { error: { message: `The name "${name.clean}" is taken. Try another.` } };
      }
      /* Signing up should not be sending mail at all. When it does, the
       * project still has "Confirm email" switched on, and the person is
       * stuck behind a confirmation that will never arrive at a .invalid
       * address. Say so, rather than showing them Supabase's wording. */
      if (/rate limit|email/i.test(error.message || '')) {
        return { error: { message: 'Accounts are not switched on yet — email confirmation still needs turning off in Supabase.' } };
      }
      return { error };
    }

    // No session means Supabase is holding the account until it is confirmed.
    if (!data.session) {
      return { error: { message: 'Accounts are not switched on yet — email confirmation still needs turning off in Supabase.' } };
    }

    /* The profile is what everybody else sees: the name on their comments and
     * the picture beside it. Written after the account exists, because it is
     * keyed on the id Supabase has just handed out. A failure here is not
     * worth refusing the whole sign-up over — they are in, and `ensureProfile`
     * will fill the gap the next time anything needs it. */
    await db.from('profiles').insert({
      id: data.session.user.id,
      username: name.clean,
      gender: answer,
    });

    return { error: null };
  }

  /* Accounts made before profiles existed have none, and an insert can fail
   * for its own reasons. Anything that needs a profile calls this first. */
  async function ensureProfile() {
    if (!enabled || !user) return null;
    const found = await db.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (found.data) return found.data;
    const row = { id: user.id, username: displayName(user), gender: 'unsaid' };
    await db.from('profiles').insert(row);
    return row;
  }

  async function myProfile() {
    return ensureProfile();
  }

  /* Their own picture. Shrunk hard — an avatar is shown at 40px, so anything
   * bigger than a couple of hundred pixels is bytes nobody will ever see. */
  async function setAvatar(file) {
    if (!enabled) return { error: off };
    if (!user) return { error: { message: 'Sign in first.' } };
    if (file.size > MAX_UPLOAD_BYTES) {
      return { error: { message: 'That picture is very large — please pick one under 8 MB.' } };
    }

    let blob;
    try { blob = await shrink(file, 256); } catch (error) { return { error } ; }

    const path = `${user.id}/avatar.jpg`;
    const up = await db.storage.from(AVATAR_BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (up.error) return { error: up.error };

    /* A fixed filename means the browser keeps showing the old picture after
     * a change, so the address carries the time it was written. */
    const url = `${db.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;

    await ensureProfile();
    const saved = await db.from('profiles').update({ avatar_url: url }).eq('id', user.id);
    if (saved.error) return { error: saved.error };
    return { error: null, url };
  }

  /* ---------- how good it was, out of five ---------- */

  let hasRatings = true;

  /* The average, how many gave it, and your own score if you gave one.
   * Averaged here rather than kept as a running total on the place: a stored
   * average is one more number that can drift, and there will never be enough
   * of these for the difference to be felt. */
  async function ratings(placeId) {
    const none = { average: 0, count: 0, mine: 0 };
    if (!enabled || !hasRatings) return none;

    const { data, error } = await db.from('ratings')
      .select('stars, user_id')
      .eq('place_id', placeId);

    if (missing(error)) { hasRatings = false; return none; }
    if (error || !data || !data.length) return none;

    const total = data.reduce((sum, row) => sum + row.stars, 0);
    const own = user && data.find((row) => row.user_id === user.id);
    return {
      average: total / data.length,
      count: data.length,
      mine: own ? own.stars : 0,
    };
  }

  /* Scoring the same number again takes the score back, the way pressing a
   * chosen answer anywhere else on this site does. */
  async function rate(place, stars) {
    if (!enabled) return { error: off };
    if (!user) return { error: { message: 'Sign in first.' } };
    if (!hasRatings) return { error: { message: 'Scoring is not switched on yet.' } };

    if (!stars) {
      const { error } = await db.from('ratings').delete()
        .eq('place_id', place.id).eq('user_id', user.id);
      if (missing(error)) hasRatings = false;
      return { error };
    }

    const value = Math.max(1, Math.min(5, Math.round(stars)));
    const { error } = await db.from('ratings').upsert({
      place_id: place.id,
      user_id: user.id,
      stars: value,
      place_name: place.name || '',
    }, { onConflict: 'place_id,user_id' });

    if (missing(error)) { hasRatings = false; return { error: { message: 'Scoring is not switched on yet.' } }; }
    return { error };
  }

  /* ---------- comments ---------- */

  /* Everything said under one place, newest first, with the name and picture
   * of whoever said it. Two queries rather than a join: an account made before
   * profiles existed has none, and a join would drop its comments entirely. */
  /* Replies, votes and notifications each need something added to the
   * database, and the site is published before that is run — sometimes long
   * before, and once in the middle of an outage that stopped the script
   * halfway. So each is treated as a thing that might not be there.
   *
   * The rule: never let a missing column or table take the comments down with
   * it. Ask for the new shape, and on "does not exist" drop back to the old
   * one and remember not to ask again. */
  let hasReplies = true;
  let hasVotes = true;
  let hasBell = true;

  const missing = (error) => Boolean(error) && (
    error.code === '42703'      // column does not exist
    || error.code === '42P01'   // table does not exist
    || error.code === 'PGRST205' // table not in the schema cache
    || /does not exist|schema cache/i.test(error.message || '')
  );

  async function comments(placeId) {
    if (!enabled) return { data: [] };

    const columns = hasReplies
      ? 'id, body, created_at, user_id, parent_id'
      : 'id, body, created_at, user_id';

    let { data, error } = await db.from('comments')
      .select(columns)
      .eq('place_id', placeId)
      .order('created_at', { ascending: false });

    // The replies column is not there yet: ask again without it, once.
    if (missing(error) && hasReplies) {
      hasReplies = false;
      ({ data, error } = await db.from('comments')
        .select('id, body, created_at, user_id')
        .eq('place_id', placeId)
        .order('created_at', { ascending: false }));
    }

    if (error || !data || !data.length) return { data: [], error };

    const ids = [...new Set(data.map((row) => row.user_id))];
    const people = await db.from('profiles').select('id, username, avatar_url').in('id', ids);
    const by = new Map((people.data || []).map((p) => [p.id, p]));

    /* Votes are counted here rather than kept as a running total on the
     * comment: a stored count is one more thing that can drift away from the
     * truth, and there are never enough of them for it to matter. */
    const votes = hasVotes
      ? await db.from('reactions')
        .select('comment_id, user_id, vote')
        .in('comment_id', data.map((row) => row.id))
      : { data: [] };
    if (missing(votes.error)) hasVotes = false;

    const tally = new Map();
    for (const row of votes.data || []) {
      const t = tally.get(row.comment_id) || { up: 0, down: 0, mine: 0 };
      if (row.vote === 1) t.up += 1; else t.down += 1;
      if (user && row.user_id === user.id) t.mine = row.vote;
      tally.set(row.comment_id, t);
    }

    const full = data.map((row) => ({
      ...row,
      username: by.get(row.user_id)?.username || 'someone',
      avatar_url: by.get(row.user_id)?.avatar_url || null,
      ...(tally.get(row.id) || { up: 0, down: 0, mine: 0 }),
    }));

    /* Handed back as a shallow tree: top-level comments newest first, each
     * carrying its replies oldest first, which is the order a conversation
     * was actually had in. */
    const tops = full.filter((row) => !row.parent_id);
    const kids = full.filter((row) => row.parent_id);
    for (const top of tops) {
      top.replies = kids
        .filter((k) => k.parent_id === top.id)
        .sort((x, y) => Date.parse(x.created_at) - Date.parse(y.created_at));
    }
    // A reply whose parent has been removed would otherwise vanish silently.
    const orphans = kids.filter((k) => !tops.some((t) => t.id === k.parent_id));
    for (const o of orphans) o.replies = [];

    return { data: [...tops, ...orphans], error: null };
  }

  /* One opinion per person per comment. Pressing the same one again takes it
   * back, which is why this can end in a delete. */
  async function react(commentId, vote) {
    if (!enabled) return { error: off };
    if (!user) return { error: { message: 'Sign in first.' } };
    if (!hasVotes) return { error: { message: 'Voting is not switched on yet.' } };

    if (vote === 0) {
      const { error } = await db.from('reactions').delete()
        .eq('comment_id', commentId).eq('user_id', user.id);
      return { error };
    }

    const { error } = await db.from('reactions')
      .upsert({ comment_id: commentId, user_id: user.id, vote }, { onConflict: 'comment_id,user_id' });
    return { error };
  }

  /* ---------- notifications ---------- */

  async function notifications() {
    if (!enabled || !user || !hasBell) return { data: [] };
    const { data, error } = await db.from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (missing(error)) { hasBell = false; return { data: [] }; }
    if (error || !data || !data.length) return { data: [], error };

    const ids = [...new Set(data.map((row) => row.actor_id).filter(Boolean))];
    const people = ids.length
      ? await db.from('profiles').select('id, username, avatar_url').in('id', ids)
      : { data: [] };
    const by = new Map((people.data || []).map((p) => [p.id, p]));

    return {
      data: data.map((row) => ({
        ...row,
        actor: by.get(row.actor_id)?.username || 'someone',
        actor_avatar: by.get(row.actor_id)?.avatar_url || null,
      })),
      error: null,
    };
  }

  async function unseenCount() {
    if (!enabled || !user || !hasBell) return 0;
    const { count, error } = await db.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('seen', false);
    if (missing(error)) { hasBell = false; return 0; }
    return count || 0;
  }

  async function markAllSeen() {
    if (!enabled || !user || !hasBell) return { error: null };
    const { error } = await db.from('notifications')
      .update({ seen: true }).eq('user_id', user.id).eq('seen', false);
    return { error };
  }

  async function postComment(place, body, parentId) {
    if (!enabled) return { error: off };
    if (!user) return { error: { message: 'Sign in first.' } };
    const text = String(body || '').trim();
    if (!text) return { error: { message: 'Write something first.' } };
    if (text.length > 500) return { error: { message: 'That is a bit long — 500 characters at most.' } };

    await ensureProfile();

    const row = { place_id: place.id, place_name: place.name || '', body: text };
    // Only mention replies to a database that knows about them.
    if (hasReplies) row.parent_id = parentId || null;

    const { error } = await db.from('comments').insert(row);

    if (error) {
      /* The five-minute rule is a row-level check, so being inside the window
       * comes back as a policy violation. The wording never mentions a timer:
       * a limit somebody can see is a limit somebody can wait out precisely. */
      if (/row-level security|violates/i.test(error.message || '')) {
        return { error: { message: 'You have just posted — give it a few minutes before the next one.' } };
      }
      return { error };
    }
    return { error: null };
  }

  async function removeComment(id) {
    if (!enabled) return { error: off };
    const { error } = await db.from('comments').delete().eq('id', id);
    return { error };
  }

  async function signIn(username, password) {
    if (!enabled) return { error: off };
    const name = checkUsername(username);
    if (name.error) return { error: { message: name.error } };

    const { error } = await db.auth.signInWithPassword({
      email: emailFor(name.clean),
      password: String(password || ''),
    });

    if (error) {
      // One message for both a wrong name and a wrong password, so the form
      // cannot be used to find out which usernames exist.
      if (/invalid login credentials/i.test(error.message || '')) {
        return { error: { message: 'That username and password do not match.' } };
      }
      return { error };
    }
    return { error: null };
  }

  async function signOut() {
    if (!enabled) return { error: off };
    const { error } = await db.auth.signOut();
    return { error };
  }

  /* ---------- photos ---------- */

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image.')); };
      img.src = url;
    });
  }

  async function shrink(file, maxEdge = MAX_EDGE) {
    const img = await loadImage(file);
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY));
    if (!blob) throw new Error('That photo could not be read.');
    return blob;
  }

  /* ---------- sending a suggestion ---------- */

  /* The photo goes up before the row that points at it, because a visitor is
   * allowed to insert a submission but never to update one — that is what
   * stops anyone editing their own answer after you have approved it. So the
   * path has to be known before the insert, not patched in afterwards. */
  async function submit({ place, facts, note, file }) {
    if (!enabled) return { error: off };
    if (!user) return { error: { message: 'Sign in first.' } };

    let photoPath = null;
    if (file) {
      if (file.size > MAX_UPLOAD_BYTES) {
        return { error: { message: 'That photo is very large — please pick one under 8 MB.' } };
      }
      let blob;
      try { blob = await shrink(file); } catch (error) { return { error }; }
      photoPath = `${user.id}/${crypto.randomUUID()}.jpg`;
      const up = await db.storage.from(PENDING_BUCKET)
        .upload(photoPath, blob, { contentType: 'image/jpeg' });
      if (up.error) return { error: up.error };
    }

    const { error } = await db.from('submissions').insert({
      place_id: place.id,
      place_name: place.name || '',
      place_lat: place.lat ?? null,
      place_lon: place.lon ?? null,
      facts: facts || {},
      note: (note || '').trim(),
      photo_path: photoPath,
    });
    return { error };
  }

  // What you yourself have sent for a place, so the form can say "you already
  // told us about this one, it is waiting" instead of inviting a duplicate.
  async function mine(placeId) {
    if (!enabled || !user) return { data: [] };
    const { data, error } = await db.from('submissions')
      .select('id, status, created_at, facts, note, photo_path')
      .eq('place_id', placeId)
      .order('created_at', { ascending: false });
    return { data: data || [], error };
  }

  /* ---------- the queue (admin only) ---------- */

  /* Everything anyone has said about one place, newest first, whatever its
   * state. This is what the detail panel shows an admin: standing on the map
   * looking at a toilet, the useful question is "what has been said about
   * *this* one", which a queue ordered by arrival cannot answer.
   *
   * The same call for a visitor comes back holding only their own rows — the
   * select policy sees to that, not this function. */
  async function forPlace(placeId) {
    if (!enabled) return { data: [], error: off };
    const { data, error } = await db.from('submissions')
      .select('*')
      .eq('place_id', placeId)
      .order('created_at', { ascending: false });
    return { data: data || [], error };
  }

  async function queue(status = 'pending') {
    if (!enabled) return { data: [], error: off };
    const { data, error } = await db.from('submissions')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: true });
    return { data: data || [], error };
  }

  async function counts() {
    if (!enabled) return {};
    const out = {};
    for (const status of ['pending', 'approved', 'rejected']) {
      const { count } = await db.from('submissions')
        .select('id', { count: 'exact', head: true })
        .eq('status', status);
      out[status] = count || 0;
    }
    return out;
  }

  // A pending photo sits in a private bucket, so the queue cannot just point
  // an <img> at it. A signed URL lets the admin's own browser see it for an
  // hour without making the bucket public.
  async function pendingPhotoUrl(path) {
    if (!enabled || !path) return null;
    const { data } = await db.storage.from(PENDING_BUCKET).createSignedUrl(path, 3600);
    return data?.signedUrl || null;
  }

  /* Approving is the only moment anything becomes visible to the public, and
   * it is three steps: move the photo into the public bucket, merge the facts
   * into the row the map reads, then mark the submission decided. If a step
   * fails the ones after it do not run, so a half-published place cannot
   * appear. */
  async function approve(row, edited) {
    if (!enabled) return { error: off };
    const facts = edited?.facts || row.facts || {};
    const note = (edited?.note ?? row.note ?? '').trim();

    let photoUrl = null;
    if (row.photo_path) {
      const got = await db.storage.from(PENDING_BUCKET).download(row.photo_path);
      if (got.error) return { error: got.error };
      const up = await db.storage.from(PUBLIC_BUCKET)
        .upload(row.photo_path, got.data, { contentType: 'image/jpeg', upsert: true });
      if (up.error) return { error: up.error };
      photoUrl = db.storage.from(PUBLIC_BUCKET).getPublicUrl(row.photo_path).data.publicUrl;
    }

    /* Merge rather than replace: a second person answering one more question
     * about a place should add to what is known, not wipe the rest. Only keys
     * this submission actually answered are written. */
    const existing = await db.from('public_facts')
      .select('facts, note, photo_url').eq('place_id', row.place_id).maybeSingle();

    const merged = { ...(existing.data?.facts || {}) };
    for (const [key, value] of Object.entries(facts)) {
      if (value !== undefined) merged[key] = value;
    }

    const saved = await db.from('public_facts').upsert({
      place_id: row.place_id,
      place_name: row.place_name || '',
      facts: merged,
      note: note || existing.data?.note || '',
      photo_url: photoUrl || existing.data?.photo_url || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'place_id' });
    if (saved.error) return { error: saved.error };

    return decide(row.id, 'approved', edited?.adminNote);
  }

  async function decide(id, status, adminNote) {
    if (!enabled) return { error: off };
    const { error } = await db.from('submissions').update({
      status,
      admin_note: (adminNote || '').trim(),
      decided_at: new Date().toISOString(),
    }).eq('id', id);
    return { error };
  }

  /* ---------- what the map reads ---------- */

  /* Approved facts, readable by anyone, signed in or not. Returned keyed by
   * place id so data.js can layer it straight on top of confirmed.js. */
  async function publicFacts() {
    if (!enabled) return {};
    const { data, error } = await db.from('public_facts').select('place_id, facts, note, photo_url');
    if (error || !data) return {};
    const out = {};
    for (const row of data) {
      out[row.place_id] = { ...(row.facts || {}), note: row.note || '', photo_url: row.photo_url || null };
    }
    return out;
  }

  return {
    enabled,
    db,
    ready,
    user: () => user,
    isAdmin: () => admin,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    signUp,
    signIn,
    displayName,
    myProfile,
    setAvatar,
    comments,
    postComment,
    removeComment,
    react,
    ratings,
    rate,
    can: () => ({ replies: hasReplies, votes: hasVotes, bell: hasBell, ratings: hasRatings }),
    notifications,
    unseenCount,
    markAllSeen,
    signOut,
    submit,
    mine,
    forPlace,
    queue,
    counts,
    pendingPhotoUrl,
    approve,
    decide,
    publicFacts,
  };
})();
