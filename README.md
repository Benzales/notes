# md-to-redesigned-html

The HTML layer for your LLM-wiki. Takes a folder of markdown notes and produces a coherent, design-system-grounded HTML site — LLM as authoring partner, Claude Code as runtime.

> Scaffold from T1. Full install + invocation + before/after demo lands in T9.

## Status

Pre-release.

## Install (will be finalized in T9)

```sh
git clone https://github.com/Benzales/notes ~/.claude/skills/md-to-redesigned-html
```

The repo is named `notes`; the skill directory must be `md-to-redesigned-html` to match `name:` in `SKILL.md` frontmatter — that's what `/md-to-redesigned-html` resolves to.

## Invoke

```
/md-to-redesigned-html ./folder
```

From within Claude Code. Output: `./folder/_site/`.

## What it does

- **Init** (first run per folder): copies `themes/default.css` to `./_design/system.css`. Edit it freely; future runs respect your edits.
- **Render**: one Claude invocation per source file. Emits a manifest block (title, summary, tags) + an HTML block per the render prompt.
- **Sanitize**: deterministic HTML sanitizer (`bin/sanitize.ts`) runs on every rendered file. Allowlist-based.
- **Index**: builds `_site/index.html` grouped + filterable by LLM-emitted tags. Plain `sitemap.xml`.

## Trust boundary

Source notes are treated as untrusted text. The sanitizer is the safety net against prompt-injection vectors that try to emit malicious HTML. Full security model documented in T9.

## License

TBD (T9).
