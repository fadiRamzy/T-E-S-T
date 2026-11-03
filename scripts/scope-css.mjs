/**
 * Scopes a stylesheet under a wrapper class so the two merged apps
 * (which share class names like .btn/.card/.sidebar) never leak styles
 * into each other. Usage: node scripts/scope-css.mjs <file> <.scope-class> <keyframePrefix>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const JOBS = [
  ['src/apps/management/styles/base.css', '.scope-mgmt', 'mgmt-'],
  ['src/apps/management/styles/reference.css', '.scope-mgmt', 'mgmt-'],
  ['src/apps/management/styles/reference-compat.css', '.scope-mgmt', 'mgmt-'],
  ['src/apps/evaluation/styles.css', '.scope-eval', 'eval-'],
];
for (const [file, scope, kfPrefix] of JOBS) run(file, scope, kfPrefix);

function run(file, scope, kfPrefix) {
const css = readFileSync(file, 'utf8');

const splitTop = (s, sep) => {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
};

function scopeSelector(sel) {
  const s = sel.trim();
  if (!s) return s;
  if (s === ':root' || s === 'html' || s === 'body' || s === '#root') return scope;
  let out = s
    .replace(/^:root\b/, scope)
    .replace(/^html\b/, scope)
    .replace(/^body\b/, scope)
    .replace(/^#root\b/, scope);
  if (out === s) {
    if (s === '*') return `${scope}, ${scope} *`;
    out = `${scope} ${s}`;
    if (/^[.#\[]/.test(s)) out += `, ${scope}${s}`; // element itself carries scope (portals)
    return out;
  }
  return out;
}

function process(text) {
  let result = '', i = 0;
  while (i < text.length) {
    const brace = text.indexOf('{', i);
    if (brace === -1) { result += text.slice(i); break; }
    const prelude = text.slice(i, brace);
    // find matching close brace
    let depth = 1, j = brace + 1;
    while (j < text.length && depth > 0) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
    const body = text.slice(brace + 1, j - 1);
    const head = prelude.trim();
    const commentMatch = head.match(/^(\/\*[\s\S]*?\*\/\s*)+/);
    const commentTail = commentMatch ? commentMatch[0].trim() : '';
    const headClean = commentTail ? head.slice(commentMatch[0].length).trim() : head;

    if (/^@(media|supports|layer)\b/.test(headClean)) {
      result += `${prelude}{${process(body)}}`;
    } else if (/^@keyframes\b/.test(headClean)) {
      const name = headClean.split(/\s+/)[1];
      result += `${prelude.replace(name, kfPrefix + name)}{${body}}`;
    } else if (/^@/.test(headClean)) {
      result += `${prelude}{${body}}`; // @font-face, @page, etc. unchanged
    } else if (!headClean) {
      result += `${prelude}{${body}}`;
    } else {
      const scoped = splitTop(headClean, ',').map(scopeSelector).join(', ');
      result += `${commentTail ? commentTail + ' ' : ''}${scoped} {${body}}`;
    }
    i = j;
  }
  return result;
}

let out = process(css);
// rename keyframe references in animation declarations
const names = [...css.matchAll(/@keyframes\s+([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
for (const n of new Set(names)) {
  out = out.replace(new RegExp(`(animation(?:-name)?\\s*:[^;}]*?)\\b${n}\\b`, 'g'), `$1${kfPrefix}${n}`);
}
writeFileSync(file, out);
console.log(`scoped ${file} under ${scope} (keyframes: ${[...new Set(names)].join(', ') || 'none'})`);
}
