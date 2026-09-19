/**
 * Checks every brand file renders before anyone ships a document with it.
 *
 *   node scripts/verify-output.js            (all brands in brands/)
 *   node scripts/verify-output.js acme       (one brand id or path)
 *
 * A brand with a missing key or a bad colour fails here rather than half way
 * through generating a 60-page document.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { generateDocument, loadBrand } = require('./generate-document.js');

const BRAND_DIR = path.join(__dirname, '..', 'brands');
const HEX = /^[0-9A-Fa-f]{6}$/;

const SAMPLE = `# 1. Introduction

Body text with **bold**, *italic* and \`code\`.

- First bullet
- Second bullet

| Item | Value |
|---|---|
| Alpha | One |
| Beta | Two |

> A callout, which uses the brand's note colours.

## 1.1 Detail

More body text.
`;

function checkBrand(id) {
  const problems = [];
  const brand = loadBrand(id);
  for (const [key, value] of Object.entries(brand.colors)) {
    if (!HEX.test(value)) problems.push(`colors.${key} is "${value}", which is not a 6-digit hex value without "#"`);
  }
  for (const [key, value] of Object.entries(brand.sizes)) {
    if (!Number.isInteger(value) || value <= 0) problems.push(`sizes.${key} is ${value}; sizes are whole half-points, so 22 means 11pt`);
  }
  if (!brand.organisation.legalName) problems.push('organisation.legalName is empty');
  if (!brand.fonts.primary) problems.push('fonts.primary is empty');
  return problems;
}

async function main(argv) {
  const ids = argv.length ? argv : fs.readdirSync(BRAND_DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
  let failed = false;

  for (const id of ids) {
    const problems = checkBrand(id);
    const out = path.join(os.tmpdir(), `verify-${path.basename(id, '.json')}.docx`);
    try {
      await generateDocument(out, {
        brand: id,
        config: { title: 'Verification Document', product: 'Verification', preparedBy: 'verify-output.js',
                  purpose: 'Confirms this brand renders.', revisions: [{ version: '1.0', date: 'today', author: 'verify', changes: 'Initial' }] },
        markdown: SAMPLE,
      });
      const bytes = fs.statSync(out).size;
      if (bytes < 5000) problems.push(`rendered only ${bytes} bytes, which is too small to be a real document`);
      fs.unlinkSync(out);
    } catch (err) {
      problems.push(`render failed: ${err.message}`);
    }

    if (problems.length) {
      failed = true;
      console.log(`${id}: FAILED`);
      problems.forEach(p => console.log(`  - ${p}`));
    } else {
      console.log(`${id}: renders`);
    }
  }
  return failed ? 1 : 0;
}

main(process.argv.slice(2)).then(code => process.exit(code));
