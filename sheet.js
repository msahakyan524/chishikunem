/* Excel export for Chishikunem.
 *
 * The sheet is built in the browser, from the same places the map is showing,
 * so it always matches what you see — including facts you confirmed yourself
 * on the review page. Nothing is fetched and no file sits on the server, which
 * is also why the download cannot go missing.
 *
 * An .xlsx file is a zip of XML parts. We write the zip uncompressed (store
 * mode), which Excel, Numbers and LibreOffice all open fine.
 */

const ChishikunemSheet = (() => {
  const HEAD = [
    'Name', 'Address', 'Cost', 'Charge', 'Gender-neutral', 'Wheelchair',
    'Baby table', 'Walk in without asking', 'Kind', 'Opening hours',
    'Latitude', 'Longitude', 'Google Maps', 'OpenStreetMap',
  ];
  const WIDTHS = [34, 26, 12, 12, 15, 13, 11, 21, 15, 26, 11, 11, 46, 42];
  const LINK_FROM = 12; // columns from here on are links

  const yesNo = (v) => (v === true ? 'Yes' : v === false ? 'No' : '');

  // An unnamed toilet is far easier to find by what it stands next to.
  function nameOf(place) {
    const base = place.name === 'Public toilet' && place.operator ? place.operator : place.name;
    return place.near ? `${base} (near ${place.near})` : base;
  }

  /* ---------- rows ---------- */

  function rowsFrom(places) {
    const rows = places
      // Every known toilet: a dedicated public one, or a venue confirmed to
      // have one. Places nobody has checked yet are left out.
      .filter((p) => p.hasToilet === true)
      // This map is only for free toilets, so a confirmed price keeps a place
      // out of the sheet as well as off the map. Checked here too, rather than
      // trusted from the caller, because that trust is exactly what let paid
      // rows into the download before.
      .filter((p) => p.free !== false)
      .map((p) => [
        nameOf(p),
        p.address,
        p.free === true ? 'Free' : p.free === false ? 'Paid' : 'Not checked',
        p.charge || '',
        yesNo(p.unisex),
        p.wheelchairLimited ? 'Limited' : yesNo(p.wheelchair),
        yesNo(p.baby),
        yesNo(p.noAsk),
        p.mall ? 'Inside a mall' : p.isToilet ? 'Public toilet' : 'Inside a venue',
        p.hours,
        Number(p.lat.toFixed(6)),
        Number(p.lon.toFixed(6)),
        Chishikunem.mapsUrl(p),
        Chishikunem.osmUrl(p),
      ]);

    /* Same order as the map's list: confirmed free before unpriced, then
     * walk-in before "you have to ask", then A-Z. Column 7 is the walk-in
     * answer, so "No" there is the one that sinks. */
    const order = { Free: 0, 'Not checked': 1 };
    rows.sort((a, b) =>
      order[a[2]] - order[b[2]]
      || (a[7] === 'No') - (b[7] === 'No')
      || a[0].localeCompare(b[0]));

    // Repeated names are left alone. A chain really is called the same thing
    // at every branch, and numbering it "Art Lunch 1 … 12" invents an ordering
    // that means nothing and matches no sign on any door. The Address column
    // and the Google Maps link are what tell the rows apart.
    return rows;
  }

  /* ---------- sheet XML ---------- */

  const esc = (s) => String(s).replace(/[&<>]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function colName(index) {
    let name = '';
    for (let i = index; i >= 0; i = Math.floor(i / 26) - 1) {
      name = String.fromCharCode(65 + (i % 26)) + name;
    }
    return name;
  }

  function cell(ref, value, style) {
    if (typeof value === 'number') return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
    if (!value) return '';
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">`
      + `${esc(value)}</t></is></c>`;
  }

  function sheetXml(rows) {
    const head = `<row r="1" ht="20" customHeight="1">`
      + HEAD.map((h, i) => cell(`${colName(i)}1`, h, 1)).join('') + '</row>';

    const body = rows.map((row, n) => `<row r="${n + 2}">`
      + row.map((v, i) => cell(`${colName(i)}${n + 2}`, v, i >= LINK_FROM ? 3 : 2)).join('')
      + '</row>').join('');

    const cols = WIDTHS.map((w, i) =>
      `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0" tabSelected="1">
<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${head}${body}</sheetData>
<autoFilter ref="A1:${colName(HEAD.length - 1)}${rows.length + 1}"/>
</worksheet>`;
  }

  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><u/><sz val="11"/><color rgb="FF1155CC"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF2F5D50"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
</cellXfs>
</styleSheet>`;

  const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Toilets" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  /* ---------- zip ---------- */

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /* Zips {name: text} into an .xlsx blob. Entries are stored, not deflated, and
   * stamped 1980-01-01 so the same data always produces the same file. */
  function zip(parts) {
    const encoder = new TextEncoder();
    const entries = Object.entries(parts).map(([name, text]) => {
      const data = encoder.encode(text);
      return { name: encoder.encode(name), data, crc: crc32(data) };
    });

    const LOCAL = 30, CENTRAL = 46, END = 22;
    const size = entries.reduce((n, e) =>
      n + LOCAL + e.name.length + e.data.length + CENTRAL + e.name.length, END);

    const out = new Uint8Array(size);
    const view = new DataView(out.buffer);
    let at = 0;
    const offsets = [];

    for (const entry of entries) {
      offsets.push(at);
      view.setUint32(at, 0x04034b50, true);
      view.setUint16(at + 4, 20, true);     // version needed
      view.setUint16(at + 6, 0x0800, true); // UTF-8 names
      view.setUint16(at + 8, 0, true);      // stored
      view.setUint16(at + 10, 0, true);     // time
      view.setUint16(at + 12, 33, true);    // date: 1980-01-01
      view.setUint32(at + 14, entry.crc, true);
      view.setUint32(at + 18, entry.data.length, true);
      view.setUint32(at + 22, entry.data.length, true);
      view.setUint16(at + 26, entry.name.length, true);
      view.setUint16(at + 28, 0, true);
      at += LOCAL;
      out.set(entry.name, at); at += entry.name.length;
      out.set(entry.data, at); at += entry.data.length;
    }

    const start = at;
    entries.forEach((entry, i) => {
      view.setUint32(at, 0x02014b50, true);
      view.setUint16(at + 4, 20, true);     // version made by
      view.setUint16(at + 6, 20, true);     // version needed
      view.setUint16(at + 8, 0x0800, true);
      view.setUint16(at + 10, 0, true);
      view.setUint16(at + 12, 0, true);
      view.setUint16(at + 14, 33, true);
      view.setUint32(at + 16, entry.crc, true);
      view.setUint32(at + 20, entry.data.length, true);
      view.setUint32(at + 24, entry.data.length, true);
      view.setUint16(at + 28, entry.name.length, true);
      view.setUint32(at + 42, offsets[i], true);
      at += CENTRAL;
      out.set(entry.name, at); at += entry.name.length;
    });

    view.setUint32(at, 0x06054b50, true);
    view.setUint16(at + 8, entries.length, true);
    view.setUint16(at + 10, entries.length, true);
    view.setUint32(at + 12, at - start, true);
    view.setUint32(at + 16, start, true);

    return new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  /* ---------- download ---------- */

  function build(places) {
    const rows = rowsFrom(places);
    return {
      rows: rows.length,
      blob: zip({
        '[Content_Types].xml': CONTENT_TYPES,
        '_rels/.rels': ROOT_RELS,
        'xl/workbook.xml': WORKBOOK,
        'xl/_rels/workbook.xml.rels': WORKBOOK_RELS,
        'xl/styles.xml': STYLES,
        'xl/worksheets/sheet1.xml': sheetXml(rows),
      }),
    };
  }

  function download(places) {
    const { rows, blob } = build(places);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    // One file per district, so downloading a second one does not look like a
    // duplicate of the first.
    link.download = `chishikunem-${Chishikunem.district().id}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return rows;
  }

  return { build, download, rowsFrom, HEAD };
})();

if (typeof module !== 'undefined') module.exports = ChishikunemSheet;
