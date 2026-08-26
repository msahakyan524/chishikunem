/* What each unnamed public toilet stands next to.
 *
 * Almost no public toilet in Kentron has a name, and a street alone does not
 * tell you where to look. These are the nearest named place within 60 m, taken
 * once from OpenStreetMap, and shown as "near X" beside the title.
 *
 * "Near" means just that — the toilet is a separate feature, not that shop's
 * toilet. Ones that ARE a venue's own toilet are listed as duplicates below
 * and dropped, because the venue is already on the map in its own right.
 *
 * A snapshot: regenerate if the toilet list changes.
 */

const CHISHIKUNEM_TOILET_NEAR = {
  "node/10002944673": "Coffee Inn Company",
  "node/10053069274": "Pulpulak",
  "node/10542631287": "The food corner",
  "node/10700384068": "Daniel",
  "node/10983725678": "Թիմ Թայմ",
  "node/10995778144": "Jazzve",
  "node/11296124090": "Տաշիր պիցցա",
  "node/11887674307": "Արևիկ",
  "node/11992855929": "Ground Zero",
  "node/12320786026": "Բարդիներ",
  "node/12363251938": "Օղակաձև զբոսայգի",
  "node/12691379505": "Ցեղասպանության թանգարան",
  "node/13161536428": "Veranda",
  "node/13352750896": "Red bridge Hotel",
  "node/1342409435": "Մեղեդի",
  "node/4506493889": "Partez",
  "node/4506493989": "KFC",
  "node/4506494089": "Hrachya Acharyan University",
  "node/4683888991": "Կարապ",
  "node/5236286131": "Աբովյանի պուրակ",
  "node/5837699234": "Շահումյանի պուրակ",
  "node/6035885916": "Սրճարան",
  "node/6035885920": "Կենտրոնական Ավտոկայարան",
  "node/630743098": "Ծիրան",
  "node/6435175887": "Bread and meat",
  "node/6699283886": "Lebanon Shawarma",
  "node/718207068": "Kith & Kin",
  "node/7183807261": "ԶԱԶԱ",
  // Metronome's upper toilet (level -1). It falls just outside the mall outline
  // OSM draws, so the mall rule cannot name it — labelled by hand instead.
  "node/9688117707": "Metronome",
  "node/975255482": "Atmosphere",
  "way/1343267712": "Sorpreso coffee",
  "way/1511742774": "Հայաստանի Ազգային Գրադարան",
  "way/221633210": "Նոստալգիա",
};

// Mapped twice: once as the venue, once as a toilet a few metres away.
const CHISHIKUNEM_TOILET_DUPLICATES = [
  "node/10878281809", // the toilet mapped for Art Lunch
  "node/11663326876", // the toilet mapped for Art Lunch
  "node/4506493989",  // the toilet mapped for KFC by Metronome, 13 m away
];
