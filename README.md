# md-to-redesigned-html

The HTML layer for your LLM-wiki. A Claude Code skill that takes a folder of markdown notes and produces a coherent, design-system-grounded HTML site — LLM as authoring partner, Claude Code as runtime.

**Live demo:** [benzales.github.io/notes](https://benzales.github.io/notes/) — Karpathy's LLM pedagogy wiki (31 pages) rendered by this skill.

## Why

The Karpathy-pattern LLM wiki has converged on markdown as substrate because (a) humans had to edit notes by hand and (b) Obsidian / IDE viewers render markdown. Both constraints have softened: LLMs can author rich HTML at speed, and a static-site viewer is one CSS file away.

This skill is the last-mile HTML layer for that pipeline:

```
research artifacts → upstream LLM-wiki tool → markdown wiki → md-to-redesigned-html → HTML site
                     (lucasastorian/llmwiki,    your editable           you are here
                      nashsu/llm_wiki, etc.)    source of truth)
```

Your `.md` files stay your source of truth. The HTML lives in a sibling `_site/` directory — open it locally, push it to GitHub Pages, deploy it anywhere static.

## Install

```sh
git clone https://github.com/Benzales/notes ~/.claude/skills/md-to-redesigned-html
cd ~/.claude/skills/md-to-redesigned-html
npm install
```

The repo is named `notes`; the skill directory must be `md-to-redesigned-html` to match the `name:` field in `SKILL.md` frontmatter — that's what `/md-to-redesigned-html` resolves to inside Claude Code.

## Invoke

Inside any Claude Code session:

```
/md-to-redesigned-html ./folder
```

Output lands at `./folder/_site/`. The skill creates `./folder/_design/system.css` on first run — edit it freely to customize the per-folder theme; future runs respect your edits.

## What lands in your folder

```
your-wiki/
├── overview.md            ← untouched (any markdown source untouched)
├── concept-a.md
├── repos/
│   └── case-study.md
├── _design/               ← NEW (editable design system)
│   └── system.css
└── _site/                 ← NEW (rendered site, open in browser or deploy)
    ├── index.html         ← from your landing file (overview.md / README.md / index.md / etc.)
    ├── concept-a.html
    └── repos/
        └── case-study.html
```

The skill detects a curated landing file by name (`index.md`, `README.md`, `overview.md`, `home.md`, `start.md` — first match wins) and writes its rendered output as `_site/index.html` so visitors land on it when they open `_site/`.

## Pipeline

```
.md source ─┬─► render prompt + theme + source → LLM → article HTML
            │
            └─► bin/sanitize.ts (allowlist strip) → article body
                                                    │
                page shell (DOCTYPE + CSP + inline CSS) ◄┘
                                                    │
                                                    ▼
                                              _site/<name>.html
```

- **Render** (`prompts/render.md`): one Claude invocation per source file. The prompt teaches the LLM to use HTML's expressive ceiling — diagrams, grids, callouts, per-page `<style>` blocks for invented patterns — while staying faithful to source content.
- **Sanitize** (`bin/sanitize.ts`): allowlist-based, built on [sanitize-html](https://github.com/apostrophecms/sanitize-html). Strips `<script>`, `<iframe>`, event handlers, `javascript:` URIs, and unsafe CSS inside `<style>` blocks. Emits a one-line stderr summary of what got removed.
- **Page shell**: every rendered page is wrapped in a fixed `<!DOCTYPE html>` + `<head>` (with strict CSP, `script-src 'none'`) + `<body>` template, with the design system CSS inlined for self-contained pages.

## Trust boundary and security

Source notes are treated as untrusted text — a maliciously-crafted markdown file can prompt-inject the LLM into emitting `<script>` tags. Four defense layers stop it:

1. **Render prompt** wraps source content in `<source>` tags, instructs the LLM to ignore directives in source.
2. **sanitize-html allowlist** strips disallowed tags/attrs before HTML hits disk.
3. **CSS smell-check** wipes `<style>` blocks containing `javascript:`, `@import`, `expression(`, `behavior:`, or external `url(...)` schemes.
4. **CSP `script-src 'none'`** in the page shell — the browser refuses to execute any script that slips past layers 1-3.

The output has **zero JavaScript by design**.

## Design contract

The theme exposes three layers:

- **Tokens** (`var(--bg)`, `var(--space-3)`, `var(--font-mono)`, etc.) — the shared visual language. The render prompt instructs Claude to use these for any color, type, or spacing. This is what makes 50 pages feel like one site.
- **Base typography** — every standard HTML element (`h1`-`h6`, `p`, `ul`, `table`, `code`, `details`, `dl`, `figure`, ...) styled regardless of class.
- **Named patterns** (`.eyebrow`, `.lede`, `.callout`, `.card`, `.tag`, `.badge`, `.term`, `.index-grid`, `.page--with-toc`, ...) — pre-baked classes for common shapes. Suggestions, not rules.

When a pattern doesn't fit the content, the LLM is encouraged to invent — a per-page `<style>` block declaring new classes that reference tokens, or inline `style="..."` attributes also referencing tokens. Coherence comes from tokens, not class-name policing.

## Scale and limits (v0)

- **Single-context orchestration.** v0 runs every render in a single Claude Code context. Comfortable up to ~50 source files. For larger corpora the orchestrator's context can fill; quality degrades on later files.
- **Subagent dispatch (v0.5).** Switching to one fresh sub-Claude per file is the v0.5 path. Each sub-agent has only its source + design system + render prompt in context, scaling to any corpus size.
- **No incremental rebuild.** Re-runs regenerate the full corpus. v1 may add hash-checked caching.
- **No inline editing.** v0 is one-shot render. v1 introduces click-a-paragraph inline LLM-edit.

## Eval

`bin/eval.ts` runs the render prompt against a fixture corpus and asks Claude (via [`@anthropic-ai/claude-agent-sdk`](https://github.com/anthropics/anthropic-sdk-typescript), authed via your Claude Code session) to judge each rendering against a 4-dimension rubric (fidelity, visual coherence, HTML expressiveness, output shape).

```sh
npm run eval
```

Outputs land in `eval/outputs/` and `eval/report.md`. Use it as a regression check before prompt changes.

## Roadmap

- **v0** (now) — folder → designed HTML site, one-shot render
- **v0.5** — subagent dispatch for large corpora, optional `--theme` flag, css-tree-based CSS sanitization
- **v1** — inline LLM-edit (click any paragraph, prompt to rewrite, write modified source back to disk)
- **v2** (conditional) — live agent loop, diff-approve gate, agentic source mutations

## License

[Apache License 2.0](LICENSE) — same as the upstream LLM-wiki tools this product extends.

---

Built with Claude Code. The design doc and build history live in `~/.gstack/projects/notes/`.
