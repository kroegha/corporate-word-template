---
name: corporate-word-template
description: Generates professional Word (.docx) documents from Markdown with a cover page, Document Control table, revision history, table of contents, styled tables and callouts, with all branding supplied as a JSON file so any organisation's colours, fonts, page size and company name can be used. Use this whenever a PRD, product requirements document, technical specification, project report, proposal, policy or any formal Word document is wanted, whenever someone asks to turn Markdown or notes into a Word document, and whenever a document must carry a specific company's branding. Pair it with a brand file per client or product line, and keep the brand file with the project so the same document renders the same way for anyone who builds it.
---

# Corporate Word Document Generator

Turns Markdown into a styled `.docx`: cover page, Document Control, Document
Information, revision history, table of contents, then your content with
properly styled headings, tables, lists and callouts.

Nothing about any organisation is compiled into the generator. Colours, fonts,
sizes, spacing, page size, company name, classification marker and the header and
footer wording all come from a brand file, and `brands/neutral.json` is a plain
starting point.

## Quick start

```bash
npm install                 # once, in this skill folder: installs docx

node scripts/generate-document.js \
  --input  ./body.md \
  --output ./Widget-PRD.docx \
  --title  "Widget Product Requirements Document" \
  --product "Widget" \
  --version 1.0 \
  --author "A. Author"
```

`--help` lists every flag. The common ones: `--type` (the line above the product
name on the cover), `--tagline`, `--trading-name`, `--status`, `--purpose`,
`--scope`, `--audience`, `--note` (a yellow callout), and `--no-front-matter` to
start straight at the body.

## Make a brand for the organisation

This is the first thing to do for a new client, product line or employer:

```bash
cp brands/neutral.json brands/acme.json
```

Then edit it — at minimum `organisation.legalName`, the heading and table
colours, and `fonts.primary`. Render with it:

```bash
node scripts/generate-document.js --brand acme --input body.md --output acme-spec.docx
node scripts/verify-output.js acme          # validates values and renders a sample
```

`--brand` takes a brand id from `brands/` or a path to a JSON file anywhere, so a
brand can live with the project rather than in this skill. `DOC_BRAND` does the
same through the environment.

A brand file carries:

| Section | Holds |
|---|---|
| `organisation` | Legal name, trading prefix, classification marker, header and footer templates |
| `page` | `A4` or `Letter`, and margins in DXA |
| `fonts` | `primary` for everything, `code` for inline code |
| `colors` | Headings, tables, cover, callouts, links — 6-digit hex, no `#` |
| `sizes` | Half-points: 22 means 11pt |
| `spacing` | Heading and paragraph spacing, cell margins, cover layout, in DXA |

Header and footer templates accept `{title}`, `{version}`, `{legalName}`,
`{tradingName}`, `{page}` and `{pages}`. Set `organisation.classification` to an
empty string for a document with no CONFIDENTIAL marker.

Read `references/style-guide.md` before editing a brand: it explains what each
group controls, the two units Word uses, and the mistakes that only show up once
a document is rendered.

## Writing the body

Plain Markdown. Blocks: `#` to `####` headings, paragraphs, `-` bullets (indent
for a second level), `1.` numbered lists, `|` pipe tables, `>` callouts (several
consecutive `>` lines become one callout), and `---` for a page break.

Inline, anywhere including headings, table headers and callouts: `**bold**`,
`__bold__`, `*italic*`, `_italic_`, `***bold italic***`, `` `code` ``,
`<u>underline</u>`, `~~strikethrough~~` and `[text](https://example.com)`.
Emphasis needs a non-space just inside the marks, so `2 * 3 * 4` and
`snake_case_name` are left alone.

Body paragraphs are justified. A brand can set `"body": { "align": "left" }` to
turn that off. Each numbered list restarts at 1, and a `---` that would produce a
blank page is ignored; `"markdown": { "hrMeans": "nothing" }` makes `---` purely
decorative.

Number your own section headings (`## 1. Introduction`) — the template does not
number them, so what you write is what appears.
`references/document-patterns.md` has skeletons for PRDs, specifications and
reports.

## Building a document in code

When content is generated rather than written:

```javascript
const { generateDocument } = require('./scripts/generate-document.js');

await generateDocument('./out/report.docx', {
  brand: './brands/acme.json',
  config: { title: 'Quarterly Report', version: '2.1', preparedBy: 'A. Author' },
  content: (b) => {
    b.heading('1. Summary', 1);
    b.paragraph('Revenue grew **12%** against the prior quarter.');
    b.table([['Metric', 'Q1', 'Q2'], ['Revenue', '1.2m', '1.35m']]);
    b.note('Figures are unaudited.');
  },
});
```

Builder methods: `heading(text, level)`, `paragraph(text)`, `bullet(text, level)`,
`numbered(text)`, `table(rows, widths)`, `note(text)`, `centred(text, opts)`,
`spacer(dxa)`, `pageBreak()`.

## Defaults worth knowing

- **Front matter is on.** Cover, Document Control, Document Information, revision history and contents come from the config. `--no-front-matter` omits all five.
- **The contents page is a Word field**, refreshed when the reader opens the document.
- **Revision history appears only when revisions are passed** (`config.revisions`).
- **Tables zebra-stripe automatically**; the first row is the header row.
- **`docx` is not bundled.** `npm install` here or in the calling project; the version is pinned in `package.json` and the script exits with that instruction if it cannot resolve it.

## Files

- `brands/neutral.json` — neutral default, and the template for a new brand
- `scripts/generate-document.js` — generator, CLI and programmatic API
- `scripts/verify-output.js` — validates a brand file and renders a sample
- `scripts/style-constants.js` — brand values in a `V2.colors.x` shape for older scripts
- `references/style-guide.md` — what each style decision is for
- `references/document-patterns.md` — section skeletons per document type

## Branded siblings

A branded skill is this generator with an organisation's brand file as its
default and nothing else changed. Keep the generator identical across siblings:
change it here, then copy across. Everything organisation-specific belongs in
`brands/`, never in the scripts.
