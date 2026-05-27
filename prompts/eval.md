---
name: eval
version: 0.0.1
owner: T5
---

<!--
  Scaffold from T1. T5 writes the eval-loop prompt body.

  Used by bin/eval.ts (offline). LLM-as-judge against a fixture corpus with a
  rubric. Surfaces quality drift quantitatively (e.g., "5% of titles empty"),
  not at runtime.

  Inputs: rendered HTML + source content + rubric criteria.
  Output: per-criterion score + brief justification.
-->
