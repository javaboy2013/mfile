// 事件绑定：所有交互统一在此（按钮直绑 + 容器事件委托）。
// render 只产 DOM（data-*），这里集中绑定，消除模块循环依赖。

import { state } from './state.js';
import { $, toast } from './utils.js';
import { SIDEBAR, renderList, renderStatus, visibleEntries, applyTagsFromInput, addTag, removeTag } from './render.js';
import { loadDir, goBack, goUp, openEntry, selectRow, showPathInput } from './nav.js';
import {
  renameEntry, deleteSelected, copySelected, cutSelected,
  paste, toggleHidden,
} from './actions.js';
import { runSearch } from './search.js';
import { showCtxMenu } from './menu.js';
import { testError } from './commands.js';

export function bindEvents() {
  // ---------- 工具栏按钮 ----------
  $('btnBack').onclick = goBack;
  $('btnUp').onclick = goUp;
  $('btnHidden').onclick = toggleHidden;

  // ---------- 文件列表：事件委托（render 只产 data-path） ----------
  const list = $('fileList');
  const entryOf = (ev) => {
    const row = ev.target.closest('.row');
    if (!row) return null;
    return state.entries.find((e) => e.path === row.dataset.path) || null;
  };
  list.addEventListener('click', (ev) => {
    if (rubber.suppressed) {
      rubber.suppressed = false; // 拖动后的释放不再触发点击选中
      return;
    }
    const e = entryOf(ev);
    if (e) selectRow(ev, e);
    else if (ev.target.id === 'fileList') {
      // 点击空白：清空选择（访达行为）
      if (state.selected.size) {
        state.selected.clear();
        state.lastSelected = null;
        renderList();
        renderStatus();
      }
    }
  });
  list.addEventListener('dblclick', (ev) => {
    const e = entryOf(ev);
    if (e) openEntry(e);
  });
  list.addEventListener('contextmenu', (ev) => {
    const e = entryOf(ev);
    ev.preventDefault();
    showCtxMenu(ev, e); // e 为 null 时弹空白菜单（新建/粘贴/全选）
  });

  // ---------- 鼠标框选（rubber-band，访达行为）----------
  // 按下后拖动超过阈值即进入框选（起点可在行上或空白）；无拖动的释放仍是
  // 点击选中。⌘ 按住拖拽为累加选择，否则重置为框选结果。
  const rubber = { active: false, suppressed: false, startX: 0, startY: 0, band: null, base: null, rowRects: [] };
  const DRAG_THRESHOLD = 4;

  list.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0) return; // 仅左键
    const rect = list.getBoundingClientRect();
    rubber.startX = ev.clientX;
    rubber.startY = ev.clientY;
    rubber.active = true;
    // ⌘ 累加模式：以当前选择为基底；普通模式基底为空
    rubber.base = ev.metaKey || ev.ctrlKey ? new Set(state.selected) : new Set();
    // 缓存行矩形（框选期间不重排列表）
    rubber.rowRects = [...list.querySelectorAll('.row')].map((el) => ({
      path: el.dataset.path,
      rect: el.getBoundingClientRect(),
    }));
    void rect;
  });

  document.addEventListener('mousemove', (ev) => {
    if (!rubber.active) return;
    const dx = ev.clientX - rubber.startX;
    const dy = ev.clientY - rubber.startY;
    if (!rubber.band && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!rubber.band) {
      rubber.band = document.createElement('div');
      rubber.band.className = 'rubber-band';
      document.body.appendChild(rubber.band);
      document.body.classList.add('rubber-selecting');
    }
    rubber.suppressed = true; // 本轮按下产生过拖动：抑制随后的 click
    // 选框几何（clamp 在列表可视区内）
    const area = list.getBoundingClientRect();
    const x1 = Math.max(rubber.startX, area.left);
    const y1 = Math.max(rubber.startY, area.top);
    const x2 = Math.min(ev.clientX, area.right);
    const y2 = Math.min(ev.clientY, area.bottom);
    const bx = Math.min(x1, x2);
    const by = Math.min(y1, y2);
    rubber.band.style.left = bx + 'px';
    rubber.band.style.top = by + 'px';
    rubber.band.style.width = Math.abs(x2 - x1) + 'px';
    rubber.band.style.height = Math.abs(y2 - y1) + 'px';
    // 相交判定 → 更新选择（DOM class 直改，避免高频重建列表）
    const sel = new Set(rubber.base);
    for (const { path, rect } of rubber.rowRects) {
      const hit =
        rect.left < bx + Math.abs(x2 - x1) && rect.right > bx &&
        rect.top < by + Math.abs(y2 - y1) && rect.bottom > by;
      if (hit) sel.add(path);
    }
    state.selected = sel;
    for (const el of list.querySelectorAll('.row')) {
      el.classList.toggle('selected', sel.has(el.dataset.path));
    }
  });

  document.addEventListener('mouseup', () => {
    if (!rubber.active) return;
    rubber.active = false;
    if (rubber.band) {
      rubber.band.remove();
      rubber.band = null;
      document.body.classList.remove('rubber-selecting');
      state.lastSelected = state.selected.size ? [...state.selected].at(-1) : null;
      renderStatus();
    }
    // 无拖动（suppressed=false）时交由 click 事件处理选中/清空
  });

  // ---------- 侧栏：委托（data-idx → SIDEBAR） ----------
  $('sidebar').addEventListener('click', (ev) => {
    const item = ev.target.closest('.side-item');
    if (!item) return;
    if (item.dataset.drive) {
      loadDir(`${state.home}/${item.dataset.drive}`);
      return;
    }
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
