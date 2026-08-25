/* Shared data layer for Chishikunem.
 *
 * Both the map (app.js) and the review page (review.js) load the same places
 * from OpenStreetMap and the same locally-saved confirmations, so a fact you
 * confirm once shows up in both.
 */

const Chishikunem = (() => {
  // Kentron district's real bounds, from OSM relation 13404218, rounded
  // outwards. [south, west, north, east]
  //
  // This is the bounding box, not the district outline, so a few places just
  // outside Kentron creep in. That is deliberate: including a neighbour is far
  // cheaper than hiding a toilet that is actually in Kentron.
  const BBOX = [40.1579, 44.4791, 40.1985, 44.5480];

  const ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];

  const CACHE_KEY = 'chishikunem:osm:v1';
  const REVIEW_KEY = 'chishikunem:reviews:v1';
  const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

  const QUERY = `[out:json][timeout:60];
(
  nwr["amenity"="fast_food"]["name"](${BBOX.join(',')});
  nwr["amenity"="toilets"](${BBOX.join(',')});
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

  /* A food court shares one toilet, so a counter inside a mall is not its own
   * entry: drop it and keep the mall's toilet, named after the mall. */
  function applyMalls(places) {
    const kept = [];
    for (const place of places) {
      const mall = mallAt(place.lat, place.lon);
      if (mall && !place.isToilet) continue;
      if (mall) {
        place.mall = mall.name;
        if (place.name === 'Public toilet') place.name = `${mall.name} toilet`;
      }
      kept.push(place);
    }
    return kept;
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

    return {
      id,
      kiosk,
      name: t.name || t['name:en'] || (isToilet ? 'Public toilet' : 'Unnamed place'),
      lat,
      lon,
      isToilet,
      address: addressOf(t, id),
      // Most public toilets in Kentron are unnamed; the operator is often the
      // only human-readable label OSM has for them.
      operator: t.operator || '',
      cuisine: t.cuisine ? t.cuisine.split(';')[0].replace(/_/g, ' ') : '',
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

  function readCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!cached || Date.now() - cached.at > CACHE_TTL) return null;
      return cached.elements;
    } catch {
      return null;
    }
  }

  function writeCache(elements) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), elements }));
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

  function saveReview(id, patch) {
    const reviews = readReviews();
    reviews[id] = { ...reviews[id], ...patch, at: Date.now() };
    writeReviews(reviews);
    return reviews[id];
  }

  function clearReview(id) {
    const reviews = readReviews();
    delete reviews[id];
    writeReviews(reviews);
  }

  // Confirmations beat whatever OpenStreetMap says. Published ones (from
  // confirmed.js) apply for everyone; your own, saved on the review page, win
  // over those because you are the one standing in the doorway.
  function applyReviews(places, reviews = readReviews()) {
    const published = typeof CHISHIKUNEM_CONFIRMED !== 'undefined' ? CHISHIKUNEM_CONFIRMED : {};

    for (const place of places) {
      const shared = published[place.id];
      const mine = reviews[place.id];
      if (!shared && !mine) continue;
      const review = { ...shared, ...mine };

      for (const { key } of FIELDS) {
        if (review[key] === true || review[key] === false) place[key] = review[key];
      }
      if (review.note) place.note = review.note;
      place.reviewed = true;

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

  async function fetchElements() {
    let lastError;
    for (const endpoint of ENDPOINTS) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: QUERY }),
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
  /* Kiosks go last, after confirmations: if someone has actually checked one
   * and found a toilet, that beats the tags and it stays. */
  const prepare = (elements) =>
    applyReviews(applyMalls(elements.map(normalise).filter(Boolean)))
      .filter((place) => !place.kiosk || place.hasToilet === true);

  async function load(onPlaces) {
    const cached = readCache();
    if (cached) onPlaces(prepare(cached), true);

    try {
      const elements = await fetchElements();
      writeCache(elements);
      onPlaces(prepare(elements), false);
    } catch (error) {
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

  // Photos you add yourself, from photos.js. Falls back to an OSM image tag.
  function photosFor(place) {
    const own = (typeof CHISHIKUNEM_PHOTOS !== 'undefined' && CHISHIKUNEM_PHOTOS[place.id]) || [];
    const list = [...own];
    if (place.image && !list.includes(place.image)) list.push(place.image);
    return list;
  }

  return {
    BBOX, FIELDS, REVIEW_KEY,
    normalise, applyMalls, applyReviews, load,
    readReviews, writeReviews, saveReview, clearReview,
    streetViewUrl, mapsUrl, osmUrl, yandexUrl, photosFor,
  };
})();
