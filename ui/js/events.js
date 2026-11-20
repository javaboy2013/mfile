// 事件绑定：所有交互统一在此（按钮直绑 + 容器事件委托）。
// render 只产 DOM（data-*），这里集中绑定，消除模块循环依赖。

import { state } from './state.js';
import { $, toast } from './utils.js';
import { SIDEBAR, renderList, renderStatus, visibleEntries, applyTagsFromInput, addTag, removeTag } from './render.js';
import { loadDir, goBack, goUp, openEntry, selectRow, showPathInput } from './nav.js';
import {
  newFolder, newFile, renameEntry, deleteSelected, copySelected, cutSelected,
  paste, toggleHidden,
} from './actions.js';
import { runSearch } from './search.js';
import { showCtxMenu } from './menu.js';
import { testError } from './commands.js';

export function bindEvents() {
  // ---------- 工具栏按钮 ----------
  $('btnBack').onclick = goBack;
  $('btnUp').onclick = goUp;
  $('btnNewFolder').onclick = newFolder;
  $('btnNewFile').onclick = newFile;
  $('btnHidden').onclick = toggleHidden;
  $('btnDelete').onclick = deleteSelected;

  // ---------- 文件列表：事件委托（render 只产 data-path） ----------
  const list = $('fileList');
  const entryOf = (ev) => {
    const row = ev.target.closest('.row');
    if (!row) return null;
    return state.entries.find((e) => e.path === row.dataset.path) || null;
  };
  list.addEventListener('click', (ev) => {
    const e = entryOf(ev);
    if (e) selectRow(ev, e);
  });
  list.addEventListener('dblclick', (ev) => {
    const e = entryOf(ev);
    if (e) openEntry(e);
  });
  list.addEventListener('contextmenu', (ev) => {
    const e = entryOf(ev);
    if (!e) return; // 空白处右键走系统默认（与原版一致）
    ev.preventDefault();
    showCtxMenu(ev, e);
  });

  // ---------- 侧栏：委托（data-idx → SIDEBAR） ----------
  $('sidebar').addEventListener('click', (ev) => {
    const item = ev.target.closest('.side-item');
    if (!item) return;
    const target = SIDEBAR[+item.dataset.idx];
    if (target && target.path) loadDir(target.path);
  });

  // ---------- 面包屑：委托 + 点空白进入路径编辑 ----------
  $('crumbs').onclick = (ev) => {
    const crumb = ev.target.closest('.crumb');
    if (crumb && crumb.dataset.target) {
      loadDir(crumb.dataset.target);
    } else if (ev.target.id === 'crumbs') {
      showPathInput();
    }
  };

  // ---------- 过滤 / 标签 ----------
  $('filterInput').oninput = (ev) => {
    state.filter = ev.target.value; // 即时过滤（输入即生效）
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

  // ---------- 搜索 ----------
  $('searchInput').onkeydown = (ev) => ev.key === 'Enter' && runSearch();
  $('btnSearchClose').onclick = () => ($('searchPanel').style.display = 'none');

  // ---------- 全局快捷键 ----------
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
          testError().catch((e) => toast(String(e), true));
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
}
