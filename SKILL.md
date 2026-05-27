---
name: md-to-redesigned-html
version: 0.0.1
description: |
  HTML layer for your LLM-wiki. Takes a folder of markdown notes and produces a
  coherent design-system-grounded HTML site where the LLM is the authoring partner.
  Invoke as /md-to-redesigned-html ./folder from within Claude Code.
  Pipeline: design-system init (once per folder) → per-file render → sanitize →
  index generation. Output is static HTML in ./_site/ deployable to any static host.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

<!-- Scaffold from T1. Full orchestration content lands in T6. -->

# md-to-redesigned-html

The HTML layer for your LLM-wiki.

## Pipeline (filled in by T6)

1. **Init** (first run only per folder)
   - Copy `themes/default.css` → `./_design/system.css` in the target folder.
   - User-edited `_design/system.css` is respected on subsequent runs.

2. **Per-file build**
   - For each `.md` in the source folder:
     - **Skip if a sibling `<name>.html` already exists in source** — the HTML is
       treated as authoritative (hand-authored or v1-edited). Mixed corpus OK.
     - Read source.
     - Apply `prompts/render.md` with source content + the CSS class vocabulary
       extracted from `_design/system.css`.
     - Claude emits a `<manifest>` block (title, summary, tags) and an `<html>` block.
     - Run `bin/sanitize.ts` on the HTML.
     - Write `./_site/<source-name>.html` + a sidecar JSON manifest.
   - For each `.html` in the source folder (sibling-of-skipped-md OR standalone):
     - Copy as-is to `./_site/<source-name>.html` (do not re-render).
     - Generate a sidecar manifest from the HTML content via one LLM call
       (title + summary + tags only — no rewrite). Included in the index.

3. **Index generation**
   - Build `./_site/index.html` from all sidecar manifests (LLM-rendered + HTML-copied).
   - Tags are LLM-emitted free-form taxonomy; group + filter on the index page.
   - Plain `sitemap.xml`. No client-side search in v0.

## Design principle — coherence at the token level, freedom at the composition level

The theme is a contract on coherence, not a cap on creativity.

- **Tokens** — `--accent`, `--fg`, `--space-*`, `--font-sans`, etc. — are the shared
  visual language. Every page references them. This is what makes a folder of 50
  notes feel like one site.
- **Base typography** — every standard HTML element (`h1`-`h6`, `p`, `ul`, `table`,
  `code`, `details`, …) is styled regardless of class. Pure semantic HTML still
  looks decent.
- **Named patterns** — `.callout`, `.eyebrow`, `.index-card`, `.page--with-toc`,
  etc. — are pre-baked moves for common shapes. Suggestions, not rules.

When a pattern doesn't fit, the LLM is encouraged to invent — via a per-page
`<style>` block or token-referencing inline styles. The render prompt (T3) carries
this directive; the sanitizer (T4) allows `<style>` blocks and `style` attributes
for the same reason. Coherence comes from tokens, not from class-name policing.

## Structure

```
SKILL.md             # this file (orchestration, T6)
themes/default.css   # the single baked theme (T2)
prompts/render.md    # render prompt with versioned frontmatter (T3)
prompts/eval.md      # eval-loop prompt (T5)
bin/sanitize.ts      # deterministic HTML sanitizer (T4)
bin/eval.ts          # offline LLM-as-judge eval helper (T5)
README.md            # install + invocation (T9)
```

## Out of scope for v0

CLI / npm distribution, cache layer, betaZodTool runtime, auth abstraction, token
meter, concurrency manager, multiple themes, inline editing (v1), agent loop (v2),
client-side search.
