// mfile 主进程（Electron）。
// 启动策略（参考 Multica）：窗口 show:false 创建，页面 ready-to-show 后才显示——
// 用户看到窗口的第一帧就是完整页面，无白屏/闪屏；Chromium 随进程启动，
// 无系统 WebView 冷启动问题。HTML #splash 覆盖层作为窗口首帧的加载动画。

const { app, BrowserWindow, shell, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const fsOps = require('./fs-ops');
const { zipEntries, extractHere } = require('./archive');
const { trashDir, emptyTrash } = require('./trash');
const { installAppMenu } = require('./menu');

// 远程桌面（HDPViewer/虚拟显卡）环境下 GPU 合成器可能不光栅化 <img> 位图
// （SVG 正常、位图空白），且 GPU 进程易反复崩溃。禁用 GPU 合成走软件路径，
// 界面流畅度在本类环境无感知差异，稳定性与位图渲染显著提升。
app.commandLine.appendSwitch('disable-gpu-compositing');

// ---------- 主题偏好（窗口底色与前端主题一致，双保险） ----------
const prefsPath = () => path.join(app.getPath('userData'), 'prefs.json');

function readThemeDark() {
  try {
    const v = JSON.parse(fs.readFileSync(prefsPath(), 'utf8'));
    return v.themeBase !== 'light';
  } catch {
    return nativeTheme.shouldUseDarkColors; // 首启无偏好：跟随系统
  }
}

// ---------- 主窗口 ----------
// MFILE_HEADLESS=1：窗口不显示（E2E 后台跑，不抢前台焦点）；渲染/DOM 照常工作
const HEADLESS = !!process.env.MFILE_HEADLESS;

function createWindow() {
  const dark = readThemeDark();
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 720,
    minHeight: 480,
    center: true,
    show: false, // 关键：ready-to-show 后才显示（参考 Multica）
    backgroundColor: dark ? '#1e1e20' : '#f5f5f7',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 10 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.on('ready-to-show', () => {
    if (!HEADLESS) win.show();
  });
  // 外部链接走系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadFile(path.join(__dirname, '..', 'ui', 'index.html'));
  return win;
}

// ---------- IPC（与前端 commands.js 契约一一对应） ----------
function registerIpc() {
  const h = (cmd, fn) =>
    ipcMain.handle(cmd, async (_e, a = {}) => {
      try {
        return { ok: true, data: await fn(a) };
      } catch (err) {
        return { ok: false, error: String(err.message ?? err) };
      }
    });

  // ---------- 我的电脑磁盘（D/E/F 盘）：用户目录下固定文件夹，带删除保护 ----------
  const DRIVE_DIRS = ['D盘', 'E盘', 'F盘'];
  const drivePaths = () => DRIVE_DIRS.map((n) => path.join(app.getPath('home'), n));
  // 首次启动确保三个磁盘文件夹存在（存在则跳过）
  for (const d of drivePaths()) {
    try { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); } catch {}
  }
  // 删除保护：拒绝移入废纸篓/删除/改名/移动磁盘文件夹本体
  const protectedPaths = () => new Set(drivePaths());
  const guardDrives = (items = []) => {
    const hits = items.filter((p) => protectedPaths().has(p));
    if (hits.length) throw new Error(`「我的电脑」磁盘文件夹受保护，不可删除或移动: ${hits.map((p) => path.basename(p)).join('、')}`);
  };

  h('list_dir', (a) => fsOps.listDir(a.path, a.showHidden));
  h('home_dir', () => app.getPath('home'));
  h('create_dir', (a) => fsOps.createDir(a.path));
  h('create_file', (a) => fsOps.createFile(a.path));
  h('rename', (a) => {
    if (protectedPaths().has(a.from)) throw new Error('「我的电脑」磁盘文件夹受保护，不可重命名');
    return fsOps.rename(a.from, a.to);
  });
  h('move_entries', (a) => {
    guardDrives(a.items);
    return fsOps.moveEntries(a.items, a.dest);
  });
  h('copy_entries', (a) => fsOps.copyEntries(a.items, a.dest));
  h('delete_entries', (a) => {
    guardDrives(a.items);
    return fsOps.deleteEntries(a.items);
  });
  h('trash_entries', async (a) => {
    guardDrives(a.items);
    // Electron 38 仅单文件 trashItem（复数 trashItems 为更高版本 API）
    for (const p of a.items) await shell.trashItem(p);
  });
  h('trash_dir', () => trashDir());
  h('empty_trash', () => emptyTrash());
  h('zip_entries', (a) => zipEntries(a.items, a.destZip));
  h('extract_here', (a) => extractHere(a.archivePath, a.destDir, a.mode || 'check'));
  h('dir_size', (a) => fsOps.dirSize(a.path));
  h('search_files', (a) => fsOps.searchFiles(a.root, a.query, a.maxResults));
  h('open_path', (a) => fsOps.openPath(a.path));
  h('app_icon', (a) => fsOps.appIcon(a.path, a.size || 32));
  h('open_in_terminal', (a) => fsOps.openInTerminal(a.path));
  h('exists', (a) => fs.existsSync(a.path));
  h('get_env', (a) => process.env[a.key] ?? null);
  h('test_error', () => fsOps.testError());
  h('app_version', () => app.getVersion());
  h('save_theme', (a) => {
    fs.mkdirSync(path.dirname(prefsPath()), { recursive: true });
    fs.writeFileSync(prefsPath(), JSON.stringify({ themeBase: a.base }));
  });
  h('updater_check', () => updaterCheck());
  h('updater_install', () => updaterInstall());
}

// ---------- 自动更新（electron-updater + GitHub Releases latest-mac.yml） ----------
let autoUpdater = null;
function initUpdater(win) {
  try {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.logger = console;
    autoUpdater.autoDownload = false; // 用户确认后再下载
    autoUpdater.autoInstallOnAppQuit = true;
    const fwd = (channel) =>
      autoUpdater.on(channel, (...args) => win.webContents.send(`updater:${channel}`, args));
    fwd('checking-for-update');
    fwd('update-available');
    fwd('update-not-available');
    fwd('download-progress');
    fwd('update-downloaded');
    autoUpdater.on('error', (e) => win.webContents.send('updater:error', [String(e)]));
  } catch (e) {
    console.warn('[updater] init failed:', e.message); // dev 或缺配置时静默
  }
}

async function updaterCheck() {
  if (!autoUpdater) return null;
  const result = await autoUpdater.checkForUpdates();
  const info = result?.updateInfo;
  if (!info || info.version === app.getVersion()) return null;
  return { version: info.version, notes: info.releaseNotes || '' };
}

function updaterInstall() {
  if (!autoUpdater) throw new Error('更新器不可用');
  return autoUpdater.downloadUpdate().then(() => autoUpdater.quitAndInstall());
}

// ---------- 应用生命周期 ----------
app.whenReady().then(() => {
  const win = createWindow();
  installAppMenu(win); // 中文原生菜单（动作经 IPC 下发渲染层）
  initUpdater(win);
  registerIpc();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const w = createWindow();
      installAppMenu(w);
      initUpdater(w);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
