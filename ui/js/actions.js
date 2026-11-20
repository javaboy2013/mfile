// 文件操作：新建 / 重命名 / 删除 / 压缩解压 / 剪贴板 / 复制路径 / 目录大小 / 终端。

import { state } from './state.js';
import { $, toast, fmtSize, esc, copyToClipboard } from './utils.js';
import {
  createDir, createFile, rename, moveEntries, copyEntries,
  trashEntries, emptyTrash, zipEntries, extractHere,
  dirSize, openInTerminal,
} from './commands.js';
import { refresh } from './nav.js';

export function selectedPaths() {
  return state.selected.size ? [...state.selected] : [];
}

// ---------- 弹窗 ----------
export function showPrompt(title, defaultValue, onOk, danger = false) {
  const root = $('modalRoot');
  root.innerHTML = `
    <div class="modal-mask">
      <div class="modal">
        <h3>${esc(title)}</h3>
        <input type="text" id="modalInput" value="${esc(defaultValue)}" />
        <div class="msg" id="modalMsg"></div>
        <div class="btns">
          <button class="btn" id="modalCancel">取消</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" id="modalOk">确定</button>
        </div>
      </div>
    </div>`;
  const input = $('modalInput');
  input.focus();
  input.select();
  const close = () => (root.innerHTML = '');
  $('modalCancel').onclick = close;
  $('modalOk').onclick = async () => {
    try {
      await onOk(input.value.trim());
      close();
    } catch (e) {
      $('modalMsg').textContent = String(e);
    }
  };
  input.onkeydown = (ev) => {
    if (ev.key === 'Enter') $('modalOk').click();
    if (ev.key === 'Escape') close();
  };
}

export function showConfirm(title, message, onOk) {
  const root = $('modalRoot');
  root.innerHTML = `
    <div class="modal-mask">
      <div class="modal">
        <h3>${esc(title)}</h3>
        <div style="color:var(--text-dim);font-size:12px;margin-bottom:14px" class="modal-body">${esc(message)}</div>
        <div class="btns">
          <button class="btn" id="modalCancel">取消</button>
          <button class="btn danger" id="modalOk">删除</button>
        </div>
      </div>
    </div>`;
  const close = () => (root.innerHTML = '');
  $('modalCancel').onclick = close;
  $('modalOk').onclick = async () => {
    try {
      await onOk();
      close();
    } catch (e) {
      close();
      toast(String(e), true);
    }
  };
}

// ---------- 新建 / 重命名 / 删除 ----------
export function newFolder() {
  showPrompt('新建文件夹', '未命名文件夹', async (name) => {
    if (!name) throw '名称不能为空';
    await createDir(`${state.cwd}/${name}`);
    await refresh();
    toast('文件夹已创建');
  });
}

export function newFile() {
  showPrompt('新建文件', '未命名.txt', async (name) => {
    if (!name) throw '名称不能为空';
    await createFile(`${state.cwd}/${name}`);
    await refresh();
    toast('文件已创建');
  });
}

export function renameEntry() {
  const paths = selectedPaths();
  if (paths.length !== 1) return toast('请选择一个项目', true);
  const oldName = paths[0].split('/').pop();
  showPrompt('重命名', oldName, async (name) => {
    if (!name) throw '名称不能为空';
    if (name === oldName) return;
    await rename(paths[0], `${state.cwd}/${name}`);
    await refresh();
    toast('已重命名');
  });
}

export function deleteSelected() {
  const paths = selectedPaths();
  if (!paths.length) return toast('请先选择项目', true);
  const dirs = paths.filter((p) => {
    const e = state.entries.find((x) => x.path === p);
    return e && e.is_dir;
  });
  let msg;
  if (paths.length === 1) {
    const name = paths[0].split('/').pop();
    msg = dirs.length ? `文件夹「${name}」及其全部内容将移到废纸篓` : `文件「${name}」将移到废纸篓`;
  } else {
    msg = `将 ${paths.length} 个项目移到废纸篓${dirs.length ? `（含 ${dirs.length} 个文件夹及其内容）` : ''}`;
  }
  showConfirm('移到废纸篓', msg, async () => {
    await trashEntries(paths);
    await refresh();
    toast(`已移到废纸篓 ${paths.length} 项`);
  });
}

// ---------- 压缩 / 解压 ----------
export async function zipSelected() {
  const paths = selectedPaths();
  if (!paths.length) return toast('请先选择项目', true);
  // 压缩包名：单选取主名，多选取父目录名+"归档"
  let zipName;
  if (paths.length === 1) {
    const n = paths[0].split('/').pop();
    zipName = n.replace(/\.zip$/i, '') + '.zip';
  } else {
    zipName = '归档.zip';
  }
  const destZip = `${state.cwd}/${zipName}`;
  try {
    await zipEntries(paths, destZip);
    await refresh();
    toast(`已压缩为 ${zipName}`);
  } catch (e) {
    toast(String(e), true);
  }
}

/** 解压压缩文件到当前目录（zip/tar/gz/tgz/bz2/xz/7z/rar）。
 * 目标同名冲突时弹窗三选一：取消 / 重命名解压（x → x 2）/ 覆盖 */
export async function extractToHere(archivePath) {
  try {
    let res = await extractHere(archivePath, state.cwd);
    if (res && res.conflict) {
      const choice = await showExtractConflict(res.conflict);
      if (!choice) return; // 取消
      res = await extractHere(archivePath, state.cwd, choice);
    }
    await refresh();
    if (res && res.renamed && Object.keys(res.renamed).length) {
      const pairs = Object.entries(res.renamed).slice(0, 3).map(([a, b]) => `${a} → ${b}`);
      toast(`解压完成（${pairs.join('、')}${Object.keys(res.renamed).length > 3 ? ' 等' : ''}）`);
    } else {
      toast('解压完成');
    }
  } catch (e) {
    toast(String(e), true);
  }
}

/** 冲突三选一弹窗：resolve 'rename' | 'overwrite' | null（取消） */
export function showExtractConflict(conflicts) {
  const shown = conflicts.slice(0, 5).map(esc).join('、');
  const more = conflicts.length > 5 ? ` 等 ${conflicts.length} 项` : '';
  const root = $('modalRoot');
  root.innerHTML = `
    <div class="modal-mask">
      <div class="modal">
        <h3>解压目标已存在</h3>
        <div style="color:var(--text-dim);font-size:12px;margin-bottom:8px">当前目录已有同名项：<b style="color:var(--text)">${shown}${more}</b></div>
        <div style="color:var(--text-dim);font-size:11px;margin-bottom:14px">重命名解压：保留现有文件，新内容按「名称 2」规则命名<br>覆盖：用压缩包内容替换现有同名文件（目录内容合并）</div>
        <div class="btns">
          <button class="btn" id="modalCancel">取消</button>
          <button class="btn" id="modalRename">重命名解压</button>
          <button class="btn danger" id="modalOverwrite">覆盖</button>
        </div>
      </div>
    </div>`;
  const close = () => (root.innerHTML = '');
  return new Promise((resolve) => {
    $('modalCancel').onclick = () => { close(); resolve(null); };
    $('modalRename').onclick = () => { close(); resolve('rename'); };
    $('modalOverwrite').onclick = () => { close(); resolve('overwrite'); };
    root.querySelector('.modal-mask').onkeydown = (ev) => {
      if (ev.key === 'Escape') { close(); resolve(null); }
    };
  });
}

// ---------- 废纸篓 ----------
export function emptyTrashConfirm() {
  showConfirm('清空废纸篓', '将永久删除废纸篓中的全部项目（不可恢复）', async () => {
    await emptyTrash();
    await refresh();
    toast('废纸篓已清空');
  });
}

// ---------- 复制路径 / 文件名 / 剪贴板 ----------
export async function copyPaths() {
  const paths = selectedPaths();
  if (!paths.length) return toast('请先选择项目', true);
  await copyToClipboard(
    paths.join('\n'),
    paths.length === 1 ? `已复制路径: ${paths[0]}` : `已复制 ${paths.length} 个路径`
  );
}

export async function copyNames() {
  const paths = selectedPaths();
  if (!paths.length) return toast('请先选择项目', true);
  const names = paths.map((p) => p.split('/').filter(Boolean).pop());
  await copyToClipboard(
    names.join('\n'),
    names.length === 1 ? `已复制文件名: ${names[0]}` : `已复制 ${names.length} 个文件名`
  );
}

export function copySelected() {
  const paths = selectedPaths();
  if (!paths.length) return toast('请先选择项目', true);
  state.clipboard = { mode: 'copy', items: paths };
  toast(`已复制 ${paths.length} 项`);
}

export function cutSelected() {
  const paths = selectedPaths();
  if (!paths.length) return toast('请先选择项目', true);
  state.clipboard = { mode: 'cut', items: paths };
  toast(`已剪切 ${paths.length} 项`);
}

export async function paste() {
  if (!state.clipboard) return toast('剪贴板为空', true);
  try {
    if (state.clipboard.mode === 'copy') {
      await copyEntries(state.clipboard.items, state.cwd);
    } else {
      await moveEntries(state.clipboard.items, state.cwd);
      state.clipboard = null;
    }
    await refresh();
    toast('已粘贴');
  } catch (e) {
    toast(String(e), true);
  }
}

// ---------- 其他 ----------
export async function calcDirSize() {
  const paths = selectedPaths();
  if (!paths.length) return toast('请先选择项目', true);
  toast('计算中…');
  let total = 0;
  for (const p of paths) {
    total += await dirSize(p);
  }
  $('sbSize').textContent = `选中大小: ${fmtSize(total)}`;
  toast(`总大小: ${fmtSize(total)}`);
}

export async function openTerminalHere() {
  // 优先当前选中文件夹；无选中则当前目录
  const paths = selectedPaths();
  let target = state.cwd;
  if (paths.length === 1) {
    const entry = state.entries.find((e) => e.path === paths[0]);
    if (entry && entry.is_dir) target = entry.path;
  }
  try {
    await openInTerminal(target);
    toast(`已在终端打开: ${target}`);
  } catch (e) {
    toast(String(e), true);
  }
}

export function toggleHidden() {
  state.showHidden = !state.showHidden;
  localStorage.setItem('showHidden', state.showHidden ? '1' : '0');
  $('btnHidden').classList.toggle('active', state.showHidden);
  refresh();
}
