#!/usr/bin/env node
// 智通 ZHITONG 社区版：在一个网页里管理多个 AI 编程智能体的终端。
// 只监听本机 127.0.0.1；终端由 tmux 承载，网页里通过 ttyd 显示。
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawn } = require('child_process');

const store = require('./lib/store');
const tmux = require('./lib/tmux');
const agents = require('./lib/agents');
const { listSkills } = require('./lib/skills');
const pkg = require('./package.json');

const HOST = '127.0.0.1';
const PORT = Number(process.env.ZHITONG_PORT) || 47690;
const TTYD_PORT = Number(process.env.ZHITONG_TTYD_PORT) || PORT + 1;
const PUBLIC_DIR = path.join(__dirname, 'public');
// 每次启动随机生成终端路径，别的网页猜不到，连不上终端
const TTYD_BASE = '/t-' + crypto.randomBytes(12).toString('hex');

const OFFICIAL = {
  download: 'https://github.com/HUHANWEN09/zhitong/releases/latest',
  site: 'https://zhitong.xingyuzhitong.com',
};

// ---------- ttyd ----------
let ttydProc = null;
function startTtyd() {
  tmux.ensureSession();
  const bin = tmux.findBin('ttyd');
  if (!bin) {
    console.error('[zhitong] 没找到 ttyd，终端无法显示。macOS 请运行：brew install ttyd');
    return;
  }
  ttydProc = spawn(bin, [
    '-i', HOST, '-p', String(TTYD_PORT), '-W', '-O', '-b', TTYD_BASE,
    '-t', 'fontSize=14', '-t', 'disableLeaveAlert=true',
    // 必须用 -- 隔开：否则 ttyd 会把后面的 -t 当成自己的参数，tmux 就会连到别的会话
    '--', tmux.bin(), 'attach-session', '-t', tmux.SESSION,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  ttydProc.stderr.on('data', () => {});
  ttydProc.on('exit', code => {
    ttydProc = null;
    if (!shuttingDown) {
      console.error(`[zhitong] ttyd 退出（${code}），2 秒后重启`);
      setTimeout(startTtyd, 2000);
    }
  });
}

// ---------- 状态 ----------
function threadView(t, alive) {
  return { ...t, alive: alive.has(t.windowId) };
}

function getState() {
  const data = store.load();
  const alive = new Set(tmux.listWindows().map(w => w.id));
  return {
    version: pkg.version,
    agents: agents.detect(),
    projects: data.projects,
    threads: data.threads.map(t => threadView(t, alive)),
    terminalUrl: `http://${HOST}:${TTYD_PORT}${TTYD_BASE}/`,
    terminalReady: !!ttydProc,
    official: OFFICIAL,
  };
}

function findThread(data, id) {
  const t = data.threads.find(x => x.id === id);
  if (!t) throw httpError(404, '线程不存在');
  return t;
}

function openThreadWindow(t, project, resume) {
  const def = agents.get(t.agent);
  if (!def) throw httpError(400, '不支持的智能体');
  const cmd = resume && def.resume ? `${def.cmd} ${def.resume}` : def.cmd;
  t.windowId = tmux.newWindow(t.name, project.dir, cmd);
  tmux.selectWindow(t.windowId);
}

// ---------- 接口 ----------
const routes = {
  'GET /api/state': () => getState(),

  'POST /api/projects': body => {
    const dir = path.resolve(String(body.dir || '').replace(/^~(?=$|\/)/, os.homedir()));
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw httpError(400, '目录不存在');
    const data = store.load();
    if (data.projects.some(p => p.dir === dir)) throw httpError(409, '这个目录已经添加过了');
    const p = { id: store.newId(), name: String(body.name || '').trim() || path.basename(dir), dir, createdAt: Date.now() };
    data.projects.push(p);
    store.save(data);
    return p;
  },

  'POST /api/projects/remove': body => {
    const data = store.load();
    for (const t of data.threads.filter(x => x.projectId === body.id)) tmux.killWindow(t.windowId);
    data.threads = data.threads.filter(x => x.projectId !== body.id);
    data.projects = data.projects.filter(x => x.id !== body.id);
    store.save(data);
    return { ok: true };
  },

  // macOS 弹出系统的选择文件夹窗口；用户取消时返回空
  'POST /api/pick-dir': () => new Promise((resolve, reject) => {
    if (process.platform !== 'darwin') return reject(httpError(501, '只有 macOS 支持选择文件夹，请直接输入路径'));
    const p = spawn('osascript', ['-e', 'POSIX path of (choose folder with prompt "选择项目文件夹")']);
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.on('close', () => resolve({ dir: out.trim().replace(/\/$/, '') }));
    p.on('error', () => resolve({ dir: '' }));
  }),

  'POST /api/threads': body => {
    const data = store.load();
    const project = data.projects.find(p => p.id === body.projectId);
    if (!project) throw httpError(404, '项目不存在');
    if (!agents.get(body.agent)) throw httpError(400, '不支持的智能体');
    const n = data.threads.filter(x => x.projectId === project.id).length + 1;
    const t = {
      id: store.newId(), projectId: project.id, agent: body.agent,
      name: String(body.name || '').trim().slice(0, 40) || `${agents.get(body.agent).name} ${n}`,
      windowId: null, createdAt: Date.now(),
    };
    openThreadWindow(t, project, false);
    data.threads.push(t);
    store.save(data);
    return t;
  },

  'POST /api/threads/open': body => {
    const data = store.load();
    const t = findThread(data, body.id);
    const alive = new Set(tmux.listWindows().map(w => w.id));
    if (alive.has(t.windowId)) {
      tmux.selectWindow(t.windowId);
    } else {
      const project = data.projects.find(p => p.id === t.projectId);
      if (!project) throw httpError(404, '项目不存在');
      openThreadWindow(t, project, true);
      store.save(data);
    }
    return { ok: true };
  },

  'POST /api/threads/close': body => {
    const data = store.load();
    const t = findThread(data, body.id);
    tmux.killWindow(t.windowId);
    return { ok: true };
  },

  'POST /api/threads/remove': body => {
    const data = store.load();
    const t = findThread(data, body.id);
    tmux.killWindow(t.windowId);
    data.threads = data.threads.filter(x => x.id !== t.id);
    store.save(data);
    return { ok: true };
  },

  'POST /api/threads/rename': body => {
    const data = store.load();
    const t = findThread(data, body.id);
    const name = String(body.name || '').trim().slice(0, 40);
    if (!name) throw httpError(400, '名称不能为空');
    t.name = name;
    if (t.windowId) tmux.renameWindow(t.windowId, name);
    store.save(data);
    return t;
  },

  'POST /api/send': body => {
    const data = store.load();
    const t = findThread(data, body.id);
    const text = String(body.text || '');
    if (text.length > 20000) throw httpError(413, '文字太长');
    tmux.sendText(t.windowId, text, body.enter !== false);
    return { ok: true };
  },

  'POST /api/key': body => {
    const data = store.load();
    const t = findThread(data, body.id);
    tmux.sendKey(t.windowId, String(body.key || ''));
    return { ok: true };
  },

  'GET /api/skills': (_, q) => {
    const data = store.load();
    const t = data.threads.find(x => x.id === q.get('thread'));
    const agent = t ? t.agent : q.get('agent');
    const project = t && data.projects.find(p => p.id === t.projectId);
    return { agent, skills: listSkills(agent, project ? project.dir : undefined) };
  },

  // 技能广场只在官方版提供，社区版返回空列表和官方版入口
  'GET /api/plaza': () => ({ items: [], official: OFFICIAL }),
};

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// ---------- 安全检查 ----------
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
function checkRequest(req) {
  // 防 DNS 重绑定：只接受本机地址
  if (!ALLOWED_HOSTS.has(req.headers.host)) return '不允许的 Host';
  const origin = req.headers.origin;
  if (origin && !ALLOWED_HOSTS.has(origin.replace(/^https?:\/\//, ''))) return '不允许的来源';
  // 写操作必须带自定义头：别的网站跨站发不出这个头（会触发预检，我们不回应）
  if (req.method !== 'GET' && req.headers['x-zhitong'] !== '1') return '缺少请求头';
  return null;
}

// ---------- 静态文件 ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); return res.end('Not found');
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  fs.createReadStream(file).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 1e6) { reject(httpError(413, '请求太大')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(httpError(400, '请求格式错误')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const bad = checkRequest(req);
  if (bad) return sendJson(res, 403, { error: bad });
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, url.pathname);
  }
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) return sendJson(res, 404, { error: '接口不存在' });
  try {
    const body = req.method === 'POST' ? await readBody(req) : {};
    sendJson(res, 200, await handler(body, url.searchParams));
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.status ? e.message : '内部错误：' + e.message });
  }
});

let shuttingDown = false;
function shutdown() {
  shuttingDown = true;
  if (ttydProc) ttydProc.kill();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (!tmux.findBin('tmux')) {
  console.error('[zhitong] 没找到 tmux。macOS 请运行：brew install tmux ttyd');
  process.exit(1);
}
server.listen(PORT, HOST, () => {
  startTtyd();
  console.log(`智通 ZHITONG 社区版 ${pkg.version} 已启动：http://${HOST}:${PORT}`);
  console.log(`数据目录：${store.DATA_DIR}`);
});
