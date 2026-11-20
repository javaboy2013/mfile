// 压缩 / 解压：系统命令封装。
// 压缩统一 zip；解压按类型分发（unzip / bsdtar / gzip / bzip2 / xz / zstd /
// unrar / 7z），解压前统一做同名冲突 + 路径穿越检查。
// macOS 自带前六种工具；rar/7z/zstd 需用户自行安装（brew install unrar/p7zip/zstd），
// 缺失时给出安装提示。

const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr }));
      else resolve({ stdout, stderr });
    });
  });

/** 命令是否可用（PATH 查找） */
const hasTool = (cmd) => {
  const { status } = require('child_process').spawnSync('which', [cmd]);
  return status === 0;
};

// ---------- 压缩文件识别 ----------
// 复合格式（tar.gz 等）必须先于单扩展名匹配
const ARCHIVE_TYPES = [
  { re: /\.tar\.gz$/i, type: 'tar' },
  { re: /\.tgz$/i, type: 'tar' },
  { re: /\.tar\.bz2$/i, type: 'tar' },
  { re: /\.tar\.xz$/i, type: 'tar' },
  { re: /\.tar\.zst$/i, type: 'tar' },
  { re: /\.tar$/i, type: 'tar' },
  { re: /\.zip$/i, type: 'zip' },
  { re: /\.gz$/i, type: 'gz' },
  { re: /\.bz2$/i, type: 'bz2' },
  { re: /\.xz$/i, type: 'xz' },
  { re: /\.zst$/i, type: 'zst' },
  { re: /\.rar$/i, type: 'rar' },
  { re: /\.7z$/i, type: '7z' },
];

/** 识别压缩类型；非压缩文件返回 null。type 含义：tar=目录包（tar 系），
 *  zip=zip 包，gz/bz2/xz/zst=单文件流压缩，rar/7z=需第三方工具 */
function detectArchive(filename) {
  for (const { re, type } of ARCHIVE_TYPES) {
    if (re.test(filename)) return type;
  }
  return null;
}

// ---------- 解压安全检查 ----------
/** 对归档内文件清单做安全检查：拒绝绝对路径 / ../ 穿越，检查目标同名冲突 */
function checkEntryNames(names, destDir) {
  const clean = names.map((n) => n.split('/')[0]).filter((n) => n && n !== '.');
  if (names.some((n) => n.startsWith('/') || n.includes('../'))) {
    throw new Error('压缩包含不安全路径，拒绝解压');
  }
  for (const top of new Set(clean)) {
    if (fs.existsSync(path.join(destDir, top))) {
      throw new Error(`目标已存在: ${path.join(destDir, top)}`);
    }
  }
}

// ---------- 压缩 ----------
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

// ---------- 解压（按类型分发） ----------

/** 列出归档内容（zip 与 tar 系） */
async function listArchive(archivePath, type) {
  const cmd = type === 'zip' ? ['unzip', ['-Z1', archivePath]] : ['tar', ['-tf', archivePath]];
  const { stdout } = await run(...cmd);
  return stdout.split('\n').filter((l) => l.trim());
}

/** 解压归档包（zip/tar 系）到 destDir */
async function extractBundle(archivePath, destDir, type) {
  const names = await listArchive(archivePath, type);
  if (!names.length) throw new Error('压缩包内容为空');
  checkEntryNames(names, destDir);
  const args = type === 'zip' ? ['-q', '-o', archivePath, '-d', destDir] : ['-xf', archivePath, '-C', destDir];
  const cmd = type === 'zip' ? 'unzip' : 'tar';
  try {
    await run(cmd, args);
  } catch (e) {
    throw new Error(`解压失败: ${e.stderr || e.message}`);
  }
}

/** 解压单文件流压缩（gz/bz2/xz/zst）：x.txt.gz → destDir/x.txt */
async function extractStream(archivePath, destDir, type) {
  const tools = { gz: 'gzip', bz2: 'bzip2', xz: 'xz', zst: 'zstd' };
  const tool = tools[type];
  if (type === 'zst' && !hasTool('zstd')) {
    throw new Error('系统未安装 zstd，请先安装：brew install zstd');
  }
  // 解压结果名 = 去掉压缩后缀（.tar.gz 这类复合已在前面走了 tar 分支）
  const outName = archivePath.replace(/\.(gz|bz2|xz|zst)$/i, '');
  const base = path.basename(outName);
  if (!base || base === path.basename(archivePath)) throw new Error('无法确定解压目标文件名');
  const dest = path.join(destDir, base);
  if (fs.existsSync(dest)) throw new Error(`目标已存在: ${dest}`);
  // 流式解压写盘（tool -dc 输出管道到文件），避免大文件驻留内存
  await new Promise((resolve, reject) => {
    const child = spawn(tool, ['-dc', archivePath]);
    const out = fs.createWriteStream(dest);
    let errText = '';
    child.stderr.on('data', (d) => (errText += d.toString()));
    child.on('error', (e) => {
      out.destroy();
      fs.rmSync(dest, { force: true });
      reject(new Error(`解压失败: ${e.message}`));
    });
    out.on('error', (e) => {
      child.kill();
      fs.rmSync(dest, { force: true });
      reject(new Error(`解压失败: ${e.message}`));
    });
    child.on('close', (code) => {
      out.end();
      if (code === 0) resolve();
      else {
        fs.rmSync(dest, { force: true });
        reject(new Error(`解压失败: ${errText || '退出码 ' + code}`));
      }
    });
    child.stdout.pipe(out);
  });
}

/** 解压 rar/7z（需第三方工具，缺失给安装提示） */
async function extractThirdParty(archivePath, destDir, type) {
  if (type === 'rar') {
    if (!hasTool('unrar')) throw new Error('系统未安装 unrar，请先安装：brew install rar 或 unrar');
    // 列表 + 冲突检查（unrar lb 只列文件名）
    const { stdout } = await run('unrar', ['lb', archivePath]);
    const names = stdout.split('\n').filter((l) => l.trim());
    if (names.length) checkEntryNames(names.map((n) => n.replace(/\\/g, '/')), destDir);
    try {
      await run('unrar', ['x', '-o+', '-y', archivePath, destDir + '/']);
    } catch (e) {
      throw new Error(`解压失败: ${e.stderr || e.message}`);
    }
    return;
  }
  // 7z
  if (!hasTool('7z')) throw new Error('系统未安装 7z，请先安装：brew install p7zip');
  const { stdout } = await run('7z', ['l', '-ba', '-slt', archivePath]);
  const names = stdout
    .split(/\r?\n/)
    .filter((l) => l.startsWith('Path = '))
    .map((l) => l.slice(7).trim())
    .filter((p) => p && p !== archivePath);
  if (names.length) checkEntryNames(names, destDir);
  try {
    await run('7z', ['x', '-y', `-o${destDir}`, archivePath]);
  } catch (e) {
    throw new Error(`解压失败: ${e.stderr || e.message}`);
  }
}

/** 统一解压入口：自动识别类型并分发 */
async function extractHere(archivePath, destDir) {
  if (!fs.existsSync(archivePath)) throw new Error(`文件不存在: ${archivePath}`);
  if (!fs.statSync(destDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`不是目录: ${destDir}`);
  }
  const type = detectArchive(path.basename(archivePath));
  if (!type) throw new Error(`不是压缩文件: ${archivePath}`);
  if (type === 'zip' || type === 'tar') return extractBundle(archivePath, destDir, type);
  if (type === 'gz' || type === 'bz2' || type === 'xz' || type === 'zst') {
    return extractStream(archivePath, destDir, type);
  }
  return extractThirdParty(archivePath, destDir, type);
}

module.exports = { zipEntries, extractHere, detectArchive };
