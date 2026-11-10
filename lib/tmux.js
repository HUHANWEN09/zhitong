// tmux 操作：所有智能体都跑在同一个 tmux 会话的不同窗口里。
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SESSION = process.env.ZHITONG_TMUX_SESSION || 'zhitong-community';
const SEARCH = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];

function findBin(name) {
  const dirs = (process.env.PATH || '').split(':').concat(SEARCH);
  for (const d of dirs) {
    const p = path.join(d, name);
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch (e) { /* 继续找 */ }
  }
  return null;
}

let tmuxBin = null;
const bin = () => tmuxBin || (tmuxBin = findBin('tmux') || 'tmux');
const run = args => execFileSync(bin(), args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryRun = args => { try { return run(args); } catch (e) { return null; } };

function ensureSession() {
  if (tryRun(['has-session', '-t', SESSION]) !== null) return;
  run(['new-session', '-d', '-s', SESSION, '-n', 'home', '-c', require('os').homedir()]);
  tryRun(['set-option', '-t', SESSION, 'mouse', 'on']);
  tryRun(['set-option', '-t', SESSION, 'history-limit', '50000']);
}

function listWindows() {
  const out = tryRun(['list-windows', '-t', SESSION, '-F', '#{window_id}\t#{window_name}']);
  if (!out) return [];
  return out.split('\n').filter(Boolean).map(l => { const [id, name] = l.split('\t'); return { id, name }; });
}

const target = id => `${SESSION}:${id}`;

// 新建窗口：先开登录 shell，再把启动命令打进去。智能体退出后窗口还在，可以接着用。
function newWindow(name, dir, cmd) {
  ensureSession();
  const id = run(['new-window', '-d', '-t', SESSION + ':', '-n', name, '-c', dir, '-P', '-F', '#{window_id}']);
  if (cmd) {
    // 等 shell 初始化完再输入，避免命令被 shell 启动脚本吞掉
    setTimeout(() => { tryRun(['send-keys', '-t', target(id), '-l', cmd]); tryRun(['send-keys', '-t', target(id), 'Enter']); }, 400);
  }
  return id;
}

function selectWindow(id) { if (id) tryRun(['select-window', '-t', target(id)]); }
function killWindow(id) { if (id) tryRun(['kill-window', '-t', target(id)]); }
function renameWindow(id, name) { tryRun(['rename-window', '-t', target(id), name]); }

function assertAlive(id) {
  if (!id || !listWindows().some(w => w.id === id)) {
    const e = new Error('这个线程的窗口已关闭，先点开它');
    e.status = 409;
    throw e;
  }
}

function sendText(id, text, enter) {
  assertAlive(id);
  if (text) run(['send-keys', '-t', target(id), '-l', text]);
  if (enter) run(['send-keys', '-t', target(id), 'Enter']);
}

const KEYS = new Set(['Enter', 'Escape', 'Tab', 'Up', 'Down', 'C-c', 'BSpace']);
function sendKey(id, key) {
  if (!KEYS.has(key)) { const e = new Error('不支持的按键'); e.status = 400; throw e; }
  assertAlive(id);
  run(['send-keys', '-t', target(id), key]);
}

module.exports = { SESSION, findBin, bin, ensureSession, listWindows, newWindow, selectWindow, killWindow, renameWindow, sendText, sendKey };
