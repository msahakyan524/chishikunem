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

  function build() {
    dialog = document.createElement('dialog');
    dialog.className = 'signin';
    dialog.innerHTML = `
      <form method="dialog" class="signin__form">
        <h2 class="signin__title">Sign in to help</h2>
        <p class="signin__lead">
          Type your email and we will send you a link. No password, and your
          address is never shown on the map.
        </p>
        <label class="signin__label" for="signinEmail">Email</label>
        <input class="signin__input" id="signinEmail" type="email" name="email"
               autocomplete="email" inputmode="email" required placeholder="you@example.com">
        <p class="signin__msg" id="signinMsg" role="status" aria-live="polite"></p>
        <div class="signin__buttons">
          <button type="button" class="btn btn--quiet" data-close>Cancel</button>
          <button type="submit" class="btn btn--go" id="signinSend">Send me a link</button>
        </div>
      </form>`;
    document.body.append(dialog);

    form = dialog.querySelector('form');
    emailInput = dialog.querySelector('#signinEmail');
    submitBtn = dialog.querySelector('#signinSend');
    message = dialog.querySelector('#signinMsg');

    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());

    form.addEventListener('submit', async (event) => {
      // Without this the dialog closes the instant you press the button and
      // you never see whether the mail actually went out.
      event.preventDefault();
      submitBtn.disabled = true;
      say('Sending…');
      const { error } = await Cloud.sendLink(emailInput.value);
      submitBtn.disabled = false;
      if (error) { say(error.message || 'That did not work. Try again in a minute.', true); return; }
      say(`Link sent to ${emailInput.value.trim()}. Open it on this device and you are in.`);
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
    emailInput.focus();
  }

  /* The top bar shows one of two things. Signed out: a button. Signed in:
   * who you are and a way out. The email is the only name we have, so it is
   * the name shown — trimmed at the @ so a long address cannot push the rest
   * of the bar off a narrow phone. */
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
    who.textContent = user.email.split('@')[0];
    who.title = user.email;

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
