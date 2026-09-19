# Document patterns

Skeletons for the document types this template is used for. Each gives the
generator flags and the Markdown body to start from. The old version of this file
carried docx JavaScript for every element; the builder now does that, so what is
left here is the shape of the document.

## Contents

1. [Product Requirements Document](#product-requirements-document)
2. [Technical specification](#technical-specification)
3. [Project report](#project-report)
4. [Section numbering](#section-numbering)
5. [Front matter fields](#front-matter-fields)

## Product Requirements Document

The full formal structure: everything in the front matter, then numbered sections.

```bash
node scripts/generate-document.js \
  --input ./widget-prd.md --output ./Widget-PRD-v1.0.docx \
  --type "PRODUCT REQUIREMENTS DOCUMENT" \
  --title "Widget Product Requirements Document" \
  --product "Widget" --tagline "Scheduling for small teams" \
  --spec-type "Complete Specification" --edition "Initial Release" \
  --version 1.0 --author "A. Author" \
  --purpose "Defines what Widget must do for its first release." \
  --scope "Functional and non-functional requirements, excluding pricing." \
  --audience "Development team, stakeholders, investors"
```

Body:

```markdown
# 1. Executive Summary
# 2. Problem Statement
# 3. Goals and Non-Goals
# 4. Users and Use Cases
# 5. Functional Requirements
## 5.1 <Area>
# 6. Non-Functional Requirements
# 7. Technical Approach
# 8. Dependencies and Assumptions
# 9. Milestones
# 10. Open Questions
# A. Glossary
```

Use `>` callouts for a constraint the reader must not miss, such as a fixed
launch date or a regulatory requirement the design turns on.

## Technical specification

Lighter front matter: no tagline or edition, and often no revision history until
it is circulated.

```bash
node scripts/generate-document.js \
  --input ./api-spec.md --output ./Widget-API-Spec-v0.3.docx \
  --type "TECHNICAL SPECIFICATION" \
  --title "Widget API Specification" --product "Widget API" \
  --version 0.3 --status "Draft for review"
```

```markdown
# 1. Overview
# 2. Architecture
# 3. Interfaces
## 3.1 <Endpoint or component>
# 4. Data Model
# 5. Error Handling
# 6. Security
# 7. Performance and Limits
# 8. Open Questions
```

## Project report

For something read once, where a cover and contents would be overhead, drop the
front matter entirely and start at the first heading:

```bash
node scripts/generate-document.js \
  --input ./q3-report.md --output ./Q3-Report.docx --no-front-matter
```

```markdown
# Executive Summary
# What Changed This Quarter
# Metrics
# Risks
# Next Quarter
```

## Section numbering

Type the numbers yourself. The template styles headings but does not number them,
so what you write is what appears, and a section can be inserted without every
later number silently moving.

| Level | Written as | Example |
|---|---|---|
| Heading 1 | `# N. Title` | `# 3. Requirements` |
| Heading 2 | `## N.N Title` | `## 3.1 Functional` |
| Heading 3 | `### N.N.N Title` | `### 3.1.1 Scheduling` |
| Appendix | `# A. Title` | `# A. Glossary` |

Keep appendices lettered and annexures after them, so a reader can tell
supporting material from the argument.

## Front matter fields

| Field | Flag | Appears |
|---|---|---|
| Document type | `--type` | Top line of the cover |
| Product | `--product` | Large name on the cover, and the page header |
| Tagline | `--tagline` | Under the product name |
| Specification type, edition | `--spec-type`, `--edition` | Middle of the cover |
| Version, date | `--version`, `--date` | Cover, Document Control, page header |
| Trading name | `--trading-name` | `t/a <name>` under the legal name |
| Prepared by, status | `--author`, `--status` | Document Control |
| Purpose, scope, audience | `--purpose`, `--scope`, `--audience` | Document Information |
| Callout | `--note` | Yellow box under Document Information |
| Revisions | `config.revisions` (programmatic) | Revision History table |

The legal name, trading prefix and classification marker come from the brand
file, not from a flag: they are properties of the organisation, not of the
document.
