// 本机技能列表：按智能体扫描本机已安装的技能 / 插件 / 自定义命令。
// 只列真的装在本机、对这个智能体可用的；没装的不出现。
// 每项：{ name, desc, source, group, invoke }
//   group：project（本项目）/ user（我的技能）/ plugin（插件）/ builtin（内置）
//   invoke：发送时放在文字最前面的调用写法；Claude、Antigravity 用 /名字，Codex 用 $名字。
//   云端同步的 Claude 技能没有可靠的斜杠名，invoke 用「请使用 xxx 技能：」这种自然语言写法。
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const CLAUDE_HOME = process.env.ZHITONG_CLAUDE_HOME || path.join(HOME, '.claude');
const CODEX_HOME = process.env.ZHITONG_CODEX_HOME || path.join(HOME, '.codex');

const readText = p => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } };
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
const listDir = p => { try { return fs.readdirSync(p); } catch (e) { return []; } };

// 读 SKILL.md / 命令 md 开头的 YAML frontmatter，只取 name、description（支持 >- / | 多行写法和引号）
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return {};
  const out = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    const key = kv[1];
    let val = kv[2].trim();
    if (/^[>|][-+]?$/.test(val)) {
      const buf = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === '')) buf.push(lines[++i].trim());
      val = buf.join(' ').trim();
    } else if (/^(["']).*\1$/.test(val)) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function shortDesc(s) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > 160 ? s.slice(0, 158) + '…' : s;
}

// root 下每个 <名字>/SKILL.md 是一个技能
function scanSkillDir(root, opts) {
  const out = [];
  for (const d of listDir(root)) {
    if (d.startsWith('.') && !opts.allowHidden) continue;
    const dir = path.join(root, d);
    const md = path.join(dir, 'SKILL.md');
    const text = readText(md);
    if (!text) continue;
    const fm = frontmatter(text);
    // Claude Code 按目录名调用（chatcut-video-gen 的 frontmatter 名是 video-gen，但斜杠命令是 /chatcut-video-gen）
    const name = opts.dirName ? d : (fm.name || d).trim();
    // user-invocable: false 的技能不能用斜杠直接调用（Claude Code 会回“只能由 Claude 调用”），改成自然语言点名
    const noSlash = String(fm['user-invocable'] || '').toLowerCase() === 'false';
    out.push({ name: opts.prefix ? `${opts.prefix}:${name}` : name, desc: shortDesc(fm.description), source: opts.source, group: opts.group, path: dir, noSlash });
  }
  return out;
}

// root 下每个 <名字>.md 是一个斜杠命令（Claude 的 commands/）
function scanCommandDir(root, opts) {
  const out = [];
  for (const f of listDir(root)) {
    if (!f.endsWith('.md')) continue;
    const fm = frontmatter(readText(path.join(root, f)));
    const base = f.slice(0, -3);
    out.push({ name: opts.prefix ? `${opts.prefix}:${base}` : base, desc: shortDesc(fm.description), source: opts.source, group: opts.group, path: path.join(root, f), command: true });
  }
  return out;
}

// 从工作目录往上走到根目录（或家目录），返回经过的每一层
function ancestors(cwd) {
  const out = [];
  if (!cwd || !path.isAbsolute(cwd)) return out;
  let d = path.resolve(cwd);
  for (let i = 0; i < 30; i++) {
    out.push(d);
    if (d === HOME) break;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return out;
}

// Claude Code 自带、本机这个版本确实有的技能命令（精选常用几个）
const CLAUDE_BUILTIN = [
  ['code-review', '审查当前改动或指定 PR 的正确性问题'],
  ['simplify', '审查改动里的重复、可简化和效率问题并直接改好'],
  ['security-review', '对当前分支的待提交改动做安全审查'],
  ['init', '为当前项目生成 CLAUDE.md 说明文件'],
  ['loop', '按固定间隔重复执行一个提示词或命令'],
  ['schedule', '创建定时运行的云端智能体任务'],
  ['run', '启动并操作本项目的应用，亲眼确认改动生效'],
  ['claude-api', 'Claude API / Anthropic SDK 参考：模型、价格、参数、工具调用'],
];

function claudeSkills(cwd) {
  const list = [];
  for (const d of ancestors(cwd)) {
    if (d === HOME) continue;   // 家目录下的 .claude 是个人级，下面单独扫
    list.push(...scanSkillDir(path.join(d, '.claude', 'skills'), { source: path.join(d, '.claude', 'skills'), group: 'project', dirName: true }));
    list.push(...scanCommandDir(path.join(d, '.claude', 'commands'), { source: path.join(d, '.claude', 'commands'), group: 'project' }));
  }
  list.push(...scanSkillDir(path.join(CLAUDE_HOME, 'skills'), { source: '~/.claude/skills', group: 'user', dirName: true }));
  list.push(...scanCommandDir(path.join(CLAUDE_HOME, 'commands'), { source: '~/.claude/commands', group: 'user' }));
  // 已安装并启用的插件：插件名:技能名
  let enabled = {};
  try { enabled = (JSON.parse(readText(path.join(CLAUDE_HOME, 'settings.json')) || '{}').enabledPlugins) || {}; } catch (e) {}
  let installed = {};
  try { installed = (JSON.parse(readText(path.join(CLAUDE_HOME, 'plugins', 'installed_plugins.json')) || '{}').plugins) || {}; } catch (e) {}
  for (const [id, entries] of Object.entries(installed)) {
    if (enabled[id] === false) continue;
    const e = Array.isArray(entries) ? entries[entries.length - 1] : entries;
    if (!e || !e.installPath) continue;
    const plugin = id.split('@')[0];
    list.push(...scanSkillDir(path.join(e.installPath, 'skills'), { source: `来自 ${plugin}`, group: 'plugin', prefix: plugin, dirName: true }));
    list.push(...scanCommandDir(path.join(e.installPath, 'commands'), { source: `来自 ${plugin}`, group: 'plugin', prefix: plugin }));
  }
  for (const s of list) s.invoke = s.noSlash ? `请使用 ${s.name} 技能：` : '/' + s.name;
  // claude.ai 云端同步下来的技能（skills/synced/<组>/<技能>）：用自然语言点名调用
  const synced = path.join(CLAUDE_HOME, 'skills', 'synced');
  for (const g of listDir(synced)) {
    for (const s of scanSkillDir(path.join(synced, g), { source: 'claude.ai 同步', group: 'plugin' })) {
      s.invoke = `请使用 ${s.name} 技能：`;
      s.natural = true;
      list.push(s);
    }
  }
  for (const [name, desc] of CLAUDE_BUILTIN) list.push({ name, desc, source: 'Claude Code 内置', group: 'builtin', invoke: '/' + name });
  return list;
}

function codexSkills(cwd) {
  const list = [];
  for (const d of ancestors(cwd)) {
    if (d === HOME) continue;
    list.push(...scanSkillDir(path.join(d, '.agents', 'skills'), { source: path.join(d, '.agents', 'skills'), group: 'project' }));
    list.push(...scanSkillDir(path.join(d, '.codex', 'skills'), { source: path.join(d, '.codex', 'skills'), group: 'project' }));
  }
  list.push(...scanSkillDir(path.join(HOME, '.agents', 'skills'), { source: '~/.agents/skills', group: 'user' }));
  list.push(...scanSkillDir(path.join(CODEX_HOME, 'skills'), { source: '~/.codex/skills', group: 'user' }));
  list.push(...scanSkillDir(path.join(CODEX_HOME, 'skills', '.system'), { source: 'Codex 内置', group: 'builtin' }));
  for (const s of list) s.invoke = '$' + s.name;
  return list;
}

function agySkills(cwd) {
  const list = [];
  const cfg = path.join(HOME, '.gemini', 'config');
  for (const d of ancestors(cwd)) {
    if (d === HOME) continue;
    list.push(...scanSkillDir(path.join(d, '.agents', 'skills'), { source: path.join(d, '.agents', 'skills'), group: 'project' }));
    list.push(...scanSkillDir(path.join(d, '.agent', 'skills'), { source: path.join(d, '.agent', 'skills'), group: 'project' }));
  }
  list.push(...scanSkillDir(path.join(cfg, 'skills'), { source: '~/.gemini/config/skills', group: 'user' }));
  for (const p of listDir(path.join(cfg, 'plugins'))) {
    const pd = path.join(cfg, 'plugins', p);
    if (isDir(pd)) list.push(...scanSkillDir(path.join(pd, 'skills'), { source: `来自 ${p}`, group: 'plugin' }));
  }
  const builtin = [path.join(HOME, '.gemini', 'antigravity-cli', 'builtin', 'skills'), path.join(HOME, '.gemini', 'antigravity', 'builtin', 'skills')];
  for (const b of builtin) list.push(...scanSkillDir(b, { source: 'Antigravity 内置', group: 'builtin' }));
  for (const s of list) s.invoke = s.noSlash ? `请使用 ${s.name} 技能：` : '/' + s.name;
  return list;
}

const GROUP_ORDER = { project: 0, user: 1, plugin: 2, builtin: 3 };
const cache = new Map();   // platform|cwd → { at, val }

function listSkills(platform, cwd) {
  const key = `${platform}|${cwd || ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 20000) return hit.val;
  const fn = { claude: claudeSkills, codex: codexSkills, agy: agySkills }[platform];
  if (!fn) return [];
  // 同名只留优先级最高的（本项目 > 我的 > 插件 > 内置），和各家自己的覆盖规则一致
  const seen = new Map();
  for (const s of fn(cwd)) {
    const prev = seen.get(s.name);
    if (!prev || GROUP_ORDER[s.group] < GROUP_ORDER[prev.group]) seen.set(s.name, s);
  }
  const val = [...seen.values()]
    .map(({ path: p, ...rest }) => rest)
    .sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || a.name.localeCompare(b.name));
  cache.set(key, { at: Date.now(), val });
  return val;
}

module.exports = { listSkills, frontmatter };
