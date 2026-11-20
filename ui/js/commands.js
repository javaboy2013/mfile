// IPC 契约层：后端命令的集中封装（对应 Multica 的 preload 桥）。
// 命令名 / 参数名（后端 snake_case 自动映射 camelCase）在此一处维护，防止裸字符串散落。

import { invoke } from './tauri.js';

/** 列目录：返回 { entries: FileEntry[], parent: string|null } */
export const listDir = (path, showHidden) => invoke('list_dir', { path, showHidden });

/** 主目录路径 */
export const homeDir = () => invoke('home_dir');

export const createDir = (path) => invoke('create_dir', { path });
export const createFile = (path) => invoke('create_file', { path });
export const rename = (from, to) => invoke('rename', { from, to });
export const moveEntries = (items, dest) => invoke('move_entries', { items, dest });
export const copyEntries = (items, dest) => invoke('copy_entries', { items, dest });

/** 移入废纸篓（~/.Trash） */
export const trashEntries = (items) => invoke('trash_entries', { items });

/** 清空废纸篓 */
export const emptyTrash = () => invoke('empty_trash');

export const zipEntries = (items, destZip) => invoke('zip_entries', { items, destZip });

/** 解压压缩文件（zip/tar/gz/tgz/bz2/xz/7z/rar，主进程按类型分发）。
 * mode：'check' 探测（冲突返回 {conflict}）| 'rename' 冲突项改名（x → x 2）| 'overwrite' 覆盖 */
export const extractHere = (archivePath, destDir, mode = 'check') =>
  invoke('extract_here', { archivePath, destDir, mode });

/** 递归计算目录大小（字节） */
export const dirSize = (path) => invoke('dir_size', { path });

/** 深度搜索：返回 SearchHit[]（后端 10s 超时 / maxResults 上限） */
export const searchFiles = (root, query, maxResults) =>
  invoke('search_files', { root, query, maxResults });

/** 用系统 open 打开文件/目录 */
export const openPath = (path) => invoke('open_path', { path });

/** 在 Terminal.app 打开目录 */
export const openInTerminal = (path) => invoke('open_in_terminal', { path });

export const exists = (path) => invoke('exists', { path });

/** 读取进程环境变量（自动化验证用：MFILE_START_DIR 等） */
export const getEnv = (key) => invoke('get_env', { key });

/** 撤掉原生启动画面，返回原生动画已播放秒数（前端续播相位用） */
export const splashReady = () => invoke('splash_ready');

/** 测试错误通道（⌘E）：返回长错误信息验证复制 */
export const testError = () => invoke('test_error');

/** 应用版本号（Cargo 包版本） */
export const appVersion = () => invoke('app_version');
