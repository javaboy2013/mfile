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
// 文件类型徽标：灰色纸主体 + 右下角色块徽标（访达式），表驱动生成，无需逐个手绘。
const PAPER =
  '<path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="#8f8f98"/>' +
  '<path d="M14 3v4h4" fill="#6e6e78"/>';

/** 徽标型文件图标：纸 + 右下角类型色块与字母 */
const fileBadge = (color, label, dark = false) =>
  `<svg viewBox="0 0 24 24" fill="none">${PAPER}` +
  `<rect x="2.5" y="12.5" width="14" height="9.5" rx="2" fill="${color}"/>` +
  `<text x="9.5" y="19.7" text-anchor="middle" font-size="7.5" font-weight="700" font-family="-apple-system,sans-serif" fill="${dark ? '#1d1d1f' : '#fff'}">${label}</text></svg>`;

// 类型映射表（先具体后一般）：扩展名 → [底色, 徽标文字, 深色文字?]
const FILE_TYPES = [
  // 办公文档
  [['doc', 'docx', 'rtf', 'odt'], '#2b579a', 'W'],
  [['xls', 'xlsx', 'csv', 'tsv', 'ods'], '#217346', 'X'],
  [['ppt', 'pptx', 'pps', 'odp'], '#d24726', 'P'],
  // iWork
  [['pages'], '#ff9500', 'Pa'],
  [['numbers'], '#34c759', 'N'],
  [['key'], '#4a7ce0', 'K'],
  // 标记 / 文本
  [['md', 'markdown'], '#083fa1', 'M'],
  // 配置
  [['json', 'yaml', 'yml', 'toml', 'ini', 'conf', 'env', 'lock', 'plist'], '#9c6b00', '{}'],
  // 代码（按语言着色）
  [['js', 'mjs', 'cjs', 'jsx'], '#f0db4f', 'JS', true],
  [['ts', 'tsx'], '#3178c6', 'TS'],
  [['py', 'pyw', 'ipynb'], '#3776ab', 'py'],
  [['rs'], '#ce422b', 'Rs'],
  [['go'], '#00add8', 'Go'],
  [['java', 'jar'], '#f89820', 'Jv'],
  [['swift'], '#f05138', 'Sw'],
  [['c', 'h'], '#5c6bc0', 'C'],
  [['cpp', 'hpp', 'cc'], '#00599c', 'C+'],
  [['sh', 'bash', 'zsh', 'command'], '#4cae8f', '$_'],
  [['html', 'htm', 'xml'], '#e34c26', '‹›'],
  [['css', 'scss', 'less'], '#2965f1', '#'],
  // 字体
  [['ttf', 'otf', 'woff', 'woff2'], '#5c9ce0', 'A'],
  // 其他
  [['torrent'], '#4a9eff', 'T'],
  [['url', 'webloc'], '#4a90d9', '⛓'],
];

const FILE_TYPE_MAP = new Map(FILE_TYPES.flatMap(([exts, ...rest]) => exts.map((e) => [e, rest])));

export const SVG = {
  folder: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4l2 2.5h7A2.5 2.5 0 0 1 21 9v8.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11z" fill="#5aa2f0"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="#8f8f98"/><path d="M14 3v4h4" fill="#6e6e78"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" fill="#7c5cd6"/><circle cx="9" cy="10" r="2" fill="#fff"/><path d="M5 18l5-5 3 3 3-4 3 6H5z" fill="#a58ae8"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="2" fill="#d65c8c"/><path d="M10 9.5v5l4.5-2.5L10 9.5z" fill="#fff"/></svg>',
  audio: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 18V6l10-2v12" stroke="#4cae8f" stroke-width="2"/><circle cx="7" cy="18" r="2.5" fill="#4cae8f"/><circle cx="17" cy="16" r="2.5" fill="#4cae8f"/></svg>',
  archive: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 4h16v4H4V4z" fill="#c99a4b"/><path d="M5 8h14v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8z" fill="#e0b25f"/><rect x="11" y="9" width="2" height="6" fill="#fff"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="#e05c5c"/><text x="8" y="17" font-size="7" fill="#fff" font-family="sans-serif" font-weight="bold">PDF</text></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="#4a7ce0"/><rect x="8" y="11" width="8" height="1.5" fill="#fff"/><rect x="8" y="14" width="8" height="1.5" fill="#fff"/><rect x="8" y="17" width="5" height="1.5" fill="#fff"/></svg>',

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
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic', 'bmp', 'tiff', 'ico', 'raw'].includes(ext)) return SVG.image;
  if (['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', 'm4v'].includes(ext)) return SVG.video;
  if (['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'wma', 'aiff'].includes(ext)) return SVG.audio;
  if (['zip', 'gz', 'tar', 'rar', '7z', 'bz2', 'xz', 'zst', 'tgz'].includes(ext)) return SVG.archive;
  if (ext === 'pdf') return SVG.pdf;
  // 磁盘镜像：纸 + 圆盘徽标
  if (['dmg', 'iso', 'img'].includes(ext)) {
    return `<svg viewBox="0 0 24 24" fill="none">${PAPER}` +
      `<rect x="2.5" y="12.5" width="14" height="9.5" rx="2" fill="#6e6e78"/>` +
      `<circle cx="9.5" cy="17.2" r="3.4" fill="#c5c5cc"/><circle cx="9.5" cy="17.2" r="1" fill="#6e6e78"/></svg>`;
  }
  if (ext === 'app') return SVG.app;
  // 表驱动类型徽标（办公/iWork/标记/配置/各语言代码/字体…）
  const t = FILE_TYPE_MAP.get(ext);
  if (t) return fileBadge(t[0], t[1], t[2]);
  // 纯文本（无类型徽标的文档类）
  if (['txt', 'log', 'text', 'rtfd'].includes(ext)) return SVG.doc;
  return SVG.file;
}
