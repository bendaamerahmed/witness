'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_MODE = 'full';
const VALID_MODES = ['off', 'lite', 'full', 'ultra', 'proof'];
// `proof` is a session-only working mode, it is never a persisted default.
const RUNTIME_MODES = ['off', 'lite', 'full', 'ultra'];

function stripBom(s) { return String(s || '').replace(/^﻿/, ''); }

function normalizeMode(value) {
  const v = stripBom(value).trim().toLowerCase();
  return VALID_MODES.includes(v) ? v : null;
}

function getClaudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function getConfigDir() {
  if (process.env.XDG_CONFIG_HOME) return path.join(process.env.XDG_CONFIG_HOME, 'witness');
  if (process.platform === 'win32' && process.env.APPDATA) return path.join(process.env.APPDATA, 'witness');
  return path.join(os.homedir(), '.config', 'witness');
}

function configPath() { return path.join(getConfigDir(), 'config.json'); }

function readConfig() {
  try {
    const raw = JSON.parse(stripBom(fs.readFileSync(configPath(), 'utf8')));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch (e) { return {}; }
}

function truthy(v) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return !(s === '' || s === '0' || s === 'false' || s === 'no');
}

function getDefaultMode() {
  const fromEnv = normalizeMode(process.env.WITNESS_DEFAULT_MODE);
  if (fromEnv && RUNTIME_MODES.includes(fromEnv)) return fromEnv;
  const fromFile = normalizeMode(readConfig().defaultMode);
  if (fromFile && RUNTIME_MODES.includes(fromFile)) return fromFile;
  return DEFAULT_MODE;
}

function writeDefaultMode(mode) {
  const m = normalizeMode(mode);
  if (!m || !RUNTIME_MODES.includes(m)) return null;
  const next = { ...readConfig(), defaultMode: m };
  try {
    fs.mkdirSync(getConfigDir(), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(next, null, 2) + '\n');
  } catch (e) { /* best effort, never fail a hook over config */ }
  return m;
}

function hideStatus() { return truthy(process.env.WITNESS_HIDE_STATUS) || truthy(readConfig().hideStatus); }
function guardEnabled() {
  if (process.env.WITNESS_GUARD != null) return truthy(process.env.WITNESS_GUARD);
  const c = readConfig();
  return c.guard == null ? true : truthy(c.guard);
}

module.exports = {
  DEFAULT_MODE, VALID_MODES, RUNTIME_MODES,
  normalizeMode, getClaudeDir, getConfigDir, configPath,
  readConfig, writeDefaultMode, getDefaultMode, hideStatus, guardEnabled, truthy, stripBom,
};
