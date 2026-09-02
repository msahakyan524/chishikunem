/* The seam between the list and the map.
 *
 * Two arrows sit on it. A plain press steps the seam one notch; grabbing them
 * and pulling drags it continuously. Both, rather than a bare draggable
 * hairline, because a 1px divider is fiddly with a trackpad and impossible
 * from a keyboard — and this page gets used one-handed, going back and forth
 * between a card and its pin all day.
 *
 * The width is remembered per page, so the balance you settled on is the one
 * you get next time.
 *
 * Wide screens only. Below 860px the CSS shows one pane at a time and hides
 * the arrows, so nothing here has anything to do.
 */
(function () {
  const layout = document.getElementById('layout');
  const split = document.querySelector('.split');
  if (!layout || !split) return;

  const panel = layout.querySelector('.panel');
  if (!panel) return;

  /* Remembered per page. Reviewing wants a wide pane of cards; looking up a
   * toilet wants a wide map. Sharing one number would have each page keep
   * undoing the other. */
  const KEY = `chishikunem:panelw:v1:${document.body.classList.contains('page-review') ? 'review' : 'map'}`;
  const STEP = 80;
  const MIN = 280;
  // The map is the other half; never squeeze it below a usable strip.
  const MAP_MIN = 320;

  const buttons = [...split.querySelectorAll('[data-split]')];

  function clamp(width) {
    const max = Math.max(MIN, window.innerWidth - MAP_MIN);
    return Math.min(max, Math.max(MIN, Math.round(width)));
  }

  /* The width to move away from: whatever was saved, or whatever the panel
   * happens to be right now on a first visit. */
  function current() {
    const saved = Number(localStorage.getItem(KEY));
    if (Number.isFinite(saved) && saved > 0) return clamp(saved);
    return clamp(panel.getBoundingClientRect().width || MIN);
  }

  /* An arrow with nowhere left to go is greyed out rather than silently doing
   * nothing when pressed. It is marked, not `disabled` — a disabled button
   * stops firing pointer events, and you would not be able to start a drag
   * from the arrow you happen to be at the end of. */
  function refresh(width) {
    for (const btn of buttons) {
      const stuck = clamp(width + Number(btn.dataset.split) * STEP) === width;
      btn.setAttribute('aria-disabled', String(stuck));
    }
  }

  function apply(width) {
    const w = clamp(width);
    layout.style.setProperty('--panelw', `${w}px`);
    refresh(w);
    return w;
  }

  function remember(w) {
    try { localStorage.setItem(KEY, String(w)); } catch { /* storage full */ }
    /* Leaflet listens for window resize itself, so this is all it takes for
     * the map to fill its new width and fetch the tiles that just appeared. */
    nudgeMap();
  }

  let startX = 0;
  let lastX = 0;
  let startW = 0;
  let dragging = false;
  let dragged = false;
  let pressed = null;
  let frame = 0;
  let lastNudge = 0;

  /* Telling the map its size changed is the expensive half of a drag: Leaflet
   * reprojects every marker and asks for new tiles. Doing it on each frame is
   * what made the seam stutter, so mid-drag the map catches up a few times a
   * second while the seam itself keeps following the pointer every frame. */
  const NUDGE_MS = 120;

  function nudgeMap() {
    lastNudge = performance.now();
    window.dispatchEvent(new Event('resize'));
  }

  split.addEventListener('click', (event) => {
    // A click that was really the end of a drag has already moved the seam.
    if (dragged) return;
    /* While the pointer is captured every event is retargeted to the strip,
     * so the click no longer knows which arrow it landed on. The one recorded
     * on the way down does. */
    const btn = event.target.closest('[data-split]') || pressed;
    if (!btn || btn.getAttribute('aria-disabled') === 'true') return;
    remember(apply(current() + Number(btn.dataset.split) * STEP));
  });

  /* Pointer events cover mouse, trackpad and touch in one path, and capturing
   * the pointer keeps the drag alive when it strays over the map — which it
   * will, since the strip is only 24px wide. */
  split.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragging = true;
    dragged = false;
    pressed = event.target.closest('[data-split]');
    startX = event.clientX;
    startW = current();
    split.setPointerCapture(event.pointerId);
    document.body.classList.add('is-splitting');
    /* Deliberately no preventDefault here. Cancelling pointerdown also
     * cancels the click that follows it, and the arrows would stop stepping
     * on a plain press. Text selection is held off by `user-select` on the
     * body instead, and touch scrolling by `touch-action` on the strip. */
  });

  /* The width follows the pointer on the next animation frame rather than on
   * every event: a fast drag fires far more moves than the screen can paint,
   * and each one would otherwise relayout both panes and the map. */
  split.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    /* A few pixels of slop, so a slightly shaky press stays a click on the
     * arrow instead of becoming a drag that goes nowhere. */
    if (!dragged && Math.abs(event.clientX - startX) < 4) return;
    dragged = true;
    // Read on the frame, not captured here, so a fast drag paints where the
    // pointer is now rather than where it was when the frame was booked.
    lastX = event.clientX;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      apply(startW + (lastX - startX));
      if (performance.now() - lastNudge > NUDGE_MS) nudgeMap();
    });
  });

  function endDrag(event) {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('is-splitting');
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    if (dragged) remember(apply(startW + (event.clientX - startX)));
    // Let the click handler see both, then clear them for the next press.
    setTimeout(() => { dragged = false; pressed = null; }, 0);
  }

  split.addEventListener('pointerup', endDrag);
  split.addEventListener('pointercancel', endDrag);

  /* Narrowing the window can leave a saved width wider than the screen, so
   * re-clamp on resize. This only reads and writes the width — it never
   * dispatches a resize of its own, so it cannot feed itself. */
  window.addEventListener('resize', () => {
    /* Mid-drag this is our own nudge coming back round, and the width it would
     * restore is the one we just set. Re-reading storage and re-clamping on
     * every one of those was half the cost of a drag. */
    if (dragging) return;
    if (localStorage.getItem(KEY)) apply(current());
    else refresh(current());
  });

  if (localStorage.getItem(KEY)) apply(current());
  else refresh(current());
})();
