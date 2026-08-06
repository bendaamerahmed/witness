'use strict';
/**
 * Report renderers: text, json, markdown, html, pdf.
 *
 * The PDF writer is hand-rolled. Zero runtime dependencies is a stated promise
 * of this project and the main reason it passes a security review without a
 * conversation, so pulling in a PDF library to format a list of findings would
 * be a bad trade. PDF's text format is verbose but not hard: a handful of
 * objects, a cross-reference table of byte offsets, and a trailer.
 */
const { ASK, ALL_TELLS } = require('../hooks/witness-detect');

const VERSION = require('../package.json').version;
const HOME = 'https://github.com/bendaamerahmed/witness';

const RANK = ['no-op fix', 'moved goalpost', 'softened assertion', 'swallow', 'skip', 'suppression', 'fixture fitting'];

function sortFindings(findings) {
  return [...findings].sort((a, b) => (RANK.indexOf(a.tell) - RANK.indexOf(b.tell))
    || String(a.path).localeCompare(String(b.path))
    || (a.line || 0) - (b.line || 0));
}

/**
 * One decision, reported once.
 *
 * A single express commit changed Content-Disposition quoting and produced 18
 * `moved goalpost` findings — every one correct, and collectively unreadable.
 * That is one thing to explain at 18 sites, not 18 things.
 *
 * Findings collapse when they share a tell and the same evidence SHAPE, i.e.
 * the same transformation once literals are blanked. SARIF deliberately does not
 * group: GitHub annotates lines, and every site needs its own annotation.
 */
const LITERALS = /(['"])(?:\\.|(?!\1)[^\\])*\1|(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])/g;

// Evidence is truncated for display, which routinely cuts a string literal in
// half and leaves the opening quote unclosed. Blanking only balanced literals
// therefore left seventeen express findings — one decision about
// Content-Disposition quoting — as seven separate "issues", because each
// half-literal still carried its own filename. An unterminated literal running
// to the end of a side is blanked too.
const OPEN_LITERAL = /(['"])(?:\\.|(?!\1)[^\\])*$/;
const SIDES = ' -> ';

function shapeSide(side) {
  return side.replace(LITERALS, '~').replace(OPEN_LITERAL, '~').replace(/\s+/g, ' ').trim();
}

function shape(evidence) {
  return String(evidence || '').split(SIDES).map(shapeSide).join(SIDES);
}

function group(findings) {
  const byKey = new Map();
  for (const f of sortFindings(findings)) {
    const key = `${f.tell}\u0000${shape(f.evidence)}`;
    if (!byKey.has(key)) byKey.set(key, { ...f, sites: [], occurrences: 0 });
    const g = byKey.get(key);
    g.occurrences++;
    g.sites.push({ path: f.path, line: f.line });
  }
  return [...byKey.values()];
}

function summarize(findings, meta = {}) {
  const byTell = {};
  for (const f of findings) byTell[f.tell] = (byTell[f.tell] || 0) + 1;
  const files = [...new Set(findings.map((f) => f.path))];
  return {
    tool: 'witness',
    version: VERSION,
    issues: group(findings).length,
    generated: meta.generated || null,
    scope: meta.scope || null,
    filesChanged: meta.filesChanged ?? null,
    findings: findings.length,
    filesWithFindings: files.length,
    byTell,
    tells: Object.keys(byTell).sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b)),
  };
}

const where = (f) => (f.line ? `${f.path}:${f.line}` : f.path);

// ---------------------------------------------------------------------------
// text
// ---------------------------------------------------------------------------
function renderText(findings, meta = {}) {
  const out = [];
  const s = summarize(findings, meta);
  if (!findings.length) {
    return `witness ${VERSION} — clean: ${meta.filesChanged ?? 0} file(s) changed, no tells.\n`;
  }
  const grouped = group(findings);
  const head = grouped.length === s.findings
    ? `${s.findings} finding(s) across ${s.filesWithFindings} file(s)`
    : `${grouped.length} issue(s) at ${s.findings} site(s) across ${s.filesWithFindings} file(s)`;
  out.push(`witness ${VERSION} — ${head}`);
  if (meta.scope) out.push(`scope: ${meta.scope}`);
  out.push('');
  for (const f of grouped) {
    out.push(`${where(f)}  ${f.tell}  ${f.evidence}`);
    if (f.occurrences > 1) {
      const rest = f.sites.slice(1, 4).map((x) => `${x.path}${x.line ? `:${x.line}` : ''}`);
      out.push(`              also ${f.occurrences - 1} more: ${rest.join(', ')}${f.occurrences - 1 > rest.length ? ', ...' : ''}`);
    }
    out.push(`              -> ${ASK[f.tell] || 'justify it or undo it'}`);
  }
  out.push('');
  out.push(`${grouped.length} issue(s) at ${s.findings} site(s) across ${meta.filesChanged ?? s.filesWithFindings} changed file(s).`);
  out.push('Every one has a legitimate version. If it is right here, keep it and mark');
  out.push('the line `witness: <why>` — that silences it and records the decision.');
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// json
// ---------------------------------------------------------------------------
function renderJson(findings, meta = {}) {
  return JSON.stringify({
    ...summarize(findings, meta),
    results: sortFindings(findings).map((f) => ({
      tell: f.tell,
      path: f.path,
      line: f.line || null,
      evidence: f.evidence,
      snippet: f.text || null,
      guidance: ASK[f.tell] || null,
    })),
  }, null, 2) + '\n';
}

// ---------------------------------------------------------------------------
// markdown
// ---------------------------------------------------------------------------
function renderMarkdown(findings, meta = {}) {
  const s = summarize(findings, meta);
  const out = [`# witness report`, ''];
  out.push(`\`witness ${VERSION}\`${meta.generated ? ` · ${meta.generated}` : ''}${meta.scope ? ` · \`${meta.scope}\`` : ''}`);
  out.push('');

  if (!findings.length) {
    out.push(`**No tells.** ${meta.filesChanged ?? 0} file(s) changed and nothing in them makes a check pass without making the code right.`);
    out.push('');
    out.push(`<sub>[witness](${HOME}) reads a diff. It reports what is visible and never infers intent.</sub>`);
    return out.join('\n') + '\n';
  }

  out.push(s.issues === s.findings
    ? `**${s.findings} finding(s)** across ${s.filesWithFindings} file(s).`
    : `**${s.issues} issue(s)** at ${s.findings} site(s) across ${s.filesWithFindings} file(s).`);
  out.push('');
  out.push('| tell | count |');
  out.push('| --- | ---: |');
  for (const t of s.tells) out.push(`| ${t} | ${s.byTell[t]} |`);
  out.push('');

  let current = null;
  for (const f of group(findings)) {
    if (f.tell !== current) { current = f.tell; out.push(`## ${f.tell}`, ''); }
    out.push(`**\`${where(f)}\`** — ${f.evidence}`);
    if (f.occurrences > 1) {
      out.push('', `<details><summary>${f.occurrences - 1} more site(s)</summary>`, '');
      for (const site of f.sites.slice(1)) out.push(`- \`${site.path}${site.line ? `:${site.line}` : ''}\``);
      out.push('', '</details>');
    }
    if (f.text) out.push('', '```', f.text, '```');
    out.push('', `> ${ASK[f.tell] || 'justify it or undo it'}`, '');
  }

  out.push('---', '');
  out.push('Every tell has a legitimate version. If it is the right call here, keep it and mark the line');
  out.push('`witness: <why>` — that silences the finding and records the decision where the next reader will find it.');
  out.push('');
  out.push(`<sub>Generated by [witness ${VERSION}](${HOME}). Advisory: it reports what is visible in a diff and never infers intent.</sub>`);
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// html
// ---------------------------------------------------------------------------
const esc = (t) => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderHtml(findings, meta = {}) {
  const s = summarize(findings, meta);
  const rows = sortFindings(findings).map((f) => `
      <tr>
        <td class="tell"><span class="pill">${esc(f.tell)}</span></td>
        <td><code>${esc(where(f))}</code><div class="ev">${esc(f.evidence)}</div>
          ${f.text ? `<pre>${esc(f.text)}</pre>` : ''}
          <div class="ask">${esc(ASK[f.tell] || '')}</div></td>
      </tr>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>witness report</title>
<style>
  :root { color-scheme: light dark; --fg:#111; --mut:#666; --line:#e3e3e3; --bg:#fff; --card:#fafafa; }
  @media (prefers-color-scheme: dark) { :root { --fg:#eee; --mut:#999; --line:#2a2a2a; --bg:#0d0d0d; --card:#161616; } }
  body { font:15px/1.6 ui-sans-serif,system-ui,-apple-system,sans-serif; color:var(--fg); background:var(--bg);
         margin:0; padding:48px 24px; }
  main { max-width:920px; margin:0 auto; }
  h1 { font:700 28px/1.2 ui-monospace,Menlo,monospace; margin:0 0 4px; letter-spacing:-.5px; }
  .sub { color:var(--mut); font-size:13px; margin-bottom:32px; }
  table { width:100%; border-collapse:collapse; }
  td { border-top:1px solid var(--line); padding:16px 8px; vertical-align:top; }
  td.tell { width:190px; }
  .pill { display:inline-block; padding:2px 9px; border:1px solid var(--line); border-radius:999px;
          font:600 12px ui-monospace,monospace; background:var(--card); }
  code { font:13px ui-monospace,Menlo,monospace; }
  .ev { color:var(--mut); font-size:13px; margin-top:4px; }
  pre { background:var(--card); border:1px solid var(--line); border-radius:6px; padding:10px 12px;
        overflow-x:auto; font:12.5px ui-monospace,monospace; margin:10px 0; }
  .ask { font-size:13.5px; margin-top:8px; }
  .clean { padding:28px; border:1px solid var(--line); border-radius:8px; background:var(--card); }
  footer { margin-top:40px; padding-top:16px; border-top:1px solid var(--line); color:var(--mut); font-size:12.5px; }
  .counts { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:28px; }
  .counts span { border:1px solid var(--line); border-radius:6px; padding:5px 10px; font-size:12.5px; background:var(--card); }
</style></head><body><main>
  <h1>witness report</h1>
  <div class="sub">witness ${esc(VERSION)}${meta.generated ? ` · ${esc(meta.generated)}` : ''}${meta.scope ? ` · ${esc(meta.scope)}` : ''}</div>
  ${findings.length ? `<div class="counts">${s.tells.map((t) => `<span>${esc(t)} · ${s.byTell[t]}</span>`).join('')}</div>
  <table><tbody>${rows}</tbody></table>`
    : `<div class="clean"><strong>No tells.</strong> ${meta.filesChanged ?? 0} file(s) changed and nothing in them
       makes a check pass without making the code right.</div>`}
  <footer>Every tell has a legitimate version. If it is the right call, keep it and mark the line
  <code>witness: &lt;why&gt;</code> — that silences the finding and records the decision.<br>
  Generated by <a href="${HOME}">witness ${esc(VERSION)}</a>. Advisory: it reports what is visible in a diff and never infers intent.</footer>
</main></body></html>
`;
}

// ---------------------------------------------------------------------------
// pdf — written by hand, see the note at the top of this file
// ---------------------------------------------------------------------------
const PAGE = { w: 595.28, h: 841.89, margin: 54, leading: 14, size: 10 };

/** PDF string literals escape backslash and both parens, and must be Latin-1. */
function pdfEscape(t) {
  return String(t)
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrap(text, max) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const out = [];
  let line = '';
  for (const w of words) {
    if (line && (line + ' ' + w).length > max) { out.push(line); line = w; }
    else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

/** Flow the report into lines tagged with a font, then paginate. */
function pdfLines(findings, meta) {
  const s = summarize(findings, meta);
  const L = [];
  L.push({ f: 'B', z: 20, t: 'witness report' });
  L.push({ f: 'R', z: 9, t: `witness ${VERSION}${meta.generated ? `   ${meta.generated}` : ''}${meta.scope ? `   ${meta.scope}` : ''}` });
  L.push({ t: '' });

  if (!findings.length) {
    L.push({ f: 'B', z: 12, t: 'No tells.' });
    for (const l of wrap(`${meta.filesChanged ?? 0} file(s) changed and nothing in them makes a check pass without making the code right.`, 92)) {
      L.push({ t: l });
    }
  } else {
    L.push({ f: 'B', z: 12, t: `${s.findings} finding(s) across ${s.filesWithFindings} file(s)` });
    L.push({ t: '' });
    for (const t of s.tells) L.push({ f: 'C', t: `  ${t.padEnd(22)} ${s.byTell[t]}` });
    L.push({ t: '' });

    let current = null;
    for (const f of sortFindings(findings)) {
      if (f.tell !== current) { current = f.tell; L.push({ t: '' }); L.push({ f: 'B', z: 13, t: f.tell }); }
      L.push({ f: 'C', z: 9.5, t: where(f) });
      for (const l of wrap(f.evidence, 96)) L.push({ f: 'R', z: 9.5, t: `   ${l}` });
      if (f.text) for (const l of wrap(f.text, 88)) L.push({ f: 'C', z: 9, t: `   ${l}` });
      for (const l of wrap(ASK[f.tell] || '', 92)) L.push({ f: 'I', z: 9.5, t: `   ${l}` });
      L.push({ t: '' });
    }
  }

  L.push({ t: '' });
  for (const l of wrap('Every tell has a legitimate version. If it is the right call here, keep it and mark the line "witness: <why>" — that silences the finding and records the decision.', 96)) {
    L.push({ f: 'R', z: 9, t: l });
  }
  L.push({ f: 'R', z: 8.5, t: `Generated by witness ${VERSION} — ${HOME}` });
  return L;
}

const FONT_OBJ = { R: '/F1', B: '/F2', C: '/F3', I: '/F4' };

function pdfContentStream(lines) {
  const parts = ['BT'];
  let y = PAGE.h - PAGE.margin;
  let lastFont = null;
  let lastSize = null;
  parts.push(`1 0 0 1 ${PAGE.margin} ${y.toFixed(2)} Tm`);
  for (const ln of lines) {
    const font = FONT_OBJ[ln.f || 'R'];
    const size = ln.z || PAGE.size;
    if (font !== lastFont || size !== lastSize) {
      parts.push(`${font} ${size} Tf`);
      lastFont = font; lastSize = size;
    }
    const lead = Math.max(PAGE.leading, size * 1.35);
    parts.push(`${lead.toFixed(2)} TL`);
    parts.push(`(${pdfEscape(ln.t || '')}) Tj T*`);
    y -= lead;
  }
  parts.push('ET');
  return parts.join('\n');
}

function paginate(lines) {
  const usable = PAGE.h - PAGE.margin * 2;
  const pages = [];
  let page = [];
  let used = 0;
  for (const ln of lines) {
    const lead = Math.max(PAGE.leading, (ln.z || PAGE.size) * 1.35);
    if (used + lead > usable && page.length) { pages.push(page); page = []; used = 0; }
    page.push(ln); used += lead;
  }
  if (page.length) pages.push(page);
  return pages.length ? pages : [[{ t: '' }]];
}

function renderPdf(findings, meta = {}) {
  const pages = paginate(pdfLines(findings, meta));

  // Object numbering: 1 catalog, 2 pages, 3-6 fonts, then per page (page, content).
  const objects = [];
  const pageIds = pages.map((_, i) => 7 + i * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objects[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>';
  objects[6] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>';

  pages.forEach((pageLines, i) => {
    const pid = pageIds[i];
    const cid = pid + 1;
    objects[pid] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] `
      + `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> /Contents ${cid} 0 R >>`;
    const stream = pdfContentStream(pageLines);
    objects[cid] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`;
  });

  // Serialize, recording the byte offset of every object for the xref table.
  const chunks = [];
  let offset = 0;
  const push = (t) => { chunks.push(t); offset += Buffer.byteLength(t, 'latin1'); };
  const offsets = [];

  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  for (let i = 1; i < objects.length; i++) {
    if (!objects[i]) continue;
    offsets[i] = offset;
    push(`${i} 0 obj\n${objects[i]}\nendobj\n`);
  }

  const xrefStart = offset;
  const count = objects.length;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) {
    xref += objects[i] ? `${String(offsets[i]).padStart(10, '0')} 00000 n \n` : '0000000000 65535 f \n';
  }
  push(xref);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  return Buffer.from(chunks.join(''), 'latin1');
}

// ---------------------------------------------------------------------------

const FORMATS = ['text', 'json', 'md', 'html', 'pdf', 'sarif'];
const BINARY = new Set(['pdf']);

function render(format, findings, meta = {}) {
  switch (format) {
    case 'text': return renderText(findings, meta);
    case 'json': return renderJson(findings, meta);
    case 'md': return renderMarkdown(findings, meta);
    case 'html': return renderHtml(findings, meta);
    case 'pdf': return renderPdf(findings, meta);
    case 'sarif': return JSON.stringify(require('./sarif').toSarif(findings, meta), null, 2) + '\n';
    default: throw new Error(`unknown format: ${format}`);
  }
}

module.exports = {
  render, FORMATS, BINARY, summarize, sortFindings, group, shape, RANK,
  renderText, renderJson, renderMarkdown, renderHtml, renderPdf,
};
