/**
 * Style constants, derived from a brand file rather than declared here.
 *
 * The palette, fonts, sizes and spacing live in brands/<id>.json so that one
 * generator serves several organisations. This module exposes them in the shape
 * older scripts expected (`V2.colors.heading1`, `V2.cellMargins`, and so on), so
 * existing code keeps working.
 *
 *   const V2 = require('./style-constants.js');          // default brand (neutral)
 *   const acme = require('./style-constants.js').forBrand('./brands/acme.json');
 */
const { loadBrand } = require('./generate-document.js');

function forBrand(brand) {
  const b = loadBrand(brand);
  const tableBorderStyle = { style: 'single', size: 1, color: b.colors.tableBorder };
  return {
    brand: b,
    colors: b.colors,
    sizes: b.sizes,
    spacing: b.spacing,
    fonts: b.fonts,
    margins: (b.page && b.page.margins) || { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    organisation: b.organisation,
    tableBorderStyle,
    cellBorders: { top: tableBorderStyle, bottom: tableBorderStyle, left: tableBorderStyle, right: tableBorderStyle },
    cellMargins: {
      top: b.spacing.tableCellTop,
      left: b.spacing.tableCellLeft,
      bottom: b.spacing.tableCellBottom,
      right: b.spacing.tableCellRight,
    },
    forBrand,
  };
}

module.exports = forBrand(process.env.DOC_BRAND || 'neutral');
