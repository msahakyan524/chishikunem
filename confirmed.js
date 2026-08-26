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
 * — `null` and a missing key both mean "nobody has checked".
 */

// Confirmed for the Art Lunch chain: there is a toilet, you can walk in
// without asking, it is not step-free and there is no baby changing table.
// Whether it is free and whether it is gender-neutral are still unchecked.
const ART_LUNCH = {
  hasToilet: true,
  wheelchair: false,
  baby: false,
  noAsk: true,
};

const CHISHIKUNEM_CONFIRMED = {
  "node/4235346737": ART_LUNCH,
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

  /* Around YSU and Alek Manukyan, checked in person.
   * Nothing is said about step-free access, baby tables or gender-neutral
   * here, so those stay unchecked rather than being guessed at. */

  // Metronome, two toilets on different floors — this one on level -2.
  "node/10944474125": { hasToilet: true, free: true },
  // ...and this one on level -1. See the note in landmarks.js.
  "node/9688117707": { hasToilet: true, free: true },
  // KFC by Metronome. Its toilet is mapped separately 13 m away, which
  // landmarks.js folds into this entry so the pair shows up once.
  "node/3501547989": { hasToilet: true, free: true },
};
