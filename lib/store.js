// 本地数据：项目和线程列表，保存为一个 JSON 文件。
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const DATA_DIR = process.env.ZHITONG_DATA_DIR || (process.platform === 'darwin'
  ? path.join(os.homedir(), 'Library', 'Application Support', 'ZHITONG-Community')
  : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'zhitong-community'));
const FILE = path.join(DATA_DIR, 'workspace.json');

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { projects: Array.isArray(d.projects) ? d.projects : [], threads: Array.isArray(d.threads) ? d.threads : [] };
  } catch (e) {
    return { projects: [], threads: [] };
  }
}

// 先写临时文件再改名，避免写到一半断电把文件写坏
function save(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}

const newId = () => crypto.randomBytes(6).toString('hex');

module.exports = { load, save, newId, DATA_DIR };
