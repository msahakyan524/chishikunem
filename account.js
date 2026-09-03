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
  let emailInput = null;
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

        <p class="signin__lead" id="signinLead">
          Your username and password. Nothing is emailed, so you are in straight away.
        </p>

        <label class="signin__label" for="signinName">Username</label>
        <input class="signin__input" id="signinName" name="username" type="text"
               autocomplete="username" autocapitalize="none" spellcheck="false"
               required placeholder="e.g. maria">

        <label class="signin__label" for="signinPass">Password</label>
        <input class="signin__input" id="signinPass" name="password" type="password"
               autocomplete="current-password" required placeholder="at least 8 characters">

        <p class="signin__msg" id="signinMsg" role="status" aria-live="polite"></p>
        <div class="signin__buttons">
          <button type="button" class="btn btn--quiet" data-close>Cancel</button>
          <button type="submit" class="btn btn--go" id="signinGo">Sign in</button>
        </div>

        <!-- The old way in, kept because the first admin account was made with
             it, and because somebody may still have a link in their inbox. -->
        <details class="signin__rescue">
          <summary>Use an email link instead</summary>
          <label class="signin__label" for="signinEmail">Email</label>
          <input class="signin__input" id="signinEmail" type="email"
                 autocomplete="email" inputmode="email" placeholder="you@example.com">
          <button type="button" class="btn" id="signinSend">Send me a link</button>

          <p class="signin__lead signin__gap">
            If that link opens a page that will not load, copy the whole address
            from it and paste it here — your sign-in is inside it.
          </p>
          <textarea class="signin__paste" id="signinPaste" rows="3"
                    placeholder="Paste the whole address here"></textarea>
          <button type="button" class="btn" id="signinUse">Sign me in with this</button>
        </details>
      </form>`;
    document.body.append(dialog);

    form = dialog.querySelector('form');
    emailInput = dialog.querySelector('#signinEmail');
    submitBtn = dialog.querySelector('#signinGo');
    message = dialog.querySelector('#signinMsg');

    const nameInput = dialog.querySelector('#signinName');
    const passInput = dialog.querySelector('#signinPass');
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
        ? 'Pick any username and password. Nothing is emailed, so keep them somewhere safe — a forgotten password cannot be sent to you.'
        : 'Your username and password. Nothing is emailed, so you are in straight away.';
      // Tells a password manager whether to offer a saved one or a new one.
      passInput.autocomplete = making ? 'new-password' : 'current-password';
      say('');
    }

    tabIn.addEventListener('click', () => setMode(false));
    tabNew.addEventListener('click', () => setMode(true));

    form.addEventListener('submit', async (event) => {
      // Without this the dialog closes the instant the button is pressed and
      // whatever went wrong is never seen.
      event.preventDefault();
      submitBtn.disabled = true;
      say(makingAccount ? 'Creating your account…' : 'Signing in…');
      const { error } = makingAccount
        ? await Cloud.signUp(nameInput.value, passInput.value)
        : await Cloud.signIn(nameInput.value, passInput.value);
      submitBtn.disabled = false;
      if (error) { say(error.message || 'That did not work.', true); return; }
      say('Signed in.');
    });

    const send = dialog.querySelector('#signinSend');
    send.addEventListener('click', async () => {
      send.disabled = true;
      say('Sending…');
      const { error } = await Cloud.sendLink(emailInput.value);
      send.disabled = false;
      if (error) { say(error.message || 'That did not work. Try again in a minute.', true); return; }
      say(`Link sent to ${emailInput.value.trim()}. Open it on this device and you are in.`);
    });

    const paste = dialog.querySelector('#signinPaste');
    const use = dialog.querySelector('#signinUse');
    use.addEventListener('click', async () => {
      use.disabled = true;
      say('Checking that address…');
      const { error } = await Cloud.useLink(paste.value);
      use.disabled = false;
      if (error) { say(error.message || 'That address did not work.', true); return; }
      // Signing in fires onChange, which closes the dialog and carries on.
      paste.value = '';
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

    mount.append(who, out);

    if (Cloud.isAdmin() && !document.body.classList.contains('page-admin')) {
      const queue = document.createElement('a');
      queue.className = 'btn btn--ghost';
      queue.href = 'admin.html';
      queue.textContent = 'Queue';
      mount.append(queue);
    }
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
