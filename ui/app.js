const { invoke } = window.__TAURI__.core;

const state = {
  cwd: null,
  parent: null,
  entries: [],
  selected: new Set(),
  history: [],
  filter: '',
  sortBy: 'name',
  showHidden: localStorage.getItem('showHidden') === '1',
  clipboard: null, // { mode: 'copy'|'cut', items: [path] }
};

const $ = (id) => document.getElementById(id);

// ---------- 工具 ----------
function fmtSize(bytes) {
  if (bytes == null) return '';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / Math.pow(1024, i);
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

function fmtDate(secs) {
  if (!secs) return '';
  const d = new Date(secs * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SVG = {
  folder: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4l2 2.5h7A2.5 2.5 0 0 1 21 9v8.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11z" fill="#5aa2f0"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="#8f8f98"/><path d="M14 3v4h4" fill="#6e6e78"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" fill="#7c5cd6"/><circle cx="9" cy="10" r="2" fill="#fff"/><path d="M5 18l5-5 3 3 3-4 3 6H5z" fill="#a58ae8"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="2" fill="#d65c8c"/><path d="M10 9.5v5l4.5-2.5L10 9.5z" fill="#fff"/></svg>',
  audio: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 18V6l10-2v12" stroke="#4cae8f" stroke-width="2"/><circle cx="7" cy="18" r="2.5" fill="#4cae8f"/><circle cx="17" cy="16" r="2.5" fill="#4cae8f"/></svg>',
  archive: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 4h16v4H4V4z" fill="#c99a4b"/><path d="M5 8h14v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8z" fill="#e0b25f"/><rect x="11" y="9" width="2" height="6" fill="#fff"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="#e05c5c"/><text x="8" y="17" font-size="7" fill="#fff" font-family="sans-serif" font-weight="bold">PDF</text></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="#4a7ce0"/><rect x="8" y="11" width="8" height="1.5" fill="#fff"/><rect x="8" y="14" width="8" height="1.5" fill="#fff"/><rect x="8" y="17" width="5" height="1.5" fill="#fff"/></svg>',
  code: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="#4aa5a0"/><path d="M11 11l-2.5 3 2.5 3M14 11l2.5 3-2.5 3" stroke="#fff" stroke-width="1.4" fill="none"/></svg>',
  app: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="4" fill="#5c9ce0"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="#fff" stroke-width="1.6"/></svg>',
  disk: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" fill="#8f8f98"/><circle cx="12" cy="12" r="6" fill="#c5c5cc"/><circle cx="12" cy="12" r="1.5" fill="#6e6e78"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9z" fill="#5aa2f0"/></svg>',
  docfolder: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4l2 2.5h7A2.5 2.5 0 0 1 21 9v8.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11z" fill="#4a7ce0"/><rect x="8" y="10" width="8" height="1.4" fill="#fff"/><rect x="8" y="13" width="8" height="1.4" fill="#fff"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4v10M8 10l4 4 4-4" stroke="#4cae8f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M4 19h16" stroke="#4cae8f" stroke-width="2" stroke-linecap="round"/></svg>',
  picture: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" fill="#7c5cd6"/><circle cx="9" cy="10" r="2" fill="#fff"/><path d="M5 18l5-5 3 3 3-4 3 6H5z" fill="#a58ae8"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 18V6l10-2v12" stroke="#4cae8f" stroke-width="2"/><circle cx="7" cy="18" r="2.5" fill="#4cae8f"/><circle cx="17" cy="16" r="2.5" fill="#4cae8f"/></svg>',
  movie: '<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="2" fill="#d65c8c"/><path d="M10 9.5v5l4.5-2.5L10 9.5z" fill="#fff"/></svg>',
  desktop: '<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="13" rx="2" fill="#5aa2f0"/><rect x="4" y="6" width="16" height="9" fill="#a7ccf2"/><path d="M9 20h6M12 17v3" stroke="#8f8f98" stroke-width="2" stroke-linecap="round"/></svg>',
  root: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" fill="#8f8f98"/><circle cx="12" cy="12" r="6" fill="#c5c5cc"/><circle cx="12" cy="12" r="1.5" fill="#6e6e78"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14l-1.2 13a1.5 1.5 0 0 1-1.5 1.35H7.7A1.5 1.5 0 0 1 6.2 20L5 7z" fill="#9aa3ad"/><rect x="4" y="4" width="16" height="2.5" rx="1.25" fill="#7c8794"/><rect x="9" y="2" width="6" height="3" rx="1" fill="#7c8794"/><path d="M10 10.5v7M14 10.5v7" stroke="#e8eaee" stroke-width="1.6" stroke-linecap="round"/></svg>',
};

function iconFor(e) {
  if (e.is_dir) return SVG.folder;
  const ext = (e.ext || '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic'].includes(ext)) return SVG.image;
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return SVG.video;
  if (['mp3', 'wav', 'flac', 'm4a', 'aac'].includes(ext)) return SVG.audio;
  if (['zip', 'gz', 'tar', 'rar', '7z', 'bz2'].includes(ext)) return SVG.archive;
  if (ext === 'pdf') return SVG.pdf;
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pages', 'key', 'numbers'].includes(ext)) return SVG.doc;
  if (['js', 'ts', 'json', 'md', 'txt', 'rs', 'py', 'sh', 'html', 'css', 'go', 'java', 'ipynb', 'log', 'yaml', 'yml', 'toml'].includes(ext)) return SVG.code;
  if (ext === 'app' || ext === 'dmg') return SVG.app;
  return SVG.file;
}

let toastTimer;
function toast(msg, isError = false) {
  const t = $('toast');
  t.innerHTML = `
    <span class="toast-text">${esc(msg)}</span>
    ${isError ? '<button class="toast-copy" onclick="copyToast(this)">复制</button>' : ''}`;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  // 错误提示常驻（不自动消失），普通提示 2.2s 后消失
  if (!isError) toastTimer = setTimeout(() => (t.className = 'toast'), 2200);
}

function copyToast(btn) {
  const text = btn.parentElement.querySelector('.toast-text').textContent;
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '已复制';
    setTimeout(() => {
      $('toast').className = 'toast';
    }, 1200);
  });
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ---------- 导航 ----------
async function loadDir(path, pushHistory = true) {
  try {
    const result = await invoke('list_dir', { path, showHidden: state.showHidden });
    if (pushHistory && state.cwd && state.cwd !== path) {
      state.history.push(state.cwd);
    }
    state.cwd = path;
    state.parent = result.parent;
    state.entries = result.entries;
    state.selected.clear();
    state.filter = '';
    state.tags = [];
    $('filterInput').value = '';
    render();
    renderTags();
  } catch (e) {
    toast(String(e), true);
  }
}

function goBack() {
  const prev = state.history.pop();
  if (prev) loadDir(prev, false);
}

function goUp() {
  if (state.parent) loadDir(state.parent);
}

// ---------- 渲染 ----------
function visibleEntries() {
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

function render() {
  renderCrumbs();
  renderSidebar();
  renderList();
  renderStatus();
}

function renderCrumbs() {
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

// 点击面包屑空白处进入路径编辑模式（访达同款）
function showPathInput() {
  const c = $('crumbs');
  c.innerHTML = '';
  const input = document.createElement('input');
  input.id = 'pathInput';
  input.value = state.cwd || '';
  input.placeholder = '输入路径后按回车';
  input.onkeydown = (ev) => {
    if (ev.key === 'Enter') {
      const target = input.value.trim();
      if (target) loadDir(target);
      else renderCrumbs();
    } else if (ev.key === 'Escape') {
      renderCrumbs();
    }
    ev.stopPropagation();
  };
  input.onblur = () => renderCrumbs();
  c.appendChild(input);
  input.focus();
  input.select();
}

function crumbEl(text, label, target, isLast = false) {
  const el = document.createElement('span');
  el.className = 'crumb' + (isLast ? ' last' : '');
  el.textContent = label;
  el.onclick = () => loadDir(target);
  return el;
}

const SIDEBAR = [
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
];

function renderSidebar() {
  const s = $('sidebar');
  s.innerHTML = '<div class="side-title">快速访问</div>';
  SIDEBAR.forEach((item) => {
    if (!item.path) return;
    const el = document.createElement('div');
    el.className = 'side-item' + (state.cwd === item.path ? ' active' : '');
    el.innerHTML = `<span class="ico">${item.icon}</span><span>${esc(item.label)}</span>`;
    el.onclick = () => loadDir(item.path);
    s.appendChild(el);
  });
}

function renderList() {
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
    row.onclick = (ev) => selectRow(ev, e);
    row.ondblclick = () => openEntry(e);
    row.oncontextmenu = (ev) => { ev.preventDefault(); showCtxMenu(ev, e); };
    fl.appendChild(frag);
    frag.appendChild(row);
  });
  fl.appendChild(frag);
}

function renderStatus() {
  const { list, dirs, files } = visibleEntries();
  $('sbItems').textContent = `${dirs} 个文件夹，${files} 个文件`;
  $('sbSelected').textContent = state.selected.size ? `已选 ${state.selected.size} 项` : '';
  $('statusText').textContent = state.cwd || '';
}

// ---------- 选择与打开 ----------
function selectRow(ev, e) {
  if (ev.metaKey || ev.ctrlKey) {
    state.selected.has(e.path) ? state.selected.delete(e.path) : state.selected.add(e.path);
  } else if (ev.shiftKey && state.lastSelected) {
    const { list } = visibleEntries();
    const i1 = list.findIndex((x) => x.path === state.lastSelected);
    const i2 = list.findIndex((x) => x.path === e.path);
    if (i1 >= 0 && i2 >= 0) {
      for (const x of list.slice(Math.min(i1, i2), Math.max(i1, i2) + 1)) state.selected.add(x.path);
    }
  } else {
    if (state.selected.size === 1 && state.selected.has(e.path)) {
      return; // 已选中，无需处理
    }
    // 单选：直接更新 DOM class，不重建列表（重建会打断 dblclick）
    document.querySelectorAll('#fileList .row.selected').forEach((el) => el.classList.remove('selected'));
    state.selected.clear();
    state.selected.add(e.path);
    const row = document.querySelector(`#fileList .row[data-path="${CSS.escape(e.path)}"]`);
    if (row) row.classList.add('selected');
    state.lastSelected = e.path;
    renderStatus();
    return;
  }
  state.lastSelected = e.path;
  renderList();
  renderStatus();
}

async function openEntry(e) {
  if (e.is_dir) {
    loadDir(e.path);
  } else {
    try {
      await invoke('open_path', { path: e.path });
    } catch (err) {
      toast(`打开失败: ${JSON.stringify(err)}`, true);
    }
  }
}

// ---------- 操作 ----------
function selectedPaths() {
  return state.selected.size ? [...state.selected] : [];
}

async function refresh() {
  if (state.cwd) await loadDir(state.cwd, false);
}

function showPrompt(title, defaultValue, onOk, danger = false) {
  const root = $('modalRoot');
  root.innerHTML = `
    <div class="modal-mask">
      <div class="modal">
        <h3>${esc(title)}</h3>
        <input type="text" id="modalInput" value="${esc(defaultValue)}" />
        <div class="msg" id="modalMsg"></div>
        <div class="btns">
          <button class="btn" id="modalCancel">取消</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" id="modalOk">确定</button>
        </div>
      </div>
    </div>`;
  const input = $('modalInput');
  input.focus();
  input.select();
  const close = () => (root.innerHTML = '');
  $('modalCancel').onclick = close;
  $('modalOk').onclick = async () => {
    try {
      await onOk(input.value.trim());
      close();
    } catch (e) {
      $('modalMsg').textContent = String(e);
    }
  };
  input.onkeydown = (ev) => {
    if (ev.key === 'Enter') $('modalOk').click();
    if (ev.key === 'Escape') close();
  };
}

function showConfirm(title, message, onOk) {
  const root = $('modalRoot');
  root.innerHTML = `
    <div class="modal-mask">
      <div class="modal">
        <h3>${esc(title)}</h3>
        <div style="color:var(--text-dim);font-size:12px;margin-bottom:14px" class="modal-body">${esc(message)}</div>
        <div class="btns">
          <button class="btn" id="modalCancel">取消</button>
          <button class="btn danger" id="modalOk">删除</button>
        </div>
      </div>
    </div>`;
  const close = () => (root.innerHTML = '');
  $('modalCancel').onclick = close;
  $('modalOk').onclick = async () => {
    try {
      await onOk();
      close();
    } catch (e) {
      close();
      toast(String(e), true);
    }
  };
}

async function newFolder() {
  showPrompt('新建文件夹', '未命名文件夹', async (name) => {
    if (!name) throw '名称不能为空';
    await invoke('create_dir', { path: `${state.cwd}/${name}` });
    await refresh();
    toast('文件夹已创建');
  });
}

async function newFile() {
  showPrompt('新建文件', '未命名.txt', async (name) => {
    if (!name) throw '名称不能为空';
    await invoke('create_file', { path: `${state.cwd}/${name}` });
    await refresh();
    toast('文件已创建');
  });
}

async function renameEntry() {
  const paths = selectedPaths();
  if (paths.length !== 1) return toast('请选择一个项目', true);
  const oldName = paths[0].split('/').pop();
  showPrompt('重命名', oldName, async (name) => {
    if (!name) throw '名称不能为空';
    if (name === oldName) return;
    await invoke('rename', { from: paths[0], to: `${state.cwd}/${name}` });
    await refresh();
    toast('已重命名');
  });
}

async function deleteSelected() {
  const paths = selectedPaths();
  if (!paths.length) return toast('请先选择项目', true);
  const dirs = paths.filter((p) => {
    const e = state.entries.find((x) => x.path === p);
    return e && e.is_dir;
  });
  let msg;
  if (paths.length === 1) {
    const name = paths[0].split('/').pop();
    msg = dirs.length ? `文件夹「${name}」及其全部内容将移到废纸篓` : `文件「${name}」将移到废纸篓`;
  } else {
    msg = `将 ${paths.length} 个项目移到废纸篓${dirs.length ? `（含 ${dirs.length} 个文件夹及其内容）` : ''}`;
  }
  showConfirm('移到废纸篓', msg, async () => {
    await invoke('trash_entries', { items: paths });
    await refresh();
    toast(`已移到废纸篓 ${paths.length} 项`);
  });
}

// ---------- 压缩 / 解压 ----------

async function zipSelected() {
  const paths = selectedPaths();
  if (!paths.length) return toast('请先选择项目', true);
  // 压缩包名：单选取主名，多选取父目录名+"归档"
  let zipName;
  if (paths.length === 1) {
    const n = paths[0].split('/').pop();
    zipName = n.replace(/\.zip$/i, '') + '.zip';
  } else {
    zipName = '归档.zip';
  }
  const destZip = `${state.cwd}/${zipName}`;
  try {
    await invoke('zip_entries', { items: paths, destZip });
    await refresh();
    toast(`已压缩为 ${zipName}`);
  } catch (e) {
    toast(String(e), true);
  }
}

async function unzipToHere(zipPath) {
  try {
    await invoke('unzip_here', { zipPath, destDir: state.cwd });
    await refresh();
    toast('解压完成');
  } catch (e) {
    toast(String(e), true);
  }
}

// ---------- 废纸篓 ----------

async function emptyTrashConfirm() {
  showConfirm('清空废纸篓', '将永久删除废纸篓中的全部项目（不可恢复）', async () => {
    await invoke('empty_trash');
    await refresh();
    toast('废纸篓已清空');
  });
}

async function copyToClipboard(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    // 剪贴板 API 失败时降级
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast(msg);
  }
}

async function copyPaths() {
  const paths = selectedPaths();
  if (!paths.length) return toast('请先选择项目', true);
  await copyToClipboard(
    paths.join('\n'),
    paths.length === 1 ? `已复制路径: ${paths[0]}` : `已复制 ${paths.length} 个路径`
  );
}

async function openTerminalHere() {
  // 优先当前选中文件夹；无选中则当前目录
  const paths = selectedPaths();
  let target = state.cwd;
  if (paths.length === 1) {
    const entry = state.entries.find((e) => e.path === paths[0]);
    if (entry && entry.is_dir) target = entry.path;
  }
  try {
    await invoke('open_in_terminal', { path: target });
    toast(`已在终端打开: ${target}`);
  } catch (e) {
    toast(String(e), true);
  }
}

async function copyNames() {
  const paths = selectedPaths();
  if (!paths.length) return toast('请先选择项目', true);
  const names = paths.map((p) => p.split('/').filter(Boolean).pop());
  await copyToClipboard(
    names.join('\n'),
    names.length === 1 ? `已复制文件名: ${names[0]}` : `已复制 ${names.length} 个文件名`
  );
}

function copySelected() {
  const paths = selectedPaths();
  if (!paths.length) return toast('请先选择项目', true);
  state.clipboard = { mode: 'copy', items: paths };
  toast(`已复制 ${paths.length} 项`);
}

function cutSelected() {
  const paths = selectedPaths();
  if (!paths.length) return toast('请先选择项目', true);
  state.clipboard = { mode: 'cut', items: paths };
  toast(`已剪切 ${paths.length} 项`);
}

async function paste() {
  if (!state.clipboard) return toast('剪贴板为空', true);
  try {
    if (state.clipboard.mode === 'copy') {
      await invoke('copy_entries', { items: state.clipboard.items, dest: state.cwd });
    } else {
      await invoke('move_entries', { items: state.clipboard.items, dest: state.cwd });
      state.clipboard = null;
    }
    await refresh();
    toast('已粘贴');
  } catch (e) {
    toast(String(e), true);
  }
}

async function calcDirSize() {
  const paths = selectedPaths();
  if (!paths.length) return toast('请先选择项目', true);
  toast('计算中…');
  let total = 0;
  for (const p of paths) {
    total += await invoke('dir_size', { path: p });
  }
  $('sbSize').textContent = `选中大小: ${fmtSize(total)}`;
  toast(`总大小: ${fmtSize(total)}`);
}

// ---------- 搜索 ----------
async function runSearch() {
  const q = $('searchInput').value.trim();
  const list = $('searchList');
  if (!q) {
    list.innerHTML = '<div class="empty">输入关键词后回车搜索</div>';
    return;
  }
  list.innerHTML = '<div class="empty">搜索中…</div>';
  try {
    const hits = await invoke('search_files', { root: state.cwd, query: q, maxResults: 500 });
    list.innerHTML = '';
    if (!hits.length) {
      list.innerHTML = '<div class="empty">无结果</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    hits.forEach((h) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <span class="ico">${h.is_dir ? SVG.folder : SVG.file}</span>
        <span class="name">${esc(h.name)} <span style="color:var(--text-dim);font-size:11px">${esc(h.path)}</span></span>
        <span class="size">${h.is_dir ? '' : fmtSize(h.size)}</span>`;
      row.ondblclick = () => {
        $('searchPanel').style.display = 'none';
        if (h.is_dir) loadDir(h.path);
        else openEntry(h);
      };
      frag.appendChild(row);
    });
    list.appendChild(frag);
  } catch (e) {
    list.innerHTML = `<div class="empty">${esc(String(e))}</div>`;
  }
}

// ---------- 事件绑定 ----------
$('btnBack').onclick = goBack;
$('crumbs').onclick = (ev) => {
  // 点空白处（非 crumb）进入路径编辑
  if (ev.target.id === 'crumbs') showPathInput();
};
$('btnUp').onclick = goUp;
$('btnNewFolder').onclick = newFolder;
$('btnNewFile').onclick = newFile;
$('btnHidden').onclick = toggleHidden;
$('btnDelete').onclick = deleteSelected;

// ---------- 主题 ----------
const THEMES = [
  { id: 'dark', label: '深色' },
  { id: 'light', label: '浅色' },
  { id: 'sepia', label: '护眼' },
  { id: 'ocean', label: '蓝色' },
  { id: 'purple', label: '紫色' },
  { id: 'glass', label: '毛玻璃' },
];

function applyTheme(id) {
  document.documentElement.dataset.theme = id;
  localStorage.setItem('theme', id);
}

applyTheme(localStorage.getItem('theme') || 'dark');

$('btnTheme').onclick = (ev) => {
  const menu = $('ctxMenu');
  const cur = localStorage.getItem('theme') || 'dark';
  menu.innerHTML = THEMES.map((t) =>
    `<div class="ctx-item" data-t="${t.id}" style="padding:6px 14px;cursor:pointer;font-size:12px;${t.id === cur ? 'color:var(--accent);font-weight:600' : ''}">${t.id === cur ? '● ' : ''}${t.label}</div>`
  ).join('');
  menu.style.display = 'block';
  const r = ev.target.getBoundingClientRect();
  menu.style.left = (r.right - menu.offsetWidth) + 'px';
  menu.style.top = (r.bottom + 4) + 'px';
  menu.querySelectorAll('.ctx-item').forEach((el) => {
    el.onmouseenter = () => (el.style.background = 'var(--hover)');
    el.onmouseleave = () => (el.style.background = 'none');
    el.onclick = () => {
      applyTheme(el.dataset.t);
      menu.style.display = 'none';
    };
  });
};

// ---------- 右键菜单 ----------
function showCtxMenu(ev, entry) {
  if (entry) {
    // 右键未选中行时切换选中到该行
    if (!state.selected.has(entry.path)) {
      state.selected = new Set([entry.path]);
      renderList();
      renderStatus();
    }
  }
  const menu = $('ctxMenu');
  const items = [];
  const hasSel = state.selected.size > 0;
  if (hasSel) {
    items.push({ label: '复制路径', fn: copyPaths });
    items.push({ label: '复制文件名', fn: copyNames });
    items.push({ label: '删除', danger: true, fn: deleteSelected });
    items.push({ label: '复制', fn: copySelected });
    items.push({ label: '剪切', fn: cutSelected });
    items.push({ label: '压缩为 ZIP', fn: zipSelected });
    // 唯一选中且是 .zip 时提供解压
    if (state.selected.size === 1) {
      const only = state.entries.find((x) => x.path === [...state.selected][0]);
      if (only && !only.is_dir && only.ext === 'zip') {
        items.push({ label: '解压到当前目录', fn: () => unzipToHere(only.path) });
      }
    }
  }
  items.push({ label: '在终端中打开', fn: openTerminalHere });
  items.push({ label: '新建文件夹', fn: newFolder });
  items.push({ label: '新建文件', fn: newFile });
  // 在废纸篓目录时提供清空
  if (state.cwd && state.cwd.endsWith('/.Trash')) {
    items.push({ label: '清空废纸篓', danger: true, fn: emptyTrashConfirm });
  }
  menu.innerHTML = items
    .map((it, i) => `<div class="ctx-item${it.danger ? ' danger' : ''}" data-i="${i}" style="padding:6px 14px;cursor:pointer;font-size:12px;${it.danger ? 'color:var(--danger)' : ''}">${it.label}</div>`)
    .join('');
  menu.style.display = 'block';
  menu.style.left = Math.min(ev.clientX, window.innerWidth - 160) + 'px';
  menu.style.top = Math.min(ev.clientY, window.innerHeight - 40 * items.length) + 'px';
  menu.querySelectorAll('.ctx-item').forEach((el) => {
    el.onmouseenter = () => (el.style.background = 'var(--hover)');
    el.onmouseleave = () => (el.style.background = 'none');
    el.onclick = () => {
      menu.style.display = 'none';
      items[+el.dataset.i].fn();
    };
  });
}
document.addEventListener('click', (ev) => {
  if (!ev.target.closest('#ctxMenu') && !ev.target.closest('#btnTheme')) $('ctxMenu').style.display = 'none';
});

function toggleHidden() {
  state.showHidden = !state.showHidden;
  localStorage.setItem('showHidden', state.showHidden ? '1' : '0');
  $('btnHidden').classList.toggle('active', state.showHidden);
  refresh();
}
// ---------- 多关键字标签过滤（OR） ----------
state.tags = [];

function renderTags() {
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

function addTag(raw) {
  const t = raw.trim();
  if (t && !state.tags.includes(t)) {
    state.tags.push(t);
    renderTags();
  }
}

function removeTag(t) {
  state.tags = state.tags.filter((x) => x !== t);
  renderTags();
  renderList();
  renderStatus();
}

function applyTagsFromInput() {
  // 输入内容里的空格段直接转成标签
  const v = $('filterInput').value;
  if (v.includes(' ')) {
    v.trim().split(/\s+/).forEach(addTag);
    $('filterInput').value = '';
    renderList();
    renderStatus();
  }
}

$('filterInput').oninput = (ev) => {
  applyTagsFromInput();
  renderList();
  renderStatus();
};
$('filterInput').onkeydown = (ev) => {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    if (ev.target.value.trim()) {
      addTag(ev.target.value);
      ev.target.value = '';
      renderList();
      renderStatus();
    }
  } else if (ev.key === 'Backspace' && !ev.target.value) {
    if (state.tags.length) {
      removeTag(state.tags[state.tags.length - 1]);
    }
  }
};
$('filterTags').onclick = () => $('filterInput').focus();
$('sortSelect').onchange = (ev) => {
  state.sortBy = ev.target.value;
  renderList();
};
$('searchInput').onkeydown = (ev) => ev.key === 'Enter' && runSearch();
$('btnSearchClose').onclick = () => ($('searchPanel').style.display = 'none');

document.addEventListener('keydown', (ev) => {
  if (ev.metaKey || ev.ctrlKey) {
    switch (ev.key.toLowerCase()) {
      case 'f': ev.preventDefault(); $('searchPanel').style.display = 'flex'; $('searchInput').focus(); break;
      case 'c': copySelected(); break;
      case 'x': cutSelected(); break;
      case 'v': paste(); break;
      case 'a': {
        ev.preventDefault();
        const { list } = visibleEntries();
        state.selected = new Set(list.map((e) => e.path));
        renderList();
        renderStatus();
        break;
      }
      case 'd': ev.preventDefault(); renameEntry(); break;
      case 'e': // 测试错误提示（⌘E），验证错误 toast 可复制
        ev.preventDefault();
        invoke('test_error').catch((e) => toast(String(e), true));
        break;
      case 'l': // ⌘L 路径跳转（访达同款）
        ev.preventDefault();
        showPathInput();
        break;
      case '.': // ⌘. / ⌘⇧. 显示/隐藏隐藏文件（访达同款为 ⌘⇧.）
        ev.preventDefault();
        toggleHidden();
        break;
    }
  } else {
    switch (ev.key) {
      case 'Delete':
      case 'Backspace': deleteSelected(); break;
      case 'Enter': {
        if (state.selected.size === 1) {
          const e = state.entries.find((x) => x.path === [...state.selected][0]);
          if (e) openEntry(e);
        }
        break;
      }
      case 'Escape': $('searchPanel').style.display = 'none'; break;
    }
  }
});

// ---------- 启动 ----------
// Splash：首帧注入已保存主题变量，避免非默认主题用户看到闪屏
(function themePrefill() {
  const t = localStorage.getItem('theme') || 'dark';
  const m = {
    light: { '--bg': '#f5f5f7', '--text': '#1d1d1f', '--accent': '#0a84ff' },
    sepia: { '--bg': '#f0e4cf', '--text': '#4a3c2a', '--accent': '#b07d3a' },
    ocean: { '--bg': '#0b1f33', '--text': '#d7e5f2', '--accent': '#3d9be9' },
    purple: { '--bg': '#221a2e', '--text': '#e4dced', '--accent': '#9c6bff' },
    glass: { '--bg': '#16181d', '--text': '#e8e8ea', '--accent': '#4a9eff' },
  }[t];
  if (m) for (const [k, v] of Object.entries(m)) document.documentElement.style.setProperty(k, v);
})();

// 隐藏 Splash（首次 loadDir 渲染后调用；3s 兜底防卡死）
let splashHidden = false;
function hideSplash() {
  if (splashHidden) return;
  splashHidden = true;
  const sp = $('splash');
  if (!sp) return;
  sp.style.opacity = '0';
  sp.addEventListener('transitionend', () => (sp.style.display = 'none'), { once: true });
  // transition 兜底
  setTimeout(() => (sp.style.display = 'none'), 300);
}
setTimeout(hideSplash, 3000);

(async function init() {
  // 开发自测：MFILE_SPLASH_TEST 为延迟毫秒数，Splash 保留该时长后再隐藏（截图验证用）
  const splashTest = await invoke('get_env', { key: 'MFILE_SPLASH_TEST' }).catch(() => '');
  const delay = parseInt(splashTest, 10);
  if (delay > 0) {
    const realHide = hideSplash;
    window.hideSplash = () => {}; // 冻结：init 完成也不隐藏
    setTimeout(() => { splashHidden = false; realHide(); }, delay);
  }
  state.home = await invoke('home_dir');
  $('btnHidden').classList.toggle('active', state.showHidden);
  // 支持 MFILE_START_DIR 环境变量指定启动目录（用于自动化验证）
  const startDir = await invoke('get_env', { key: 'MFILE_START_DIR' });
  await loadDir(startDir && startDir.length > 0 ? startDir : state.home);
  hideSplash();
})();
