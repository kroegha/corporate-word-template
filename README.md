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
| `brands/neutral.json` | Neutral default, and the template for a new brand |
| `scripts/generate-document.js` | Generator, CLI and programmatic API |
| `scripts/verify-output.js` | Validates a brand file and renders a sample |
| `scripts/style-constants.js` | Brand values in an older `V2.colors.x` shape |
| `references/style-guide.md` | What each style decision is for |
| `references/document-patterns.md` | Skeletons for PRDs, specifications and reports |

## Run it

```bash
npm install
cp brands/neutral.json brands/acme.json     # edit for the organisation
node scripts/generate-document.js --brand acme --input body.md --output doc.docx --title "My Document"
node scripts/verify-output.js acme
```

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
