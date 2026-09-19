# Style guide: what each decision is for

The values themselves live in `brands/<id>.json`, and the generator reads them
from there. This file explains what each group controls and what to be careful
of when editing a brand, so the numbers are in one place and the reasoning in
another.

## Contents

1. [Units](#1-units)
2. [Fonts](#2-fonts)
3. [Colour roles](#3-colour-roles)
4. [Headings](#4-headings)
5. [Tables](#5-tables)
6. [Cover page](#6-cover-page)
7. [Header and footer](#7-header-and-footer)
8. [Lists and callouts](#8-lists-and-callouts)
9. [Page setup](#9-page-setup)
10. [Editing a brand safely](#10-editing-a-brand-safely)

## 1. Units

Word uses two units, and mixing them up is the most common mistake in a brand
file.

| Unit | Used for | Conversion |
|---|---|---|
| Half-points | Font sizes | 22 = 11pt. Double the point size you want |
| DXA (twentieths of a point) | Spacing, margins, table widths | 1440 = 1 inch, 720 = half an inch |

Colours are 6-digit hex **without** a leading `#`. `verify-output.js` fails a
brand that gets either of these wrong.

## 2. Fonts

`fonts.primary` is used for every run in the document, including tables, headers
and the cover, so a document never mixes typefaces by accident. `fonts.code` is
used only for inline `` `code` ``, where a monospace face makes an identifier
readable.

Pick a font the reader will have. A brand naming a font that is not installed
renders in a substitute, and the page count moves with it.

## 3. Colour roles

Each key is a role, not a shade, so a brand can be re-skinned without touching
the generator:

| Key | Applies to |
|---|---|
| `heading1` … `heading4` | Heading runs at each level |
| `tableHeader`, `tableHeaderText` | Header row fill and its text |
| `tableRowAlt`, `tableRowNormal` | Zebra striping on data rows |
| `tableBorder` | All table borders |
| `headerFooter` | Page header and footer text |
| `coverTitle`, `coverProduct`, `coverSubtitle`, `coverSpec`, `coverEdition` | The cover, top to bottom |
| `confidential` | The classification marker |
| `noteBackground`, `noteText` | Callout boxes |
| `inlineCode` | Inline code runs |
| `hyperlink` | Link text |

Keep `tableHeaderText` readable against `tableHeader`: a dark header fill needs
white text, and a light one needs dark text. Nothing checks contrast for you.

## 4. Headings

Four levels, each mapped to a Word built-in style so the table of contents and
the navigation pane work. `outlineLevel` is what the contents field reads, which
is why headings must be real headings rather than bold paragraphs.

Spacing is larger before a heading than after it, so a heading sits with the text
it introduces rather than floating between two blocks. Heading 4 is italic in the
supplied brand, which separates it from Heading 3 without another size
step.

The contents page covers levels 1 to 3. A level 4 heading is deliberately absent
from it: if something needs to be found from the contents, it should be a level 3.

## 5. Tables

- The first row is the header row, repeated by Word when a table breaks across pages.
- Data rows alternate `tableRowNormal` and `tableRowAlt`, which is what makes a wide table readable across a row.
- Cell margins give text room: 80 DXA top and bottom, 120 left and right. Less than that and text touches the borders.
- Column widths default to an even split of 9360 DXA (the text width of an A4 page with 1-inch margins). Pass explicit widths where one column holds most of the text.

## 6. Cover page

The order is fixed: document type, product name, tagline, specification type,
edition, version and date, legal name, trading name, classification. Each element
is skipped when its config value is empty, so a lighter cover needs no template
change.

`coverTopSpace` (1800 DXA, about 1.25 inches) is what pushes the block down the
page. Adjust that rather than adding empty paragraphs.

## 7. Header and footer

Both are templates in the brand file, so an organisation that words its header
differently does not need code:

```json
"headerTemplate": "{title} v{version} | {legalName}",
"footerTemplate": "Page {page} of {pages}"
```

Placeholders: `{title}`, `{version}`, `{legalName}`, `{tradingName}` in the
header; `{page}` and `{pages}` in the footer, which become live Word fields.

## 8. Lists and callouts

Bullets are ● at level 0 and ○ at level 1, indented 720 and 1080 DXA with a 360
hanging indent, so wrapped lines align under the text rather than the bullet.
Numbered lists use `%1.` at level 0.

A callout is a shaded paragraph, not a table, so it flows with the text and never
splits awkwardly. Use it for something the reader must not miss, and sparingly:
three callouts on a page is none.

## 9. Page setup

`page.size` accepts `A4` (11906 × 16838 DXA) or `Letter` (12240 × 15840). Margins
default to 1 inch on all four sides. Changing the page size changes the usable
text width, so explicit table widths may need revisiting with it.

## 10. Editing a brand safely

1. Copy an existing brand rather than starting from nothing, so no key is missing.
2. Change colours in role groups, not one at a time: a new heading colour usually needs the table header and cover title to move with it.
3. Run `node scripts/verify-output.js <brand>` — it validates the values and renders a sample document with every element in it.
4. Open the sample. Contrast, font substitution and a cover that has grown past one page are visible there and nowhere else.
