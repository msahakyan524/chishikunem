/* Confirmations published for everyone.
 *
 * The review page saves what you confirm to your own browser only. Facts that
 * have been checked and published live here instead, so every visitor sees
 * them and they show up in the Excel export.
 *
 * Order of trust, lowest to highest: OpenStreetMap tags, then this file, then
 * whatever you confirmed yourself on the review page.
 *
 * Fields are the same as the review form. Leave a fact out when it is unknown
 * — `null` and a missing key both mean "nobody has checked". A key present and
 * null is different: somebody looked and could not tell.
 */

// Confirmed for the Art Lunch chain: there is a toilet, free, you can walk in
// without asking, it is not step-free and there is no baby changing table.
const ART_LUNCH = {
  hasToilet: true,
  free: true,
  wheelchair: false,
  baby: false,
  unisex: true,
  noAsk: true,
};

const CHISHIKUNEM_CONFIRMED = {
  "node/6466314885": ART_LUNCH,
  "node/6856381086": ART_LUNCH,
  "node/9713061521": ART_LUNCH,
  "node/9822438233": ART_LUNCH,
  "node/10701235664": ART_LUNCH,
  "node/11172049938": ART_LUNCH,
  "node/11427201226": ART_LUNCH,
  "node/11663091346": ART_LUNCH,
  "node/11663326877": ART_LUNCH,
  "node/11767172832": ART_LUNCH,
  "node/14098930672": ART_LUNCH,
  "way/1227579985": ART_LUNCH,

  /* Checked in person, imported from the review page export. */

  "node/10587264426": { hasToilet: true, free: true, wheelchair: false, baby: false, unisex: false, noAsk: false },
  "node/4235346737": { hasToilet: true, free: true, wheelchair: false, baby: false, unisex: true, noAsk: true },
  "node/4675188390": { hasToilet: true, free: true, wheelchair: false, baby: false, unisex: false, noAsk: false },
  "node/5304518321": { hasToilet: true, free: true, wheelchair: false, baby: false, unisex: false, noAsk: false },
  "node/10951676530": { hasToilet: false },
  "node/6435176186": { hasToilet: false },
  "node/9705921709": { hasToilet: false },
  "node/11146456127": { hasToilet: false },
  "node/10204023994": { hasToilet: false },
  "node/12133441793": { hasToilet: true, free: true, wheelchair: false, baby: false, unisex: false, noAsk: false },
  "node/12237288860": { hasToilet: true, free: true, wheelchair: true, baby: false, unisex: false, noAsk: false },
  "node/12459559600": { hasToilet: true, free: true, wheelchair: true, baby: false, unisex: false, noAsk: false },
  "node/11163155327": { hasToilet: true, free: true, wheelchair: true, baby: true, unisex: true, noAsk: true },
  "node/2327059455": { hasToilet: true, free: true, wheelchair: false, baby: false, unisex: false, noAsk: true },
  "node/3501547989": { hasToilet: true, free: true, wheelchair: false, baby: false, unisex: false, noAsk: true },
  /* KFC on Northern Avenue is the one branch where you cannot simply walk in:
   * its own note says the code comes on your receipt, so it stays "ask first".
   * It is off the map anyway, being the paid one. */
  "node/4070832320": { hasToilet: true, free: false, wheelchair: false, baby: false, unisex: false, noAsk: false, note: "need to get a qr on your receipt to use" },
  "node/4299181616": { hasToilet: true, free: true, wheelchair: false, baby: false, unisex: false, noAsk: true },
  "node/10944474125": { hasToilet: true, free: true, wheelchair: false, baby: false, unisex: false, noAsk: false, note: "not always open, usually under \"cleaning\" most of the time. Two actual restrooms, one on the second floor near Bookinist, the other on the first, near Lebanon shawarma" },
  "node/13192306201": { hasToilet: false },
  "node/11361717246": { hasToilet: true, free: true, wheelchair: false, baby: false, unisex: false, noAsk: false, note: "has a period product vending machine" },
  "node/12290806151": { hasToilet: true, free: true, wheelchair: false, baby: false, unisex: false, noAsk: false },
  "node/630743098": { hasToilet: true, free: false, wheelchair: false, baby: false, unisex: false, noAsk: true, note: "Upon entering metro Barekamutyun, to your left, and up the stairs. If you need to be directed, ask the Metro staff. 100 AMD" },
  "node/4506493889": { hasToilet: false },
  "node/4506493989": { hasToilet: false },
  "node/4506494089": { hasToilet: true, free: false, wheelchair: false, baby: false, unisex: false, noAsk: true },
  "node/4984530823": { hasToilet: true, free: false, wheelchair: false, baby: false, unisex: false, noAsk: true, note: "100-200 AMD. English park restroom." },
  "node/4337180789": { hasToilet: true, free: true, wheelchair: false, baby: false, unisex: true, noAsk: true },
  "node/1957098128": { hasToilet: true, free: true, wheelchair: false, baby: false, unisex: true, noAsk: true },
  "node/3687726382": { hasToilet: true, free: true, wheelchair: false, baby: false, unisex: false, noAsk: false },
  "node/10771691834": { hasToilet: true, free: true, wheelchair: true, baby: false, unisex: false, noAsk: false },
  "way/116719155": { hasToilet: true, free: true, wheelchair: true, baby: true, unisex: false, noAsk: false },
  "node/6822559126": { hasToilet: true, free: true, wheelchair: false, baby: false, unisex: true, noAsk: true },
  "node/1456826041": { hasToilet: true, free: true, wheelchair: false, unisex: true, noAsk: true },
  "way/521004015": { hasToilet: true, free: true, wheelchair: false, unisex: false, noAsk: false },
  "way/33292325": { hasToilet: false },
  "node/12363053192": { hasToilet: true, free: true, noAsk: true, unisex: true },
  "node/7284624495": { hasToilet: false },
  "way/1278603834": { hasToilet: true, free: true, wheelchair: false, noAsk: true, unisex: true },
  "node/4401870279": { hasToilet: true, free: true, wheelchair: false, noAsk: true, unisex: true },
  "way/82550823": { hasToilet: true, free: true, wheelchair: false, baby: false, unisex: false, noAsk: false },
  "way/57880951": { hasToilet: false },
  "way/31624086": { hasToilet: true, free: true, wheelchair: true, baby: false, unisex: false, noAsk: false },
  "way/492129643": { hasToilet: true, free: true },
  "node/7044579181": { deleted: true },
  "node/4393174278": { deleted: true },
  "node/3499172433": { hasToilet: true, free: true, unisex: true, noAsk: true },
  "node/3370889934": { hasToilet: true, free: true, unisex: true, noAsk: true },
  "node/6699283886": { hasToilet: false },
  "node/9721260029": { hasToilet: true, free: true },
  "node/11992855929": { hasToilet: false },
  "node/12320786026": { hasToilet: false },
  "node/12691379505": { hasToilet: false },
  "node/13352750896": { hasToilet: false },
  "node/13760687092": { hasToilet: false },
  "way/1511742774": { hasToilet: false },
  "node/12134277270": { hasToilet: true, free: true },
  "way/770806030": { hasToilet: false },
  "node/9634089046": { hasToilet: true, free: true },
  "way/461012212": { hasToilet: true, free: true },
  "node/9921352717": { hasToilet: true, free: true },
  "node/12290317060": { hasToilet: true, free: true },
  "way/366456371": { hasToilet: false },
  "node/3551033516": { hasToilet: true, free: true, unisex: true, noAsk: true },
  "node/9743330443": { hasToilet: true, free: true, unisex: true, noAsk: true },
  "node/12556362974": { hasToilet: true, free: true, unisex: true, noAsk: true },
  "node/13651988598": { hasToilet: true, free: true },

  /* The toilet by Tumo on Halabyan: separate men's and women's, step-free,
   * and you can walk straight in. */
  "added/tumo": { hasToilet: true, free: true, wheelchair: true, baby: false, unisex: false, noAsk: true },

  /* Yerevan Mall's bathrooms: separate men's and women's, and step-free.
   *
   * Free is not something that was said out loud — it is taken from the fact
   * that this map lists nothing else, so adding a place to it means saying it
   * costs nothing. Worth correcting if that is wrong. */
  "way/33771226": { hasToilet: true, free: true, wheelchair: true, unisex: false },
};
