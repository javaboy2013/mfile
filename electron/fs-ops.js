// 文件系统操作（IPC 后端实现）。从 Tauri/Rust 版逐条翻译，行为保持一致：
// 复制/移动到已存在同名目标直接报错、list_dir 跟随符号链接判型、
// 目录置顶 + 名称不区分大小写排序。

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');
const { detectArchive } = require('./archive');

/** 应用真实图标：app.getFileIcon(path) → dataURL，带进程级缓存。
 *  供渲染层 .app 条目用 <img> 展示真实图标（size 32 足够列表 + 2x retina）。
 *  已知 Electron getFileIcon 对个别 icns（如哔哩哔哩）解析出全透明图——
 *  检测到透明图时回退：用 sips 直接从 app 的 icns 转 PNG，稳定可靠。 */
const iconCache = new Map();
async function appIcon(p, size = 32) {
  const key = `${p}|${size}`;
  if (iconCache.has(key)) return iconCache.get(key);
  // 延迟 require：本文件被单测直接加载（无 electron 环境）
  const { app } = require('electron');
  const icon = await app.getFileIcon(p, { size });
  let url = icon.toDataURL();
  if (await isBlankPng(icon.toPNG())) url = (await icnsFallback(p, size)) || url;
  iconCache.set(key, url);
  return url;
}

/** 粗判全透明 PNG：解压 IDAT 后抽样 alpha 通道，最大值 < 32 视为空白 */
async function isBlankPng(buf) {
  try {
    const zlib = require('zlib');
    let i = 8;
    const idat = [];
    while (i + 8 <= buf.length) {
      const ln = buf.readUInt32BE(i);
      if (buf.slice(i + 4, i + 8).toString('ascii') === 'IDAT') idat.push(buf.slice(i + 8, i + 8 + ln));
      i += 12 + ln;
    }
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const w = buf.readUInt32BE(16);
    const stride = w * 4 + 1; // RGBA + 行 filter 字节
    let maxA = 0;
    for (let row = 0; row < raw.length / stride; row += 4) {
      const line = raw.slice(row * stride + 1, (row + 1) * stride);
      for (let px = 0; px < w; px += 8) maxA = Math.max(maxA, line[px * 4 + 3] || 0);
    }
    return maxA < 32;
  } catch { return false; }
}

/** 回退：读 app 的 CFBundleIconFile 指向的 icns，sips 转 PNG → dataURL */
async function icnsFallback(p, size) {
  try {
    const { execFile } = require('child_process');
    const { promisify } = require('util');
    const exec = promisify(execFile);
    const { stdout } = await exec('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIconFile', path.join(p, 'Contents/Info.plist')]);
    const name = stdout.trim();
    const icnsPath = path.join(p, 'Contents/Resources', name.endsWith('.icns') ? name : `${name}.icns`);
    const tmp = `/tmp/mfile-icon-${process.pid}-${Math.random().toString(36).slice(2)}.png`;
    await exec('/usr/bin/sips', ['-s', 'format', 'png', '-Z', String(size * 2), icnsPath, '--out', tmp]);
    const buf = await fsp.readFile(tmp);
    fsp.unlink(tmp).catch(() => {});
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch { return null; }
}


/** 列目录：目录置顶、按名排序（不区分大小写），返回 { entries, parent } */
async function listDir(p, showHidden) {
  const stat = await fsp.stat(p).catch(() => null);
  if (!stat || !stat.isDirectory()) throw new Error(`不是目录: ${p}`);
  const names = await fsp.readdir(p);
  const entries = [];
  for (const name of names) {
    const isHidden = name.startsWith('.');
    if (isHidden && !showHidden) continue;
    const full = path.join(p, name);
    // statSync 跟随符号链接，指向目录的软链正确判型；损坏软链回退 lstat
    let meta;
    try {
      meta = await fsp.stat(full);
    } catch {
      meta = await fsp.lstat(full).catch(() => null);
    }
    const isDir = meta ? meta.isDirectory() : false;
    entries.push({
      name,
      path: full,
      is_dir: isDir,
      size: meta && !isDir ? meta.size : meta ? meta.size : null,
      modified: meta ? Math.floor(meta.mtimeMs / 1000) : null,
      is_hidden: isHidden,
      ext: path.extname(name).slice(1).toLowerCase() || null,
      is_archive: !isDir && !!detectArchive(name), // 压缩文件标记（右键解压入口）
    });
  }
  entries.sort((a, b) =>
    b.is_dir - a.is_dir || a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );
  return { entries, parent: path.dirname(p) === p ? null : path.dirname(p) };
}

async function createDir(p) {
  await fsp.mkdir(p, { recursive: true }).catch((e) => {
    throw new Error(`创建失败: ${e.message}`);
  });
}

async function createFile(p) {
  if (fs.existsSync(p)) throw new Error('文件已存在');
  const fh = await fsp.open(p, 'wx').catch((e) => {
    throw new Error(`创建失败: ${e.message}`);
  });
  await fh.close();
}

async function rename(from, to) {
  await fsp.rename(from, to).catch((e) => {
    throw new Error(`重命名失败: ${e.message}`);
  });
}

async function moveEntries(items, dest) {
  for (const from of items) {
    const to = path.join(dest, path.basename(from));
    if (fs.existsSync(to)) throw new Error(`目标已存在: ${to}`);
    await fsp.rename(from, to).catch((e) => {
      throw new Error(`移动失败 ${from}: ${e.message}`);
    });
  }
}

async function copyEntries(items, dest) {
  for (const from of items) {
    const to = path.join(dest, path.basename(from));
    if (fs.existsSync(to)) throw new Error(`目标已存在: ${to}`);
    await copyRecursive(from, to);
  }
}

async function copyRecursive(src, dst) {
  const stat = await fsp.stat(src).catch(() => null);
  if (!stat) throw new Error(`复制失败: 源不存在 ${src}`);
  if (stat.isDirectory()) {
    await fsp.mkdir(dst, { recursive: true });
    for (const name of await fsp.readdir(src)) {
      await copyRecursive(path.join(src, name), path.join(dst, name));
    }
  } else {
    await fsp.copyFile(src, dst).catch((e) => {
      throw new Error(`复制失败: ${e.message}`);
    });
  }
}

async function deleteEntries(items) {
  for (const p of items) {
    await fsp.rm(p, { recursive: true, force: false }).catch((e) => {
      throw new Error(`删除失败 ${p}: ${e.message}`);
    });
  }
}

async function dirSize(p) {
  let total = 0;
  const walk = async (dir) => {
    let names;
    try {
      names = await fsp.readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const full = path.join(dir, name);
      let meta;
      try {
        meta = await fsp.stat(full);
      } catch {
        continue;
      }
      if (meta.isDirectory()) await walk(full);
      else total += meta.size;
    }
  };
  const stat = await fsp.stat(p).catch(() => null);
  if (!stat) throw new Error(`路径不存在: ${p}`);
  if (stat.isDirectory()) await walk(p);
  else total = stat.size;
  return total;
}

/** 深度搜索：10s 超时 + 结果数上限，跳过隐藏文件 */
async function searchFiles(root, query, maxResults) {
  if (!query) return [];
  const q = query.toLowerCase();
  const hits = [];
  const deadline = Date.now() + 10_000;
  const stack = [root];
  while (stack.length) {
    if (hits.length >= maxResults || Date.now() > deadline) break;
    const dir = stack.pop();
    let names;
    try {
      names = await fsp.readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name.startsWith('.')) continue;
      const full = path.join(dir, name);
      let meta;
      try {
        meta = await fsp.stat(full);
      } catch {
        meta = null;
      }
      const isDir = meta ? meta.isDirectory() : false;
      if (name.toLowerCase().includes(q)) {
        hits.push({
          name,
          path: full,
          is_dir: isDir,
          size: meta && !isDir ? meta.size : null,
        });
        if (hits.length >= maxResults) break;
      }
      if (isDir) stack.push(full);
    }
  }
  return hits;
}

/** 用系统 open 命令打开（Electron shell.openPath 也可，此处保留原行为） */
function openPath(p) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(p)) return reject(new Error(`路径不存在: ${p}`));
    execFile('open', [p], (err) => (err ? reject(new Error(`open 退出码`)) : resolve()));
  });
}

/** 在 Terminal.app 打开目录 */
function openInTerminal(p) {
  return new Promise((resolve, reject) => {
    const stat = fs.statSync(p, { throwIfNoEntry: false });
    if (!stat || !stat.isDirectory()) return reject(new Error(`不是目录: ${p}`));
    execFile('open', ['-a', 'Terminal', p], (err) =>
      err ? reject(new Error('启动终端失败')) : resolve()
    );
  });
}

/** 测试错误通道：返回长错误信息验证复制 */
function testError() {
  throw new Error(
    `模拟错误：无法访问 ${process.env.HOME}/Library/Application Support/某目录/子目录/目标文件.txt —— Permission denied (os error 13)。当前时间: ${Math.floor(Date.now() / 1000)}`
  );
}

module.exports = {
  listDir,
  createDir,
  createFile,
  rename,
  moveEntries,
  copyEntries,
  deleteEntries,
  dirSize,
  searchFiles,
  openPath,
  openInTerminal,
  testError,
  appIcon,
};
