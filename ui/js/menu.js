// 右键菜单：分组 + 二级子菜单（参考访达组织方式）。
// 条目结构：{ label, hint?, danger?, fn } | { label, sub: [...] } | { sep: true }

import { state } from './state.js';
import { $ } from './utils.js';
import { renderList, renderStatus, visibleEntries } from './render.js';
import {
  copyPaths, copyNames, deleteSelected, copySelected, cutSelected, paste,
  zipSelected, extractToHere, emptyTrashConfirm, openTerminalHere,
  newFolder, newFile, renameEntry,
} from './actions.js';
import { openEntry } from './nav.js';

export function showCtxMenu(ev, entry) {
  if (entry) {
    // 右键未选中行时切换选中到该行
    if (!state.selected.has(entry.path)) {
      state.selected = new Set([entry.path]);
      renderList();
      renderStatus();
    }
  }
  const hasSel = state.selected.size > 0;
  // 唯一选中且是压缩文件时提供解压
  let archiveOnly = null;
  if (state.selected.size === 1) {
    const only = state.entries.find((x) => x.path === [...state.selected][0]);
    if (only && only.is_archive) archiveOnly = only;
  }

  const items = [];
  if (entry) {
    items.push({ label: '打开', fn: () => openEntry(entry) });
    items.push({ sep: true });
    items.push({ label: '复制', hint: '⌘C', fn: copySelected });
    items.push({ label: '剪切', hint: '⌘X', fn: cutSelected });
    items.push({ label: '粘贴', hint: '⌘V', fn: paste });
    items.push({ sep: true });
    items.push({
      label: '拷贝为',
      sub: [
        { label: '拷贝路径', fn: copyPaths },
        { label: '拷贝文件名', fn: copyNames },
      ],
    });
    const archSub = [{ label: '压缩为 ZIP', fn: zipSelected }];
    if (archiveOnly) {
      archSub.push({ label: '解压到当前目录', fn: () => extractToHere(archiveOnly.path) });
    }
    items.push({ label: '压缩', sub: archSub });
    items.push({ sep: true });
    items.push({ label: '在终端中打开', fn: openTerminalHere });
    if (hasSel && state.selected.size === 1) {
      items.push({ label: '重命名', hint: 'F2', fn: renameEntry });
    }
    items.push({ sep: true });
    items.push({
      label: '新建',
      sub: [
        { label: '新建文件夹', fn: newFolder },
        { label: '新建文件', fn: newFile },
      ],
    });
    items.push({ sep: true });
    items.push({ label: '删除', hint: '⌫', danger: true, fn: deleteSelected });
  } else {
    // 空白处右键：新建 / 粘贴 / 全选 / 视图设置
    items.push({
      label: '新建',
      sub: [
        { label: '新建文件夹', fn: newFolder },
        { label: '新建文件', fn: newFile },
      ],
    });
    items.push({ label: '粘贴', hint: '⌘V', fn: paste });
    items.push({
      label: '全选',
      hint: '⌘A',
      fn: () => {
        const { list } = visibleEntries();
        state.selected = new Set(list.map((e) => e.path));
        renderList();
        renderStatus();
      },
    });
    if (state.cwd && state.cwd.endsWith('/.Trash')) {
      items.push({ sep: true });
      items.push({ label: '清空废纸篓', danger: true, fn: emptyTrashConfirm });
    }
  }
  // 在废纸篓目录时提供清空
  if (state.cwd && state.cwd.endsWith('/.Trash')) {
    items.push({ sep: true });
    items.push({ label: '清空废纸篓', danger: true, fn: emptyTrashConfirm });
  }

  renderMenu(ev, items);
}

function renderMenu(ev, items) {
  const menu = $('ctxMenu');
  menu.innerHTML = items.map(itemHtml).join('');
  // 定位（沿用原逻辑：贴边收进）
  menu.style.display = 'block';
  menu.style.left = Math.min(ev.clientX, window.innerWidth - 170) + 'px';
  menu.style.top = Math.min(ev.clientY, window.innerHeight - 30 * items.length) + 'px';
  // 父菜单贴右缘时，二级子菜单翻转到左侧展开
  const menuRight = menu.getBoundingClientRect().right;
  if (menuRight + 160 > window.innerWidth) {
    menu.querySelectorAll('.ctx-item.has-sub').forEach((el) => el.classList.add('flip-sub'));
  }
  bindItemEvents(menu, items);
  // 子菜单条目绑定（fn 在子数组里）
  menu.querySelectorAll('.ctx-item.has-sub').forEach((parent, i) => {
    const sub = items.filter((it) => it.sub)[i];
    bindItemEvents(parent.querySelector('.ctx-sub'), sub.sub);
  });
}

// 右侧小箭头（SVG，避免字体字符渲染差异）
const ARROW_SVG =
  '<svg width="9" height="9" viewBox="0 0 10 10"><path d="M3 1.5L7.5 5 3 8.5z" fill="currentColor"/></svg>';

function itemHtml(it) {
  if (it.sep) return '<div class="ctx-sep"></div>';
  const cls = 'ctx-item' + (it.danger ? ' danger' : '') + (it.sub ? ' has-sub' : '');
  const right = it.sub
    ? `<span class="ctx-arrow">${ARROW_SVG}</span>`
    : it.hint
      ? `<span class="ctx-hint">${it.hint}</span>`
      : '';
  return `<div class="${cls}" data-label="${it.label}"><span>${it.label}</span>${right}${
    it.sub ? `<div class="ctx-sub">${it.sub.map(itemHtml).join('')}</div>` : ''
  }</div>`;
}

// hover 高亮由 CSS :hover 接管（含 danger 淡红底），此处只绑点击
function bindItemEvents(container, items) {
  if (!container) return;
  container.querySelectorAll(':scope > .ctx-item').forEach((el) => {
    const it = items.find((x) => x.label === el.dataset.label && !x.sep);
    el.onclick = () => {
      if (!it || it.sub) return; // 分组父项不响应点击
      $('ctxMenu').style.display = 'none';
      it.fn();
    };
  });
}

// 点击空白处关闭菜单
document.addEventListener('click', (ev) => {
  if (!ev.target.closest('#ctxMenu') && !ev.target.closest('#btnTheme')) $('ctxMenu').style.display = 'none';
});
