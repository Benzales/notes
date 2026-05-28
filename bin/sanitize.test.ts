// Smoke tests for bin/sanitize.ts — built-in node --test runner, no framework.
//
// Run: npm test
// Or:  node --test --import tsx bin/sanitize.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, summarize } from './sanitize.ts';

test('safe semantic HTML passes through', () => {
  const input = `<article>
    <header><span class="eyebrow">GUIDE</span><h1 id="top">Hello</h1></header>
    <p class="lede">A <strong>structured</strong> intro with <a href="https://example.com">a link</a>.</p>
    <ul><li>one</li><li>two</li></ul>
    <details><summary>More</summary><p>Body</p></details>
  </article>`;
  const out = sanitize(input);
  assert.match(out, /<article>/);
  assert.match(out, /class="eyebrow"/);
  assert.match(out, /id="top"/);
  assert.match(out, /href="https:\/\/example\.com"/);
  assert.match(out, /<details>/);
  assert.match(out, /<summary>More<\/summary>/);
});

test('<script> tags are stripped', () => {
  const input = `<p>before</p><script>alert('xss')</script><p>after</p>`;
  const out = sanitize(input);
  assert.doesNotMatch(out, /<script/i);
  assert.doesNotMatch(out, /alert/);
  assert.match(out, /<p>before<\/p>/);
  assert.match(out, /<p>after<\/p>/);
});

test('<style> block survives intact', () => {
  const input = `<style>
    .flow { display: flex; gap: var(--space-4); }
    .flow-arrow { color: var(--accent); }
  </style>
  <div class="flow"><span>A</span><span class="flow-arrow">→</span><span>B</span></div>`;
  const out = sanitize(input);
  assert.match(out, /<style[^>]*>/);
  assert.match(out, /\.flow\s*\{/);
  assert.match(out, /var\(--accent\)/);
  assert.match(out, /class="flow"/);
});

test('style="..." attribute survives', () => {
  const input = `<div style="border-left: 3px solid var(--accent); padding: var(--space-3);">hi</div>`;
  const out = sanitize(input);
  // sanitize-html normalizes whitespace inside style, so don't pin on spacing.
  assert.match(out, /style="[^"]*var\(--accent\)[^"]*"/);
  assert.match(out, /var\(--space-3\)/);
});

test('javascript: href is dropped', () => {
  const input = `<a href="javascript:alert(1)">click</a><a href="https://ok.example">ok</a>`;
  const out = sanitize(input);
  assert.doesNotMatch(out, /javascript:/i);
  // The safe link should still be intact.
  assert.match(out, /href="https:\/\/ok\.example"/);
  // The unsafe anchor either loses its href entirely or is dropped — either is fine.
  // (sanitize-html keeps the tag but strips the href.)
});

test('basic SVG passes through', () => {
  const input = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g1"><stop offset="0%" stop-color="var(--accent)"/></linearGradient>
    </defs>
    <circle cx="50" cy="50" r="40" fill="url(#g1)" stroke="var(--rule)" stroke-width="2"/>
    <path d="M10 10 L90 90" stroke="var(--fg)"/>
    <text x="50" y="55" text-anchor="middle">hi</text>
  </svg>`;
  const out = sanitize(input);
  assert.match(out, /<svg[^>]*viewBox="0 0 100 100"/);
  assert.match(out, /<linearGradient id="g1">/);
  assert.match(out, /<stop offset="0%"/);
  assert.match(out, /<circle[^>]*cx="50"/);
  assert.match(out, /fill="url\(#g1\)"/);
  assert.match(out, /<path[^>]*d="M10 10 L90 90"/);
  assert.match(out, /<text[^>]*text-anchor="middle"/);
});

// ─── Extra: a few belt-and-suspenders cases ────────────────────────────────

test('on* event handlers are stripped', () => {
  const input = `<div onclick="alert(1)" onmouseover="x()" onload="y()">click</div>`;
  const out = sanitize(input);
  assert.doesNotMatch(out, /onclick/i);
  assert.doesNotMatch(out, /onmouseover/i);
  assert.doesNotMatch(out, /onload/i);
  assert.match(out, /<div>click<\/div>/);
});

test('iframe / object / embed / form are stripped', () => {
  const input = `<iframe src="https://evil.example"></iframe>
    <object data="x.swf"></object>
    <embed src="x">
    <form><input name="x"><button>go</button></form>
    <p>survivor</p>`;
  const out = sanitize(input);
  for (const tag of ['iframe', 'object', 'embed', 'form', 'input', 'button']) {
    assert.doesNotMatch(out, new RegExp(`<${tag}\\b`, 'i'), `tag <${tag}> should be stripped`);
  }
  assert.match(out, /<p>survivor<\/p>/);
});

test('<style> with javascript: URI is wiped', () => {
  const input = `<style>.x { background: url(javascript:alert(1)); }</style><p>ok</p>`;
  const out = sanitize(input);
  assert.doesNotMatch(out, /javascript:/i);
  assert.match(out, /<style[^>]*>/);
  assert.match(out, /removed by sanitizer/);
  assert.match(out, /<p>ok<\/p>/);
});

test('<style> with @import is wiped', () => {
  const input = `<style>@import url("https://evil.example/x.css"); .ok {color: red;}</style>`;
  const out = sanitize(input);
  assert.doesNotMatch(out, /@import/i);
  assert.doesNotMatch(out, /evil\.example/);
  assert.match(out, /removed by sanitizer/);
});

test('<style> with external url() is wiped, but data:image is allowed', () => {
  const evil = `<style>.bg { background: url(https://evil.example/x.png); }</style>`;
  const okData = `<style>.bg { background: url("data:image/png;base64,AAAA"); }</style>`;
  const okRel = `<style>.bg { background: url("./local.png"); }</style>`;

  assert.match(sanitize(evil), /removed by sanitizer/);
  assert.doesNotMatch(sanitize(okData), /removed by sanitizer/);
  assert.match(sanitize(okData), /data:image\/png/);
  assert.doesNotMatch(sanitize(okRel), /removed by sanitizer/);
  assert.match(sanitize(okRel), /\.\/local\.png/);
});

test('aria-* and data-* attributes pass through', () => {
  const input = `<button is="x"><span aria-label="close" data-id="abc">x</span></button><nav aria-current="page"><a href="/x">x</a></nav>`;
  const out = sanitize(input);
  assert.match(out, /aria-label="close"/);
  assert.match(out, /data-id="abc"/);
  assert.match(out, /aria-current="page"/);
});

test('external <link>, <meta>, <base> are stripped', () => {
  const input = `<link rel="stylesheet" href="https://evil.example/x.css">
    <meta http-equiv="refresh" content="0;url=https://evil">
    <base href="https://evil.example/">
    <article><p>ok</p></article>`;
  const out = sanitize(input);
  assert.doesNotMatch(out, /<link\b/i);
  assert.doesNotMatch(out, /<meta\b/i);
  assert.doesNotMatch(out, /<base\b/i);
  assert.match(out, /<p>ok<\/p>/);
});

test('target=_blank links get rel=noopener noreferrer', () => {
  const input = `<a href="https://example.com" target="_blank">ext</a>`;
  const out = sanitize(input);
  assert.match(out, /target="_blank"/);
  assert.match(out, /rel="[^"]*noopener[^"]*"/);
  assert.match(out, /rel="[^"]*noreferrer[^"]*"/);
});

// ─── summarize() — stderr diagnostic ───────────────────────────────────────

test('summarize: clean input reports "clean"', () => {
  const input = `<article><h1>Hi</h1><p>safe content</p></article>`;
  assert.equal(summarize(input), 'sanitize: clean');
});

test('summarize: counts <script> tags', () => {
  const input = `<p>ok</p><script>x()</script><script>y()</script>`;
  assert.match(summarize(input), /removed 2 <script>/);
});

test('summarize: counts handlers, frames, forms together', () => {
  const input = `<div onclick="x()" onload="y()"></div>
    <iframe src="x"></iframe>
    <form><input></form>`;
  const out = summarize(input);
  assert.match(out, /2 on\* handlers/);
  assert.match(out, /1 <iframe>/);
  assert.match(out, /2 <form>/); // form + input
});

test('summarize: counts javascript: URIs', () => {
  const input = `<a href="javascript:x()">a</a><a href="javascript:y()">b</a>`;
  assert.match(summarize(input), /2 javascript: URIs/);
});

test('summarize: reports <style> block wipes separately', () => {
  const input = `<style>@import url("x.css");</style><p>ok</p>`;
  const out = summarize(input);
  assert.match(out, /wiped 1 <style> block \(unsafe CSS\)/);
});

test('summarize: handles mixed removals + wipes on separate lines', () => {
  const input = `<script>x()</script><style>@import url("x");</style>`;
  const out = summarize(input);
  const lines = out.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /removed 1 <script>/);
  assert.match(lines[1], /wiped 1 <style> block/);
});
