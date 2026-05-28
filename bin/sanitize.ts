// Deterministic HTML sanitizer for md-to-redesigned-html.
//
// Contract: reads HTML from stdin, writes sanitized HTML to stdout.
// Allowlist-based; defends against prompt-injection in source notes.
// No LLM, no network.
//
// Allows what the render prompt is told to emit:
//   - Rich semantic HTML, tables, figures, details/summary, time, abbr, ...
//   - Per-page <style> blocks (documented design decision — see SKILL.md)
//   - style="..." attributes (documented design decision)
//   - class / id / aria-* / role / data-* attributes
//   - Standard SVG (svg/g/path/circle/.../linearGradient/...) for diagrams
//
// Blocks: <script>, <iframe>, <object>, <embed>, <link>, <meta>, <base>,
// <form>, <input>, <button>, <textarea>, <select>; all on* event handlers;
// javascript: URLs; and CSS-level smells inside <style> blocks
// (javascript:, expression(, behavior:, @import, external url(...)).

import sanitizeHtml from 'sanitize-html';

// ─── Tag allowlist ──────────────────────────────────────────────────────────

const SEMANTIC_TAGS = [
  'article', 'section', 'header', 'footer', 'main', 'nav', 'aside',
  'div', 'span', 'p',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'blockquote', 'hr', 'br',
  'strong', 'em', 'small', 'sub', 'sup', 'mark', 'abbr',
  'code', 'pre', 'kbd',
  'figure', 'figcaption',
  'details', 'summary',
  'time',
  'a', 'img',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'caption', 'colgroup', 'col',
];

const SVG_TAGS = [
  'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line',
  'polyline', 'polygon', 'text', 'tspan',
  'defs', 'linearGradient', 'radialGradient', 'stop',
  'marker', 'use', 'symbol', 'title', 'desc',
];

const STYLE_TAG = ['style'];

const ALLOWED_TAGS = [...SEMANTIC_TAGS, ...SVG_TAGS, ...STYLE_TAG];

// ─── Attribute allowlist ────────────────────────────────────────────────────
//
// `*` applies to every tag. We allow class/id/style/aria-*/role/data-*/title
// universally. Per-tag entries cover element-specific attrs (href, src, etc.).
// SVG attrs are sprawling — we use a permissive set keyed to the SVG primitives
// listed above. sanitize-html drops any attribute not in the table.

const COMMON_ATTRS = [
  'class', 'id', 'style', 'title', 'lang', 'dir',
  'role',
  // aria-* and data-* are pattern-matched via `allowedAttributes` wildcard below
];

const SVG_COMMON_ATTRS = [
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'stroke-opacity',
  'fill-opacity', 'fill-rule', 'opacity',
  'transform', 'transform-origin',
  'clip-path', 'clip-rule', 'mask',
  'vector-effect',
  'font-family', 'font-size', 'font-weight', 'font-style',
  'text-anchor', 'dominant-baseline', 'alignment-baseline',
  'pointer-events', 'visibility', 'display',
];

const sanitizeConfig: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,

  allowedAttributes: {
    // Wildcard — applies to every allowed tag. sanitize-html supports `*`.
    '*': [
      ...COMMON_ATTRS,
      'aria-*',
      'data-*',
    ],

    a: ['href', 'name', 'target', 'rel', 'download', 'hreflang', 'type'],
    img: ['src', 'alt', 'width', 'height', 'loading', 'decoding', 'srcset', 'sizes'],
    time: ['datetime'],
    abbr: ['title'],
    details: ['open'],
    blockquote: ['cite'],
    q: ['cite'],
    th: ['scope', 'colspan', 'rowspan', 'abbr', 'headers'],
    td: ['colspan', 'rowspan', 'headers'],
    col: ['span'],
    colgroup: ['span'],
    ol: ['start', 'reversed', 'type'],
    li: ['value'],
    pre: ['data-language'],
    code: ['data-language'],

    // SVG primitives. Each gets the common SVG attrs plus its geometry attrs.
    svg: [
      ...SVG_COMMON_ATTRS,
      'xmlns', 'xmlns:xlink', 'version',
      'viewBox', 'preserveAspectRatio',
      'width', 'height', 'x', 'y',
      'aria-labelledby', 'aria-describedby',
    ],
    g: [...SVG_COMMON_ATTRS],
    path: [...SVG_COMMON_ATTRS, 'd', 'pathLength'],
    circle: [...SVG_COMMON_ATTRS, 'cx', 'cy', 'r'],
    ellipse: [...SVG_COMMON_ATTRS, 'cx', 'cy', 'rx', 'ry'],
    rect: [...SVG_COMMON_ATTRS, 'x', 'y', 'width', 'height', 'rx', 'ry'],
    line: [...SVG_COMMON_ATTRS, 'x1', 'y1', 'x2', 'y2'],
    polyline: [...SVG_COMMON_ATTRS, 'points'],
    polygon: [...SVG_COMMON_ATTRS, 'points'],
    text: [...SVG_COMMON_ATTRS, 'x', 'y', 'dx', 'dy', 'rotate', 'textLength', 'lengthAdjust'],
    tspan: [...SVG_COMMON_ATTRS, 'x', 'y', 'dx', 'dy', 'rotate', 'textLength', 'lengthAdjust'],
    defs: [...SVG_COMMON_ATTRS],
    linearGradient: [
      ...SVG_COMMON_ATTRS,
      'x1', 'y1', 'x2', 'y2', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'href',
    ],
    radialGradient: [
      ...SVG_COMMON_ATTRS,
      'cx', 'cy', 'r', 'fx', 'fy', 'fr', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'href',
    ],
    stop: [...SVG_COMMON_ATTRS, 'offset', 'stop-color', 'stop-opacity'],
    marker: [
      ...SVG_COMMON_ATTRS,
      'markerWidth', 'markerHeight', 'markerUnits', 'orient', 'refX', 'refY', 'viewBox', 'preserveAspectRatio',
    ],
    use: [...SVG_COMMON_ATTRS, 'href', 'xlink:href', 'x', 'y', 'width', 'height'],
    symbol: [...SVG_COMMON_ATTRS, 'viewBox', 'preserveAspectRatio', 'width', 'height', 'x', 'y'],
    // <title> / <desc> are SVG accessibility children; no special attrs beyond COMMON.
  },

  // URL schemes for href/src. NO `javascript:`. `data:` only for images.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: {
    img: ['http', 'https', 'data'],
  },
  allowedSchemesAppliedToAttributes: ['href', 'src', 'cite', 'xlink:href'],
  allowProtocolRelative: true,

  // Style attribute handling — keep it permissive (the LLM is told to use
  // var(--token) and arbitrary CSS), but sanitize-html still strips
  // url(javascript:...) and other dangerous declarations via its CSS parser.
  // We pass an empty per-attribute filter map => default permissive sanitization.
  allowedStyles: {},

  // Don't preserve void-element close tags etc — let sanitize-html normalize.
  selfClosing: ['img', 'br', 'hr', 'area', 'base', 'basefont', 'input', 'link', 'meta'],

  // Drop comments — they can carry conditional IE crud and add no value here.
  allowedClasses: false as unknown as undefined, // means "no class filtering" — we already allowed `class` above

  // We want <style> to pass through (its CSS contents are filtered separately,
  // see post-process step below). sanitize-html drops script/style by default
  // unless we list them in allowedTags AND tell it to keep their text.
  allowVulnerableTags: true, // we know we're allowing <style>; suppress warning
  parser: {
    lowerCaseTags: false,        // preserve SVG camelCase tag names
    lowerCaseAttributeNames: false,
  },

  // Disable URL transformations — we already lock down schemes above.
  transformTags: {
    // Force rel="noopener noreferrer" on links opening new tabs.
    a: (tagName, attribs) => {
      if (attribs.target === '_blank') {
        const existingRel = (attribs.rel || '').split(/\s+/).filter(Boolean);
        const needed = ['noopener', 'noreferrer'];
        for (const r of needed) if (!existingRel.includes(r)) existingRel.push(r);
        attribs.rel = existingRel.join(' ');
      }
      return { tagName, attribs };
    },
  },
};

// ─── <style> CSS smell-check ────────────────────────────────────────────────
//
// sanitize-html keeps <style> tag contents as text (we allow the tag). We then
// scan that text for known-bad patterns. If any are found we wipe the block to
// `/* removed by sanitizer */` rather than try to surgically edit CSS — losing
// one custom <style> block is acceptable; emitting unsafe CSS is not.
//
// This is intentionally NOT a CSS parser. It's a substring/regex tripwire for
// the patterns that matter for v0.

const CSS_DENY_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /javascript\s*:/i, name: 'javascript: URI' },
  { pattern: /expression\s*\(/i, name: 'expression()' },
  { pattern: /behavior\s*:/i, name: 'behavior:' },
  { pattern: /-moz-binding\s*:/i, name: '-moz-binding:' },
  { pattern: /@import\b/i, name: '@import' },
];

// url(...) with anything other than data:image/* or a relative/same-origin path.
// Allowed: url("data:image/..."), url("/foo"), url("./foo"), url("../foo"), url("#anchor"), url("foo.svg")
// Blocked: url("http://..."), url("https://..."), url("javascript:..."), url("//evil")
function urlRefIsSafe(raw: string): boolean {
  const trimmed = raw.replace(/^['"]|['"]$/g, '').trim();
  if (trimmed === '') return true;
  if (trimmed.startsWith('#')) return true;
  if (trimmed.startsWith('data:image/')) return true;
  // Any other scheme (incl. data:text/html, http:, https:, javascript:, //...) → block
  if (/^[a-z][a-z0-9+\-.]*:/i.test(trimmed)) return false;
  if (trimmed.startsWith('//')) return false;
  // Relative path — fine.
  return true;
}

function cssBlockIsSafe(css: string): boolean {
  for (const { pattern } of CSS_DENY_PATTERNS) {
    if (pattern.test(css)) return false;
  }
  const urlRe = /url\s*\(\s*([^)]*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(css)) !== null) {
    if (!urlRefIsSafe(m[1])) return false;
  }
  return true;
}

function filterStyleBlocks(html: string): string {
  // Match <style ...>...</style> non-greedy. The body of <style> is opaque to
  // sanitize-html — it preserves it verbatim. We do the smell check here.
  return html.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi,
    (_full, open: string, body: string, close: string) => {
      if (cssBlockIsSafe(body)) return open + body + close;
      return open + '/* removed by sanitizer: unsafe CSS pattern */' + close;
    },
  );
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function sanitize(input: string): string {
  const cleaned = sanitizeHtml(input, sanitizeConfig);
  return filterStyleBlocks(cleaned);
}

// ─── CLI: stdin → stdout ────────────────────────────────────────────────────

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Run as CLI when invoked directly (not when imported by tests).
// import.meta.url comparison handles both `tsx bin/sanitize.ts` and compiled .js.
const isMain = (() => {
  try {
    const invoked = process.argv[1];
    if (!invoked) return false;
    const here = new URL(import.meta.url).pathname;
    return invoked === here || here.endsWith(invoked.replace(/^.*[/\\]/, ''));
  } catch {
    return false;
  }
})();

if (isMain) {
  readStdin()
    .then((input) => {
      process.stdout.write(sanitize(input));
    })
    .catch((err) => {
      process.stderr.write(`sanitize: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    });
}
