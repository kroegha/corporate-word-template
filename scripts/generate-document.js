/**
 * Corporate Word document generator.
 *
 * Styling comes from a brand file (brands/<id>.json), so the same generator
 * produces any organisation's document with no change to this file. The neutral
 * brand is the default; copy brands/neutral.json to add your own.
 *
 *   node generate-document.js --input body.md --output prd.docx \
 *        --title "Widget PRD" --product "Widget" --version 1.0
 *
 *   node generate-document.js --brand ./brands/acme.json --input body.md --output spec.docx
 *
 * Programmatic use:
 *   const { generateDocument, buildFromMarkdown, loadBrand } = require('./generate-document.js');
 *   await generateDocument('out.docx', { config: { title: 'Widget PRD' }, markdown });
 *
 * Requires the docx package (see package.json): npm install
 */
const fs = require('fs');
const path = require('path');

let docx;
try {
  docx = require('docx');
} catch (e) {
  console.error(
    "The 'docx' package is not installed.\n" +
    "Run `npm install` in " + __dirname + "/.., or `npm install docx` in the project you are\n" +
    "generating from. This generator does not bundle it, so the caller controls the version."
  );
  process.exit(1);
}

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  LevelFormat, PageBreak, ShadingType, PageNumber, TableOfContents, ImageRun,
  ExternalHyperlink
} = docx;

const BRAND_DIR = path.join(__dirname, '..', 'brands');
const PAGE_SIZES = {                       // DXA, portrait
  A4: { width: 11906, height: 16838 },
  Letter: { width: 12240, height: 15840 },
};

// ---------------------------------------------------------------- brand

/** Load a brand by id (brands/<id>.json) or by path. Defaults to neutral. */
function loadBrand(brand = process.env.DOC_BRAND || 'neutral') {
  if (brand && typeof brand === 'object') return brand;        // already loaded
  const file = brand.endsWith('.json') ? brand : path.join(BRAND_DIR, `${brand}.json`);
  if (!fs.existsSync(file)) {
    const available = fs.readdirSync(BRAND_DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
    throw new Error(`Brand not found: ${file}. Available: ${available.join(', ')}`);
  }
  const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const key of ['organisation', 'fonts', 'colors', 'sizes', 'spacing']) {
    if (!loaded[key]) throw new Error(`Brand ${file} is missing the "${key}" section`);
  }
  return loaded;
}

const DEFAULT_CONFIG = {
  documentType: 'PRODUCT REQUIREMENTS DOCUMENT',
  title: 'Untitled Document',        // Document Control title, and the page header
  product: '',                       // cover: large product name, defaults to title
  tagline: '',
  specType: '',
  edition: '',
  tradingName: '',                   // renders as "t/a <tradingName>" under the legal name
  version: '1.0',
  date: new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
  preparedBy: '',
  status: 'Draft',
  purpose: '',
  scope: '',
  audience: '',
  note: '',                          // callout box under Document Information
  revisions: [],                     // { version, date, author, changes }
  frontMatter: true,                 // false: skip cover, control, revisions and contents
};

// ---------------------------------------------------------------- builder

class DocBuilder {
  constructor(brand, config) {
    this.brand = brand;
    this.config = config;
    this.children = [];
    this.b = { ...brand.colors };
    this.s = brand.sizes;
    this.sp = brand.spacing;
    this.font = brand.fonts.primary;
  }

  get border() { return { style: BorderStyle.SINGLE, size: 1, color: this.b.tableBorder }; }
  get cellBorders() { const x = this.border; return { top: x, bottom: x, left: x, right: x }; }
  get cellMargins() {
    return { top: this.sp.tableCellTop, left: this.sp.tableCellLeft, bottom: this.sp.tableCellBottom, right: this.sp.tableCellRight };
  }

  spacer(before) { this.children.push(new Paragraph({ spacing: { before }, children: [] })); return this; }

  /** Centred image, sized in pixels. Used for a brand's logo on the cover. */
  logo(imagePath, widthPx, heightPx) {
    const ext = path.extname(imagePath).slice(1).toLowerCase();
    this.children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({
        type: ext === 'jpg' ? 'jpeg' : ext,
        data: fs.readFileSync(imagePath),
        transformation: { width: widthPx, height: heightPx },
      })],
    }));
    return this;
  }
  pageBreak() {
    this.mark('pagebreak');
    this.children.push(new Paragraph({ children: [new PageBreak()] }));
    return this;
  }

  centred(text, { size, color, bold = false, italics = false, before } = {}) {
    this.children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: before ? { before } : undefined,
      children: [new TextRun({ text, bold, italics, size: size || this.s.coverText, color, font: this.font })],
    }));
    return this;
  }

  heading(text, level = 1) {
    const levels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
    this.mark('heading');
    this.children.push(new Paragraph({
      heading: levels[level - 1],
      children: this.inlineRuns(text, { bold: true, size: this.s[`heading${level}`] }),
    }));
    return this;
  }

  /** Body alignment is a brand decision: "justified" (default) or "left". */
  get bodyAlignment() {
    const choice = (this.brand.body && this.brand.body.align) || 'justified';
    return choice === 'left' ? AlignmentType.LEFT : AlignmentType.JUSTIFIED;
  }

  paragraph(text, opts = {}) {
    this.mark('paragraph');
    this.children.push(new Paragraph({
      spacing: { after: this.sp.bodyAfter },
      alignment: this.bodyAlignment,
      ...opts,
      children: this.inlineRuns(text),
    }));
    return this;
  }

  /** Remembers what was emitted last, so a new numbered list can restart at 1. */
  mark(kind) { this.lastBlock = kind; return this; }

  // A little space after each item, so the paragraph following a list does not
  // butt against its last line.
  bullet(text, level = 0) {
    this.mark('bullet');
    this.children.push(new Paragraph({
      numbering: { reference: 'bullet-list', level },
      spacing: { after: Math.round(this.sp.bodyAfter / 2) },
      children: this.inlineRuns(text),
    }));
    return this;
  }

  /**
   * Word continues one counter across every list that shares a numbering
   * instance, so the fourth list in a document would start at wherever the third
   * ended. A numbered item that does not directly follow another one starts a
   * new instance, which restarts it at 1.
   */
  numbered(text, level = 0) {
    if (this.lastBlock !== 'numbered') this.numberedInstance = (this.numberedInstance || 0) + 1;
    this.mark('numbered');
    this.children.push(new Paragraph({
      numbering: { reference: 'numbered-list', level, instance: this.numberedInstance },
      spacing: { after: Math.round(this.sp.bodyAfter / 2) },
      children: this.inlineRuns(text),
    }));
    return this;
  }

  /** Shaded callout for something the reader must not miss. */
  note(text) {
    this.mark('note');
    this.children.push(new Paragraph({
      shading: { fill: this.b.noteBackground, type: ShadingType.CLEAR },
      spacing: { before: this.sp.noteBeforeAfter, after: this.sp.noteBeforeAfter },
      children: this.inlineRuns(text, { bold: true, color: this.b.noteText }),
    }));
    return this;
  }

  /** rows[0] is the header row. Column widths are shared out evenly unless given. */
  table(rows, widths) {
    if (!rows.length) return this;
    const total = 9360;
    const cols = widths || rows[0].map(() => Math.floor(total / rows[0].length));
    const cell = (text, width, { header = false, alt = false } = {}) => new TableCell({
      borders: this.cellBorders,
      width: { size: width, type: WidthType.DXA },
      shading: { fill: header ? this.b.tableHeader : (alt ? this.b.tableRowAlt : this.b.tableRowNormal), type: ShadingType.CLEAR },
      margins: this.cellMargins,
      children: [new Paragraph({
        children: header
          ? this.inlineRuns(text, { bold: true, color: this.b.tableHeaderText, size: this.s.table })
          : this.inlineRuns(text, { size: this.s.table }),
      })],
    });
    const built = [new TableRow({ tableHeader: true, children: rows[0].map((t, i) => cell(t, cols[i], { header: true })) })];
    rows.slice(1).forEach((row, r) => {
      built.push(new TableRow({ children: row.map((t, i) => cell(t, cols[i], { alt: r % 2 === 1 })) }));
    });
    this.mark('table');
    this.children.push(new Table({ columnWidths: cols, rows: built }));
    this.spacer(200);
    return this;
  }

  /**
   * Inline markdown inside a line: ***bold italic***, **bold**, __bold__,
   * `code`, <u>underline</u>, ~~strike~~, [text](url), *italic*, _italic_.
   *
   * Order matters, so the rules are tried longest-delimiter first. The emphasis
   * rules require a non-space just inside the delimiters and a non-word
   * character just outside, which is what stops `2 * 3 * 4` becoming italic and
   * `snake_case_name` losing its middle.
   */
  inlineRuns(text, extra = {}) {
    const RULES = [
      { re: /\*\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*\*/,                    style: { bold: true, italics: true } },
      { re: /(?<![\w_])___(?!\s)([^_\n]+?)(?<!\s)___(?![\w_])/,       style: { bold: true, italics: true } },
      { re: /\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*/,                        style: { bold: true } },
      { re: /(?<![\w_])__(?!\s)([^_\n]+?)(?<!\s)__(?![\w_])/,         style: { bold: true } },
      { re: /`([^`\n]+)`/,                                            code: true },
      { re: /<u>([\s\S]*?)<\/u>/i,                                    style: { underline: {} } },
      { re: /~~(?!\s)([^~\n]+?)(?<!\s)~~/,                            style: { strike: true } },
      { re: /\[([^\]\n]+)\]\(([^)\s]+)\)/,                            link: true },
      { re: /(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/,         style: { italics: true } },
      { re: /(?<![\w_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w_])/,           style: { italics: true } },
    ];

    const children = [];
    const base = { size: this.s.body, font: this.font, ...extra };
    const plain = (t) => { if (t) children.push(new TextRun({ text: t, ...base })); };

    let rest = String(text);
    while (rest) {
      // Earliest match wins; ties go to the rule listed first, which is the longer delimiter.
      let best = null;
      for (const rule of RULES) {
        const m = rule.re.exec(rest);
        if (m && (!best || m.index < best.m.index)) best = { rule, m };
      }
      if (!best) break;

      plain(rest.slice(0, best.m.index));
      const { rule, m } = best;
      if (rule.code) {
        children.push(new TextRun({ text: m[1], font: this.brand.fonts.code, color: this.b.inlineCode, size: this.s.code, ...extra }));
      } else if (rule.link) {
        children.push(new ExternalHyperlink({
          link: m[2],
          children: [new TextRun({ text: m[1], color: this.b.hyperlink, underline: {}, ...base })],
        }));
      } else {
        children.push(new TextRun({ text: m[1], ...base, ...rule.style }));
      }
      rest = rest.slice(best.m.index + m[0].length);
    }
    plain(rest);
    return children.length ? children : [new TextRun({ text: '', ...base })];
  }
}

// ---------------------------------------------------------------- markdown

/**
 * Headings (# to ####), paragraphs, - bullets, 1. numbered lists, | tables,
 * --- page breaks, > notes, and inline bold / italic / code.
 */
function buildFromMarkdown(builder, markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  let i = 0, para = [];
  const flush = () => { if (para.length) { builder.paragraph(para.join(' ')); para = []; } };

  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === '') { flush(); i++; continue; }
    // Many documents use --- as a visual separator rather than a page break.
    // "pagebreak" (default) honours it, but never twice in a row and never on an
    // empty document, because either produces a blank page.
    if (/^---+$/.test(t)) {
      flush();
      const means = (builder.brand.markdown && builder.brand.markdown.hrMeans) || 'pagebreak';
      if (means === 'pagebreak' && builder.children.length && builder.lastBlock !== 'pagebreak') {
        builder.pageBreak();
      }
      i++;
      continue;
    }

    const h = t.match(/^(#{1,4})\s+(.*)$/);
    if (h) { flush(); builder.heading(h[2], h[1].length); i++; continue; }

    // A callout wrapped over several source lines is one callout, not one per line.
    if (t.startsWith('>')) {
      flush();
      const quoted = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoted.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      builder.note(quoted.join(' ').trim());
      continue;
    }

    if (t.startsWith('|') && i + 1 < lines.length && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1].trim())) {
      flush();
      const cells = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      const rows = [cells(t)];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(cells(lines[i])); i++; }
      builder.table(rows);
      continue;
    }

    const bullet = t.match(/^[-*]\s+(.*)$/);
    if (bullet) { flush(); builder.bullet(bullet[1], /^\s{2,}/.test(lines[i]) ? 1 : 0); i++; continue; }

    const numbered = t.match(/^\d+[.)]\s+(.*)$/);
    if (numbered) { flush(); builder.numbered(numbered[1]); i++; continue; }

    para.push(t);
    i++;
  }
  flush();
  return builder;
}

// ---------------------------------------------------------------- front matter

function coverPage(b) {
  const { config: c, brand } = b;
  const org = brand.organisation;
  const logo = brand.assets && brand.assets.logo;
  if (logo) {
    const file = path.isAbsolute(logo) ? logo : path.join(__dirname, '..', logo);
    if (fs.existsSync(file)) {
      b.spacer(Math.round(b.sp.coverTopSpace / 3));
      const width = (brand.assets.logoWidthPx) || 90;
      b.logo(file, width, Math.round(width * (brand.assets.logoRatio || 1)));
      b.spacer(b.sp.coverMediumSpace);   // the mark should not sit on the title
    } else {
      console.warn(`Brand logo not found, cover rendered without it: ${file}`);
      b.spacer(b.sp.coverTopSpace);
    }
  } else {
    b.spacer(b.sp.coverTopSpace);
  }
  b.centred(c.documentType, { size: b.s.coverTitle, color: b.b.coverTitle, bold: true });
  b.spacer(b.sp.coverSectionSpace);
  b.centred(c.product || c.title, { size: b.s.coverProduct, color: b.b.coverProduct, bold: true });
  const tagline = c.tagline || org.tagline;
  if (tagline) b.centred(tagline, { color: b.b.coverSubtitle, before: b.sp.coverSmallSpace });
  if (c.specType || c.edition) {
    b.spacer(b.sp.coverMediumSpace);
    if (c.specType) b.centred(c.specType, { size: b.s.coverSpec, color: b.b.coverSpec });
    if (c.edition) b.centred(c.edition, { italics: true, color: b.b.coverEdition, before: b.sp.coverSmallSpace });
  }
  b.spacer(b.sp.coverSectionSpace);
  b.centred(`Version ${c.version}`);
  b.centred(c.date);
  b.spacer(b.sp.coverSectionSpace);
  b.centred(org.legalName, { bold: true });
  if (c.tradingName) b.centred(`${org.tradingPrefix} ${c.tradingName}`, { italics: true, size: b.s.coverTrading, before: b.sp.coverTradingSpace });
  if (org.classification) {
    b.spacer(b.sp.coverConfidentialSpace);
    b.centred(org.classification, { bold: true, size: b.s.confidential, color: b.b.confidential });
  }
  b.pageBreak();
}

function documentControl(b) {
  const { config: c, brand } = b;
  const rows = [
    ['Item', 'Details'],
    ['Document Title', c.title],
    ['Version', c.version],
    ['Date', c.date],
  ];
  if (c.preparedBy) rows.push(['Prepared By', c.preparedBy]);
  rows.push(['Company', brand.organisation.legalName]);
  if (c.tradingName) rows.push(['Trading Name', c.tradingName]);
  rows.push(['Status', c.status]);
  if (brand.organisation.classification) rows.push(['Classification', brand.organisation.classification]);
  b.heading('Document Control', 1);
  b.table(rows, [3000, 6360]);
}

function documentInformation(b) {
  const { config: c } = b;
  if (!c.purpose && !c.scope && !c.audience && !c.note) return;
  b.heading('Document Information', 3);
  const field = (label, value) => {
    if (!value) return;
    b.children.push(new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: `${label}: `, bold: true, font: b.font }), ...b.inlineRuns(value)],
    }));
  };
  field('Purpose', c.purpose);
  field('Scope', c.scope);
  field('Audience', c.audience);
  if (c.note) { b.spacer(b.sp.noteBeforeAfter); b.note(c.note); }
}

function revisionHistory(b) {
  const revisions = b.config.revisions;
  if (!revisions.length) return;
  b.heading('Revision History', 3);
  b.table(
    [['Version', 'Date', 'Author', 'Changes'], ...revisions.map(r => [r.version, r.date, r.author, r.changes])],
    [1200, 1500, 2000, 4660]
  );
  b.pageBreak();
}

function tableOfContents(b) {
  b.heading('Table of Contents', 1);
  b.children.push(new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-3' }));
  b.pageBreak();
}

// ---------------------------------------------------------------- document

function stylesFor(brand) {
  const { colors: c, sizes: s, spacing: sp, fonts } = brand;
  const heading = (id, name, size, color, level, italics = false) => ({
    id, name, basedOn: 'Normal', next: 'Normal', quickFormat: true,
    run: { size, bold: true, italics, color, font: fonts.primary },
    paragraph: { spacing: { before: sp[`heading${level + 1}Before`], after: sp[`heading${level + 1}After`] }, outlineLevel: level },
  });
  return {
    default: { document: { run: { font: fonts.primary, size: s.body } } },
    paragraphStyles: [
      heading('Heading1', 'Heading 1', s.heading1, c.heading1, 0),
      heading('Heading2', 'Heading 2', s.heading2, c.heading2, 1),
      heading('Heading3', 'Heading 3', s.heading3, c.heading3, 2),
      heading('Heading4', 'Heading 4', s.heading4, c.heading4, 3, true),
    ],
  };
}

const NUMBERING = {
  config: [
    {
      reference: 'bullet-list',
      levels: [
        { level: 0, format: LevelFormat.BULLET, text: '●', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '○', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 360 } } } },
      ],
    },
    {
      reference: 'numbered-list',
      levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
    },
  ],
};

function headerFooter(brand, config) {
  const { colors: c, sizes: s, fonts, organisation: org } = brand;
  const style = { color: c.headerFooter, size: s.headerFooter, font: fonts.primary };
  const headerText = org.headerTemplate
    .replace('{title}', config.product || config.title)
    .replace('{version}', config.version)
    .replace('{legalName}', org.legalName)
    .replace('{tradingName}', config.tradingName || '');
  const footer = org.footerTemplate || 'Page {page} of {pages}';
  const [beforePage, rest] = footer.split('{page}');
  const [betweenPages, afterPages] = (rest || '').split('{pages}');
  return {
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: headerText, ...style })] })] }) },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: beforePage, ...style }),
            new TextRun({ children: [PageNumber.CURRENT], ...style }),
            new TextRun({ text: betweenPages || '', ...style }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], ...style }),
            new TextRun({ text: afterPages || '', ...style }),
          ],
        })],
      }),
    },
  };
}

/**
 * @param {string} outputPath
 * @param {object} opts  { brand, config, markdown, content }
 *   content is a callback (builder) => void for documents built in code.
 */
async function generateDocument(outputPath, opts = {}) {
  const brand = loadBrand(opts.brand);
  const config = { ...DEFAULT_CONFIG, ...(opts.config || {}) };
  const builder = new DocBuilder(brand, config);

  if (config.frontMatter) {
    coverPage(builder);
    documentControl(builder);
    documentInformation(builder);
    revisionHistory(builder);
    tableOfContents(builder);
  }

  if (opts.markdown) buildFromMarkdown(builder, opts.markdown);
  else if (opts.content) opts.content(builder);
  else builder.heading('1. Introduction', 1).paragraph('Replace this with the document body, or pass --input <file.md>.');

  const size = PAGE_SIZES[(brand.page && brand.page.size) || 'A4'] || PAGE_SIZES.A4;
  const doc = new Document({
    styles: stylesFor(brand),
    numbering: NUMBERING,
    features: { updateFields: true },
    sections: [{
      properties: { page: { size, margin: (brand.page && brand.page.margins) || PAGE_SIZES.margins } },
      ...headerFooter(brand, config),
      children: builder.children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  console.log(`Document generated: ${outputPath}`);
  return outputPath;
}

// ---------------------------------------------------------------- CLI

const FLAGS = {
  '--title': 'title', '--product': 'product', '--type': 'documentType', '--tagline': 'tagline',
  '--spec-type': 'specType', '--edition': 'edition', '--trading-name': 'tradingName',
  '--version': 'version', '--date': 'date', '--author': 'preparedBy', '--status': 'status',
  '--purpose': 'purpose', '--scope': 'scope', '--audience': 'audience', '--note': 'note',
};

function parseArgs(argv) {
  const opts = { config: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input' || a === '-i') opts.input = argv[++i];
    else if (a === '--output' || a === '-o') opts.output = argv[++i];
    else if (a === '--brand') opts.brand = argv[++i];
    else if (a === '--no-front-matter') opts.config.frontMatter = false;
    else if (FLAGS[a]) opts.config[FLAGS[a]] = argv[++i];
    else if (!a.startsWith('-') && !opts.output) opts.output = a;
  }
  return opts;
}

function usage() {
  const brands = fs.readdirSync(BRAND_DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
  console.log(`Corporate Word document generator

Usage:
  node generate-document.js --output <file.docx> [--input <body.md>] [options]

Options:
  -o, --output <path>      Output .docx (required)
  -i, --input <path>       Markdown file supplying the body
      --brand <id|path>    Brand file; available: ${brands.join(', ')} (default: neutral)
      --title <text>       Document title (Document Control, page header)
      --product <text>     Large name on the cover (defaults to the title)
      --type <text>        Cover line, e.g. "TECHNICAL SPECIFICATION"
      --tagline <text>     One line under the product name
      --spec-type <text>   e.g. "Complete Specification"
      --edition <text>     e.g. "Initial Release"
      --trading-name <t>   Renders as "t/a <name>" under the legal name
      --version <text>     Default 1.0
      --date <text>        Default: current month and year
      --author <text>      Prepared By
      --status <text>      Default Draft
      --purpose|--scope|--audience|--note <text>
      --no-front-matter    Skip cover, Document Control, revisions and contents

Markdown supported: # to #### headings, paragraphs, - bullets, 1. numbered lists,
| tables, --- page break, > callout, and inline **bold** *italic* \`code\`.

Brand files live in brands/. Copy one and edit it for another organisation;
nothing about the company, palette, fonts or page size is compiled into this script.`);
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
    usage();
  } else {
    const opts = parseArgs(argv);
    if (!opts.output) { console.error('No --output given.'); process.exit(2); }
    if (opts.input && !fs.existsSync(opts.input)) { console.error(`Input not found: ${opts.input}`); process.exit(2); }
    generateDocument(opts.output, {
      brand: opts.brand,
      config: opts.config,
      markdown: opts.input ? fs.readFileSync(opts.input, 'utf8') : undefined,
    }).catch(err => { console.error('Error:', err.message); process.exit(1); });
  }
}

module.exports = { generateDocument, buildFromMarkdown, loadBrand, DocBuilder, DEFAULT_CONFIG };
