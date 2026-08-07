'use strict';
const test = require('node:test');
const assert = require('node:assert');
const report = require('../lib/report');
const { ALL_TELLS, SCANNER_DEFAULT, applyRules } = require('../hooks/witness-detect');

const VERSION = require('../package.json').version;

const F = [
  { tell: 'moved goalpost', path: 'tests/test_fmt.py', line: 7, evidence: 'assert fmt(1000) == "1000" -> assert fmt(100) == "100"', text: 'assert fmt(100) == "100"' },
  { tell: 'swallow', path: 'src/a.js', line: 12, evidence: 'catch {}', text: '} catch {}' },
];
const META = { generated: '2026-08-06', scope: '--base main', filesChanged: 2 };

test('every format renders and is non-empty', () => {
  for (const f of report.FORMATS) {
    const out = report.render(f, F, META);
    assert.ok((Buffer.isBuffer(out) ? out.length : out.length) > 40, `${f} produced almost nothing`);
  }
});

test('every format handles zero findings without pretending otherwise', () => {
  for (const f of report.FORMATS) {
    const out = report.render(f, [], META);
    const s = Buffer.isBuffer(out) ? out.toString('latin1') : out;
    if (f === 'sarif') { assert.strictEqual(JSON.parse(s).runs[0].results.length, 0); continue; }
    if (f === 'json') { assert.strictEqual(JSON.parse(s).findings, 0); continue; }
    assert.match(s, /no tells|No tells/i, `${f} does not say it found nothing`);
  }
});

test('an unknown format is refused rather than silently defaulted', () => {
  assert.throws(() => report.render('docx', F, META), /unknown format/);
});

test('every format carries the version, so a report can be traced to a build', () => {
  for (const f of ['text', 'json', 'md', 'html']) {
    const out = String(report.render(f, F, META));
    assert.ok(out.includes(VERSION), `${f} does not state the version`);
  }
  assert.ok(report.renderPdf(F, META).toString('latin1').includes(VERSION));
});

// ---------------------------------------------------------------------------
// grouping — one decision reported once
// ---------------------------------------------------------------------------
test('findings sharing a tell and an evidence shape collapse to one issue', () => {
  // An express commit changed Content-Disposition quoting and produced 18
  // individually correct findings that are one decision.
  const many = Array.from({ length: 18 }, (_, i) => ({
    tell: 'moved goalpost', path: `test/res${i}.js`, line: 10 + i,
    evidence: `.expect('CD', 'filename="f${i}"') -> .expect('CD', 'filename=f${i}')`,
  }));
  const grouped = report.group(many);
  assert.strictEqual(grouped.length, 1);
  assert.strictEqual(grouped[0].occurrences, 18);
  assert.strictEqual(grouped[0].sites.length, 18);
});

test('genuinely different findings do not collapse', () => {
  assert.strictEqual(report.group(F).length, 2);
});

// Evidence is truncated for display, which cuts string literals in half. Before
// this was handled, the seventeen express Content-Disposition findings — one
// decision — grouped into SEVEN issues, because each surviving half-literal
// still carried its own filename.
test('findings whose evidence was truncated mid-literal still collapse', () => {
  const files = ['downloads.js', 'res.attachment.js', 'res.download.js'];
  const names = ['grocery.txt', 'amazing.txt', 'image.png', 'user.html', 'document.pdf'];
  const many = names.flatMap((n, i) => files.map((f, j) => ({
    tell: 'moved goalpost', path: `test/${f}`, line: 10 + i * 10 + j,
    // truncated exactly as the detector truncates it: the closing quote is gone
    evidence: `.expect('Content-Disposition', 'attachment; filename="${n}`
      + ` -> .expect('Content-Disposition', 'attachment; filename=${n}`,
  })));
  const grouped = report.group(many);
  assert.strictEqual(grouped.length, 1, 'one decision reported more than once');
  assert.strictEqual(grouped[0].occurrences, many.length);
});

test('truncation-tolerant grouping does not merge different transformations', () => {
  const a = { tell: 'moved goalpost', path: 'a.js', line: 1, evidence: "assert.equal(x, 'aaa -> assert.ok(x" };
  const b = { tell: 'moved goalpost', path: 'b.js', line: 1, evidence: "assert.equal(x, 'aaa -> assert.equal(x, 'bbb" };
  assert.strictEqual(report.group([a, b]).length, 2);
});

test('the text report names issues and sites separately when they differ', () => {
  const many = Array.from({ length: 5 }, (_, i) => ({
    tell: 'skip', path: `t${i}.js`, line: i, evidence: '.skip(',
  }));
  const out = report.renderText(many, META);
  assert.match(out, /1 issue\(s\) at 5 site\(s\)/);
  assert.match(out, /also 4 more/);
});

test('SARIF does NOT group, because GitHub annotates every line', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({
    tell: 'skip', path: `t${i}.js`, line: i + 1, evidence: '.skip(',
  }));
  const doc = JSON.parse(report.render('sarif', many, META));
  assert.strictEqual(doc.runs[0].results.length, 6);
});

// ---------------------------------------------------------------------------
// pdf — hand-rolled, so its structure is worth asserting
// ---------------------------------------------------------------------------
test('the PDF is structurally valid', () => {
  const buf = report.renderPdf(F, META);
  const s = buf.toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'), 'missing header');
  assert.ok(s.trimEnd().endsWith('%%EOF'), 'missing EOF');
  assert.ok(s.includes('/Type /Catalog'));
  assert.ok(s.includes('/Type /Pages'));
  assert.ok(s.includes('/Type /Page'));
  const startxref = Number(/startxref\s+(\d+)/.exec(s)[1]);
  assert.strictEqual(s.slice(startxref, startxref + 4), 'xref', 'startxref must point at the xref table');
});

test('PDF xref offsets actually locate their objects', () => {
  const s = report.renderPdf(F, META).toString('latin1');
  const xrefAt = Number(/startxref\s+(\d+)/.exec(s)[1]);
  // Rows start at object 0, which is always the free entry. latin1 keeps one
  // byte per character, so a string index is also the byte offset.
  const table = s.slice(xrefAt).split('\n').slice(2);
  let obj = 0;
  let checked = 0;
  for (const row of table) {
    if (/^trailer/.test(row)) break;
    const m = /^(\d{10}) \d{5} n/.exec(row);
    if (m) {
      assert.match(s.slice(Number(m[1]), Number(m[1]) + 12), new RegExp(`^${obj} 0 obj`),
        `xref entry ${obj} does not point at object ${obj}`);
      checked++;
    }
    obj++;
  }
  assert.ok(checked >= 6, `only ${checked} xref entries were verified`);
});

test('PDF text is escaped so a paren in a finding cannot corrupt the file', () => {
  const nasty = [{ tell: 'swallow', path: 'a.js', line: 1, evidence: 'catch (e) {} \\ ) ( unbalanced' }];
  const s = report.renderPdf(nasty, META).toString('latin1');
  const stream = s.slice(s.indexOf('stream'), s.indexOf('endstream'));
  const body = [...stream.matchAll(/\((?:\\.|[^\\()])*\)/g)].join('');
  assert.ok(body.length, 'no text was emitted');
  assert.ok(s.includes('\\)') || s.includes('\\('), 'parens were not escaped');
});

test('PDF paginates rather than running off one page', () => {
  const many = Array.from({ length: 120 }, (_, i) => ({
    tell: 'skip', path: `some/rather/long/path/to/file_${i}.js`, line: i,
    evidence: `finding number ${i} with enough text to take a whole line on its own`,
  }));
  const s = report.renderPdf(many, META).toString('latin1');
  assert.ok((s.match(/\/Type \/Page[^s]/g) || []).length > 1, 'everything landed on a single page');
});

// ---------------------------------------------------------------------------
// rule sets
// ---------------------------------------------------------------------------
test('the tells held out of the scanner default are held out for measured reasons', () => {
  // Both exclusions were decided by counting on real commits, not by taste.
  assert.ok(ALL_TELLS.includes('suppression'));
  assert.ok(!SCANNER_DEFAULT.includes('suppression'),
    'on 111 real commits suppression was 100 of 136 findings, almost all intentional');

  assert.ok(ALL_TELLS.includes('deleted check'));
  assert.ok(!SCANNER_DEFAULT.includes('deleted check'),
    'on the pinned sweep it is 3 findings in 171 commits and one of the three is '
    + 'a duplicate whose twin lives in a file the commit never touched — 2 of 3, below both floors');

  assert.strictEqual(SCANNER_DEFAULT.length, ALL_TELLS.length - 2);
});

test('applyRules filters to the requested set', () => {
  const mixed = [
    { tell: 'suppression', path: 'a.py', line: 1, evidence: '# noqa' },
    { tell: 'moved goalpost', path: 'b.py', line: 2, evidence: 'x -> y' },
  ];
  assert.strictEqual(applyRules(mixed, SCANNER_DEFAULT).length, 1);
  assert.strictEqual(applyRules(mixed, ALL_TELLS).length, 2);
  assert.strictEqual(applyRules(mixed, ['suppression'])[0].tell, 'suppression');
});

test('an empty rule list means no filtering, not no findings', () => {
  assert.strictEqual(applyRules(F, []).length, 2);
  assert.strictEqual(applyRules(F, null).length, 2);
});
