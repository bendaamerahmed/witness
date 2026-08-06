'use strict';
/**
 * Remove everything witness wrote outside its own directory.
 *
 * Run this BEFORE the host's plugin-remove command — this script is itself a
 * plugin file, and once the host deletes the plugin it is gone too.
 */
const fs = require('fs');
const path = require('path');
const { getClaudeDir, getConfigDir, configPath } = require('../hooks/witness-config');
const { statePath } = require('../hooks/witness-runtime');

const removed = [];
const kept = [];

function rm(p, what) {
  try {
    if (!fs.existsSync(p)) return;
    fs.rmSync(p, { recursive: true, force: true });
    removed.push(`${what}: ${p}`);
  } catch (e) { kept.push(`${what}: ${p} (${e.message})`); }
}

rm(statePath(), 'session level');
rm(path.join(path.dirname(statePath()), 'witness-sessions'), 'session ledgers');
rm(configPath(), 'config');
try {
  if (fs.existsSync(getConfigDir()) && !fs.readdirSync(getConfigDir()).length) {
    fs.rmdirSync(getConfigDir()); removed.push(`config dir: ${getConfigDir()}`);
  }
} catch (e) { /* leave it */ }
rm(path.join(getClaudeDir(), '.witness-statusline-nudged'), 'statusline nudge flag');

// settings.json may have a statusLine shared with other plugins, so only the
// witness segment comes out, and a malformed file is reported rather than rewritten.
const settings = path.join(getClaudeDir(), 'settings.json');
try {
  if (fs.existsSync(settings)) {
    const raw = fs.readFileSync(settings, 'utf8').replace(/^﻿/, '');
    const cfg = JSON.parse(raw);
    const cmd = cfg.statusLine && cfg.statusLine.command;
    if (typeof cmd === 'string' && /witness-statusline/.test(cmd)) {
      const segments = cmd.split(/\s*(?:&&|;)\s*/).filter((s) => s && !/witness-statusline/.test(s));
      if (segments.length) cfg.statusLine.command = segments.join(' && ');
      else delete cfg.statusLine;
      fs.writeFileSync(settings, JSON.stringify(cfg, null, 2) + '\n');
      removed.push(`statusLine segment in ${settings}`);
    }
  }
} catch (e) {
  kept.push(`${settings} is not valid JSON, leaving it alone — remove the witness-statusline entry by hand`);
}

if (removed.length) { console.log('removed:'); for (const r of removed) console.log(`  ${r}`); }
else console.log('nothing to remove; witness had written no state.');
if (kept.length) { console.log('\ncould not remove:'); for (const k of kept) console.log(`  ${k}`); }
console.log('\nNow remove the plugin in your host (Claude Code: /plugin uninstall witness@witness).');
