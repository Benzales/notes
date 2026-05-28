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
     - **Skip if a sibling `<name>.html` already exists in source** — the HTML
       is treated as authoritative (hand-authored or v1-edited). Mixed corpus OK.
     - Read source.
     - Apply `prompts/render.md` with source content + the design system CSS
       as context.
     - Claude emits a single `<html>` block containing the article body
       (and optionally a per-page `<style>` block at the top).
     - Pipe through `bin/sanitize.ts` to strip disallowed tags/attributes
       (this also unwraps the outer `<html>` parse-marker, leaving the
       article body).
     - Wrap in the page shell (above). `{{TITLE}}` is extracted from the
       rendered article's first `<h1>`.
     - **Write to `_site/index.html` if the source name matches the landing
       allowlist (see step 3); otherwise write to `_site/<source-name>.html`.**
   - For each `.html` in the source folder (sibling-of-skipped-md OR standalone):
     - Copy as-is. Same rename-on-write rule applies: if the filename matches
       the landing allowlist, write to `_site/index.html`; otherwise
       `_site/<source-name>.html`.

3. **Index handling** (Option A′ — rename-on-write with landing allowlist)

   The skill detects the upstream tool's curated landing page by name and
   promotes it to `_site/index.html` so it loads when a visitor opens `_site/`.

   - **Landing allowlist** (first match wins, in order):
     1. `index.md` / `index.html` — universal web convention
     2. `README.md` / `README.html` — GitHub convention
     3. `overview.md` / `overview.html` — `lucasastorian/llmwiki` convention
     4. `home.md` / `home.html` — common wiki convention
     5. `start.md` / `start.html` — alternate wiki convention
   - If any source file matches, step 2 has already written its rendered
     output to `_site/index.html`. No further action.
   - If no source file matches, generate a fallback `_site/index.html`
     listing every rendered page (titles extracted from each `<h1>`).
     Simple list, no client-side filtering in v0.
   - Either way, `_site/index.html` exists when the pipeline completes.
   - No `sitemap.xml` in v0. No client-side search in v0.

## Page shell — what wraps the LLM's `<article>` output

The render prompt instructs the LLM to emit `<article>...</article>` only — no
DOCTYPE, head, or body. The orchestrator (T6) wraps it in a fixed page shell
when writing each `_site/<name>.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' data:; script-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'self';">
<title>{{TITLE}}</title>
<link rel="stylesheet" href="./_design/system.css">
</head>
<body>
<main class="page">
{{ARTICLE_HTML}}
</main>
</body>
</html>
```

`{{TITLE}}` is extracted from the rendered HTML's first `<h1>`.
`{{ARTICLE_HTML}}` is the sanitized output of `bin/sanitize.ts`.

The CSP meta tag is the second defense layer (sanitize-html is the first).
`script-src 'none'` means: even if a `<script>` slips past the sanitizer
(mXSS, future CVE, prompt-injection bypass), the browser refuses to execute
it. The rendered output has no JavaScript by design. `'unsafe-inline'` covers
the `<style>` blocks and `style="..."` attributes the design contract allows.

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
