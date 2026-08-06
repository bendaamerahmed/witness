'use strict';
/**
 * PostToolUse: the only part of witness that watches instead of instructs.
 *
 * It reads the edit that just happened, looks for the seven tells, and hands the
 * agent a sentence about what it just did. It never blocks, never rejects, never
 * reverts. The whole design bet is that an agent shown its own tell will explain
 * or undo it, and that an agent forbidden from the tell will find a subtler one.
 */
const fs = require('fs');
const { readMode, writeHookOutput, readStdin } = require('./witness-runtime');
const { guardEnabled } = require('./witness-config');
const { inspectEdit, isSourcePath, isTestPath, isConfigPath } = require('./witness-detect');
const ledger = require('./witness-ledger-store');

/** Line number in `filePath` where `needle` begins, or 0 if it cannot be located. */
function offsetOf(filePath, needle) {
  if (!filePath || !needle) return 0;
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const idx = text.indexOf(needle);
    if (idx < 0) return 0;
    return text.slice(0, idx).split(/\r?\n/).length - 1;
  } catch (e) { return 0; }
}

/** Normalize the several tool_input shapes into before/after pairs. */
function editsFrom(toolName, input) {
  if (!input) return [];
  const p = input.file_path || input.filePath || input.notebook_path || '';
  switch (toolName) {
    case 'Edit':
      return [{ path: p, before: input.old_string || '', after: input.new_string || '' }];
    case 'MultiEdit':
      return (input.edits || []).map((e) => ({ path: p, before: e.old_string || '', after: e.new_string || '' }));
    case 'NotebookEdit':
      return [{ path: p, before: input.old_source || '', after: input.new_source || input.new_string || '' }];
    case 'Write':
      // No prior content is available here. Everything reads as added, which is
      // correct for a new file and noisy for an overwrite, so Write findings are
      // held to the unambiguous tells only (see FROM_WRITE below).
      return [{ path: p, before: '', after: input.content || '', whole: true }];
    default:
      return [];
  }
}

// On a whole-file Write there is no removal to compare against, so a `swallow`
// or a softening cannot be distinguished from code that was always there.
const FROM_WRITE = new Set(['suppression', 'skip']);

function classify(p) {
  return { source: isSourcePath(p), test: isTestPath(p), config: isConfigPath(p) };
}

function main() {
  const mode = readMode();
  if (!mode || mode === 'off' || !guardEnabled()) return;

  readStdin(1500, (data) => {
    if (!data) return;
    const tool = data.tool_name || data.toolName || '';
    const input = data.tool_input || data.toolInput || {};
    const session = data.session_id || data.sessionId || '';

    if (tool === 'Bash') {
      const cmd = String(input.command || '');
      ledger.record(session, { commands: cmd ? [cmd] : [] });
      // A command that disables the check on the way past is itself a tell.
      const sneaky = /--no-verify\b|\|\|\s*true\b|(?:^|\s)set\s+\+e\b|--exitfirst\s+--no-header|-k\s+["']not\s/.test(cmd);
      if (!sneaky) return;
      writeHookOutput('PostToolUse', mode,
        `WITNESS — that command relaxes the check it runs (\`${cmd.trim().slice(0, 120)}\`). `
        + 'Run it without the escape and report what it actually says, or say why the escape is correct here.');
      return;
    }

    const edits = editsFrom(tool, input);
    if (!edits.length) return;

    const paths = [...new Set(edits.map((e) => e.path).filter(Boolean))];
    let findings = [];
    for (const e of edits) {
      const base = offsetOf(e.path, e.after);
      for (const f of inspectEdit(e)) {
        if (e.whole && !FROM_WRITE.has(f.tell)) continue;
        findings.push({ ...f, line: f.line + base });
      }
    }

    const led = ledger.record(session, {
      paths,
      findings: findings.map((f) => ({ tell: f.tell, path: f.path, line: f.line, evidence: f.evidence })),
    });

    if (!findings.length) return;

    // Weakening a check inside a test file, in a session that has touched no
    // source file, is the shape of the no-op fix. Say so, it changes the ask.
    const touchedSource = led.paths.some((p) => classify(p).source);
    const { renderAdvisory } = require('./witness-detect');
    let text = renderAdvisory(findings, { mode });
    if (!touchedSource && paths.some((p) => classify(p).test)) {
      text += '\n\nNo source file has been changed in this session. If the behavior was supposed to change, '
        + 'it has not, and the check moving is the only thing that happened.';
    }
    writeHookOutput('PostToolUse', mode, text);
  });
}

if (require.main === module) main();
module.exports = { editsFrom, offsetOf, FROM_WRITE };
