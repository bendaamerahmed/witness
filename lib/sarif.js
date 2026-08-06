'use strict';
/**
 * SARIF 2.1.0 output.
 *
 * This is what makes witness usable as a policy gate rather than a personal
 * habit: GitHub ingests SARIF into code scanning, so a `moved goalpost` lands as
 * an annotation on the exact line of the pull request that introduced it, and
 * the security tab keeps the history.
 *
 * Every rule ships `defaultConfiguration.level: "note"`, deliberately. These are
 * findings that need a sentence from a human, not build failures. `--fail-on`
 * exists for teams that want a gate, and it is opt-in.
 */
const { ASK } = require('../hooks/witness-detect');

const VERSION = require('../package.json').version;
const INFO_URI = 'https://github.com/bendaamerahmed/witness';

const RULES = {
  'no-op fix': {
    id: 'witness/no-op-fix',
    name: 'NoOpFix',
    short: 'Only tests or config changed, and a check got weaker',
    full: 'The change touches only test, config or CI files, no source file changed, and at least one check in it got weaker. A test-only diff is normal engineering; a test-only diff in which an assertion was loosened, skipped or suppressed is a behavior claim that nothing in production can support. Both halves are required for this rule to fire.',
  },
  'moved goalpost': {
    id: 'witness/moved-goalpost',
    name: 'MovedGoalpost',
    short: 'Assertion is equally strict but asks a different question',
    full: 'An assertion was replaced by one of identical structure and identical strictness, against a different input or a different expected value. Nothing about it looks weakened, which is why assertion-strength checks score it clean. It is not a weaker check, it is a different check.',
  },
  'softened assertion': {
    id: 'witness/softened-assertion',
    name: 'SoftenedAssertion',
    short: 'A strict comparison was relaxed into a loose one',
    full: 'A strict comparison was removed and a loose one added in its place, for example assertEqual to assertTrue or toEqual to toBeTruthy. The test still runs and still passes, and no longer constrains the behavior it was written for.',
  },
  swallow: {
    id: 'witness/swallowed-error',
    name: 'SwallowedError',
    short: 'An error path was silenced rather than handled',
    full: 'An empty catch or except block, a discarded error return, or a default value standing in for a failure. A loud failure becomes a silent one, at runtime, in production.',
  },
  skip: {
    id: 'witness/skipped-test',
    name: 'SkippedTest',
    short: 'A test was disabled rather than made to pass',
    full: 'A skip or focus marker was added. The test is preserved as evidence of diligence and never executed. `.only` is included because it silently skips every other test in the file.',
  },
  suppression: {
    id: 'witness/suppression',
    name: 'Suppression',
    short: 'A type, lint or CI gate was disabled at the point it would have fired',
    full: 'A suppression comment or flag was added, for example @ts-ignore, # noqa, eslint-disable, #[allow], --no-verify or continue-on-error. The gate is disabled at exactly the place it was about to report something.',
  },
  'fixture fitting': {
    id: 'witness/fixture-fitting',
    name: 'FixtureFitting',
    short: 'A branch keyed on the exact value the test uses',
    full: 'A new branch or constant matches exactly the input the test supplies. It passes every visible check and fails every real input. This is the tell no diff-based detector can see reliably.',
  },
};

const LEVEL = { error: 'error', warning: 'warning', note: 'note' };

function rulesArray() {
  return Object.values(RULES).map((r) => ({
    id: r.id,
    name: r.name,
    shortDescription: { text: r.short },
    fullDescription: { text: r.full },
    help: {
      text: `${r.full}\n\nWhat to do: ${ASK[keyFor(r.id)] || 'justify it in your summary or undo it'}\n\n`
        + 'This finding is advisory. If it is the right call, keep it and mark it `witness: <why>` '
        + 'on or next to the line, which silences it and records it in the ledger.',
      markdown: `${r.full}\n\n**What to do:** ${ASK[keyFor(r.id)] || 'justify it in your summary or undo it'}\n\n`
        + 'Advisory. If it is correct here, keep it and add a `witness: <why>` comment on or next to the line — '
        + 'that silences the finding and records the decision.',
    },
    defaultConfiguration: { level: LEVEL.note },
    properties: { tags: ['witness', 'test-integrity', 'reward-hacking'], precision: 'medium' },
    helpUri: `${INFO_URI}/blob/main/docs/TELLS.md#${r.name.toLowerCase()}`,
  }));
}

function keyFor(id) {
  for (const [k, v] of Object.entries(RULES)) if (v.id === id) return k;
  return null;
}

/** Normalize a path for SARIF: forward slashes, no leading ./ , URI-safe. */
function uriFor(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function toSarif(findings, { level = 'note' } = {}) {
  const results = findings.map((f) => {
    const rule = RULES[f.tell];
    const region = f.line > 0 ? { startLine: f.line } : undefined;
    return {
      ruleId: rule ? rule.id : `witness/${String(f.tell).replace(/\s+/g, '-')}`,
      level: LEVEL[level] || LEVEL.note,
      message: { text: `${f.tell}: ${f.evidence}. ${ASK[f.tell] || ''}`.trim() },
      locations: [{
        physicalLocation: {
          artifactLocation: { uri: uriFor(f.path), uriBaseId: '%SRCROOT%' },
          ...(region ? { region } : {}),
        },
      }],
      partialFingerprints: {
        // Stable across line moves so GitHub does not re-open a resolved finding
        // every time something above it shifts.
        witnessTellLocation: `${f.tell}:${uriFor(f.path)}:${(f.evidence || '').slice(0, 60)}`,
      },
      properties: { tell: f.tell },
    };
  });

  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spectool/main/schemas/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'witness',
          semanticVersion: VERSION,
          version: VERSION,
          informationUri: INFO_URI,
          rules: rulesArray(),
        },
      },
      results,
      columnKind: 'unicodeCodePoints',
    }],
  };
}

module.exports = { toSarif, RULES, rulesArray, uriFor };
