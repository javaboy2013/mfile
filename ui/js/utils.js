// 通用工具：DOM 查询 / 转义 / 格式化 / toast / 图标。

export const $ = (id) => document.getElementById(id);

export function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function fmtSize(bytes) {
  if (bytes == null) return '';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / Math.pow(1024, i);
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function fmtDate(secs) {
  if (!secs) return '';
  const d = new Date(secs * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let toastTimer;
export function toast(msg, isError = false) {
  const t = $('toast');
  t.innerHTML = `
    <span class="toast-text">${esc(msg)}</span>
    ${isError ? '<button class="toast-copy" onclick="copyToast(this)">复制</button>' : ''}`;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  // 错误提示常驻（不自动消失），普通提示 2.2s 后消失
  if (!isError) toastTimer = setTimeout(() => (t.className = 'toast'), 2200);
}

// toast 内联 onclick 依赖全局（见上方模板字符串）
function copyToast(btn) {
  const text = btn.parentElement.querySelector('.toast-text').textContent;
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '已复制';
    setTimeout(() => {
      $('toast').className = 'toast';
    }, 1200);
  });
}
window.copyToast = copyToast;

export async function copyToClipboard(text, msg) {
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

// ---------- 图标 ----------
export const SVG = {
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

export function iconFor(e) {
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
