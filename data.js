/* Shared data layer for Chishikunem.
 *
 * Both the map (app.js) and the review page (review.js) load the same places
 * from OpenStreetMap and the same locally-saved confirmations, so a fact you
 * confirm once shows up in both.
 */

const Chishikunem = (() => {
  const ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];

  const REVIEW_KEY = 'chishikunem:reviews:v1';
  const ADDED_KEY = 'chishikunem:added:v1';
  const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

  /* ---------- districts ---------- */

  // The bounds live in districts.js. Kentron is the fallback for anything
  // unrecognised, because it is the district with places in it.
  const DISTRICTS = typeof CHISHIKUNEM_DISTRICTS !== 'undefined' ? CHISHIKUNEM_DISTRICTS : [];

  const districtById = (id) => DISTRICTS.find((d) => d.id === id) || DISTRICTS[0];

  /* The site covers Kentron and nothing else. The other eleven boxes stay in
   * districts.js untouched, and every place outside Kentron stays in
   * places.js — reopening the city is a matter of changing ONLY_DISTRICT back
   * to a chooser, not of finding the data again. */
  const ONLY_DISTRICT = 'kentron';

  let current = districtById(ONLY_DISTRICT);

  function district() {
    return current;
  }

  // Each district is fetched and cached on its own, so switching back to one
  // you have already opened is instant.
  const cacheKey = (id) => `chishikunem:osm:v2:${id}`;

  const queryFor = (bbox) => `[out:json][timeout:60];
(
  nwr["amenity"="fast_food"]["name"](${bbox.join(',')});
  nwr["amenity"="toilets"](${bbox.join(',')});
);
out center tags;`;

  // The facts we track, in the order they appear in the review form.
  const FIELDS = [
    { key: 'hasToilet', label: 'Has a toilet' },
    { key: 'free', label: 'Free to use' },
    { key: 'wheelchair', label: 'Wheelchair accessible' },
    { key: 'baby', label: 'Baby changing table' },
    { key: 'unisex', label: 'Gender-neutral' },
    { key: 'noAsk', label: 'No need to ask anyone' },
  ];

  /* ---------- OSM tags ---------- */

  // OSM tags are free text; anything we do not recognise stays `null` = unknown.
  function tri(value, yes, no) {
    if (value == null) return null;
    if (yes.includes(value)) return true;
    if (no.includes(value)) return false;
    return null;
  }

  // OSM tags first; otherwise the address we reverse-geocoded into addresses.js.
  function addressOf(tags, id) {
    const street = tags['addr:street'];
    const number = tags['addr:housenumber'];
    if (street && number) return `${street} ${number}`;
    if (street) return street;
    if (typeof CHISHIKUNEM_ADDRESSES !== 'undefined') return CHISHIKUNEM_ADDRESSES[id] || '';
    return '';
  }

  /* ---------- malls ---------- */

  // Ray casting against the mall outline. Rings are small, so this is plenty.
  function inRing(lat, lon, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [latI, lonI] = ring[i];
      const [latJ, lonJ] = ring[j];
      if ((latI > lat) !== (latJ > lat)
        && lon < ((lonJ - lonI) * (lat - latI)) / (latJ - latI) + lonI) {
        inside = !inside;
      }
    }
    return inside;
  }

  function mallAt(lat, lon) {
    if (typeof CHISHIKUNEM_MALLS === 'undefined') return null;
    return CHISHIKUNEM_MALLS.find((mall) => inRing(lat, lon, mall.ring)) || null;
  }

  /* ---------- places you added yourself ---------- */

  /* Dropped on the map by hand, for somewhere OpenStreetMap has never heard
   * of. Kept in this browser, like your answers, and travelling in the same
   * export — so a place you add is yours until it is published.
   *
   * The id is `added/<timestamp>`, which cannot collide with an OSM id and is
   * easy to recognise: `isAdded` is what tells the pages to leave out the
   * "View on OpenStreetMap" link, since there is nothing there to view. */

  const isAdded = (id) => String(id).startsWith('added/');

  function readAdded() {
    try {
      const raw = JSON.parse(localStorage.getItem(ADDED_KEY) || '{}');
      return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    } catch {
      return {};
    }
  }

  function writeAdded(added) {
    localStorage.setItem(ADDED_KEY, JSON.stringify(added));
  }

  function addPlace({ name, lat, lon }) {
    const added = readAdded();
    const id = `added/${Date.now()}`;
    added[id] = { name: name || 'New place', lat, lon };
    writeAdded(added);
    return id;
  }

  function updateAdded(id, patch) {
    const added = readAdded();
    if (!added[id]) return null;
    added[id] = { ...added[id], ...patch };
    writeAdded(added);
    return added[id];
  }

  function removeAdded(id) {
    const added = readAdded();
    delete added[id];
    writeAdded(added);
  }

  // Same raw shape data.js reads everywhere else, so nothing downstream has to
  // know these came from a tap on the map rather than from Overpass.
  const addedElements = () =>
    Object.entries(readAdded()).map(([id, p]) => ({
      type: 'added',
      id: id.slice('added/'.length),
      lat: p.lat,
      lon: p.lon,
      tags: { name: p.name },
    }));

  // Named branches that keep their own entry despite standing in a mall.
  const mallKeep = new Set(
    typeof CHISHIKUNEM_MALL_KEEP !== 'undefined' ? CHISHIKUNEM_MALL_KEEP : [],
  );

  /* A food court shares one toilet, so a counter inside a mall is not its own
   * entry: drop it and keep the mall's toilet, named after the mall. */
  function applyMalls(places) {
    const kept = [];
    for (const place of places) {
      const mall = mallAt(place.lat, place.lon);
      // A mall stands inside its own outline, but it is not a stall within
      // itself — it is the very thing the shared toilet belongs to.
      const isTheMall = mall != null && mall.id === place.id;
      // Still labelled with the mall it is in, just not folded away.
      if (mall && !isTheMall && !place.isToilet && !mallKeep.has(place.id)) continue;
      if (mall && !isTheMall) {
        place.mall = mall.name;
        if (place.name === 'Public toilet') place.name = `${mall.name} toilet`;
      }
      kept.push(place);
    }
    return kept;
  }

  /* The landmark beside an unnamed toilet. Dropped when it only repeats what
   * the toilet is already called — "KFC (near KFC)" helps nobody. */
  function nearFor(id, isToilet, name, operator) {
    if (!isToilet || typeof CHISHIKUNEM_TOILET_NEAR === 'undefined') return '';
    const near = CHISHIKUNEM_TOILET_NEAR[id];
    if (!near) return '';

    const same = (label) => {
      const a = label.toLowerCase();
      const b = near.toLowerCase();
      return a.includes(b) || b.includes(a);
    };
    if (same(name) || (operator && same(operator))) return '';
    return near;
  }

  function normalise(element) {
    const t = element.tags || {};
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (lat == null || lon == null) return null;

    const isToilet = t.amenity === 'toilets';

    // A venue describes its toilet with `toilets:*`; a public toilet uses the
    // plain keys, because the whole feature *is* the toilet.
    const fee = isToilet ? t.fee : t['toilets:fee'];
    const wheel = isToilet ? t.wheelchair : (t['toilets:wheelchair'] ?? t.wheelchair);
    const unisex = isToilet ? t.unisex : (t['toilets:unisex'] ?? t.unisex);
    const access = isToilet ? t.access : t['toilets:access'];

    const id = `${element.type}/${element.id}`;

    // A standa — a counter you pick a coffee up from, with no room to sit and
    // so no toilet. OSM says so with takeaway-only, no indoor seating, or an
    // outright kiosk tag.
    const kiosk = !isToilet && (t.takeaway === 'only' || t.indoor_seating === 'no'
      || t.building === 'kiosk' || t.shop === 'kiosk');

    const name = t.name || t['name:en'] || (isToilet ? 'Public toilet' : 'Unnamed place');
    const operator = t.operator || '';

    return {
      id,
      kiosk,
      name,
      lat,
      lon,
      isToilet,
      address: addressOf(t, id),
      // Most public toilets in Kentron are unnamed; the operator is often the
      // only human-readable label OSM has for them.
      operator,
      // The named place it stands next to, so "which one is it" has an answer.
      near: nearFor(id, isToilet, name, operator),
      cuisine: t.cuisine ? t.cuisine.split(';')[0].replace(/_/g, ' ') : '',
      // What kind of place it is, kept so the map can rule whole categories
      // out — a bakery counter is not somewhere you use a toilet.
      kind: t.amenity || t.shop || t.leisure || t.tourism || '',
      hours: t.opening_hours || '',
      // Some OSM entries carry a freely-licensed photo URL.
      image: /^https?:\/\//.test(t.image || '') ? t.image : '',
      // A dedicated public toilet always has a toilet; a venue must say so.
      hasToilet: isToilet ? true : tri(t.toilets, ['yes'], ['no']),
      free: tri(fee, ['no'], ['yes']),
      // What it costs, when OSM bothered to say — e.g. "200 AMD".
      charge: (isToilet ? t.charge : t['toilets:charge']) || '',
      wheelchair: tri(wheel, ['yes', 'designated'], ['no']),
      wheelchairLimited: wheel === 'limited',
      baby: tri(t.changing_table, ['yes'], ['no']),
      unisex: tri(unisex, ['yes'], ['no']),
      // "No need to ask": open to anyone, not just paying customers.
      noAsk: tri(access, ['yes', 'public'], ['customers', 'private', 'permissive', 'no']),
      reviewed: false,
      note: '',
    };
  }

  /* ---------- cache ---------- */

  function readCache(key) {
    try {
      const cached = JSON.parse(localStorage.getItem(key) || 'null');
      if (!cached || Date.now() - cached.at > CACHE_TTL) return null;
      return cached.elements;
    } catch {
      return null;
    }
  }

  function writeCache(key, elements) {
    try {
      localStorage.setItem(key, JSON.stringify({ at: Date.now(), elements }));
    } catch {
      // Storage full or blocked — everything works fine without a cache.
    }
  }

  /* ---------- saved confirmations ---------- */

  function readReviews() {
    try {
      return JSON.parse(localStorage.getItem(REVIEW_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function writeReviews(reviews) {
    localStorage.setItem(REVIEW_KEY, JSON.stringify(reviews));
  }

  /* An answer is only worth keeping if it says something.
   *
   * "Not sure" is the option already highlighted before you touch anything, so
   * tapping it is easy to do by accident — and it used to leave a record that
   * marked the place Reviewed while holding no information at all. A review
   * that has been emptied out this way is removed instead, which puts the
   * place back in the queue where it belongs. */
  const saysSomething = (review) => Object.entries(review).some(([key, value]) =>
    key !== 'at' && value !== null && value !== undefined && value !== '');

  function saveReview(id, patch) {
    const reviews = readReviews();
    const merged = { ...reviews[id], ...patch, at: Date.now() };

    if (!saysSomething(merged)) {
      delete reviews[id];
      writeReviews(reviews);
      return {};
    }

    reviews[id] = merged;
    writeReviews(reviews);
    return reviews[id];
  }

  function clearReview(id) {
    const reviews = readReviews();
    delete reviews[id];
    writeReviews(reviews);
  }

  /* Answers approved from the queue, once they have arrived over the network.
   * Empty until then, and empty forever if there is no backend — which is why
   * everything downstream treats it as just one more layer that might be
   * missing rather than something to wait for. */
  let approvedFacts = {};

  function setCloudFacts(map) {
    approvedFacts = map || {};
  }

  // Confirmations beat whatever OpenStreetMap says. Published ones (from
  // confirmed.js) apply for everyone, then answers approved from the queue on
  // top of those; your own, saved on the review page, win over both because
  // you are the one standing in the doorway.
  function applyReviews(places, reviews = readReviews()) {
    const published = typeof CHISHIKUNEM_CONFIRMED !== 'undefined' ? CHISHIKUNEM_CONFIRMED : {};

    for (const place of places) {
      const shared = published[place.id];
      const approved = approvedFacts[place.id];
      const mine = reviews[place.id];
      if (!shared && !approved && !mine) continue;
      const review = { ...shared, ...approved, ...mine };

      for (const { key } of FIELDS) {
        // A key that was never answered is absent, and leaves OSM's answer
        // alone. A key answered "Not sure" is present and null — that is a
        // real answer, and it overrides OSM's claim with "nobody knows".
        if (key in review) place[key] = review[key] ?? null;
      }
      if (review.note) place.note = review.note;
      place.reviewed = true;

      /* Taken off the map by hand: closed down, never existed, or simply not
       * something this map should list. It stays in the review queue, marked,
       * so the decision can be undone — and it travels in the export like any
       * other answer, so it can be published for everyone. */
      place.deleted = review.deleted === true;

      // A confirmed "no toilet" clears facts that only make sense with one.
      if (place.hasToilet === false) {
        place.free = null;
        place.wheelchair = null;
        place.wheelchairLimited = false;
        place.baby = null;
        place.unisex = null;
        place.noAsk = null;
      }
    }
    return places;
  }

  /* ---------- loading ---------- */

  async function fetchElements(query) {
    let lastError;
    for (const endpoint of ENDPOINTS) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: query }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        if (!Array.isArray(json.elements)) throw new Error('unexpected response');
        return json.elements;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? new Error('no endpoint reachable');
  }

  /* Calls `onPlaces` with cached data first (if any), then with fresh data.
   * Throws only when there is nothing at all to show. */
  const duplicates = new Set(
    typeof CHISHIKUNEM_TOILET_DUPLICATES !== 'undefined' ? CHISHIKUNEM_TOILET_DUPLICATES : [],
  );

  /* ---------- hand-added places ---------- */

  /* Overpass only returns fast food and dedicated toilets, so a restaurant or
   * a hotel never arrives on its own. places.js lists those by hand; they join
   * here and are then normalised, reviewed and filtered like anything else. */
  const EXTRA = typeof CHISHIKUNEM_EXTRA !== 'undefined' ? CHISHIKUNEM_EXTRA : [];

  function inBbox(element, [south, west, north, east]) {
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    return lat != null && lon != null
      && lat >= south && lat <= north && lon >= west && lon <= east;
  }

  /* A place somebody has actually been to and answered for is worth showing
   * wherever it stands. The district box is there to stop the whole city
   * arriving unchecked — it was never meant to hide finished work, and it was
   * quietly doing that to Yerevan Mall, which sits 250 m the wrong side of the
   * Kentron line. Confirmed, or answered in this browser, and it is in. */
  function isChecked(element) {
    const id = `${element.type}/${element.id}`;
    const published = typeof CHISHIKUNEM_CONFIRMED !== 'undefined' ? CHISHIKUNEM_CONFIRMED : {};
    return id in published || id in readReviews();
  }

  // Whatever Overpass returned wins, so if one of these ever gets the tags
  // that would have fetched it anyway, the live version is used and the entry
  // in places.js quietly stops mattering.
  function withExtra(elements, bbox) {
    const seen = new Set(elements.map((element) => `${element.type}/${element.id}`));
    const wanted = (element) => inBbox(element, bbox) || isChecked(element);
    const extra = EXTRA.filter((element) =>
      !seen.has(`${element.type}/${element.id}`) && wanted(element));
    // Your own pins go in last and are never deduped away: nothing else can
    // claim an `added/` id.
    const mine = addedElements().filter(wanted);
    return elements.concat(extra, mine);
  }

  /* Kiosks go last, after confirmations: if someone has actually checked one
   * and found a toilet, that beats the tags and it stays. */
  const prepare = (elements, bbox) =>
    applyReviews(applyMalls(withExtra(elements, bbox).map(normalise).filter(Boolean)))
      .filter((place) => !duplicates.has(place.id))
      .filter((place) => !place.kiosk || place.hasToilet === true);

  async function load(onPlaces) {
    // Whichever district is showing when the request goes out. If you switch
    // while it is in flight, this answer is for a district you left — drop it
    // rather than paint Avan's toilets over Kentron's.
    const asked = current;
    const stillWanted = () => current === asked;

    const key = cacheKey(asked.id);
    const cached = readCache(key);
    if (cached) onPlaces(prepare(cached, asked.bbox), true);

    try {
      const elements = await fetchElements(queryFor(asked.bbox));
      if (!stillWanted()) return 'abandoned';
      writeCache(key, elements);
      onPlaces(prepare(elements, asked.bbox), false);
    } catch (error) {
      if (!stillWanted()) return 'abandoned';
      if (!cached) throw error;
      return 'stale';
    }
    return 'fresh';
  }

  /* ---------- links ---------- */

  const streetViewUrl = (p) =>
    `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lon}`;

  const mapsUrl = (p) =>
    `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;

  const osmUrl = (p) => `https://www.openstreetmap.org/${p.id}`;

  // "What's here" on Yandex — opens the place card, which is where its photos are.
  const yandexUrl = (p) =>
    `https://yandex.com/maps/?ll=${p.lon}%2C${p.lat}&z=19&mode=whatshere`
    + `&whatshere%5Bpoint%5D=${p.lon}%2C${p.lat}&whatshere%5Bzoom%5D=19`;

  /* A visitor cannot change what this site says — only the repo can. So the
   * one thing they can do is tell us: this opens a new issue with the place
   * already filled in, leaving them only the part we do not know. */
  const REPO = 'https://github.com/msahakyan524/chishikunem';

  function correctionUrl(place) {
    const said = (value) => (value === true ? 'yes' : value === false ? 'no' : 'not checked');
    const where = [place.address, place.near && `near ${place.near}`].filter(Boolean).join(', ');

    const body = [
      `**Place:** ${place.name}${where ? ` (${where})` : ''}`,
      `**OpenStreetMap:** ${osmUrl(place)}`,
      `**On the map now:** toilet ${said(place.hasToilet)} · free ${said(place.free)}`
      + ` · step-free ${said(place.wheelchair)} · baby table ${said(place.baby)}`
      + ` · gender-neutral ${said(place.unisex)} · no need to ask ${said(place.noAsk)}`,
      '',
      '**What is wrong, and what did you see?**',
      '',
      '',
      '_When were you there?_',
      '',
    ].join('\n');

    return `${REPO}/issues/new?title=${encodeURIComponent(`Correction: ${place.name}`)}`
      + `&body=${encodeURIComponent(body)}`;
  }

  // Photos you add yourself, from photos.js, then any a visitor sent in that
  // has since been approved. Falls back to an OSM image tag.
  function photosFor(place) {
    const own = (typeof CHISHIKUNEM_PHOTOS !== 'undefined' && CHISHIKUNEM_PHOTOS[place.id]) || [];
    const list = [...own];
    const approved = approvedFacts[place.id]?.photo_url;
    if (approved && !list.includes(approved)) list.push(approved);
    if (place.image && !list.includes(place.image)) list.push(place.image);
    return list;
  }

  /* Street-level photos of the spot itself, from KartaView. It is the one
   * street imagery service that will answer a plain browser: no key, and it
   * sends `Access-Control-Allow-Origin: *`, so the visitor's own browser can
   * load the photo directly. Google and Yandex both need a paid key, which a
   * static site has nowhere safe to keep.
   *
   * These are drive-by shots taken from the road, so they show the building
   * the toilet is in, not the toilet. Whatever displays them has to say so. */
  const STREET_KEY = 'chishikunem:street:v1';
  const STREET_TTL = 30 * 24 * 60 * 60 * 1000;
  /* KartaView's Yerevan coverage is patchy — at 80m only about a quarter of
   * the places have anything, at 150m about a third. Widened to 150 and the
   * caption prints the distance, so a photo from down the road is offered as
   * "the street 140m away" rather than passed off as the doorway. */
  const STREET_RADIUS = 150;

  function readStreet() {
    try { return JSON.parse(localStorage.getItem(STREET_KEY)) || {}; } catch { return {}; }
  }

  /* Metres between two nearby points. Over a few hundred metres, treating a
   * degree as a fixed length is accurate to well under a metre. */
  function metresApart(lat1, lon1, lat2, lon2) {
    const dy = (lat1 - lat2) * 111320;
    const dx = (lon1 - lon2) * 111320 * Math.cos((lat1 * Math.PI) / 180);
    return Math.hypot(dx, dy);
  }

  /* Resolves to [{src, metres, year}], nearest first. A miss is cached too —
   * "no camera has been down this street" is a real answer, and reopening a
   * place should not ask again. A network failure is not cached: that one may
   * fix itself. */
  async function streetPhotos(place, limit = 3) {
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lon)) return [];

    const cache = readStreet();
    const hit = cache[place.id];
    if (hit && Date.now() - hit.at < STREET_TTL) return hit.shots;

    let shots = [];
    try {
      const res = await fetch('https://api.openstreetcam.org/2.0/photo/'
        + `?lat=${place.lat}&lng=${place.lon}&radius=${STREET_RADIUS}&itemsPerPage=25`);
      if (!res.ok) return [];
      const body = await res.json();
      shots = ((body.result && body.result.data) || [])
        /* `lth` is KartaView's large thumbnail. Full size is a multi-megabyte
         * dashcam frame — far more than a panel this wide can use. */
        .map((p) => ({
          src: p.imageLthUrl || (p.fileurl || '').replace('{{sizeprefix}}', 'lth'),
          /* The API's own `distance` field comes back as 0.00 for every photo,
           * so it cannot be sorted or captioned with. The coordinates are
           * real, so measure it here instead. */
          metres: Math.round(metresApart(place.lat, place.lon, Number(p.lat), Number(p.lng))),
          year: String(p.shotDate || p.dateAdded || '').slice(0, 4),
        }))
        .filter((s) => s.src && Number.isFinite(s.metres))
        .sort((a, b) => a.metres - b.metres)
        .slice(0, limit);
    } catch {
      return [];
    }

    cache[place.id] = { at: Date.now(), shots };
    try { localStorage.setItem(STREET_KEY, JSON.stringify(cache)); } catch { /* full */ }
    return shots;
  }

  return {
    FIELDS, REVIEW_KEY,
    district,
    normalise, applyMalls, applyReviews, setCloudFacts, load,
    readReviews, writeReviews, saveReview, clearReview,
    isAdded, readAdded, writeAdded, addPlace, updateAdded, removeAdded,
    streetViewUrl, mapsUrl, osmUrl, yandexUrl, correctionUrl,
    photosFor, streetPhotos,
  };
})();
