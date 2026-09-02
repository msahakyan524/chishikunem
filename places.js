/* Places added by hand.
 *
 * The Overpass query in data.js only asks for two things: named fast food and
 * dedicated public toilets. That misses whole categories that plainly do have
 * a toilet worth knowing about — a sit-down restaurant, a hotel lobby, a
 * supermarket food court. Widening the query would drag in every café in
 * Yerevan unchecked, which is the opposite of what this map is for.
 *
 * So places are added here one at a time, on purpose. Each one still has to be
 * reviewed on review.html before it reaches the map: nothing here claims a
 * toilet exists, it only claims the place is worth walking up to and looking.
 *
 * Shape is a raw OpenStreetMap element, because that is what data.js already
 * knows how to read. Keep the real OSM type and id — that keeps "View on
 * OpenStreetMap" and the correction link working, and lets a real OSM entry
 * take over automatically if the tags ever improve.
 *
 * `name` is the English form on purpose: this site is written in English, and
 * data.js prefers `name` over `name:en`. Where a chain has several branches in
 * one district, the street goes in the name too — a list of four rows all
 * reading "SAS Food Court" tells you nothing about which one you are near.
 *
 * Only tags that describe the place itself are copied over. A venue-level
 * `wheelchair=yes` is deliberately left out: it says the building is step-free,
 * which is not the same as the toilet being step-free, and it would pre-fill
 * the review form with an answer nobody has actually checked.
 */

const CHISHIKUNEM_EXTRA = [
  /* Around Republic Square. Mr.Gyros and the SAS food court sit on King Pap
   * Street a minute apart; Ramada is round the corner on Pavstos Buzand.
   * Addresses come from addresses.js, reverse-geocoded like the rest.
   * (Sherep, node/5299493124, was here and has been taken off.) */

  {
    type: 'node',
    id: 9634089058,
    lat: 40.1789626,
    lon: 44.5108827,
    tags: {
      name: 'Mr.Gyros (King Pap)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'restaurant',
      cuisine: 'greek',
      opening_hours: '09:30-24:00',
    },
  },

  {
    type: 'node',
    id: 12134277270,
    lat: 40.1797422,
    lon: 44.5117968,
    tags: {
      name: 'Ramada',
      tourism: 'hotel',
    },
  },

  /* Every SAS food court in Yerevan.
   *
   * Two more exist that are not listed here — Mesrop Mashtots (node/9634089046)
   * and Halabyan (node/10156081817). Both are tagged `amenity=fast_food`, so
   * Overpass already returns them and they are in the review queue on their
   * own. Adding them here would be dead weight: withExtra() drops an entry the
   * moment Overpass returns the same id. */

  {
    type: 'node',
    id: 9921352717,
    lat: 40.179268,
    lon: 44.509813,
    tags: {
      name: 'SAS Food Court (King Pap)',
      amenity: 'restaurant',
    },
  },

  {
    type: 'node',
    id: 12290317060,
    lat: 40.1719012,
    lon: 44.5186502,
    tags: {
      name: 'SAS Food Court (Yervand Kochar)',
      amenity: 'cafe',
      opening_hours: 'Mo-Su 09:00-01:00',
    },
  },

  // A building rather than a point, so its coordinates arrive as `center` —
  // the same shape Overpass sends for a way, which normalise() already reads.
  {
    type: 'way',
    id: 461012212,
    center: { lat: 40.166132, lon: 44.5060659 },
    tags: {
      name: 'SAS Food Court (Arshakunyats)',
      amenity: 'food_court',
      opening_hours: '09:00-01:00',
    },
  },

  {
    type: 'node',
    id: 4909509523,
    lat: 40.2064549,
    lon: 44.514376,
    tags: {
      name: 'SAS Food Court (Komitas)',
      amenity: 'food_court',
      opening_hours: 'Mo-Su 09:00-00:00',
    },
  },

  {
    type: 'node',
    id: 11365834510,
    lat: 40.1770419,
    lon: 44.4450533,
    tags: {
      name: 'SAS Food Court (Zoravar Andranik)',
      amenity: 'food_court',
    },
  },

  /* Yerevan State University, the main building on Alek Manukyan 1.
   *
   * OpenStreetMap maps the faculties as separate points sitting on this same
   * building and address — physics, maths, informatics, sociology, law,
   * chemistry, international relations, geography. One address, one entry, so
   * they are not listed individually. The faculties with their own building
   * and their own number are a different matter and are not covered here:
   * biology at 1/3 (way/31868908), 1/4 (way/31868909), and romance and
   * germanic philology (node/12137419799). */

  {
    type: 'way',
    id: 492129643,
    center: { lat: 40.1815714, lon: 44.5264267 },
    tags: {
      name: 'Yerevan State University (Alek Manukyan 1)',
      amenity: 'university',
    },
  },

  /* Grand Candy — the Ponchikanots below Matenadaran, and 3rd massiv.
   *
   * OpenStreetMap maps the Matenadaran one twice, 7 m apart in the same
   * building: the 1963 Ponchikanots cafe at Mashtots 54, and a Grand Candy
   * shop counter with its own shorter hours. One address, one entry — the
   * cafe is kept, because that is the half with somewhere to sit and
   * therefore the half with a toilet. The shop is node/4683889191. */

  {
    type: 'node',
    id: 1456826041,
    lat: 40.1902325,
    lon: 44.5191253,
    tags: {
      name: 'Grand Candy Ponchikanots (Mashtots 54)',
      amenity: 'cafe',
      opening_hours: 'Mo-Su 9:00-21:00',
    },
  },

  {
    type: 'node',
    id: 9695256592,
    lat: 40.1518541,
    lon: 44.4835522,
    tags: {
      name: 'Grand Candy (3rd massiv)',
      shop: 'confectionery',
      opening_hours: '10:00-20:00',
    },
  },

  /* KFC and Pizza Hut are deliberately absent from this file.
   *
   * All eleven KFCs are tagged `amenity=fast_food`, so Overpass already
   * returns them. Five stand inside a mall and are dropped in favour of that
   * mall's own toilet — Dalma Garden, Pak Shuka, Yerevan Mall, Rio Mall — so
   * seven reach the queue.
   *
   * Every one of the four Pizza Huts stands 6-25 m from a KFC, sharing the
   * building and therefore the toilet: Northern Avenue 1, Komitas 5,
   * Arshakunyats 34 and Mesrop Mashtots. One address, one entry — so the KFC
   * is kept and the Pizza Hut left off. Two of the four are inside a mall
   * anyway (Yerevan Mall and Pak Shuka). Three are tagged `restaurant`, which
   * Overpass does not fetch, so leaving them out of this file is all it takes;
   * the fourth is dropped by the mall rule. */

  /* Every Tashir Pizza in Yerevan, all 23 of them minus the five below.
   *
   * OpenStreetMap spells the chain "Տաշիր պիցցա" and tags each branch
   * restaurant or cafe, so none of them is fetched by the Overpass query.
   * The street is in each name because Kentron alone has eight.
   *
   * `toilets:unisex: yes` on every branch: the chain's toilets are
   * gender-neutral. This sits with the tags rather than in confirmed.js so it
   * does not mark a branch "checked in person" when nobody has been yet.
   *
   * Five are left out on purpose — they sit inside a mall outline, where
   * applyMalls() drops the counter and keeps the mall's own toilet instead:
   * Movses Khorenatsi 33 (Tashir Mall), Tsitsernakaberd Highway 3 (Dalma
   * Garden), Mesrop Mashtots 5 (Pak Shuka), Avetik Isahakyan 22/10
   * (Metronome) and Vahram Papazyan 8 (Rio Mall). Listing them here would add
   * rows that get thrown away. */

  {
    type: 'node',
    id: 7046467110,
    lat: 40.1417894,
    lon: 44.5192905,
    tags: {
      name: 'Tashir Pizza (Erebuni 14)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'restaurant',
      cuisine: 'pizza',
      opening_hours: 'Mo-Sa 10:00-23:00; Su 11:00-23:00',
    },
  },

  {
    type: 'node',
    id: 4892324561,
    lat: 40.1960437,
    lon: 44.5682575,
    tags: {
      name: 'Tashir Pizza (Gai 16/45)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'restaurant',
      cuisine: 'pizza',
      opening_hours: 'Mo-Su 10:00-22:00',
    },
  },

  {
    type: 'node',
    id: 3551046029,
    lat: 40.1522011,
    lon: 44.4954666,
    tags: {
      name: 'Tashir Pizza (Garegin Nzhdeh 27/4)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'restaurant',
      cuisine: 'pizza',
      opening_hours: 'Mo-Su 10:00-00:00',
    },
  },

  {
    type: 'node',
    id: 962312484,
    lat: 40.1761559,
    lon: 44.5141671,
    tags: {
      name: 'Tashir Pizza (Hanrapetutyan 37)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'restaurant',
      cuisine: 'pizza',
      opening_hours: 'Mo-Su 10:00-00:00',
    },
  },

  {
    type: 'node',
    id: 4779338211,
    lat: 40.1802095,
    lon: 44.5242368,
    tags: {
      name: 'Tashir Pizza (Khanjyan 50)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'restaurant',
      cuisine: 'pizza',
      opening_hours: 'Mo-Su 10:00-00:00',
    },
  },

  {
    type: 'node',
    id: 4042499385,
    lat: 40.2064239,
    lon: 44.5247512,
    tags: {
      name: 'Tashir Pizza (Komitas 63)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'restaurant',
      cuisine: 'pizza',
      opening_hours: 'Mo-Su 10:00-00:00',
    },
  },

  {
    type: 'node',
    id: 7044579181,
    lat: 40.16278,
    lon: 44.5061278,
    tags: {
      name: 'Tashir Pizza (Kristapor 4)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'restaurant',
      cuisine: 'pizza',
      opening_hours: 'Mo-Su 11:00-11:00',
    },
  },

  {
    type: 'node',
    id: 9743330443,
    lat: 40.1823608,
    lon: 44.5093152,
    tags: {
      name: 'Tashir Pizza (Mashtots)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'restaurant',
      cuisine: 'pizza',
      opening_hours: 'Mo-Sa 10:00-24:00; Su 11:00-24:00',
    },
  },

  {
    type: 'node',
    id: 3551033516,
    lat: 40.1890308,
    lon: 44.5181007,
    tags: {
      name: 'Tashir Pizza (Mashtots 50)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'restaurant',
      cuisine: 'pizza',
      opening_hours: 'Mo-Su 10:00-00:00',
    },
  },

  {
    type: 'node',
    id: 12006479849,
    lat: 40.2098711,
    lon: 44.4640215,
    tags: {
      name: 'Tashir Pizza (Mazmanian)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'restaurant',
      cuisine: 'pizza',
    },
  },

  {
    type: 'node',
    id: 4393174278,
    lat: 40.174327,
    lon: 44.5103695,
    tags: {
      name: 'Tashir Pizza (Movses Khorenatsi 17)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'restaurant',
      cuisine: 'pizza',
      opening_hours: 'Mo-Su 10:00-00:00',
    },
  },

  {
    type: 'node',
    id: 3370889934,
    lat: 40.1807912,
    lon: 44.5142861,
    tags: {
      name: 'Tashir Pizza (Northern Avenue 18)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'restaurant',
      cuisine: 'pizza',
      opening_hours: 'Mo-Su 10:00-00:00',
    },
  },

  {
    type: 'node',
    id: 3551068958,
    lat: 40.1733822,
    lon: 44.4453078,
    tags: {
      name: 'Tashir Pizza (Raffi)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'restaurant',
      cuisine: 'pizza',
    },
  },

  {
    type: 'node',
    id: 3499172433,
    lat: 40.186376,
    lon: 44.5184641,
    tags: {
      name: 'Tashir Pizza (Teryan 69)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'restaurant',
      cuisine: 'pizza',
      opening_hours: 'Mo-Su 10:00-00:00',
    },
  },

  {
    type: 'node',
    id: 12556362974,
    lat: 40.1682835,
    lon: 44.513691,
    tags: {
      name: 'Tashir Pizza (Tigran Mets 31A)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'restaurant',
      cuisine: 'pizza',
      opening_hours: 'Mo-Fr 10:00-23:00; Sa-Su 11:00-23:00',
    },
  },

  {
    type: 'node',
    id: 3551073324,
    lat: 40.2186133,
    lon: 44.4894876,
    tags: {
      name: 'Tashir Pizza (Tigran Petrosyan 9/5)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'restaurant',
      cuisine: 'pizza',
      opening_hours: 'Mo-Su 10:00-00:00',
    },
  },

  {
    type: 'node',
    id: 3551072093,
    lat: 40.2052872,
    lon: 44.5013222,
    tags: {
      name: 'Tashir Pizza (Vahram Papazyan 21)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'cafe',
      cuisine: 'pizza',
      opening_hours: 'Mo-Su 10:00-00:00',
    },
  },

  {
    type: 'node',
    id: 5840226886,
    lat: 40.1762522,
    lon: 44.4459832,
    tags: {
      name: 'Tashir Pizza (Zoravar Andranik 51/7)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'cafe',
      cuisine: 'pizza',
      opening_hours: 'Mo-Su 10:00-00:00',
    },
  },

  /* Every shopping mall in Yerevan.
   *
   * A mall is worth its own entry even when the counters inside it are
   * suppressed: the shared toilet belongs to the mall, so the mall is the
   * thing you walk towards. Eight of these already had an outline in
   * malls.js; that file decides which stalls get folded away, and says
   * nothing about the mall being reviewable, which is what these do.
   *
   * The seven without an outline — Yerevan Mall, Megamall Armenia, Rio Mall,
   * Malatia Mall, Kidz Mall, Palace Trade Center, Erebuni Mall — do not fold
   * their counters away yet. Rio Mall is the clearest case: the KFC and the
   * Tashir Pizza both listed at Vahram Papazyan 8 are inside it.
   *
   * Not included: the four Domus branches and Tun Depot, which OSM tags
   * shop=mall but which are construction hypermarkets, not shopping centres. */

  {
    type: 'way',
    id: 116719155,
    center: { lat: 40.1794003, lon: 44.4880012 },
    tags: {
      name: 'Dalma Garden Mall',
      shop: 'mall',
      opening_hours: 'Mo-Su 10:00-22:00',
    },
  },

  {
    type: 'way',
    id: 820244230,
    center: { lat: 40.1426337, lon: 44.5209684 },
    tags: {
      name: 'Erebuni Mall',
      shop: 'mall',
    },
  },

  {
    type: 'node',
    id: 9272287048,
    lat: 40.169792,
    lon: 44.4372777,
    tags: {
      name: 'Kidz Mall',
      shop: 'mall',
    },
  },

  {
    type: 'way',
    id: 406847498,
    center: { lat: 40.171257, lon: 44.4571033 },
    tags: {
      name: 'Malatia Mall',
      shop: 'mall',
    },
  },

  {
    type: 'way',
    id: 564447937,
    center: { lat: 40.1970701, lon: 44.5668209 },
    tags: {
      name: 'Megamall Armenia',
      shop: 'mall',
      opening_hours: 'Mo-Su 10:00-22:00',
    },
  },

  {
    type: 'way',
    id: 521004015,
    center: { lat: 40.1864093, lon: 44.5220326 },
    tags: {
      name: 'Metronome',
      shop: 'mall',
      opening_hours: 'Mo-Su 10:00-22:00',
    },
  },

  {
    type: 'way',
    id: 82550823,
    center: { lat: 40.1786825, lon: 44.5039267 },
    tags: {
      name: 'Pak Shuka',
      shop: 'mall',
    },
  },

  {
    type: 'way',
    id: 168024588,
    center: { lat: 40.1986814, lon: 44.5657149 },
    tags: {
      name: 'Palace Trade Center',
      shop: 'mall',
    },
  },

  {
    type: 'way',
    id: 57880951,
    center: { lat: 40.1624456, lon: 44.5072107 },
    tags: {
      name: 'Petak',
      shop: 'mall',
    },
  },

  {
    type: 'way',
    id: 770806030,
    center: { lat: 40.1627211, lon: 44.5078528 },
    tags: {
      name: 'Rich Plaza',
      shop: 'mall',
    },
  },

  {
    type: 'way',
    id: 50900022,
    center: { lat: 40.2015288, lon: 44.5049035 },
    tags: {
      name: 'Rio Mall',
      shop: 'mall',
      opening_hours: 'Mo-Su 10:00-22:00',
    },
  },

  {
    type: 'way',
    id: 31624086,
    center: { lat: 40.1720107, lon: 44.5128783 },
    tags: {
      name: 'Rossia Mall',
      shop: 'mall',
      opening_hours: 'Mo-Su 10:00-22:00',
    },
  },

  {
    type: 'way',
    id: 366456371,
    center: { lat: 40.1644196, lon: 44.505825 },
    tags: {
      name: 'Surmalu',
      shop: 'mall',
    },
  },

  {
    type: 'way',
    id: 31651859,
    center: { lat: 40.1687411, lon: 44.5147898 },
    tags: {
      name: 'Tashir Mall',
      shop: 'mall',
      opening_hours: 'Mo-Su 10:00-20:00',
    },
  },

  {
    type: 'way',
    id: 33771226,
    center: { lat: 40.1556475, lon: 44.4991078 },
    tags: {
      name: 'Yerevan Mall',
      shop: 'mall',
      opening_hours: 'Mo-Su 10:00-22:00',
    },
  },

  /* Every Mr.Gyros in Yerevan that is not inside a mall.
   *
   * Four are excluded because they stand inside a mall outline, where the
   * shared toilet belongs to the mall: Dalma Garden (node/7284459716), Rio
   * Mall (node/7284486426), Metronome (node/7284624495) and Yerevan Mall
   * (node/11311349560).
   *
   * Four more are not here because Overpass already fetches them as named
   * fast food: Teryan 62, Komitas 59/6, Tumanyan 21/1 and Avetis Aharonyan
   * (node/8729044724, which needed an address before it could be reviewed).
   *
   * The Baghramyan branch is the odd one — OpenStreetMap gives it a brand and
   * a website but no `name`, so the query that looks for named fast food
   * walks straight past it. It only appears because it is listed here. */

  {
    type: 'node',
    id: 12363053192,
    lat: 40.19182,
    lon: 44.5054,
    tags: {
      name: 'Mr.Gyros (Baghramyan 23)',
      amenity: 'fast_food',
      cuisine: 'greek',
    },
  },

  {
    type: 'node',
    id: 4401870279,
    lat: 40.17736,
    lon: 44.51856,
    tags: {
      name: 'Mr.Gyros (Vardanants 10)',
      amenity: 'restaurant',
      cuisine: 'greek',
    },
  },

  {
    type: 'way',
    id: 1278603834,
    center: { lat: 40.18669, lon: 44.51176 },
    tags: {
      name: 'Mr.Gyros (Tumanyan 40)',
      amenity: 'restaurant',
      cuisine: 'greek',
    },
  },

  {
    type: 'node',
    id: 5844371087,
    lat: 40.17642,
    lon: 44.44599,
    tags: {
      name: 'Mr.Gyros (Zoravar Andranik 51/7)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'restaurant',
      cuisine: 'greek',
    },
  },

  {
    type: 'node',
    id: 7284404407,
    lat: 40.20395,
    lon: 44.53531,
    tags: {
      name: 'Mr.Gyros (Avetis Aharonyan 12/5)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'restaurant',
      cuisine: 'greek',
    },
  },

  {
    type: 'node',
    id: 7284704717,
    lat: 40.19774,
    lon: 44.56747,
    tags: {
      name: 'Mr.Gyros (Gai 14/3)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'restaurant',
      cuisine: 'greek',
    },
  },

  /* Dodo Pizza. OpenStreetMap knows of only two branches in Yerevan, and this
   * is the one it tags `restaurant`, so the query never fetches it. The other,
   * on Vardanants (node/11163155327), is tagged `amenity=fast_food` with a
   * name and an address, so it already reaches the queue on its own.
   *
   * Checked against every pizza place in Yerevan, not just the name: the same
   * cross-check is what turned up the 22 Tashir branches hiding behind the
   * Armenian spelling. Dodo really is mapped twice and no more. */

  {
    type: 'node',
    id: 5813963716,
    lat: 40.206556,
    lon: 44.5126278,
    tags: {
      name: 'Dodo Pizza (Komitas 48)',
      amenity: 'restaurant',
      cuisine: 'pizza',
      opening_hours: 'Mo-Th 10:00-23:00; Fr-Su: 10:00-00:00',
    },
  },

  /* Missak Manouchian Park, the garden around the Zeytuna restaurant on Aram
   * street. OpenStreetMap has no toilet mapped inside it — the two nearest
   * public toilets, on Aram street and Northern Avenue, both fall outside the
   * outline — so whether this one has anything is an open question worth
   * walking over to settle.
   *
   * OSM's `name:en` is the literal "Park after Missak Manouchian", a calque of
   * the Armenian. The plain English form is used instead, as everywhere else
   * in this file. */

  {
    type: 'way',
    id: 33292325,
    center: { lat: 40.1817066, lon: 44.5099576 },
    tags: {
      name: 'Missak Manouchian Park',
      leisure: 'park',
    },
  },

  /* Dors, the craft beer pub on King Pap Street. Tagged `amenity=pub`, which
   * the Overpass query does not ask for, so it only appears because it is
   * listed here. OpenStreetMap styles the name in lower case, "dors"; the
   * capitalised form is used so it does not look like a mistake in a list of
   * proper names. */

  {
    type: 'node',
    id: 6822559126,
    lat: 40.1803934,
    lon: 44.5108295,
    tags: {
      name: 'Dors',
      amenity: 'pub',
      opening_hours: '11:00-24:00',
    },
  },

  /* The two Mr.Gyros branches that stand inside a mall.
   *
   * applyMalls() would normally fold these away — a food court shares one
   * toilet, so listing every counter sends people to the same door twice. They
   * are exempted below because they were asked for by name, and because the
   * mall toilets here turn out not to be one shared thing: Dalma Garden alone
   * has three, checked separately. */

  {
    type: 'node',
    id: 7284624495,
    lat: 40.18655,
    lon: 44.52238,
    tags: {
      name: 'Mr.Gyros (Metronome)',
      amenity: 'restaurant',
      cuisine: 'greek',
    },
  },

  {
    type: 'node',
    id: 7284459716,
    lat: 40.18008,
    lon: 44.48742,
    tags: {
      name: 'Mr.Gyros (Dalma Garden)',
      'toilets:unisex': 'yes',
      'toilets:access': 'yes',
      amenity: 'restaurant',
      cuisine: 'greek',
    },
  },

  /* Star Gym Premier, Alek Manukyan 9 — the building the British Council and
   * the WHO office share. Tagged `leisure=fitness_centre`, which the Overpass
   * query does not ask for, so it appears only because it is listed here. */

  {
    type: 'node',
    id: 5287192822,
    lat: 40.17664,
    lon: 44.52453,
    tags: {
      name: 'Star Gym Premier (Alek Manukyan 9)',
      leisure: 'fitness_centre',
    },
  },

  /* A toilet by Tumo, on Halabyan. OpenStreetMap does not have it, so it
   * carries an `added/` id rather than an OSM one — the same shape a pin
   * dropped on the review map gets — and nothing tries to link it to a page
   * that is not there. Its facts are published in confirmed.js.
   *
   * The coordinates are the centre of the four pins dropped by hand near Tumo
   * Labs, which were all the same place tried four times. */

  {
    type: 'added',
    id: 'tumo',
    lat: 40.1934163,
    lon: 44.4799646,
    tags: {
      name: 'Toilet near Tumo (Halabyan)',
      amenity: 'toilets',
    },
  },
];

/* Inside a mall outline, but listed anyway.
 *
 * The mall rule in data.js exists so a food court is not enumerated one
 * counter at a time. These are the exceptions: named branches asked for
 * specifically, which keep their own entry while everything else inside the
 * same outline is still folded away. */
const CHISHIKUNEM_MALL_KEEP = [
  "node/7284624495", // Mr.Gyros inside Metronome
  "node/7284459716", // Mr.Gyros inside Dalma Garden

];