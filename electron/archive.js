// 压缩解压：系统 zip/unzip 命令封装（与 Rust 版行为一致：
// 解压前查同名冲突、拒绝 ../ 路径穿越与绝对路径）。

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr }));
      else resolve({ stdout, stderr });
    });
  });

/** 压缩为 zip（items 须同一父目录，保留目录结构） */
async function zipEntries(items, destZip) {
  if (fs.existsSync(destZip)) throw new Error(`目标已存在: ${destZip}`);
  const parent = path.dirname(items[0] || '');
  const names = items.map((p) => path.basename(p));
  if (!names.length || names.some((n) => !n)) throw new Error('非法路径');
  try {
    await run('zip', ['-r', '-q', destZip, ...names], { cwd: parent });
  } catch (e) {
    fs.rmSync(destZip, { force: true }); // 失败清理半成品
    throw new Error(`zip 退出码: ${e.code ?? e.message}`);
  }
}

/** 解压 zip 到指定目录（覆盖前先检查同名冲突 + 路径安全） */
async function unzipHere(zipPath, destDir) {
  if (!/\.zip$/i.test(zipPath) || !fs.existsSync(zipPath)) {
    throw new Error(`不是 zip 文件: ${zipPath}`);
  }
  if (!fs.statSync(destDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`不是目录: ${destDir}`);
  }
  const { stdout } = await run('unzip', ['-Z1', zipPath]);
  const names = stdout.split('\n').filter((l) => l.trim());
  if (!names.length) throw new Error('zip 内容为空');
  // 安全检查：路径穿越（../）与绝对路径
  if (names.some((n) => n.startsWith('/') || n.includes('../'))) {
    throw new Error('zip 含不安全路径，拒绝解压');
  }
  for (const n of names) {
    const top = n.split('/')[0];
    if (top && fs.existsSync(path.join(destDir, top))) {
      throw new Error(`目标已存在: ${path.join(destDir, top)}`);
    }
  }
  try {
    await run('unzip', ['-q', '-o', zipPath, '-d', destDir]);
  } catch (e) {
    throw new Error(`解压失败: ${e.stderr || e.message}`);
  }
}

module.exports = { zipEntries, unzipHere };
