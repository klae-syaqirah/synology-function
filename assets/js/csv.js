/*
 * Small RFC 4180 CSV parser. Handles quoted fields, escaped quotes ("")
 * and line breaks inside cells (Alt+Enter in Google Sheets).
 * Works in the browser (window.CSV) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  function parse(text) {
    if (!text) return [];
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
        continue;
      }

      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (c !== '\r') {
        field += c;
      }
    }

    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  // First row is the header. Header names are lower-cased and spaces become "_",
  // so "On our NAS" and "on_our_nas" both work as column names.
  function toObjects(rows) {
    if (!rows.length) return [];
    const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    return rows
      .slice(1)
      .filter((r) => r.some((v) => v.trim() !== ''))
      .map((r) => {
        const obj = {};
        header.forEach((h, i) => {
          if (h) obj[h] = (r[i] || '').trim();
        });
        return obj;
      });
  }

  const CSV = {
    parse: parse,
    toObjects: toObjects,
    parseObjects: function (text) {
      return toObjects(parse(text));
    },
  };

  root.CSV = CSV;
  if (typeof module !== 'undefined' && module.exports) module.exports = CSV;
})(typeof window !== 'undefined' ? window : globalThis);
