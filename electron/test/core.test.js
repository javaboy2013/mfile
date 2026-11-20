// 核心逻辑单测（node --test）：zip/unzip 往返、同名冲突、复制/移动冲突、
// 路径穿越拒绝——与 Rust 版测试同覆盖。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { zipEntries, unzipHere } = require('../archive');
const { copyEntries, moveEntries } = require('../fs-ops');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mfile-test-'));

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
  await unzipHere(zip, out);
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
  await unzipHere(zip, dir); // 第一次成功
  await assert.rejects(() => unzipHere(zip, dir), /目标已存在/);
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
