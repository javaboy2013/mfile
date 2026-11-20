// 深度搜索面板（⌘F）。

import { state } from './state.js';
import { $, esc, fmtSize, SVG } from './utils.js';
import { searchFiles } from './commands.js';
import { loadDir, openEntry } from './nav.js';

export async function runSearch() {
  const q = $('searchInput').value.trim();
  const list = $('searchList');
  if (!q) {
    list.innerHTML = '<div class="empty">输入关键词后回车搜索</div>';
    return;
  }
  list.innerHTML = '<div class="empty">搜索中…</div>';
  try {
    const hits = await searchFiles(state.cwd, q, 500);
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
