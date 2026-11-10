'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const state = { data: null, current: localStorage.getItem('zt.current') || null, lang: localStorage.getItem('zt.lang') || (navigator.language.startsWith('zh') ? 'zh' : 'en'), dialogProject: null, dialogAgent: null };

  // ---------- 文字 ----------
  const t = (k, vars) => {
    let s = (I18N[state.lang] || I18N.zh)[k] || I18N.zh[k] || k;
    if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace('{' + a + '}', b);
    return s;
  };
  function applyLang() {
    document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
    document.querySelectorAll('[data-tp]').forEach(el => { el.placeholder = t(el.dataset.tp); });
    $('#btn-lang').textContent = state.lang === 'zh' ? 'English' : '中文';
    render();
  }

  // ---------- 接口 ----------
  async function api(method, url, body) {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-Zhitong': '1' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  }
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.hidden = true; }, 2600);
  }
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
    }
    for (const c of kids) if (c != null) n.append(c);
    return n;
  };

  async function refresh() {
    try { state.data = await api('GET', '/api/state'); render(); } catch (e) { /* 服务暂时连不上，下次再试 */ }
  }

  // ---------- 渲染 ----------
  function render() {
    const d = state.data; if (!d) return;
    $('#link-official').href = d.official.download;
    const box = $('#projects'); box.textContent = '';
    for (const p of d.projects) {
      const threads = d.threads.filter(x => x.projectId === p.id);
      box.append(el('div', { class: 'project' },
        el('div', { class: 'project-head', title: p.dir },
          el('span', { class: 'project-name' }, p.name),
          el('button', { class: 'icon', title: t('newThreadBtn'), onclick: () => openThreadDialog(p) }, '＋'),
          el('button', { class: 'icon', title: t('removeProject'), onclick: () => removeProject(p) }, '⋯')),
        ...threads.map(th => el('div', {
          class: 'thread' + (th.id === state.current ? ' active' : '') + (th.alive ? '' : ' dead'),
          title: th.alive ? '' : t('reopenHint'),
          onclick: () => selectThread(th.id),
        },
          el('span', { class: 'dot ' + th.agent }),
          el('span', { class: 'thread-name' }, th.name),
          th.alive ? null : el('span', { class: 'muted' }, t('closed')),
          el('button', { class: 'icon', title: t('rename'), onclick: e => { e.stopPropagation(); renameThread(th); } }, '✎'),
          el('button', { class: 'icon', title: t('removeThread'), onclick: e => { e.stopPropagation(); removeThread(th); } }, '✕')))));
    }
    const cur = d.threads.find(x => x.id === state.current);
    $('#thread-title').textContent = cur ? `${cur.name} · ${(d.agents.find(a => a.id === cur.agent) || {}).name || cur.agent}` : t('noThread');
    $('#btn-close-thread').disabled = !(cur && cur.alive);
    const term = $('#term');
    const showTerm = !!(cur && d.terminalReady);
    if (showTerm && term.dataset.src !== d.terminalUrl) { term.src = d.terminalUrl; term.dataset.src = d.terminalUrl; }
    term.style.visibility = showTerm ? 'visible' : 'hidden';
    $('#term-empty').hidden = showTerm;
    if (cur && !d.terminalReady) $('#term-empty').querySelector('p').textContent = t('terminalMissing');
  }

  // ---------- 项目 ----------
  function openProjectDialog() {
    $('#project-dir').value = ''; $('#project-name').value = ''; $('#project-err').textContent = '';
    $('#dlg-project').showModal(); $('#project-dir').focus();
  }
  $('#btn-add-project').onclick = openProjectDialog;
  $('#btn-pick').onclick = async () => {
    try { const r = await api('POST', '/api/pick-dir'); if (r.dir) $('#project-dir').value = r.dir; } catch (e) { $('#project-err').textContent = e.message; }
  };
  $('#btn-project-ok').onclick = async e => {
    e.preventDefault();
    try {
      await api('POST', '/api/projects', { dir: $('#project-dir').value.trim(), name: $('#project-name').value });
      $('#dlg-project').close(); await refresh();
    } catch (err) { $('#project-err').textContent = err.message; }
  };
  async function removeProject(p) {
    if (!confirm(t('confirmRemoveProject', { name: p.name }))) return;
    await api('POST', '/api/projects/remove', { id: p.id }).catch(e => toast(e.message));
    await refresh();
  }

  // ---------- 线程 ----------
  function openThreadDialog(p) {
    state.dialogProject = p;
    const list = $('#agent-list'); list.textContent = '';
    const agents = state.data.agents;
    state.dialogAgent = (agents.find(a => a.installed && a.id !== 'shell') || agents[0]).id;
    for (const a of agents) {
      list.append(el('label', { class: 'agent-opt' + (a.installed ? '' : ' off') },
        el('input', Object.assign({ type: 'radio', name: 'agent', value: a.id, onchange: () => { state.dialogAgent = a.id; } }, a.installed ? {} : { disabled: '' }, a.id === state.dialogAgent ? { checked: '' } : {})),
        el('span', { class: 'dot ' + a.id }),
        el('span', {}, a.id === 'shell' ? (state.lang === 'zh' ? '终端' : 'Terminal') : a.name),
        a.installed ? null : el('span', { class: 'muted' }, ` ${t('notInstalled')} · ${t('installHint')}`, el('code', {}, a.install))));
    }
    $('#thread-name').value = ''; $('#thread-err').textContent = '';
    $('#dlg-thread').showModal();
  }
  $('#btn-thread-ok').onclick = async e => {
    e.preventDefault();
    try {
      const th = await api('POST', '/api/threads', { projectId: state.dialogProject.id, agent: state.dialogAgent, name: $('#thread-name').value });
      $('#dlg-thread').close(); setCurrent(th.id); await refresh(); $('#input').focus();
    } catch (err) { $('#thread-err').textContent = err.message; }
  };
  function setCurrent(id) { state.current = id; if (id) localStorage.setItem('zt.current', id); else localStorage.removeItem('zt.current'); }
  async function selectThread(id) {
    setCurrent(id);
    try { await api('POST', '/api/threads/open', { id }); } catch (e) { toast(e.message); }
    await refresh(); $('#input').focus();
  }
  async function renameThread(th) {
    const name = prompt(t('rename'), th.name); if (!name) return;
    await api('POST', '/api/threads/rename', { id: th.id, name }).catch(e => toast(e.message));
    await refresh();
  }
  async function removeThread(th) {
    if (!confirm(t('confirmRemoveThread', { name: th.name }))) return;
    await api('POST', '/api/threads/remove', { id: th.id }).catch(e => toast(e.message));
    if (state.current === th.id) setCurrent(null);
    await refresh();
  }
  $('#btn-close-thread').onclick = async () => {
    if (!state.current) return;
    await api('POST', '/api/threads/close', { id: state.current }).catch(e => toast(e.message));
    await refresh();
  };

  // ---------- 发送 ----------
  async function send() {
    const text = $('#input').value;
    if (!state.current) return toast(t('pickThreadFirst'));
    if (!text.trim()) return;
    try { await api('POST', '/api/send', { id: state.current, text }); $('#input').value = ''; } catch (e) { toast(e.message); }
  }
  $('#btn-send').onclick = send;
  $('#input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  document.querySelectorAll('[data-key]').forEach(b => {
    b.onclick = async () => {
      if (!state.current) return toast(t('pickThreadFirst'));
      await api('POST', '/api/key', { id: state.current, key: b.dataset.key }).catch(e => toast(e.message));
    };
  });

  // ---------- 侧栏：本机技能 / 技能广场 ----------
  function openDrawer(title, body) {
    $('#drawer-title').textContent = title; const b = $('#drawer-body'); b.textContent = ''; b.append(body);
    $('#drawer').hidden = false;
  }
  $('#btn-drawer-close').onclick = () => { $('#drawer').hidden = true; };
  $('#btn-skills').onclick = async () => {
    const cur = state.data && state.data.threads.find(x => x.id === state.current);
    if (!cur) return toast(t('pickThreadFirst'));
    const r = await api('GET', '/api/skills?thread=' + encodeURIComponent(cur.id)).catch(e => { toast(e.message); return null; });
    if (!r) return;
    const agentName = (state.data.agents.find(a => a.id === cur.agent) || {}).name || cur.agent;
    const list = el('div', { class: 'skills' });
    if (!r.skills.length) list.append(el('p', { class: 'muted' }, t('noSkills')));
    for (const s of r.skills) {
      list.append(el('div', { class: 'skill' },
        el('div', { class: 'skill-head' }, el('b', {}, s.name), el('span', { class: 'muted' }, s.source || '')),
        s.desc ? el('p', {}, s.desc) : null,
        el('button', { class: 'btn ghost small', onclick: () => { const i = $('#input'); i.value = s.invoke + ' ' + i.value; i.focus(); } }, t('insert'))));
    }
    openDrawer(t('skillsFor', { agent: agentName }), list);
  };
  $('#btn-plaza').onclick = async () => {
    const r = await api('GET', '/api/plaza').catch(() => ({ items: [], official: state.data.official }));
    openDrawer(t('plazaTitle'), el('div', { class: 'plaza' },
      el('div', { class: 'plaza-empty' },
        el('h3', {}, t('plazaEmpty')),
        el('p', {}, t('plazaDesc')),
        el('a', { class: 'btn primary', href: r.official.download, target: '_blank', rel: 'noopener' }, t('plazaDownload')),
        el('a', { class: 'btn ghost', href: r.official.site, target: '_blank', rel: 'noopener' }, t('plazaSite')))));
  };

  $('#btn-lang').onclick = () => { state.lang = state.lang === 'zh' ? 'en' : 'zh'; localStorage.setItem('zt.lang', state.lang); applyLang(); };

  applyLang();
  refresh();
  setInterval(refresh, 4000);
})();
