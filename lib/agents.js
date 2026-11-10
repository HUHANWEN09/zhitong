// 支持的智能体：启动命令、续接上次对话的参数，以及本机是否已安装。
'use strict';

const { spawnSync } = require('child_process');

// resume：重新打开已关闭的线程时追加的参数，接回这个目录里最近一次对话
const AGENTS = [
  { id: 'claude', name: 'Claude Code', cmd: 'claude', resume: '--continue', install: 'npm install -g @anthropic-ai/claude-code' },
  { id: 'codex', name: 'Codex', cmd: 'codex', resume: 'resume --last', install: 'npm install -g @openai/codex' },
  { id: 'gemini', name: 'Gemini CLI', cmd: 'gemini', resume: '', install: 'npm install -g @google/gemini-cli' },
  { id: 'shell', name: '终端', cmd: '', resume: '', install: '' },
];

let cache = null;
let cacheAt = 0;

// 用登录 shell 查找命令，这样能找到 nvm、Homebrew 等装在用户 PATH 里的程序
function installed(cmd) {
  if (!cmd) return true;
  const shell = process.env.SHELL || '/bin/zsh';
  const r = spawnSync(shell, ['-lc', `command -v ${cmd}`], { encoding: 'utf8', timeout: 8000 });
  return r.status === 0 && !!(r.stdout || '').trim();
}

function detect() {
  if (cache && Date.now() - cacheAt < 60000) return cache;
  cache = AGENTS.map(a => ({ id: a.id, name: a.name, installed: installed(a.cmd), install: a.install }));
  cacheAt = Date.now();
  return cache;
}

const get = id => AGENTS.find(a => a.id === id);

module.exports = { detect, get };
