// 导航：目录加载 / 前进后退 / 上一级 / 打开条目 / 行选择 / 路径编辑。

import { state } from './state.js';
import { $, toast } from './utils.js';
import { listDir, openPath } from './commands.js';
import { render, renderCrumbs, renderList, renderStatus, renderTags, visibleEntries } from './render.js';

export async function loadDir(path, pushHistory = true) {
  try {
    const result = await listDir(path, state.showHidden);
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

export function goBack() {
  const prev = state.history.pop();
  if (prev) loadDir(prev, false);
}

export function goUp() {
  if (state.parent) loadDir(state.parent);
}

export async function refresh() {
  if (state.cwd) await loadDir(state.cwd, false);
}

export async function openEntry(e) {
  if (e.is_dir) {
    loadDir(e.path);
  } else {
    try {
      await openPath(e.path);
    } catch (err) {
      toast(`打开失败: ${JSON.stringify(err)}`, true);
    }
  }
}

// ---------- 选择（click 委托入口在 events.js） ----------
export function selectRow(ev, e) {
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

// 点击面包屑空白处进入路径编辑模式（访达同款）
export function showPathInput() {
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
