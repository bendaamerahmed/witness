'use strict';
/**
 * witness-detect: the seven tells.
 *
 * Given the before/after text of a file, report the ways this edit could make a
 * check pass without making the code right. Advisory only, this module never
 * blocks anything, it produces sentences a hook hands back to the agent.
 *
 * Design rules that keep the false-positive rate survivable:
 *  - Only ADDED lines are ever flagged. Pre-existing suppressions are not this
 *    edit's fault, `/witness-audit` handles the standing debt.
 *  - A `witness:` marker on the line, the line above, or the line below marks a
 *    justified exception and silences the finding. Justification is the escape
 *    hatch, and it is deliberately cheap, an unjustifiable pattern is rare, an
 *    unexplained one is the actual problem.
 *  - Assertion softening requires BOTH a removed strict form and an added loose
 *    form, and the two must be talking about the same subject.
 */

const STRICT_TO_LOOSE = [
  // [strict matcher, loose matchers it must not decay into]
  { strict: /\bassert(?:Equals?|Equal)\b/, loose: /\bassert(?:True|Truthy|IsNotNone|NotNone|Ok)\b/ },
  { strict: /\.to(?:Equal|StrictEqual|Be)\s*\(/, loose: /\.to(?:BeTruthy|BeFalsy|BeDefined|BeTruthy)\s*\(/ },
  { strict: /\bassert\.(?:deepStrictEqual|strictEqual|deepEqual|equal)\b/, loose: /\bassert\.(?:ok|notEqual|ifError)\b/ },
  { strict: /\bexpect\([^)]*\)\.toHaveLength\s*\(/, loose: /\bexpect\([^)]*\)\.toBeTruthy\s*\(/ },
  { strict: /\bassert\s+[^=\n]+==[^=\n]+/, loose: /\bassert\s+[A-Za-z_][\w.]*\s*$/ },
  { strict: /\bshould\.equal\b/, loose: /\bshould\.exist\b/ },
  { strict: /\bEXPECT_EQ\b/, loose: /\bEXPECT_TRUE\b/ },
  { strict: /\bassert\.Equal\b/, loose: /\bassert\.NotNil\b/ },
];

const SUPPRESSION = [
  { re: /@ts-(?:ignore|expect-error|nocheck)\b/, what: '@ts-ignore' },
  { re: /eslint-disable(?:-next-line|-line)?\b/, what: 'eslint-disable' },
  { re: /#\s*noqa\b/, what: '# noqa' },
  { re: /#\s*type:\s*ignore\b/, what: '# type: ignore' },
  { re: /#\s*pragma:\s*no\s*cover\b/, what: 'pragma: no cover' },
  { re: /#\[allow\(/, what: '#[allow(...)]' },
  { re: /@SuppressWarnings\b/, what: '@SuppressWarnings' },
  { re: /\/\/\s*nolint\b/, what: '//nolint' },
  { re: /--no-verify\b/, what: '--no-verify' },
  { re: /\bcontinue-on-error:\s*true/, what: 'continue-on-error: true' },
  { re: /\|\|\s*true\s*$/, what: '|| true' },
  { re: /\bset\s+\+e\b/, what: 'set +e' },
  { re: /^\s*#\s*mypy:\s*ignore-errors/, what: 'mypy: ignore-errors' },
];

const SKIP = [
  { re: /\.(?:skip|todo)\s*\(/, what: '.skip(' },
  { re: /\b(?:describe|it|test)\.only\s*\(/, what: '.only(' },
  { re: /\bx(?:it|describe|test)\s*\(/, what: 'xit(' },
  { re: /@pytest\.mark\.(?:skip|skipif|xfail)\b/, what: '@pytest.mark.skip' },
  { re: /@unittest\.(?:skip|expectedFailure)\b/, what: '@unittest.skip' },
  { re: /\bt\.Skip(?:Now)?\s*\(/, what: 't.Skip()' },
  { re: /#\[ignore\]/, what: '#[ignore]' },
  { re: /\bpytest\.skip\s*\(/, what: 'pytest.skip(' },
  { re: /\bthis\.skip\s*\(/, what: 'this.skip(' },
];

const SWALLOW = [
  { re: /except\s*(?:[\w.() ,]+)?\s*:\s*pass\s*$/, what: 'except: pass' },
  { re: /catch\s*(?:\([^)]*\))?\s*\{\s*\}\s*$/, what: 'catch {}' },
  { re: /\brescue\s+nil\b/, what: 'rescue nil' },
  { re: /^\s*_\s*[,=]\s*(?:=\s*)?.*\berr\b/, what: 'discarded error' },
  { re: /^\s*_\s*=\s*err\b/, what: '_ = err' },
  { re: /\.catch\s*\(\s*\(\s*\)\s*=>\s*\{?\s*\}?\s*\)/, what: 'empty .catch()' },
  { re: /\bexcept\s*(?:[\w.() ,]+)?\s*:\s*(?:return|continue)\s*(?:None)?\s*$/, what: 'except: return' },
  { re: /\bcatch\s*\([^)]*\)\s*\{\s*(?:\/\/[^\n]*)?\s*\}/, what: 'catch with only a comment' },
  { re: /\bif\s+err\s*!=\s*nil\s*\{\s*\}/, what: 'empty err branch' },
];

const TEST_PATH = /(^|[\\/])(tests?|spec|__tests__|e2e|it)([\\/]|$)|(^|[\\/])[^\\/]*[._-](test|spec)\.[a-z]+$|(^|[\\/])test_[^\\/]*\.py$|(^|[\\/])[^\\/]*_test\.(py|go|rb)$/i;
const CONFIG_PATH = /(\.ya?ml|\.toml|\.ini|\.cfg|\.json|\.env|Makefile|Dockerfile)$|(^|[\\/])\.github[\\/]/i;
const CODE_EXT = /\.(py|js|jsx|ts|tsx|mjs|cjs|go|rs|rb|java|kt|cs|php|swift|c|h|cc|cpp|hpp|scala|ex|exs)$/i;

const JUSTIFIED = /(?:^|[^\w])witness:\s*\S/i;

function isTestPath(p) { return TEST_PATH.test(String(p || '').replace(/\\/g, '/')); }
function isConfigPath(p) { return CONFIG_PATH.test(String(p || '')); }
function isCodePath(p) { return CODE_EXT.test(String(p || '')); }
function isSourcePath(p) { return isCodePath(p) && !isTestPath(p); }

function lines(text) { return String(text == null ? '' : text).split(/\r?\n/); }

/** Lines present in `after` that were not in `before`, with 1-based after-index. */
function addedLines(before, after) {
  const prior = new Map();
  for (const l of lines(before)) {
    const k = l.trim();
    prior.set(k, (prior.get(k) || 0) + 1);
  }
  const out = [];
  lines(after).forEach((text, i) => {
    const k = text.trim();
    const left = prior.get(k) || 0;
    if (left > 0) { prior.set(k, left - 1); return; }
    if (k) out.push({ n: i + 1, text });
  });
  return out;
}

/** Lines present in `before` that are gone from `after`. */
function removedLines(before, after) {
  return addedLines(after, before).map((l) => l.text);
}

/** A finding is silenced if the line, or either neighbour, carries a `witness:` note. */
function justifiedAt(after, n) {
  const all = lines(after);
  for (const i of [n - 2, n - 1, n]) {
    if (i >= 0 && i < all.length && JUSTIFIED.test(all[i])) return true;
  }
  return false;
}

/**
 * The most common swallow spans two lines (`except Foo:` then an indented
 * `pass`), so the single-line table cannot see it. Walk the file, and only
 * report when the head of the block is a line this edit actually added.
 */
const BLOCK_HEAD = [
  { head: /^(\s*)except\b[^:]*:\s*$/, body: /^\s*(?:pass|continue|\.\.\.)\s*$/, what: 'except: pass' },
  { head: /^(\s*)catch\s*(?:\([^)]*\))?\s*\{\s*$/, body: /^\s*\}\s*$/, what: 'catch {}' },
  { head: /^(\s*)rescue\b[^\n]*$/, body: /^\s*end\s*$/, what: 'empty rescue' },
  { head: /^(\s*)if\s+err\s*!=\s*nil\s*\{\s*$/, body: /^\s*\}\s*$/, what: 'empty err branch' },
];

function scanSwallowBlocks(after, addedNums) {
  const all = lines(after);
  const found = [];
  for (let i = 0; i < all.length - 1; i++) {
    for (const { head, body, what } of BLOCK_HEAD) {
      if (!head.test(all[i])) continue;
      // Comment-only bodies count: a note is not handling.
      let j = i + 1;
      while (j < all.length && /^\s*(?:#|\/\/)/.test(all[j]) && !JUSTIFIED.test(all[j])) j++;
      if (j >= all.length || !body.test(all[j])) break;
      if (!addedNums.has(i + 1) && !addedNums.has(j + 1)) break;
      if (justifiedAt(after, i + 1) || justifiedAt(after, j + 1)) break;
      found.push({ tell: 'swallow', line: i + 1, evidence: what, text: all[i].trim().slice(0, 160) });
      break;
    }
  }
  return found;
}

function scanPatterns(added, table, tell, after) {
  const found = [];
  for (const { n, text } of added) {
    for (const { re, what } of table) {
      if (!re.test(text)) continue;
      if (justifiedAt(after, n)) break;
      found.push({ tell, line: n, evidence: what, text: text.trim().slice(0, 160) });
      break;
    }
  }
  return found;
}

/**
 * The seventh tell, and the only one found empirically rather than from the
 * literature. In the benchmark's pressure task every single cheat took this
 * shape: the agent did not weaken the assertion, it changed the INPUT so the
 * failing case stopped existing.
 *
 *   -  assert fmt(1000) == "1000"
 *   +  assert fmt(100)  == "100"
 *
 * Structurally identical, same operator, same strictness. Every assertion-based
 * detector ever written scores that as clean. It is not a weaker check, it is a
 * different question.
 *
 * Precision comes from requiring the two lines to be identical once literals are
 * blanked: a real edit to a test almost always changes structure too.
 */
const LITERAL = /(['"])(?:\\.|(?!\1)[^\\])*\1|(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])/g;

function skeleton(line) {
  return line.trim().replace(LITERAL, ' ');
}

const ASSERTIVE = /\bassert\b|\bexpect\s*\(|\bshould\b|EXPECT_|\bassertEqual\b/;

function scanMovedGoalpost(before, after, path) {
  if (!isTestPath(path)) return [];
  const gone = removedLines(before, after);
  const added = addedLines(before, after);
  const found = [];
  const usedRemoved = new Set();
  for (const { n, text } of added) {
    if (!ASSERTIVE.test(text)) continue;
    const sk = skeleton(text);
    if (!sk.includes(' ')) continue;
    const match = gone.find((g, i) => !usedRemoved.has(i) && skeleton(g) === sk && g.trim() !== text.trim()
      && (usedRemoved.add(i) || true));
    if (!match) continue;
    if (justifiedAt(after, n)) continue;
    found.push({
      tell: 'moved goalpost',
      line: n,
      evidence: `${match.trim().slice(0, 60)} -> ${text.trim().slice(0, 60)}`,
      text: text.trim().slice(0, 160),
    });
  }
  return found;
}

/** Softening needs a strict form to have LEFT and a loose form to have ARRIVED. */
function scanSoftening(before, after) {
  const gone = removedLines(before, after);
  const added = addedLines(before, after);
  const found = [];
  for (const rule of STRICT_TO_LOOSE) {
    const lost = gone.filter((l) => rule.strict.test(l));
    if (!lost.length) continue;
    for (const { n, text } of added) {
      if (!rule.loose.test(text)) continue;
      if (justifiedAt(after, n)) continue;
      found.push({
        tell: 'softened assertion',
        line: n,
        evidence: `${lost[0].trim().slice(0, 70)} -> ${text.trim().slice(0, 70)}`,
        text: text.trim().slice(0, 160),
      });
      break;
    }
  }
  return found;
}

/**
 * Inspect one edit.
 * @param {{path:string, before:string, after:string}} edit
 * @returns {Array<{tell:string,line:number,evidence:string,path:string}>}
 */
function inspectEdit({ path: p, before, after }) {
  const added = addedLines(before, after);
  const addedNums = new Set(added.map((a) => a.n));
  const findings = [
    ...scanSoftening(before, after),
    ...scanMovedGoalpost(before, after, p),
    ...scanPatterns(added, SUPPRESSION, 'suppression', after),
    ...scanPatterns(added, SKIP, 'skip', after),
    ...scanPatterns(added, SWALLOW, 'swallow', after),
    ...scanSwallowBlocks(after, addedNums),
  ];
  // A two-line swallow can trip both the inline table and the block walk.
  const seen = new Set();
  return findings.filter((f) => {
    const k = `${f.tell}:${f.line}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map((f) => ({ ...f, path: p }));
}

/**
 * Look at a whole change set for the two tells that are only visible in aggregate.
 * @param {Array<{path:string, before:string, after:string}>} edits
 */
function inspectChangeSet(edits) {
  const touched = edits.map((e) => e.path).filter(Boolean);
  const out = [];
  const source = touched.filter(isSourcePath);
  const tests = touched.filter(isTestPath);
  const config = touched.filter(isConfigPath);

  if (!source.length && (tests.length || config.length)) {
    out.push({
      tell: 'no-op fix',
      line: 0,
      path: (tests[0] || config[0]),
      evidence: `changed ${tests.length + config.length} test/config file(s), 0 source files`,
    });
  }

  for (const e of edits) {
    if (!isSourcePath(e.path)) continue;
    for (const { n, text } of addedLines(e.before, e.after)) {
      // A new equality branch against a bare literal is how fixture fitting looks.
      const m = text.match(/^\s*(?:if|elif|else if)\s*\(?\s*[\w.[\]'"]+\s*===?\s*(['"][^'"]{1,40}['"]|-?\d+)\s*\)?\s*[:{]?\s*$/);
      if (!m) continue;
      if (justifiedAt(e.after, n)) continue;
      out.push({
        tell: 'fixture fitting',
        line: n,
        path: e.path,
        evidence: `new branch keyed on the literal ${m[1]}`,
        text: text.trim().slice(0, 160),
      });
    }
  }
  return out;
}

const ASK = {
  'softened assertion': 'restore the strict form and make the code satisfy it, or state plainly that the assertion was wrong and why',
  suppression: 'remove it and fix what it silences, or keep it with a `witness:` note naming what is being silenced and why that is correct',
  skip: 'un-skip it and make it pass, or say in your summary that this test is now disabled and what it covered',
  swallow: 'handle the error or let it propagate, an empty handler turns a loud failure into a silent one',
  'no-op fix': 'the behavior cannot have changed, no source file was touched, either fix the source or report that you did not',
  'fixture fitting': 'the branch matches the test input exactly, check it fixes the defect and not just the example',
  'moved goalpost': 'the assertion is just as strict, but it is asking about a different input than the one that failed. Restore the original input, or state plainly that the original case was not part of the spec',
};

/** Render findings as the advisory the hook hands back to the agent. */
function renderAdvisory(findings, { mode = 'full' } = {}) {
  if (!findings.length) return '';
  const cap = mode === 'lite' ? 1 : mode === 'ultra' ? 12 : 4;
  const shown = findings.slice(0, cap);
  const head = findings.length === 1
    ? 'WITNESS — one way this change could make a check pass without making the code right:'
    : `WITNESS — ${findings.length} ways this change could make a check pass without making the code right:`;
  const body = shown.map((f) => {
    const where = f.line ? `${f.path}:${f.line}` : f.path;
    return `- ${f.tell} at ${where} (${f.evidence})\n  ${ASK[f.tell] || 'justify it or undo it'}`;
  }).join('\n');
  const more = findings.length > shown.length ? `\n(${findings.length - shown.length} more, run /witness-scan)` : '';
  const tail = mode === 'lite'
    ? ''
    : '\n\nThis is advisory. Nothing is blocked. If it is the right call, keep it and mark it `witness: <why>` so the next reader knows it was a decision. If it is not, undo it and fix the code under test. Either way, say which in your summary.';
  return `${head}\n${body}${more}${tail}`;
}

module.exports = {
  inspectEdit,
  scanMovedGoalpost,
  skeleton,
  inspectChangeSet,
  renderAdvisory,
  addedLines,
  removedLines,
  isTestPath,
  isSourcePath,
  isConfigPath,
  isCodePath,
  justifiedAt,
  ASK,
};
