// 渲染层：纯 DOM 生成（不带行为绑定——交互统一在 events.js 事件委托，
// 避免 render ↔ nav/actions 的循环依赖）。仅标签 × 删除为同模块内部闭包。

import { state } from './state.js';
import { $, esc, fmtSize, fmtDate, iconFor, SVG } from './utils.js';
import { appIcon } from './commands.js';

// 应用真实图标异步补挂：占位 SVG 先渲染，dataURL 回来后替换 .ico 内容。
// 注意：不能按路径做「已画」标记——重渲染会重建 DOM 行，标记会导致新行
// 永远停在占位 SVG（实测竞态 bug）。改为每次渲染都补挂：主进程有缓存，
// 重复调用是微秒级 IPC，成本可忽略。
function paintRealIcon(row, e) {
  appIcon(e.path).then((url) => {
    const ico = row?.querySelector('.ico');
    if (ico) ico.innerHTML = `<img src="${url}" alt="" draggable="false">`;
    const img = ico?.querySelector('img');
    const r = img?.getBoundingClientRect();
    const cs = img ? getComputedStyle(img) : null;
    diag(`then ${e.name} img=${!!img} loaded=${img?.complete && img.naturalWidth > 0} nat=${img?.naturalWidth} rect=${Math.round(r?.width ?? -1)}x${Math.round(r?.height ?? -1)} disp=${cs?.display} vis=${cs?.visibility}`);
  }).catch((err) => diag(`catch ${e.name} ${String(err).slice(0, 50)}`));
}
// [icon-diag] 渲染层诊断写 localStorage（正式版移除）。启动时清空防历史污染。
try { localStorage.removeItem('mfile_icon_diag'); } catch {}
function diag(msg) {
  try {
    window.__mfileDiag = window.__mfileDiag || [];
    window.__mfileDiag.push(msg);
    localStorage.setItem('mfile_icon_diag', JSON.stringify(window.__mfileDiag.slice(-200)));
  } catch {}
}

/** 过滤 + 排序后的可见条目（目录置顶） */
export function visibleEntries() {
  let list = state.entries;
  if (state.filter) {
    const f = state.filter.toLowerCase();
    list = list.filter((e) => e.name.toLowerCase().includes(f));
  }
  if (state.tags && state.tags.length) {
    const ts = state.tags.map((t) => t.toLowerCase());
    list = list.filter((e) => {
      const n = e.name.toLowerCase();
      return ts.some((t) => n.includes(t)); // OR：命中任意关键字即保留
    });
  }
  const by = state.sortBy;
  const cmp = {
    name: (a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }),
    size: (a, b) => (b.size || 0) - (a.size || 0),
    date: (a, b) => (b.modified || 0) - (a.modified || 0),
    type: (a, b) => (a.ext || '').localeCompare(b.ext || '') || a.name.localeCompare(b.name),
  }[by];
  const dirs = list.filter((e) => e.is_dir).sort(cmp);
  const files = list.filter((e) => !e.is_dir).sort(cmp);
  return { list: [...dirs, ...files], dirs: dirs.length, files: files.length };
}

export function render() {
  renderCrumbs();
  renderSidebar();
  renderList();
  renderStatus();
}

export function renderCrumbs() {
  const c = $('crumbs');
  c.innerHTML = '';
  if (!state.cwd) return;
  const parts = state.cwd.split('/').filter(Boolean);
  let acc = '';
  const frag = document.createDocumentFragment();
  if (state.cwd.startsWith('/')) {
    frag.appendChild(crumbEl('/', '/', '/'));
    acc = '';
  }
  parts.forEach((p, i) => {
    acc += '/' + p;
    const sep = document.createElement('span');
    sep.className = 'crumb-sep';
    sep.textContent = '›';
    frag.appendChild(sep);
    frag.appendChild(crumbEl(p, p, acc, i === parts.length - 1));
  });
  c.appendChild(frag);
  c.scrollLeft = c.scrollWidth;
}

// 点击行为由 events.js 对 crumbs 容器统一委托（data-target）
function crumbEl(text, label, target, isLast = false) {
  const el = document.createElement('span');
  el.className = 'crumb' + (isLast ? ' last' : '');
  el.textContent = label;
  el.dataset.target = target;
  return el;
}

export const SIDEBAR = [
  { icon: SVG.home, label: '主目录', get path() { return state.home; } },
  { icon: SVG.app, label: '应用程序', path: '/Applications' },
  { icon: SVG.docfolder, label: '文稿', get path() { return `${state.home || ''}/Documents`; } },
  { icon: SVG.download, label: '下载', get path() { return `${state.home || ''}/Downloads`; } },
  { icon: SVG.picture, label: '图片', get path() { return `${state.home || ''}/Pictures`; } },
  { icon: SVG.music, label: '音乐', get path() { return `${state.home || ''}/Music`; } },
  { icon: SVG.movie, label: '影片', get path() { return `${state.home || ''}/Movies`; } },
  { icon: SVG.desktop, label: '桌面', get path() { return `${state.home || ''}/Desktop`; } },
  { icon: SVG.root, label: '根目录', path: '/' },
  { icon: SVG.trash, label: '废纸篓', get path() { return `${state.home || ''}/.Trash`; } },
  { icon: SVG.user, label: '用户', path: '/Users' },
];

// 点击行为由 events.js 对 sidebar 容器统一委托（data-idx → SIDEBAR）
export function renderSidebar() {
  const s = $('sidebar');
  s.innerHTML = '<div class="side-title">快速访问</div>';
  SIDEBAR.forEach((item, idx) => {
    if (!item.path) return;
    const el = document.createElement('div');
    el.className = 'side-item' + (state.cwd === item.path ? ' active' : '');
    el.dataset.idx = idx;
    el.innerHTML = `<span class="ico">${item.icon}</span><span>${esc(item.label)}</span>`;
    s.appendChild(el);
  });
  // 我的电脑分区：D/E/F 盘（用户目录下固定文件夹，主进程启动时确保存在）
  const drives = [
    { label: 'D 盘', name: 'D盘', icon: SVG.driveD },
    { label: 'E 盘', name: 'E盘', icon: SVG.driveE },
    { label: 'F 盘', name: 'F盘', icon: SVG.driveF },
  ];
  const myPc = document.createElement('div');
  myPc.className = 'side-title';
  myPc.textContent = '我的电脑';
  s.appendChild(myPc);
  drives.forEach((d) => {
    const p = `${state.home || ''}/${d.name}`;
    const el = document.createElement('div');
    el.className = 'side-item' + (state.cwd === p ? ' active' : '');
    el.dataset.drive = d.name;
    el.innerHTML = `<span class="ico">${d.icon}</span><span>${esc(d.label)}</span>`;
    s.appendChild(el);
  });
}

export function renderList() {
  const fl = $('fileList');
  fl.innerHTML = '';
  const { list } = visibleEntries();
  if (!list.length) {
    fl.innerHTML = '<div class="empty">空目录</div>';
    return;
  }
  const frag = document.createDocumentFragment();
  list.forEach((e) => {
    const row = document.createElement('div');
    row.className = 'row' + (e.is_dir ? ' dir-row' : '') + (state.selected.has(e.path) ? ' selected' : '');
    row.dataset.path = e.path;
    row.innerHTML = `
      <span class="ico">${iconFor(e)}</span>
      <span class="name" data-path="${esc(e.path)}">${esc(e.name)}</span>
      <span class="size">${e.is_dir ? '' : fmtSize(e.size)}</span>
      <span class="date">${fmtDate(e.modified)}</span>`;
    if (e.ext === 'app' || (e.is_dir && e.name.endsWith('.app'))) paintRealIcon(row, e);
    frag.appendChild(row);
  });
  fl.appendChild(frag);
}

export function renderStatus() {
  const { list, dirs, files } = visibleEntries();
  $('sbItems').textContent = `${dirs} 个文件夹，${files} 个文件`;
  $('sbSelected').textContent = state.selected.size ? `已选 ${state.selected.size} 项` : '';
  $('statusText').textContent = state.cwd || '';
}

// ---------- 多关键字标签过滤（OR） ----------
export function renderTags() {
  const box = $('filterTags');
  const input = $('filterInput');
  box.querySelectorAll('.tag').forEach((el) => el.remove());
  for (const t of state.tags) {
    const el = document.createElement('span');
    el.className = 'tag';
    el.innerHTML = `<span class="t-text">${esc(t)}</span><span class="t-x">×</span>`;
    el.querySelector('.t-x').onclick = () => removeTag(t);
    box.insertBefore(el, input);
  }
}

export function addTag(raw) {
  const t = raw.trim();
  if (t && !state.tags.includes(t)) {
    state.tags.push(t);
    renderTags();
  }
}

export function removeTag(t) {
  state.tags = state.tags.filter((x) => x !== t);
  renderTags();
  renderList();
  renderStatus();
}

export function applyTagsFromInput() {
  // 输入内容里的空格段直接转成标签
  const v = $('filterInput').value;
  if (v.includes(' ')) {
    v.trim().split(/\s+/).forEach(addTag);
    $('filterInput').value = '';
    renderList();
    renderStatus();
  }
}
