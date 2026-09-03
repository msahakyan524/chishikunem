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

  /* No password and no invite list: you type your email, you get a link, you
   * are in. A password would be one more thing to forget for someone who
   * wants to report a broken toilet once. */
  async function sendLink(email, redirectTo) {
    if (!enabled) return { error: off };
    const address = String(email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
      return { error: { message: 'That does not look like an email address.' } };
    }
    const { error } = await db.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: redirectTo || window.location.href.split('#')[0] },
    });
    return { error };
  }

  async function signOut() {
    if (!enabled) return { error: off };
    const { error } = await db.auth.signOut();
    return { error };
  }

  /* A way in when the emailed link lands somewhere useless.
   *
   * Supabase sends people to the Site URL configured in its dashboard, and if
   * that is wrong — or an email client mangles the link, or the address is an
   * old one — the browser shows "this site can't be reached" while the sign-in
   * itself has already succeeded. Everything needed is sitting right there in
   * the address, after the `#`.
   *
   * So: paste that address here and we finish the job. The tokens belong to
   * whoever received the email; handing them to the same Supabase project they
   * came from grants nothing that clicking a working link would not have. */
  async function useLink(text) {
    if (!enabled) return { error: off };
    const raw = String(text || '').trim();
    if (!raw) return { error: { message: 'Paste the whole address, including the part after the #.' } };

    // Accept a full address or just the fragment somebody copied out of one.
    const fragment = raw.includes('#') ? raw.slice(raw.indexOf('#') + 1) : raw;
    const params = new URLSearchParams(fragment);

    const description = params.get('error_description');
    if (description) return { error: { message: description.replace(/\+/g, ' ') } };

    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) {
      return { error: { message: 'That address has no sign-in details in it. Copy the whole thing, from https right to the end.' } };
    }

    const { error } = await db.auth.setSession({ access_token, refresh_token });
    if (error) {
      // Much the commonest case: the link sat in an inbox for over an hour.
      const stale = /expired|invalid|jwt/i.test(error.message || '');
      return { error: { message: stale ? 'That link has expired — send yourself a fresh one.' : error.message } };
    }
    return { error: null };
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

  async function shrink(file) {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
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
    sendLink,
    signOut,
    useLink,
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
