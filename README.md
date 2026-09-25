# corporate-word-template

A Claude skill that turns Markdown into a styled Word document — cover page,
Document Control, revision history, table of contents, styled tables, callouts —
with every branding decision supplied as a JSON file.

`SKILL.md` is what the agent reads and is the operational source. This file
orients someone opening the repository.

## What is in here

| Path | Holds |
|---|---|
| `SKILL.md` | How to run the generator, make a brand, and write the body |
| `brands/neutral.json` | Neutral default, and the template for a new brand. Calibri for body and headings, Consolas for code, in a greyscale palette so it carries no one's branding until you set yours |
| `scripts/generate-document.js` | Generator, CLI and programmatic API |
| `scripts/verify-output.js` | Validates a brand file, then reads the rendered document back and checks it |
| `scripts/style-constants.js` | Brand values in an older `V2.colors.x` shape |
| `references/style-guide.md` | What each style decision is for |
| `references/document-patterns.md` | Skeletons for PRDs, specifications and reports |

## Run it

```bash
npm install
cp brands/neutral.json brands/acme.json     # edit for the organisation
node scripts/generate-document.js --brand acme --input body.md --output doc.docx --title "My Document"
node scripts/verify-output.js acme
node scripts/verify-output.js --input real-prd.md   # the same checks on a real document
```

`verify-output.js` has two layers. It validates the brand values, then unzips the
rendered `.docx` and fails on literal markdown markers left in the text,
unjustified body paragraphs, numbered lists sharing one counter, two page breaks
in a row, or missing front matter. Put the `--input` form in CI against a real
document: a verify step that cannot see those defects passes them.

## What it renders

Blocks: `#` to `####` headings, paragraphs, `-` bullets, `1.` numbered lists
(each list restarts at 1), `|` tables, `>` callouts (consecutive `>` lines become
one), `---` page breaks that are skipped when they would leave a blank page.

Inline, anywhere including headings, table headers and callouts: `**bold**`,
`__bold__`, `*italic*`, `_italic_`, `***both***`, `` `code` ``, `<u>underline</u>`,
`~~strike~~` and `[links](https://example.com)`. Emphasis requires a non-space
inside the marks, so `2 * 3 * 4` and `snake_case_name` are left alone.

Body paragraphs are justified unless a brand sets `"body": { "align": "left" }`.

`docx` is a dependency rather than a bundled copy, so the caller controls the
version. The script exits with that instruction if it cannot resolve it.

## Branded siblings

A branded skill is this generator with its organisation's brand file as the
default and nothing else changed. `scripts/generate-document.js` and
`scripts/verify-output.js` stay identical across siblings apart from the default
brand id: change them here first, then copy across. Everything
organisation-specific belongs in `brands/`, never in the scripts.

`ddd-word-template` (private) is the sibling this was extracted from.

## Licence

MIT. See LICENSE.
