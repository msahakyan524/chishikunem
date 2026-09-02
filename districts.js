/* The twelve districts of Yerevan.
 *
 * Each box comes from that district's OpenStreetMap boundary relation
 * (admin_level=5), rounded outwards to four decimals. [south, west, north, east]
 *
 * These are bounding boxes, not the district outlines, so neighbouring boxes
 * overlap and a few places just outside a district creep in. That is
 * deliberate: showing a toilet under the wrong district heading is far cheaper
 * than hiding one that is really there.
 *
 * Kentron is first because it is where this map started and where nearly every
 * checked place still is.
 */
const CHISHIKUNEM_DISTRICTS = [
  { id: 'kentron', name: 'Kentron', relation: 13404218, bbox: [40.1579, 44.4792, 40.1984, 44.5479] },
  { id: 'ajapnyak', name: 'Ajapnyak', relation: 13404299, bbox: [40.1853, 44.3947, 40.2340, 44.4910] },
  { id: 'arabkir', name: 'Arabkir', relation: 13404297, bbox: [40.1873, 44.4810, 40.2418, 44.5642] },
  { id: 'avan', name: 'Avan', relation: 13404250, bbox: [40.2050, 44.5471, 40.2381, 44.5881] },
  { id: 'davtashen', name: 'Davtashen', relation: 13404298, bbox: [40.2081, 44.4525, 40.2335, 44.5137] },
  { id: 'erebuni', name: 'Erebuni', relation: 13404216, bbox: [40.1024, 44.5051, 40.1682, 44.6218] },
  { id: 'kanaker-zeytun', name: 'Kanaker-Zeytun', relation: 13404296, bbox: [40.1937, 44.5164, 40.2361, 44.5600] },
  { id: 'malatia-sebastia', name: 'Malatia-Sebastia', relation: 13404219, bbox: [40.1447, 44.3621, 40.1969, 44.4875] },
  { id: 'nor-nork', name: 'Nor Nork', relation: 13404220, bbox: [40.1610, 44.5412, 40.2100, 44.6044] },
  { id: 'nork-marash', name: 'Nork-Marash', relation: 13404217, bbox: [40.1655, 44.5255, 40.1958, 44.5545] },
  { id: 'nubarashen', name: 'Nubarashen', relation: 13404214, bbox: [40.0659, 44.5028, 40.1376, 44.6153] },
  { id: 'shengavit', name: 'Shengavit', relation: 13404215, bbox: [40.0843, 44.4251, 40.1668, 44.5271] },
];
