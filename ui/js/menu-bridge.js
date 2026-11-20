// 原生菜单动作分发：主进程菜单点击/快捷键经 IPC 下发到这里，
// 复用渲染层现有 actions（单一执行路径，与页面快捷键/右键菜单同源）。

import { state } from './state.js';
import { $, toast } from './utils.js';
import { renderList, renderStatus, visibleEntries } from './render.js';
import { loadDir, goBack, goUp, openEntry } from './nav.js';
import {
  newFolder, newFile, renameEntry, deleteSelected, copySelected, cutSelected,
  paste, zipSelected, extractToHere, emptyTrashConfirm, openTerminalHere,
  toggleHidden,
} from './actions.js';
import { applyTheme } from './theme.js';
import { checkNow } from './updater.js';

const selectedEntry = () =>
  state.selected.size === 1
    ? state.entries.find((x) => x.path === [...state.selected][0])
    : null;

const GO = {
  home: () => state.home,
  applications: () => '/Applications',
  documents: () => `${state.home || ''}/Documents`,
  downloads: () => `${state.home || ''}/Downloads`,
  desktop: () => `${state.home || ''}/Desktop`,
};

function run(action) {
  const [group, op, arg] = action.split(':');
  if (group === 'file') {
    switch (op) {
      case 'newFolder': return newFolder();
      case 'newFile': return newFile();
      case 'open': {
        const e = selectedEntry();
        if (e) return openEntry(e);
        return toast('请先选择一个项目', true);
      }
      case 'openTerminal': return openTerminalHere();
      case 'zip': return zipSelected();
      case 'extract': {
        const e = selectedEntry();
        if (e && e.is_archive) return extractToHere(e.path);
        return toast('请选择一个压缩文件', true);
      }
      case 'trash': return deleteSelected();
      case 'emptyTrash': return emptyTrashConfirm();
    }
    return;
  }
  if (group === 'edit') {
    switch (op) {
      case 'cut': return cutSelected();
      case 'copy': return copySelected();
      case 'paste': return paste();
      case 'selectAll': {
        const { list } = visibleEntries();
        state.selected = new Set(list.map((e) => e.path));
        renderList();
        renderStatus();
        return;
      }
      case 'rename': return renameEntry();
    }
    return;
  }
  if (group === 'view') {
    switch (op) {
      case 'toggleHidden': return toggleHidden();
      case 'sort':
        state.sortBy = arg;
        $('sortSelect').value = arg; // 下拉同步
        renderList();
        return;
      case 'theme': return applyTheme(arg);
    }
    return;
  }
  if (group === 'go') {
    if (op === 'back') return goBack();
    if (op === 'up') return goUp();
    const target = GO[op] && GO[op]();
    if (target) loadDir(target);
    return;
  }
  if (group === 'app' && op === 'checkUpdate') return checkNow(true);
}

export function bindMenuActions() {
  window.mfile.onMenuAction(({ action } = {}) => {
    if (action) run(action);
  });
}
