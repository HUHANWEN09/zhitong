// 接口与安全检查测试：用临时数据目录、独立端口和独立 tmux 会话，不影响正在使用的实例。
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 47890 + Math.floor(Math.random() * 50) * 2;
const SESSION = 'zhitong-test-' + process.pid;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zhitong-test-'));
const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zhitong-proj-'));
const B = `http://127.0.0.1:${PORT}`;
let srv;

const api = (method, url, body, headers = {}) => fetch(B + url, {
  method, headers: { 'Content-Type': 'application/json', 'X-Zhitong': '1', ...headers },
  body: body ? JSON.stringify(body) : undefined,
}).then(async r => ({ status: r.status, body: await r.json() }));

before(async () => {
  srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, ZHITONG_PORT: String(PORT), ZHITONG_DATA_DIR: tmp, ZHITONG_TMUX_SESSION: SESSION },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(B + '/api/state'); return; } catch (e) { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error('服务没有启动');
});

after(() => {
  srv.kill();
  try { execFileSync('tmux', ['kill-session', '-t', SESSION], { stdio: 'ignore' }); } catch (e) { /* 已关闭 */ }
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(projectDir, { recursive: true, force: true });
});

test('拒绝非本机 Host', async () => {
  const r = await new Promise(resolve => {
    require('node:http').get({ host: '127.0.0.1', port: PORT, path: '/api/state', headers: { Host: `evil.example:${PORT}` } }, res => resolve(res.statusCode));
  });
  assert.strictEqual(r, 403);
});

test('拒绝跨站来源和缺少请求头的写操作', async () => {
  assert.strictEqual((await api('POST', '/api/projects', { dir: projectDir }, { Origin: 'https://evil.example' })).status, 403);
  const r = await fetch(B + '/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.strictEqual(r.status, 403);
});

test('静态文件不能越出 public 目录', async () => {
  const r = await new Promise(resolve => {
    require('node:http').get({ host: '127.0.0.1', port: PORT, path: '/../server.js' }, res => resolve(res.statusCode));
  });
  assert.strictEqual(r, 404);
});

test('项目和线程的完整流程', async () => {
  assert.strictEqual((await api('POST', '/api/projects', { dir: '/no/such/dir' })).status, 400);
  const p = await api('POST', '/api/projects', { dir: projectDir });
  assert.strictEqual(p.status, 200);
  assert.strictEqual((await api('POST', '/api/projects', { dir: projectDir })).status, 409);

  const t = await api('POST', '/api/threads', { projectId: p.body.id, agent: 'shell', name: 'test' });
  assert.strictEqual(t.status, 200);
  await new Promise(r => setTimeout(r, 500));
  assert.strictEqual((await api('POST', '/api/send', { id: t.body.id, text: 'echo zhitong-$((40+2))' })).status, 200);
  await new Promise(r => setTimeout(r, 800));
  const screen = execFileSync('tmux', ['capture-pane', '-p', '-t', `${SESSION}:${t.body.windowId}`], { encoding: 'utf8' });
  assert.match(screen, /zhitong-42/);

  assert.strictEqual((await api('POST', '/api/key', { id: t.body.id, key: 'rm -rf' })).status, 400);
  assert.strictEqual((await api('POST', '/api/threads/close', { id: t.body.id })).status, 200);
  assert.strictEqual((await api('POST', '/api/send', { id: t.body.id, text: 'x' })).status, 409);
  assert.strictEqual((await api('POST', '/api/threads/open', { id: t.body.id })).status, 200);
  const s = await api('GET', '/api/state');
  assert.strictEqual(s.body.threads[0].alive, true);

  assert.strictEqual((await api('POST', '/api/projects/remove', { id: p.body.id })).status, 200);
  const s2 = await api('GET', '/api/state');
  assert.strictEqual(s2.body.projects.length, 0);
  assert.strictEqual(s2.body.threads.length, 0);
});

test('技能广场在社区版为空，并给出官方版入口', async () => {
  const r = await api('GET', '/api/plaza');
  assert.deepStrictEqual(r.body.items, []);
  assert.match(r.body.official.download, /github\.com\/HUHANWEN09\/zhitong\/releases/);
});
