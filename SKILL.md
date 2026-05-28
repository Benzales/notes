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

# md-to-redesigned-html

The HTML layer for your LLM-wiki.

## Invocation

The user runs `/md-to-redesigned-html <folder>` where `<folder>` is a path to
a directory containing markdown (and optionally HTML) notes. Render every
`.md` into a designed HTML page in `<folder>/_site/` and produce a navigable
static site.

Resolve `<folder>` to an absolute path first. If it doesn't exist or isn't a
directory, stop and tell the user. Don't create it for them — that suggests
an invocation typo, not a missing folder.

Throughout this procedure, `$SKILL_DIR` refers to this skill's install
location (the directory containing this `SKILL.md` file). You can derive it
from the path you read this file from.

## Procedure

### Step 1 — Initialize the per-folder design system

1. Use **Read** on `$SKILL_DIR/themes/default.css` — the canonical theme.
2. Check if `<folder>/_design/system.css` exists.
   - If it doesn't: use **Write** to copy the canonical theme there. This
     becomes the per-folder design system the user can edit between runs.
   - If it does: leave it alone. The user has edited it; respect that.
3. Use **Read** on `<folder>/_design/system.css` to get the current design
   system CSS. This is the `{{DESIGN_SYSTEM_CSS}}` substitution for each
   render call in step 3.

### Step 2 — Discover and plan

1. Use **Glob** with pattern `<folder>/**/*.md` to list every markdown file
   (recursive — wikis often have subdirectories like `repos/`).
2. Use **Glob** with `<folder>/**/*.html` to list every HTML file (either
   hand-edits sitting next to a `.md`, or standalone HTML).
3. For each `.md`, check if a sibling `<name>.html` exists in the **same
   directory**. If yes, skip the `.md` (mixed-corpus rule: HTML wins).
4. Determine the **landing file** from this allowlist, checking **top-level
   only** (subdirectory matches don't count as the site landing):
   - `index.md`, `index.html`
   - `README.md`, `README.html`
   - `overview.md`, `overview.html`
   - `home.md`, `home.html`
   - `start.md`, `start.html`

   First match wins. Remember which one — step 3 writes its output to
   `_site/index.html` instead of `_site/<name>.html`.
5. Use **Bash** `mkdir -p <folder>/_site` to ensure the output directory
   exists.

### Step 3 — Render each markdown file

For each `.md` not skipped, in any order (sequential, single context — see
"Performance notes" for scale limits):

1. Use **Read** to load the source. This is `{{SOURCE_CONTENT}}`.
2. Use **Read** to load `$SKILL_DIR/prompts/render.md` — the render prompt
   template.
3. Substitute `{{DESIGN_SYSTEM_CSS}}` (from step 1) and `{{SOURCE_CONTENT}}`
   (from this step) into the template.
4. **Apply the substituted prompt directly.** You are the LLM the prompt is
   addressed to — produce your response per the prompt's instructions, which
   means: start with `<html>`, end with `</html>`, no preamble or commentary.
5. **If your output isn't framed by `<html>...</html>`**, mark this file
   **failed** and move on (don't retry — see "Failure handling"). Continue
   the loop.
6. Use **Write** to save your output to a temp file under `/tmp/`. Use a
   stable name like `/tmp/wikify-render-<slug>.html` (slug = source filename
   with non-alphanumeric replaced by `-`).
7. Run **Bash**:
   ```sh
   npx tsx $SKILL_DIR/bin/sanitize.ts < /tmp/wikify-render-<slug>.html \
     > /tmp/wikify-clean-<slug>.html 2> /tmp/wikify-stderr-<slug>.txt
   ```
   (substitute the actual paths). The sanitize subprocess strips disallowed
   tags/attributes AND unwraps the outer `<html>` parse-marker, leaving the
   article body.
8. Use **Read** on `/tmp/wikify-clean-<slug>.html` — the sanitized article
   body. This is `{{ARTICLE_HTML}}` in the page shell.
9. Use **Read** on `/tmp/wikify-stderr-<slug>.txt` — sanitize's one or two
   line summary. Save the line in memory for the build report. Ignore
   `sanitize: clean` lines; remember anything else.
10. Extract the **page title** — `<h1>...</h1>` content from the sanitized
    body. If there isn't one, fall back to the source filename without
    extension.
11. **Wrap in the page shell** (see the next major section below). Substitute
    `{{TITLE}}`, `{{ARTICLE_HTML}}`, and `{{DESIGN_SYSTEM_CSS}}` (the same
    CSS content you loaded in step 1.3 — inlined into the page's `<style>`
    block so each page is self-contained).
12. **Determine the output path:**
    - If this source file is the landing file (step 2.4), write to
      `<folder>/_site/index.html`.
    - Otherwise, write to `<folder>/_site/<relative-path>.html`,
      preserving subdirectory structure. Example: `repos/micrograd.md` →
      `_site/repos/micrograd.html`. Use **Bash** `mkdir -p` to create
      intermediate directories first if they don't exist.
    - Use **Write** to save the wrapped page.

### Step 4 — Copy standalone HTML files

For each `.html` source file that wasn't a sibling-of-skipped-md and isn't
the landing file already handled in step 3:

1. Use **Read** to load the file.
2. Use **Write** to copy to `<folder>/_site/<relative-path>.html` (same
   rename-on-write rule for the landing match).

We don't sanitize hand-authored HTML in v0 — the user wrote it, they own it.
If they want sanitization, they can rename to `.md` and re-run.

### Step 5 — Generate the fallback hub if no landing matched

After steps 3 and 4, check if `<folder>/_site/index.html` exists.

- If yes (the user's curated landing was promoted to it): nothing to do.
- If no (no source file matched the allowlist): generate a minimal hub.

  Construct an article body like:

  ```html
  <article>
    <span class="eyebrow">Index</span>
    <h1>{folder-name}</h1>
    <ul>
      <li><a href="page-a.html">Title A</a></li>
      <li><a href="repos/page-b.html">Title B</a></li>
      ...
    </ul>
  </article>
  ```

  Use the titles you extracted in step 3.10. Sort alphabetically by title.
  Wrap in the page shell with `{{TITLE}}` = folder name. **Write** to
  `<folder>/_site/index.html`.

  The fallback is intentionally plain. Users who want a curated hub create
  an `index.md` / `README.md` / `overview.md` / etc. and re-run.

## Reporting

After the procedure completes, summarize to the user. Don't be verbose;
match this shape:

```
Rendered 47 files → ./folder/_site/

Sanitizer activity (3 files):
  about.md: removed 1 <script>
  notes/links.md: removed 2 javascript: URIs
  tutorials/raw-html.md: wiped 1 <style> block (unsafe CSS)

Index: from overview.md (landing match) → _site/index.html
Open _site/index.html in your browser, or push _site/ to GitHub Pages.
```

Rules:
- Only show files where sanitize did something. Omit `sanitize: clean` lines.
  If the sanitizer was clean across the entire corpus, omit the "Sanitizer
  activity" section entirely.
- If any files failed (step 3.5 marked them), add at the bottom:
  ```
  Failed: 2 files
    notes/broken.md
    drafts/incomplete.md
  ```
  Don't speculate on reasons.
- Index line: state whether the landing came from a user file or the
  fallback hub.

## Failure handling

- **Source folder doesn't exist or isn't a directory** — stop immediately,
  tell the user. No partial build.
- **A render call produces output without `<html>...</html>` framing** —
  mark this file failed, move on. **Don't retry** — your own reasoning has
  already failed; retrying in the same context rarely helps and burns
  tokens. Surface the file in the final report.
- **sanitize.ts subprocess fails (non-zero exit code)** — extremely rare
  (only on malformed stdin); mark file failed, capture the stderr, move on.
- **Output path collision** — two source files target the same
  `_site/<name>.html` (e.g., both `Foo.md` and `foo.md` exist on a
  case-insensitive filesystem). Log a warning and let the second write win.
- **Subdirectory `_site/` already contains stale files from a previous run**
  — don't clean it. The user may have edits. Overwrites happen file-by-file;
  files no longer in source linger. Documented; not a bug.

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
<style>
{{DESIGN_SYSTEM_CSS}}
</style>
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
`{{DESIGN_SYSTEM_CSS}}` is the contents of `<folder>/_design/system.css` —
inlined into every page so each page is self-contained (works under `file://`,
HTTPS, any subdirectory depth, GitHub Pages with or without a subpath). Cost:
the theme is duplicated into every page (~20KB per page). Trade-off: when the
user edits `_design/system.css`, they must re-render the corpus for changes
to propagate.

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

## Performance notes — v0 single-context limit

The procedure above runs every file render in a single orchestrator context
(yours). For corpora of ~50 source files or fewer, this is fine — total
in-context tokens stay well under budget. For larger corpora (~100+), the
context fills and later files may render lower-quality or fail.

The fix is **subagent dispatch**: one fresh sub-Claude per file via the
Agent tool, each with only the source + design system + render prompt in
its context. We deferred that to v0.5 because it adds complexity the v0
audience (small personal wikis, the Karpathy demo corpus) doesn't need.

If you're processing a folder with 100+ files and notice quality degrading
mid-build (output structure breaking, fidelity slipping), **stop and tell
the user**. Recommend either splitting the folder into batches or waiting
for the v0.5 subagent dispatch. Don't ship a half-broken corpus silently.

## Out of scope for v0

CLI / npm distribution, cache layer, betaZodTool runtime, auth abstraction, token
meter, concurrency manager, multiple themes, inline editing (v1), agent loop (v2),
client-side search, subagent dispatch (v0.5 — see above).
