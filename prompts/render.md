---
name: render
version: 0.0.1
owner: T3
---

<!--
  Scaffold from T1. T3 writes the v0.1 render prompt body.

  Required output shape (parsed by the skill from tag boundaries):

    <manifest>
    { "title": "...", "summary": "...", "tags": ["..."] }
    </manifest>

    <html>
    <article class="...">...</article>
    </html>

  Inputs available to the prompt:
    - source file content (.md or .html)
    - CSS class vocabulary extracted from _design/system.css

  Robustness:
    - prompt-quality enforces structure (no API-layer schema in v0)
    - bin/sanitize.ts runs on the <html> section before write
    - bin/eval.ts measures drift offline against fixture corpus
-->
