// 右键菜单：条目操作集合 + 废纸篓上下文项。菜单项函数来自 actions。

import { state } from './state.js';
import { $ } from './utils.js';
import { renderList, renderStatus } from './render.js';
import {
  copyPaths, copyNames, deleteSelected, copySelected, cutSelected,
  zipSelected, extractToHere, emptyTrashConfirm, openTerminalHere,
  newFolder, newFile,
} from './actions.js';

export function showCtxMenu(ev, entry) {
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
    // 唯一选中且是压缩文件（zip/tar/gz/tgz/bz2/xz/7z/rar…）时提供解压
    if (state.selected.size === 1) {
      const only = state.entries.find((x) => x.path === [...state.selected][0]);
      if (only && only.is_archive) {
        items.push({ label: '解压到当前目录', fn: () => extractToHere(only.path) });
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

// 点击空白处关闭菜单
document.addEventListener('click', (ev) => {
  if (!ev.target.closest('#ctxMenu') && !ev.target.closest('#btnTheme')) $('ctxMenu').style.display = 'none';
});
