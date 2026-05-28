// Offline eval loop for md-to-redesigned-html.
//
// Pipeline:
//   for each fixture:
//     render  → Claude (Agent SDK, opus-4-7, tools off)  → HTML
//     sanitize → bin/sanitize.ts (re-used as a function import)
//     judge   → Claude with eval prompt + source + HTML  → JSON scores
//   write eval/outputs/<name>.html + eval/report.md
//   exit 0 if all pass, 1 otherwise
//
// Auth: the Claude Agent SDK auto-uses Claude Code's session auth. Run this
// from a shell where `claude` is installed and logged in. No API key needed.
//
// Not on the render hot path. Inline LLM-as-judge per design 1G; Braintrust
// deferred to v0.5.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { sanitize } from './sanitize.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DEMO_CORPUS = '/Users/benja/wikify/demo-corpus/wiki';
const FIXTURES = ['overview.md', 'attention.md', 'gradient-accumulation.md'];
const MODEL = 'claude-opus-4-7';

const OUT_DIR = resolve(REPO_ROOT, 'eval/outputs');
const REPORT_PATH = resolve(REPO_ROOT, 'eval/report.md');
const RENDER_PROMPT_PATH = resolve(REPO_ROOT, 'prompts/render.md');
const EVAL_PROMPT_PATH = resolve(REPO_ROOT, 'prompts/eval.md');
const THEME_PATH = resolve(REPO_ROOT, 'themes/default.css');

// ─── Types ──────────────────────────────────────────────────────────────────

type CriterionScore = { score: number; justification: string };
type Scores = {
  fidelity: CriterionScore;
  visual_coherence: CriterionScore;
  html_expressiveness: CriterionScore;
  output_shape: CriterionScore;
};
type Verdict = 'pass' | 'weak' | 'fail';
type FixtureResult =
  | { fixture: string; ok: true; html: string; scores: Scores; verdict: Verdict }
  | { fixture: string; ok: false; html: string; error: string };

// ─── Helpers ────────────────────────────────────────────────────────────────

function readPromptVersion(path: string): string {
  const body = readFileSync(path, 'utf8');
  const m = body.match(/^---[\s\S]*?\nversion:\s*([^\n]+)\n[\s\S]*?\n---/);
  return m ? m[1].trim() : 'unknown';
}

function stripFrontmatter(body: string): string {
  return body.replace(/^---[\s\S]*?\n---\n/, '');
}

async function callClaude(prompt: string): Promise<string> {
  let text = '';
  for await (const msg of query({
    prompt,
    options: {
      model: MODEL,
      allowedTools: [],
      permissionMode: 'bypassPermissions',
    },
  })) {
    if (msg.type === 'assistant') {
      for (const block of msg.message.content) {
        if (block.type === 'text') text += block.text;
      }
    }
  }
  return text;
}

function parseScores(raw: string): Scores | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  try {
    const parsed = JSON.parse(body.trim());
    const keys: (keyof Scores)[] = [
      'fidelity',
      'visual_coherence',
      'html_expressiveness',
      'output_shape',
    ];
    for (const k of keys) {
      const v = parsed[k];
      if (
        !v ||
        typeof v.score !== 'number' ||
        typeof v.justification !== 'string'
      ) {
        return null;
      }
    }
    return parsed as Scores;
  } catch {
    return null;
  }
}

function verdictFor(scores: Scores): Verdict {
  const values = [
    scores.fidelity.score,
    scores.visual_coherence.score,
    scores.html_expressiveness.score,
    scores.output_shape.score,
  ];
  if (values.some((v) => v <= 1)) return 'fail';
  if (values.some((v) => v <= 2)) return 'weak';
  return 'pass';
}

// ─── Page shell (mirrors SKILL.md; theme link is relative to eval/outputs/) ──

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractTitle(articleHtml: string, fallback: string): string {
  const m = articleHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return fallback;
  const text = m[1].replace(/<[^>]+>/g, '').trim();
  return text || fallback;
}

function wrapInPageShell(articleFragment: string, fallbackTitle: string): string {
  const title = escapeHtml(extractTitle(articleFragment, fallbackTitle));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' data:; script-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'self';">
<title>${title}</title>
<link rel="stylesheet" href="../../themes/default.css">
</head>
<body>
<main class="page">
${articleFragment}
</main>
</body>
</html>
`;
}

// ─── Render + judge per fixture ─────────────────────────────────────────────

async function runFixture(
  fixture: string,
  renderPromptTpl: string,
  evalPromptTpl: string,
  designSystemCss: string,
): Promise<FixtureResult> {
  const sourcePath = resolve(DEMO_CORPUS, fixture);
  const source = readFileSync(sourcePath, 'utf8');

  // 1. Render
  process.stderr.write(`  [${fixture}] rendering…\n`);
  const renderPrompt = renderPromptTpl
    .replace('{{DESIGN_SYSTEM_CSS}}', designSystemCss)
    .replace('{{SOURCE_CONTENT}}', source);
  const rawHtml = await callClaude(renderPrompt);

  // 2. Sanitize
  const cleanHtml = sanitize(rawHtml);

  // 3. Persist — page-shell-wrapped so eval outputs are browser-viewable.
  //    The judge still sees the bare article fragment (cleanHtml), not the shell.
  const stem = basename(fixture, '.md');
  const outName = stem + '.html';
  const outPath = resolve(OUT_DIR, outName);
  writeFileSync(outPath, wrapInPageShell(cleanHtml, stem), 'utf8');

  // 4. Judge
  process.stderr.write(`  [${fixture}] judging…\n`);
  const judgePrompt = evalPromptTpl
    .replace('{{SOURCE_CONTENT}}', source)
    .replace('{{RENDERED_HTML}}', cleanHtml);
  const judgeRaw = await callClaude(judgePrompt);

  const scores = parseScores(judgeRaw);
  if (!scores) {
    return {
      fixture,
      ok: false,
      html: cleanHtml,
      error: `judge response unparseable; raw:\n${judgeRaw.slice(0, 500)}`,
    };
  }

  return { fixture, ok: true, html: cleanHtml, scores, verdict: verdictFor(scores) };
}

// ─── Report ─────────────────────────────────────────────────────────────────

function renderReport(
  results: FixtureResult[],
  renderVersion: string,
  evalVersion: string,
): string {
  const lines: string[] = [];
  const stamp = new Date().toISOString();

  lines.push('# Eval report — md-to-redesigned-html');
  lines.push('');
  lines.push(`- **Run:** ${stamp}`);
  lines.push(`- **Model:** ${MODEL}`);
  lines.push(`- **Render prompt:** v${renderVersion}`);
  lines.push(`- **Eval prompt:** v${evalVersion}`);
  lines.push(`- **Fixture source:** ${DEMO_CORPUS}`);
  lines.push('');

  // Tally
  let pass = 0;
  let weak = 0;
  let fail = 0;
  let errored = 0;
  for (const r of results) {
    if (!r.ok) errored++;
    else if (r.verdict === 'pass') pass++;
    else if (r.verdict === 'weak') weak++;
    else fail++;
  }

  lines.push(`## Tally`);
  lines.push('');
  lines.push(
    `**pass** ${pass} · **weak** ${weak} · **fail** ${fail} · **judge-error** ${errored}`,
  );
  lines.push('');

  // Per-fixture scores table
  lines.push('## Scores');
  lines.push('');
  lines.push('| Fixture | Fidelity | Coherence | HTML | Shape | Verdict |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of results) {
    if (!r.ok) {
      lines.push(`| \`${r.fixture}\` | — | — | — | — | **judge-error** |`);
      continue;
    }
    const s = r.scores;
    lines.push(
      `| \`${r.fixture}\` | ${s.fidelity.score} | ${s.visual_coherence.score} | ${s.html_expressiveness.score} | ${s.output_shape.score} | **${r.verdict}** |`,
    );
  }
  lines.push('');

  // Detail — justifications, focus on anything < 3
  lines.push('## Detail');
  lines.push('');
  for (const r of results) {
    lines.push(`### \`${r.fixture}\``);
    lines.push('');
    if (!r.ok) {
      lines.push('**judge-error.** Raw response unparseable.');
      lines.push('');
      lines.push('```');
      lines.push(r.error);
      lines.push('```');
      lines.push('');
      continue;
    }
    const s = r.scores;
    const row = (label: string, c: CriterionScore) => {
      const flag = c.score <= 2 ? ' ⚠' : '';
      lines.push(`- **${label}** ${c.score}/5${flag} — ${c.justification}`);
    };
    row('Fidelity', s.fidelity);
    row('Visual coherence', s.visual_coherence);
    row('HTML expressiveness', s.html_expressiveness);
    row('Output shape', s.output_shape);
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  mkdirSync(OUT_DIR, { recursive: true });

  const renderPromptRaw = readFileSync(RENDER_PROMPT_PATH, 'utf8');
  const evalPromptRaw = readFileSync(EVAL_PROMPT_PATH, 'utf8');
  const designSystemCss = readFileSync(THEME_PATH, 'utf8');

  const renderVersion = readPromptVersion(RENDER_PROMPT_PATH);
  const evalVersion = readPromptVersion(EVAL_PROMPT_PATH);

  const renderPromptTpl = stripFrontmatter(renderPromptRaw);
  const evalPromptTpl = stripFrontmatter(evalPromptRaw);

  process.stderr.write(
    `\nEval run — model=${MODEL}, render=v${renderVersion}, eval=v${evalVersion}\n`,
  );
  process.stderr.write(`Fixtures: ${FIXTURES.join(', ')}\n\n`);

  const results: FixtureResult[] = [];
  for (const fixture of FIXTURES) {
    try {
      const r = await runFixture(
        fixture,
        renderPromptTpl,
        evalPromptTpl,
        designSystemCss,
      );
      results.push(r);
      const summary = r.ok ? r.verdict : 'judge-error';
      process.stderr.write(`  [${fixture}] ${summary}\n\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`  [${fixture}] error: ${msg}\n\n`);
      results.push({ fixture, ok: false, html: '', error: msg });
    }
  }

  const report = renderReport(results, renderVersion, evalVersion);
  writeFileSync(REPORT_PATH, report, 'utf8');
  process.stderr.write(`\nReport written to ${REPORT_PATH}\n`);

  const anyBad = results.some((r) => !r.ok || r.verdict !== 'pass');
  return anyBad ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(
      `eval: fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
    );
    process.exit(2);
  });
