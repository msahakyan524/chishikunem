/* The sign-in button in the top bar, and the little dialog behind it.
 *
 * Shared by the map and the admin queue. It draws nothing at all unless
 * cloud-config.js has been filled in, so the site keeps its current shape
 * until there is a backend to sign in to.
 *
 * Signing in is one field: your email. Supabase mails a link, you tap it, you
 * land back here signed in. No password to invent, no invite to wait for —
 * the point is that a stranger who just found a clean toilet can tell us
 * about it before they have finished washing their hands.
 */
window.ChishikunemAccount = (function () {
  const mount = document.getElementById('account');
  if (!mount || !window.Cloud || !Cloud.enabled) {
    return { start() {}, requireUser: () => null };
  }

  let dialog = null;
  let form = null;
  let submitBtn = null;
  let message = null;
  let afterSignIn = null;
  let makingAccount = false;

  function build() {
    dialog = document.createElement('dialog');
    dialog.className = 'signin';
    dialog.innerHTML = `
      <form method="dialog" class="signin__form">
        <h2 class="signin__title">Sign in to help</h2>

        <div class="signin__tabs" role="group" aria-label="Sign in or create an account">
          <button type="button" class="signin__tab is-on" id="tabIn">I have an account</button>
          <button type="button" class="signin__tab" id="tabNew">Create one</button>
        </div>

        <!-- Filled in by setMode below, which owns this wording for both
             modes; leaving a second copy here to drift out of step is how the
             dialog ended up saying one thing before a tab was pressed and
             another after. -->
        <p class="signin__lead" id="signinLead"></p>

        <label class="signin__label" for="signinName">Username</label>
        <input class="signin__input" id="signinName" name="username" type="text"
               autocomplete="username" autocapitalize="none" spellcheck="false"
               required placeholder="e.g. maria">

        <label class="signin__label" for="signinPass">Password</label>
        <input class="signin__input" id="signinPass" name="password" type="password"
               autocomplete="current-password" required placeholder="at least 8 characters">

        <!-- Only shown while creating an account. Never displayed to anyone
             else, and "Rather not say" is a real answer rather than a blank. -->
        <div id="signinGenderRow" hidden>
          <label class="signin__label" for="signinGender">Gender</label>
          <select class="signin__input" id="signinGender" name="gender">
            <option value="unsaid">Rather not say</option>
            <option value="f">Female</option>
            <option value="m">Male</option>
            <option value="other">Other</option>
          </select>
        </div>

        <p class="signin__msg" id="signinMsg" role="status" aria-live="polite"></p>
        <div class="signin__buttons">
          <button type="button" class="btn btn--quiet" data-close>Cancel</button>
          <button type="submit" class="btn btn--go" id="signinGo">Sign in</button>
        </div>

      </form>`;
    document.body.append(dialog);

    form = dialog.querySelector('form');
    submitBtn = dialog.querySelector('#signinGo');
    message = dialog.querySelector('#signinMsg');

    const nameInput = dialog.querySelector('#signinName');
    const passInput = dialog.querySelector('#signinPass');
    const genderRow = dialog.querySelector('#signinGenderRow');
    const genderPick = dialog.querySelector('#signinGender');
    const lead = dialog.querySelector('#signinLead');
    const tabIn = dialog.querySelector('#tabIn');
    const tabNew = dialog.querySelector('#tabNew');

    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());

    /* Two modes, one form. Signing in and signing up ask for exactly the same
     * two things, so a second form would be the same fields twice. */
    function setMode(making) {
      makingAccount = making;
      tabNew.classList.toggle('is-on', making);
      tabIn.classList.toggle('is-on', !making);
      tabNew.setAttribute('aria-pressed', String(making));
      tabIn.setAttribute('aria-pressed', String(!making));
      submitBtn.textContent = making ? 'Create my account' : 'Sign in';
      lead.textContent = making
        ? 'Pick any username and password. There is no email involved, so keep them somewhere safe — if you forget the password, ask us and we will reset it for you.'
        : 'Your username and password. No email, no waiting — you are in straight away.';
      // Asked once, when the account is made; never again on the way in.
      genderRow.hidden = !making;
      // Tells a password manager whether to offer a saved one or a new one.
      passInput.autocomplete = making ? 'new-password' : 'current-password';
      say('');
    }

    tabIn.addEventListener('click', () => setMode(false));
    tabNew.addEventListener('click', () => setMode(true));

    // Signing in is the common case, and this also writes the lead text.
    setMode(false);

    form.addEventListener('submit', async (event) => {
      // Without this the dialog closes the instant the button is pressed and
      // whatever went wrong is never seen.
      event.preventDefault();
      submitBtn.disabled = true;
      say(makingAccount ? 'Creating your account…' : 'Signing in…');
      const { error } = makingAccount
        ? await Cloud.signUp(nameInput.value, passInput.value, genderPick.value)
        : await Cloud.signIn(nameInput.value, passInput.value);
      submitBtn.disabled = false;
      if (error) { say(error.message || 'That did not work.', true); return; }
      say('Signed in.');
    });

  }

  function say(text, bad = false) {
    message.textContent = text;
    message.classList.toggle('signin__msg--bad', bad);
  }

  function open(onDone) {
    afterSignIn = onDone || null;
    say('');
    if (submitBtn) submitBtn.disabled = false;
    dialog.showModal();
    // Straight into the username box: that is the path nearly everyone takes.
    dialog.querySelector('#signinName').focus();
  }

  /* The top bar shows one of two things. Signed out: a button. Signed in:
   * who you are and a way out. For a password account that is the username;
   * for an older email one it is the part before the @, so neither can push
   * the rest of the bar off a narrow phone. */
  function draw() {
    const user = Cloud.user();
    mount.textContent = '';

    if (!user) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn--ghost';
      button.textContent = 'Sign in';
      button.addEventListener('click', () => open());
      mount.append(button);
      return;
    }

    const who = document.createElement('span');
    who.className = 'account__who';
    who.textContent = Cloud.displayName(user);
    who.title = Cloud.displayName(user);

    const out = document.createElement('button');
    out.type = 'button';
    out.className = 'btn btn--quiet';
    out.textContent = 'Sign out';
    out.addEventListener('click', async () => { await Cloud.signOut(); });

    mount.append(bell(), who, out);

    if (Cloud.isAdmin() && !document.body.classList.contains('page-admin')) {
      const queue = document.createElement('a');
      queue.className = 'btn btn--ghost';
      queue.href = 'admin.html';
      queue.textContent = 'Queue';
      mount.append(queue);
    }
  }

  /* The bell.
   *
   * A notification here is a thing on the site, not an email or a phone push:
   * there is no address to send to, and a push would need a permission prompt
   * and a worker. So it waits quietly in the corner until it is looked at. */
  function bell() {
    const wrap = document.createElement('span');
    wrap.className = 'bell';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--ghost bell__btn';
    button.setAttribute('aria-label', 'Notifications');
    button.textContent = '\u2709';

    const count = document.createElement('span');
    count.className = 'bell__count';
    count.hidden = true;

    button.append(count);
    wrap.append(button);

    Cloud.unseenCount().then((n) => {
      if (!n) return;
      count.hidden = false;
      count.textContent = n > 9 ? '9+' : String(n);
      button.classList.add('is-hot');
    });

    button.addEventListener('click', async () => {
      openNotifications();
      count.hidden = true;
      button.classList.remove('is-hot');
      await Cloud.markAllSeen();
    });

    return wrap;
  }

  function openNotifications() {
    let box = document.querySelector('dialog.notes');
    if (!box) {
      box = document.createElement('dialog');
      box.className = 'signin notes';
      box.innerHTML = `
        <div class="signin__form">
          <h2 class="signin__title">Your notifications</h2>
          <ul class="notes__list" id="notesList"></ul>
          <div class="signin__buttons">
            <button type="button" class="btn btn--quiet" data-close>Close</button>
          </div>
        </div>`;
      document.body.append(box);
      box.querySelector('[data-close]').addEventListener('click', () => box.close());
    }

    const list = box.querySelector('#notesList');
    list.textContent = 'Loading…';
    box.showModal();

    const SAID = {
      like: 'liked your comment',
      dislike: 'disliked your comment',
      reply: 'replied to you',
    };

    Cloud.notifications().then(({ data }) => {
      list.textContent = '';
      if (!data.length) {
        const none = document.createElement('li');
        none.className = 'notes__none';
        none.textContent = 'Nothing yet. When somebody likes or replies to a comment of yours, it turns up here.';
        list.append(none);
        return;
      }
      for (const note of data) {
        const li = document.createElement('li');
        li.className = note.seen ? 'notes__row' : 'notes__row notes__row--new';
        const what = document.createElement('span');
        what.className = 'notes__what';
        what.textContent = `${note.actor} ${SAID[note.kind] || 'did something'}`;
        const where = document.createElement('span');
        where.className = 'notes__where';
        where.textContent = note.place_name ? `at ${note.place_name}` : '';
        li.append(what, where);
        list.append(li);
      }
    });
  }

  async function start() {
    build();
    Cloud.onChange(() => {
      draw();
      // Coming back from the emailed link should finish whatever the person
      // was trying to do, not dump them on the page with no explanation.
      if (Cloud.user() && dialog.open) dialog.close();
      if (Cloud.user() && afterSignIn) { const fn = afterSignIn; afterSignIn = null; fn(); }
    });
    await Cloud.ready();
    draw();
  }

  return {
    start,
    open,
    // Small helper for callers that need a signed-in user before doing a thing.
    requireUser(onDone) {
      if (Cloud.user()) { onDone(); return true; }
      open(onDone);
      return false;
    },
  };
})();
