/**
 * Checks a brand file and the document it produces.
 *
 *   node scripts/verify-output.js                    (every brand in brands/)
 *   node scripts/verify-output.js acme               (one brand id or path)
 *   node scripts/verify-output.js --input real.md    (render a real document too)
 *
 * Two layers, because each catches what the other cannot:
 *
 *  1. Brand values: colours are 6-digit hex without "#", sizes are whole
 *     half-points, the required keys exist.
 *  2. The rendered document: no literal markdown markers survived into the text,
 *     body paragraphs are justified, each numbered list restarts, no two page
 *     breaks in a row, and the front matter landed on separate pages.
 *
 * The second layer exists because a generator can render a perfectly valid
 * document full of "**bold**" and nobody notices until a stakeholder does.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { generateDocument, loadBrand } = require('./generate-document.js');

const BRAND_DIR = path.join(__dirname, '..', 'brands');
const HEX = /^[0-9A-Fa-f]{6}$/;

/** Every construct the markdown pipeline claims to support. */
const SAMPLE = `# 1. Introduction

Body with **bold**, __also bold__, *italic*, _also italic_, ***both***,
\`code\`, ~~struck~~, <u>underlined</u> and a [link](https://example.com).
Arithmetic like 2 * 3 * 4 and snake_case_name must survive untouched.

1. First step
2. Second step

A paragraph between the lists.

1. First again
2. Second again

- A bullet
- Another bullet

> A callout with **bold** inside,
> wrapped across two source lines.

| **Item** | Value |
|---|---|
| Alpha | One |
| Beta | Two |

---

## 1.1 After a separator

More body text.
`;

// ---------------------------------------------------------------- zip

/** Reads one entry out of a .docx without pulling in a zip dependency. */
function readZipEntry(buffer, wanted) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a zip file');
  let offset = buffer.readUInt32LE(eocd + 16);
  const count = buffer.readUInt16LE(eocd + 10);

  for (let i = 0; i < count; i++) {
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLen);
    if (name === wanted) {
      const method = buffer.readUInt16LE(offset + 10);
      const compSize = buffer.readUInt32LE(offset + 20);
      const local = buffer.readUInt32LE(offset + 42);
      const localName = buffer.readUInt16LE(local + 26);
      const localExtra = buffer.readUInt16LE(local + 28);
      const start = local + 30 + localName + localExtra;
      const data = buffer.subarray(start, start + compSize);
      return method === 0 ? data : zlib.inflateRawSync(data);
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${wanted} not found in the document`);
}

// ---------------------------------------------------------------- checks

function checkBrand(id) {
  const problems = [];
  let brand;
  try {
    brand = loadBrand(id);
  } catch (err) {
    return [err.message];          // a bad path or a missing brand is a finding, not a crash
  }
  for (const [key, value] of Object.entries(brand.colors)) {
    if (!HEX.test(value)) problems.push(`colors.${key} is "${value}", which is not a 6-digit hex value without "#"`);
  }
  for (const [key, value] of Object.entries(brand.sizes)) {
    if (!Number.isInteger(value) || value <= 0) problems.push(`sizes.${key} is ${value}; sizes are whole half-points, so 22 means 11pt`);
  }
  if (!brand.organisation.legalName) problems.push('organisation.legalName is empty');
  if (!brand.fonts.primary) problems.push('fonts.primary is empty');
  if (brand.assets && brand.assets.logo) {
    const logo = path.isAbsolute(brand.assets.logo) ? brand.assets.logo : path.join(__dirname, '..', brand.assets.logo);
    if (!fs.existsSync(logo)) problems.push(`assets.logo points at ${logo}, which does not exist`);
  }
  return problems;
}

function checkDocument(file, { expectFrontMatter = true } = {}) {
  const problems = [];
  const xml = readZipEntry(fs.readFileSync(file), 'word/document.xml').toString('utf8');
  const text = xml.replace(/<[^>]+>/g, '');

  const markers = { '**': /\*\*/g, '__': /__/g, '~~': /~~/g, '<u>': /<u>/gi, '](': /\]\(/g };
  for (const [marker, re] of Object.entries(markers)) {
    const hits = (text.match(re) || []).length;
    if (hits) problems.push(`${hits} literal "${marker}" left in the text; inline formatting was not applied`);
  }

  const bodyParagraphs = (xml.match(/<w:p [^>]*>|<w:p>/g) || []).length;
  const justified = (xml.match(/w:jc w:val="both"/g) || []).length;
  if (!justified) problems.push(`no justified paragraphs in ${bodyParagraphs} paragraphs; body text should be justified unless the brand sets body.align`);

  const numIds = new Set((xml.match(/<w:numId w:val="(\d+)"/g) || []).map(s => s.match(/\d+/)[0]));
  if (numIds.size < 2) problems.push(`only ${numIds.size} numbering instance(s); separate lists share a counter, so the second list will not restart at 1`);

  if (/<w:br w:type="page"\/>\s*<\/w:r>\s*<\/w:p>\s*<w:p[^>]*>\s*<w:r>\s*<w:br w:type="page"\/>/.test(xml)) {
    problems.push('two page breaks in a row, which renders as a blank page');
  }

  if (expectFrontMatter) {
    for (const required of ['Document Control', 'Table of Contents']) {
      if (!text.includes(required)) problems.push(`front matter is missing "${required}"`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------- main

async function main(argv) {
  const inputAt = argv.indexOf('--input');
  const realInput = inputAt >= 0 ? argv[inputAt + 1] : null;
  const ids = argv.filter((a, i) => !a.startsWith('--') && !(inputAt >= 0 && i === inputAt + 1));
  const brands = ids.length ? ids : fs.readdirSync(BRAND_DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
  let failed = false;

  for (const id of brands) {
    const problems = checkBrand(id);
    const out = path.join(os.tmpdir(), `verify-${path.basename(id, '.json')}.docx`);
    try {
      await generateDocument(out, {
        brand: id,
        config: {
          title: 'Verification Document', product: 'Verification', preparedBy: 'verify-output.js',
          purpose: 'Confirms this brand renders every supported construct.',
          revisions: [{ version: '1.0', date: 'today', author: 'verify', changes: 'Initial' }],
        },
        markdown: realInput ? fs.readFileSync(realInput, 'utf8') : SAMPLE,
      });
      if (fs.statSync(out).size < 5000) problems.push('rendered document is too small to be real');
      problems.push(...checkDocument(out));
      fs.unlinkSync(out);
    } catch (err) {
      problems.push(`render failed: ${err.message}`);
    }

    if (problems.length) {
      failed = true;
      console.log(`${id}: FAILED`);
      problems.forEach(p => console.log(`  - ${p}`));
    } else {
      console.log(`${id}: renders, and the output passes every check`);
    }
  }
  return failed ? 1 : 0;
}

main(process.argv.slice(2)).then(code => process.exit(code));
