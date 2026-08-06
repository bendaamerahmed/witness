'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getClaudeDir } = require('./witness-config');

const STATE_FILE = '.witness-active';

const isCopilot = Boolean(process.env.COPILOT_PLUGIN_DATA);
const isCodex = !isCopilot && Boolean(process.env.PLUGIN_DATA);
const isQoder = !isCopilot && !isCodex && Boolean(process.env.QODER_SESSION_ID);

function stateDir() {
  if (isCopilot) return process.env.COPILOT_PLUGIN_DATA;
  if (isCodex) return process.env.PLUGIN_DATA;
  if (isQoder) return path.join(os.homedir(), '.qoder');
  return getClaudeDir();
}
function statePath() { return path.join(stateDir(), STATE_FILE); }

function setMode(mode) {
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    fs.writeFileSync(statePath(), String(mode));
  } catch (e) { /* best effort */ }
}
function clearMode() { try { fs.unlinkSync(statePath()); } catch (e) { /* already off */ } }
function readMode() {
  try { return fs.readFileSync(statePath(), 'utf8').replace(/^﻿/, '').trim() || null; }
  catch (e) { return null; }
}

/**
 * Write a hook result in whatever shape the host actually reads.
 * Claude Code takes raw stdout for SessionStart/UserPromptSubmit, but silently
 * drops it for SubagentStart and PostToolUse unless it is wrapped.
 */
function writeHookOutput(event, mode, context = '') {
  const WRAPPED = new Set(['SubagentStart', 'PostToolUse', 'PreToolUse', 'Stop']);
  try {
    if (isCopilot) {
      process.stdout.write(JSON.stringify(
        event === 'SessionStart' && context ? { additionalContext: context } : {}));
      return;
    }
    if (isCodex) {
      const out = { systemMessage: `WITNESS:${String(mode || 'off').toUpperCase()}` };
      if (context) out.hookSpecificOutput = { hookEventName: event, additionalContext: context };
      process.stdout.write(JSON.stringify(out));
      return;
    }
    if (isQoder || WRAPPED.has(event)) {
      const out = {};
      if (context) out.hookSpecificOutput = { hookEventName: event, additionalContext: context };
      process.stdout.write(JSON.stringify(out));
      return;
    }
    process.stdout.write(context);
  } catch (e) { /* EPIPE must not surface as a hook failure */ }
}

/** Read stdin JSON without ever hanging the host. Windows PowerShell wrappers can eat the pipe. */
function readStdin(timeoutMs, cb) {
  let done = false;
  let buf = '';
  const finish = (v) => { if (!done) { done = true; cb(v); } };
  const timer = setTimeout(() => finish(null), timeoutMs);
  if (timer.unref) timer.unref();
  try {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => { buf += d; });
    process.stdin.on('error', () => finish(null));
    process.stdin.on('end', () => {
      clearTimeout(timer);
      try { finish(JSON.parse(buf.replace(/^﻿/, '') || '{}')); }
      catch (e) { finish(null); }
    });
  } catch (e) { finish(null); }
}

module.exports = { STATE_FILE, isCodex, isCopilot, isQoder, statePath, setMode, clearMode, readMode, writeHookOutput, readStdin };
