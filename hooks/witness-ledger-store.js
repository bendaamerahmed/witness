'use strict';
/**
 * Per-session ledger. Two of the seven tells, `no-op fix` and an unverified claim,
 * are invisible in any single edit and only exist across the whole session, so a
 * small amount of state has to survive between hook invocations.
 *
 * Bounded on purpose: 200 paths, 60 findings, 40 commands. It is a signal for an
 * advisory, not an audit log.
 */
const fs = require('fs');
const path = require('path');
const { statePath } = require('./witness-runtime');

const LIMITS = { paths: 200, findings: 60, commands: 40 };

function dir() { return path.join(path.dirname(statePath()), 'witness-sessions'); }
function fileFor(sessionId) {
  const safe = String(sessionId || 'default').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'default';
  return path.join(dir(), `${safe}.json`);
}

function empty() { return { paths: [], findings: [], commands: [], claims: 0 }; }

function read(sessionId) {
  try {
    const raw = JSON.parse(fs.readFileSync(fileFor(sessionId), 'utf8').replace(/^﻿/, ''));
    return {
      paths: Array.isArray(raw.paths) ? raw.paths : [],
      findings: Array.isArray(raw.findings) ? raw.findings : [],
      commands: Array.isArray(raw.commands) ? raw.commands : [],
      claims: Number(raw.claims) || 0,
    };
  } catch (e) { return empty(); }
}

function write(sessionId, data) {
  try {
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(fileFor(sessionId), JSON.stringify({
      paths: data.paths.slice(-LIMITS.paths),
      findings: data.findings.slice(-LIMITS.findings),
      commands: data.commands.slice(-LIMITS.commands),
      claims: data.claims || 0,
    }));
  } catch (e) { /* best effort */ }
}

function record(sessionId, { paths = [], findings = [], commands = [] }) {
  const led = read(sessionId);
  for (const p of paths) if (p && !led.paths.includes(p)) led.paths.push(p);
  for (const f of findings) led.findings.push(f);
  for (const c of commands) led.commands.push(String(c).slice(0, 200));
  write(sessionId, led);
  return led;
}

function clear(sessionId) { try { fs.unlinkSync(fileFor(sessionId)); } catch (e) { /* nothing to clear */ } }

/** Drop session files nobody will read again. Cheap, runs at SessionStart only. */
function sweep(maxAgeMs = 7 * 24 * 3600 * 1000) {
  try {
    const now = Date.now();
    for (const name of fs.readdirSync(dir())) {
      const p = path.join(dir(), name);
      try { if (now - fs.statSync(p).mtimeMs > maxAgeMs) fs.unlinkSync(p); } catch (e) { /* skip */ }
    }
  } catch (e) { /* no dir yet */ }
}

module.exports = { read, write, record, clear, sweep, fileFor, dir, LIMITS };
