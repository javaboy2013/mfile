// 自动更新（Electron electron-updater，经 preload 桥）：
// ⟳ 手动检查 + 启动静默检查；确认后下载安装重启。

import { invoke } from './tauri.js';
import { $, esc } from './utils.js';
import { appVersion } from './commands.js';

export function bindUpdaterMenu() {
  $('btnUpdate').onclick = () => doCheck(true);
}

export function autoCheck() {
  setTimeout(() => doCheck(false), 3000);
}

async function doCheck(manual) {
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
  showUpdateModal(
    `发现新版本 v${update.version}`,
    update.notes ? `<div style="white-space:pre-wrap">${esc(String(update.notes))}</div>` : '',
    true
  );
}

function showUpdateModal(title, bodyHtml, canInstall) {
  const root = $('modalRoot');
  root.innerHTML = `
    <div class="modal-mask">
      <div class="modal">
        <h3>${esc(title)}</h3>
        <div style="color:var(--text-dim);font-size:12px;margin-bottom:14px;max-height:200px;overflow:auto">${bodyHtml || '&nbsp;'}</div>
        <div class="msg" id="modalMsg"></div>
        <div class="btns">
          <button class="btn" id="modalCancel">${canInstall ? '稍后再说' : '关闭'}</button>
          ${canInstall ? '<button class="btn primary" id="modalOk">下载并安装</button>' : ''}
        </div>
      </div>
    </div>`;
  const close = () => (root.innerHTML = '');
  $('modalCancel').onclick = close;
  if (!canInstall) return;
  $('modalOk').onclick = async () => {
    const btn = $('modalOk');
    btn.disabled = true;
    btn.textContent = '下载中…';
    try {
      // 主进程下载完成即 quitAndInstall（应用会自动重启）
      await invoke('updater_install');
    } catch (e) {
      btn.disabled = false;
      btn.textContent = '下载并安装';
      $('modalMsg').textContent = String(e);
    }
  };
}
