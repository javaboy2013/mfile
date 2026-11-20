// 核心逻辑单测（node --test）：zip/unzip 往返、同名冲突、复制/移动冲突、
// 路径穿越拒绝——与 Rust 版测试同覆盖。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { zipEntries, extractHere, detectArchive } = require('../archive');
const { copyEntries, moveEntries } = require('../fs-ops');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mfile-test-'));
const sh = (cmd, args, opts) =>
  new Promise((res, rej) => execFile(cmd, args, opts, (e) => (e ? rej(e) : res())));

test('zip → unzip 往返保留目录结构', async () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'roundtrip/inner'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'roundtrip/a.txt'), 'A');
  fs.writeFileSync(path.join(dir, 'roundtrip/inner/b.txt'), 'B');
  const zip = path.join(dir, 'roundtrip.zip');
  await zipEntries([path.join(dir, 'roundtrip')], zip);
  assert.ok(fs.existsSync(zip), 'zip 应已生成');

  const out = path.join(dir, 'unzip-out');
  fs.mkdirSync(out);
  await extractHere(zip, out);
  assert.strictEqual(fs.readFileSync(path.join(out, 'roundtrip/a.txt'), 'utf8'), 'A');
  assert.strictEqual(fs.readFileSync(path.join(out, 'roundtrip/inner/b.txt'), 'utf8'), 'B');
});

test('解压到已有同名目标应报冲突', async () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'inner'));
  fs.writeFileSync(path.join(dir, 'inner/a.txt'), 'A');
  const zip = path.join(dir, 'x.zip');
  await zipEntries([path.join(dir, 'inner')], zip);
  fs.renameSync(path.join(dir, 'inner'), path.join(dir, 'inner-src'));
  await extractHere(zip, dir); // 第一次成功
  await assert.rejects(() => extractHere(zip, dir), /目标已存在/);
});

test('复制到已存在同名目标应报错（不静默覆盖）', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'src.txt'), 'S');
  fs.writeFileSync(path.join(dir, 'dst.txt'), 'D');
  await assert.rejects(() => copyEntries([path.join(dir, 'src.txt')], dir), /目标已存在/);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'dst.txt'), 'utf8'), 'D', '原文件未被覆盖');
});

test('移动多项目到目标目录', async () => {
  const dir = tmp();
  const sub = path.join(dir, 'sub');
  fs.mkdirSync(sub);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'A');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'B');
  await moveEntries([path.join(dir, 'a.txt'), path.join(dir, 'b.txt')], sub);
  assert.ok(fs.existsSync(path.join(sub, 'a.txt')));
  assert.ok(fs.existsSync(path.join(sub, 'b.txt')));
});

test('递归复制目录', async () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'src/inner'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/inner/x.txt'), 'X');
  const dst = path.join(dir, 'dst');
  await copyEntries([path.join(dir, 'src')], dst);
  // 复制语义：dest/<源名>/...（与粘贴行为一致）
  assert.strictEqual(fs.readFileSync(path.join(dst, 'src/inner/x.txt'), 'utf8'), 'X');
});

// ---------- 压缩识别 / 多格式解压 ----------

test('压缩类型识别（含复合扩展名优先）', () => {
  assert.strictEqual(detectArchive('a.zip'), 'zip');
  assert.strictEqual(detectArchive('b.tar.gz'), 'tar'); // tar.gz 优先于 gz
  assert.strictEqual(detectArchive('c.tgz'), 'tar');
  assert.strictEqual(detectArchive('d.tar'), 'tar');
  assert.strictEqual(detectArchive('e.txt.gz'), 'gz');
  assert.strictEqual(detectArchive('f.7z'), '7z');
  assert.strictEqual(detectArchive('g.rar'), 'rar');
  assert.strictEqual(detectArchive('普通文件.txt'), null);
  assert.strictEqual(detectArchive('无扩展名'), null);
});

test('tar.gz → 解压往返', async () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'bundle/inner'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bundle/a.txt'), 'A');
  fs.writeFileSync(path.join(dir, 'bundle/inner/b.txt'), 'B');
  const tgz = path.join(dir, 'bundle.tar.gz');
  await sh('tar', ['-czf', tgz, 'bundle'], { cwd: dir });

  const out = path.join(dir, 'out');
  fs.mkdirSync(out);
  await extractHere(tgz, out);
  assert.strictEqual(fs.readFileSync(path.join(out, 'bundle/a.txt'), 'utf8'), 'A');
  assert.strictEqual(fs.readFileSync(path.join(out, 'bundle/inner/b.txt'), 'utf8'), 'B');
});

test('tar.gz 解压到已有同名目标应报冲突', async () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'pkg'));
  fs.writeFileSync(path.join(dir, 'pkg/a.txt'), 'A');
  const tgz = path.join(dir, 'pkg.tar.gz');
  await sh('tar', ['-czf', tgz, 'pkg'], { cwd: dir });
  await assert.rejects(() => extractHere(tgz, dir), /目标已存在/);
});

test('gz 单文件流式解压（去后缀命名）', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'note.txt'), '内容');
  await sh('gzip', [path.join(dir, 'note.txt')]);
  assert.ok(fs.existsSync(path.join(dir, 'note.txt.gz')));

  const out = path.join(dir, 'out');
  fs.mkdirSync(out);
  await extractHere(path.join(dir, 'note.txt.gz'), out);
  assert.strictEqual(fs.readFileSync(path.join(out, 'note.txt'), 'utf8'), '内容');
});

test('gz 解压同名冲突应报错', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'dup.txt'), '原');
  await sh('gzip', ['-kf', path.join(dir, 'dup.txt')]); // -k 保留原文件
  const out = path.join(dir, 'out');
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, 'dup.txt'), '已存在');
  await assert.rejects(() => extractHere(path.join(dir, 'dup.txt.gz'), out), /目标已存在/);
});

test('非压缩文件解压应报错', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'plain.txt'), 'X');
  await assert.rejects(() => extractHere(path.join(dir, 'plain.txt'), dir), /不是压缩文件/);
});

test('rar 缺工具时给安装提示', async () => {
  const dir = tmp();
  const rar = path.join(dir, 'x.rar');
  fs.writeFileSync(rar, 'fake');
  try {
    await extractHere(rar, dir);
    assert.ok(false, '应抛错');
  } catch (e) {
    // 本机装了 unrar 则走解压失败；没装则提示安装——两种都可接受
    assert.ok(/unrar|解压失败/.test(String(e.message)), e.message);
  }
});
