// 自动更新（Electron electron-updater，经 preload 桥）：
// ⟳ 手动检查 + 启动静默检查；确认后分步下载（进度条）→ 重启安装。
// 体验设计：
//  - 静默检查发现新版 → 角落提示条（不打断），手动检查 → 弹窗
//  - 下载监听 download-progress 显示百分比/速度/剩余
//  - 下载完成 → 「重启安装」按钮（用户挑时机），或退出应用时自动装

import { invoke } from './tauri.js';
import { $, esc } from './utils.js';
import { appVersion } from './commands.js';
import { onUpdaterEvent } from './tauri.js';

let downloading = false;
let pendingVersion = null; // 已下载待安装的版本

export function bindUpdaterMenu() {
  $('btnUpdate').onclick = () => checkNow(true);
  bindProgressEvents();
}

export function autoCheck() {
  setTimeout(() => checkNow(false), 3000);
}

/** download-progress / update-downloaded 事件 → 进度 UI */
function bindProgressEvents() {
  onUpdaterEvent('download-progress', ([p]) => {
    if (!downloading) return;
    const pct = Math.round(p.percent || 0);
    const speed = p.bytesPerSecond ? `${(p.bytesPerSecond / 1048576).toFixed(1)} MB/s` : '';
    const transferred = p.transferred != null
      ? `${(p.transferred / 1048576).toFixed(1)}/${(p.total / 1048576).toFixed(1)} MB` : '';
    const msg = $('updateProgressMsg');
    const bar = $('updateProgressBar');
    if (msg) msg.textContent = `${transferred} ${speed}`;
    if (bar) bar.style.width = `${Math.max(2, pct)}%`;
    const btn = $('modalOk');
    if (btn) btn.textContent = `下载中 ${pct}%`;
  });
  onUpdaterEvent('update-downloaded', () => {
    downloading = false;
    showDownloaded();
  });
  onUpdaterEvent('error', ([e]) => {
    if (!downloading) return;
    downloading = false;
    const msg = $('modalMsg');
    if (msg) msg.textContent = `下载失败: ${String(e).slice(0, 120)}`;
    const btn = $('modalOk');
    if (btn) { btn.disabled = false; btn.textContent = '重试下载'; }
  });
}

/** 检查更新（manual=true 时弹结果框；原生菜单「检查更新…」也走这里） */
export async function checkNow(manual) {
  let update = null;
  try {
    update = await invoke('updater_check');
  } catch (e) {
    if (manual) showUpdateModal('检查更新失败', String(e), null);
    return;
  }
  if (!update) {
    if (manual) showUpdateModal('已是最新版本', `当前版本 v${await appVersion()}，未发现新版本。`, null);
    return;
  }
  if (manual) {
    showUpdateModal(
      `发现新版本 v${update.version}`,
      notesHtml(update.notes),
      true
    );
  } else {
    // 静默检查：角落提示条，不打断当前操作
    showCornerToast(update.version, update.notes);
  }
}

function notesHtml(notes) {
  return notes
    ? `<div style="white-space:pre-wrap;line-height:1.7">${esc(String(notes))}</div>`
    : '<div style="color:var(--text-dim)">本次更新未提供说明。</div>';
}

/** 角落提示条：发现新版（静默检查路径） */
function showCornerToast(version, notes) {
  if ($('updateCorner')) return; // 已在展示
  const root = $('modalRoot');
  const el = document.createElement('div');
  el.id = 'updateCorner';
  el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9999;background:var(--panel,#2a2a2e);border:1px solid rgba(128,128,140,.3);border-radius:10px;padding:12px 16px;box-shadow:0 6px 24px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:8px;min-width:220px;font-size:13px;color:var(--text,#e8e8ea)';
  el.innerHTML = `
    <div style="font-weight:600">🚀 新版本 v${esc(version)} 可用</div>
    ${notes ? `<div style="color:var(--text-dim);font-size:12px;max-height:80px;overflow:auto;white-space:pre-wrap">${esc(String(notes)).slice(0, 200)}</div>` : ''}
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn" id="updateLater" style="font-size:12px;padding:4px 10px">稍后</button>
      <button class="btn primary" id="updateGo" style="font-size:12px;padding:4px 10px">查看更新</button>
    </div>`;
  root.appendChild(el);
  $('updateLater').onclick = () => el.remove();
  $('updateGo').onclick = () => { el.remove(); showUpdateModal(`发现新版本 v${version}`, notesHtml(notes), true); };
}

/** 下载完成 → 分步提示：重启安装 / 稍后自动装 */
function showDownloaded() {
  const root = $('modalRoot');
  const cur = root.querySelector('.modal');
  if (!cur) { showUpdateModal('更新已下载', '重启应用即可完成安装（也可退出时自动安装）。', null); return; }
  // 弹窗还在（下载中状态）→ 原地切换为完成态
  const body = cur.querySelector('div[style*="margin-bottom"]');
  if (body) body.innerHTML = '<div style="color:var(--ok,#4cae8f);font-weight:600">✓ 下载完成</div>';
  const msg = $('modalMsg'); if (msg) msg.textContent = '点击「重启安装」立即完成更新，或稍后退出应用时自动安装。';
  const btn = $('modalOk');
  if (btn) { btn.disabled = false; btn.textContent = '重启安装'; btn.onclick = () => invoke('updater_install'); }
}

function showUpdateModal(title, bodyHtml, canInstall) {
  const root = $('modalRoot');
  root.innerHTML = `
    <div class="modal-mask">
      <div class="modal">
        <h3>${esc(title)}</h3>
        <div style="color:var(--text-dim);font-size:12px;margin-bottom:14px;max-height:200px;overflow:auto">${bodyHtml || '&nbsp;'}</div>
        <div id="updateProgressWrap" style="display:none;margin-bottom:14px">
          <div style="height:5px;border-radius:3px;background:rgba(128,128,140,.25);overflow:hidden">
            <div id="updateProgressBar" style="width:2%;height:100%;background:var(--accent,#4a9eff);transition:width .3s"></div>
          </div>
          <div id="updateProgressMsg" style="color:var(--text-dim);font-size:11px;margin-top:5px"></div>
        </div>
        <div class="msg" id="modalMsg"></div>
        <div class="btns">
          <button class="btn" id="modalCancel">${canInstall ? '稍后再说' : '关闭'}</button>
          ${canInstall ? '<button class="btn primary" id="modalOk">下载并安装</button>' : ''}
        </div>
      </div>
    </div>`;
  const close = () => { root.innerHTML = ''; if (!downloading) return; };
  $('modalCancel').onclick = close;
  if (!canInstall) return;
  $('modalOk').onclick = async () => {
    const btn = $('modalOk');
    btn.disabled = true;
    downloading = true;
    btn.textContent = '连接中…';
    // 展示进度条
    const wrap = $('updateProgressWrap');
    if (wrap) wrap.style.display = 'block';
    try {
      // 主进程下载完成即 quitAndInstall（应用会自动重启）；
      // 进度经 update-downloaded 事件切换完成态（showDownloaded）
      await invoke('updater_install');
    } catch (e) {
      downloading = false;
      btn.disabled = false;
      btn.textContent = '下载并安装';
      $('modalMsg').textContent = String(e);
    }
  };
}
