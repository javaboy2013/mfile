// 主题：6 套切换，localStorage 持久化，模块加载即应用（早于首帧，避免闪屏）。
// 明暗基调同步到 Rust 侧（prefs.json），下次启动原生 splash 与应用主题同色。

import { $ } from './utils.js';
import { invoke } from './tauri.js';

const THEMES = [
  { id: 'dark', label: '深色' },
  { id: 'light', label: '浅色' },
  { id: 'sepia', label: '护眼' },
  { id: 'ocean', label: '蓝色' },
  { id: 'purple', label: '紫色' },
  { id: 'glass', label: '毛玻璃' },
];

// 花色主题的明暗归属（浅底 → light，其余 → dark），与 index.html 浅色兜底一致
const BASE_OF = { light: 'light', sepia: 'light', dark: 'dark', ocean: 'dark', purple: 'dark', glass: 'dark' };

export function applyTheme(id) {
  document.documentElement.dataset.theme = id;
  // 主题变量已注入，停用 splash 的系统深浅色兜底（见 index.html 内嵌样式）
  document.documentElement.setAttribute('data-theme-ready', '1');
  localStorage.setItem('theme', id);
  // 同步明暗基调给原生 splash（下次启动配色一致）；fire-and-forget
  invoke('save_theme', { base: BASE_OF[id] || 'dark' }).catch(() => {});
}

// 初始主题：已保存的优先；首启无历史时跟随系统深浅色
// （原生 splash 无偏好文件时也跟随系统，两边一致无闪变）
const saved = localStorage.getItem('theme');
applyTheme(
  saved ||
  (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
);

// 主题菜单（挂在右上角按钮上，弹出用通用 #ctxMenu 容器）
export function bindThemeMenu() {
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
}
