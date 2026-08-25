/* Street addresses for toilets that OpenStreetMap has no address tags for.
 *
 * Reverse-geocoded once from each place's coordinates via Nominatim and saved
 * here, so the site never calls a geocoder at page load. Key = OSM id.
 *
 * A real `addr:street` tag in OSM always wins over this list. Entries reading
 * "near X" are approximate: the nearest named area, not a doorway.
 *
 * Regenerate only if the toilet list changes; Nominatim allows 1 request/sec.
 */

const CHISHIKUNEM_ADDRESSES = {
  "node/10002944673": "Freedom Square",
  "node/10053069274": "Nalbandyan street",
  "node/10204023995": "Agatangeghos street",
  "node/10542631287": "Northern Avenue",
  "node/10700384068": "Zakian street 1st lane",
  "node/10771691834": "Movses Khorenatsi street",
  "node/10878281809": "Architects street",
  "node/10944474125": "Avetik Isahakyan street 22/8",
  "node/10977638381": "Saralanj Highway",
  "node/10983725678": "Zakian street",
  "node/10995778144": "Tumanyan street",
  "node/11296124090": "Kristapor street",
  "node/11337918097": "Kievyan street",
  "node/11361717246": "Mesrop Mashtots Avenue 5",
  "node/11663326876": "Alek Manukyan street",
  "node/11887674307": "Babayan street",
  "node/11992855929": "Aram street",
  "node/12133441793": "Tsitsernakaberd Highway 3",
  "node/12237288860": "Tsitsernakaberd Highway 3",
  "node/12320786026": "Hrazdan Gorge street 71",
  "node/12363251938": "Moskovyan street",
  "node/12459559600": "Tsitsernakaberd Highway 3",
  "node/12691379505": "Tsitsernakaberd Highway",
  "node/13161536428": "Khanjyan street",
  "node/13352750896": "Կարմիր կամուրջ",
  "node/1342409435": "Tumanyan street",
  "node/13760687092": "Argishti street",
  "node/4506493889": "Avetik Isahakyan street",
  "node/4506493989": "Moskovyan street 17/3",
  "node/4506494089": "Moskovyan street 3a",
  "node/4683888991": "Alek Manoukyan street",
  "node/4984530823": "Movses Khorenatsi street",
  "node/5236286131": "Abovyan street",
  "node/5616650021": "Nikita Simonyan street",
  "node/5616660222": "Tsitsernakaberd Highway 2/8",
  "node/5837699234": "Vazgen Sargsyan street",
  "node/6035885916": "Admiral Isakov Avenue",
  "node/6035885920": "Admiral Isakov Avenue 6",
  "node/6132523285": "Nikita Simonyan street",
  "node/630743098": "Hrachya Kochar Street",
  "node/6435175887": "Pavstos Buzand street",
  "node/6521652787": "Pushkin Street",
  "node/6699283886": "Tigran Mets avenue",
  "node/718207068": "Aygedzor street",
  "node/7183807261": "Avetik Isahakyan street",
  "node/9688117707": "Abovyan street",
  "node/9721260029": "Khanjyan street",
  "node/975255482": "Tumanyan street",
  "way/1176604868": "Hrazdan riverbank road",
  "way/1302423844": "Aram street",
  "way/1343267712": "Mark Grigoryan street",
  "way/1454717784": "Arshakuniats Avenue",
  "way/1511742774": "Teryan street",
  "way/221633210": "Agatangeghos street",
};
