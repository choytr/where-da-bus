/**
 * Extract text from a PDF. No dependencies — `node:zlib` does the work.
 *
 *   node scripts/pdf-text.mjs docs/api/arrivalsJSON.pdf
 *
 * This exists because `Read` renders PDFs by shelling out to `pdftoppm`, and
 * poppler-utils is not installed here (installing it wants a sudo password).
 * The vendor API documentation in docs/api/ is otherwise unreadable.
 *
 * Two text encodings appear across those files and both are handled:
 *
 *   - Literal strings: `(text) Tj`. Straightforward.
 *   - Identity-H subset fonts: `<hex> Tj`, where the hex is a sequence of
 *     glyph ids private to one embedded font subset. Those mean nothing
 *     without that font's `/ToUnicode` CMap, which maps glyph id -> character.
 *
 * The second case matters more than it sounds: an extractor that only handles
 * literal strings returns *zero bytes* for docs/api/*JSON.pdf and makes them
 * look like scanned images. They are not. That misreading cost real time once
 * already, which is why this script is committed rather than improvised again.
 *
 * Output is plain text with layout approximated from the text operators, so
 * two-column pages interleave. It is meant to be read, not parsed.
 */

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const path = process.argv[2];
if (path === undefined) {
  console.error('usage: node scripts/pdf-text.mjs <file.pdf>');
  process.exit(1);
}

const buf = readFileSync(path);
// latin1 keeps a byte-for-byte view: offsets into this string are offsets into
// the buffer, which is what makes searching for PDF keywords safe.
const latin = buf.toString('latin1');

/** Byte offset of every `N 0 obj` header, keyed by object number. */
const objectAt = new Map();
for (const match of latin.matchAll(/(\d+)\s+0\s+obj\b/g)) {
  objectAt.set(Number(match[1]), match.index);
}

/** The body of object `num`, inflated when the dictionary says it is deflated. */
function streamOf(num) {
  const start = objectAt.get(num);
  if (start === undefined) return null;

  const keyword = latin.indexOf('stream', start);
  if (keyword === -1) return null;

  // The spec allows CRLF or LF after the `stream` keyword, and neither byte
  // belongs to the data.
  let from = keyword + 6;
  if (buf[from] === 0x0d) from += 1;
  if (buf[from] === 0x0a) from += 1;

  const to = latin.indexOf('endstream', from);
  if (to === -1) return null;

  const raw = buf.subarray(from, to);
  if (!/\/FlateDecode/.test(latin.slice(start, keyword))) return raw.toString('latin1');
  try {
    return inflateSync(raw).toString('latin1');
  } catch {
    // Font programs and images inflate to binary, or fail outright. Neither is
    // text, so neither is this function's problem.
    return null;
  }
}

/** Parse a `/ToUnicode` CMap into glyph id -> string. */
function parseCMap(text) {
  const map = new Map();

  // CMap targets are UTF-16BE, so each character is four hex digits and one
  // glyph can legitimately map to several (ligatures).
  const decodeTarget = (hex) => {
    let out = '';
    for (let i = 0; i + 4 <= hex.length; i += 4) {
      out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    }
    return out;
  };

  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const entry of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(parseInt(entry[1], 16), decodeTarget(entry[2]));
    }
  }

  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const entry of block[1].matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
    )) {
      const low = parseInt(entry[1], 16);
      const high = parseInt(entry[2], 16);
      const target = parseInt(entry[3], 16);
      for (let id = low; id <= high; id += 1) {
        map.set(id, String.fromCharCode(target + (id - low)));
      }
    }
  }

  return map;
}

/** Font object number -> its glyph map, for every font declaring a /ToUnicode. */
const glyphMaps = new Map();
for (const [num, offset] of objectAt) {
  const header = latin.slice(offset, offset + 700);
  const ref = header.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
  if (ref === null) continue;
  const cmap = streamOf(Number(ref[1]));
  if (cmap !== null) glyphMaps.set(num, parseCMap(cmap));
}

/** Resource name (`F1`) -> font object number, from every /Font resource dict. */
const fontByName = new Map();
for (const dict of latin.matchAll(/\/Font\s*<<([^>]*)>>/g)) {
  for (const entry of dict[1].matchAll(/\/(\w+)\s+(\d+)\s+0\s+R/g)) {
    fontByName.set(entry[1], Number(entry[2]));
  }
}

const pieces = [];

for (const [num] of objectAt) {
  const body = streamOf(num);
  // A content stream selects a font and shows text. Anything that does neither
  // is a font program, an image, or metadata.
  if (body === null || !/\bTf\b/.test(body) || !/\bTJ\b|\bTj\b/.test(body)) continue;

  let font = null;

  const decodeHex = (hex) => {
    const digits = hex.replace(/\s+/g, '');
    let out = '';
    for (let i = 0; i + 4 <= digits.length; i += 4) {
      out += font?.get(parseInt(digits.slice(i, i + 4), 16)) ?? '';
    }
    return out;
  };

  const unescape = (text) =>
    text.replace(/\\([nrt()\\])/g, (_, char) =>
      char === 'n' ? '\n' : char === 'r' ? '\r' : char === 't' ? '\t' : char,
    );

  const tokens = body.matchAll(
    /\/(\w+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f\s]+)>\s*Tj|\(((?:[^()\\]|\\.)*)\)\s*Tj|\[((?:[^\]])*)\]\s*TJ|\bT\*|\bTd\b|\bTD\b|\bET\b/g,
  );

  for (const token of tokens) {
    if (token[1] !== undefined) {
      font = glyphMaps.get(fontByName.get(token[1])) ?? null;
    } else if (token[2] !== undefined) {
      pieces.push(decodeHex(token[2]));
    } else if (token[3] !== undefined) {
      pieces.push(unescape(token[3]));
    } else if (token[4] !== undefined) {
      // A TJ array alternates strings with kerning offsets. A large negative
      // offset is the typesetter opening a word gap, so it becomes a space.
      let line = '';
      for (const part of token[4].matchAll(
        /<([0-9A-Fa-f\s]+)>|\(((?:[^()\\]|\\.)*)\)|(-?[\d.]+)/g,
      )) {
        if (part[1] !== undefined) line += decodeHex(part[1]);
        else if (part[2] !== undefined) line += unescape(part[2]);
        else if (Number(part[3]) < -180) line += ' ';
      }
      pieces.push(line);
    } else {
      // T*, Td, TD and ET all move off the current line.
      pieces.push('\n');
    }
  }
}

console.log(pieces.join('').replace(/\n{3,}/g, '\n\n'));
