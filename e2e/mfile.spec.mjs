// mfile 核心用户旅程 E2E：启动 / 导航 / 多格式解压（含冲突）/ 压缩 /
// 废纸篓 / 主题 / 排序。每个用例独立临时目录，程序化断言（无肉眼截图）。

import { test, expect, sh } from './helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

// ---------- 启动与首屏 ----------
test('启动：splash 淡出后主界面完整，列目录正确', async ({ app, win, fixtureDir }) => {
  // splash 已隐藏（display:none）
  await expect(win.locator('#splash')).toBeHidden();
  // 文件列表含夹具文件；隐藏目录（.staging 已删，无 . 开头项）
  await expect(win.locator('.row', { hasText: 'hello.txt' })).toBeVisible();
  await expect(win.locator('.row', { hasText: 'bundle.tar.gz' })).toBeVisible();
  await expect(win.locator('.row', { hasText: 'arch.zip' })).toBeVisible();
  // 状态栏计数：docs 目录 + 4 文件 = 1 文件夹 4 文件
  await expect(win.locator('#sbItems')).toHaveText(/1 个文件夹.*4 个文件/);
  void app;
});

// ---------- 导航 ----------
test('双击进入目录、上一级返回', async ({ win, fixtureDir }) => {
  const docsRow = win.locator('.row', { hasText: 'docs' });
  await docsRow.dblclick();
  await expect(win.locator('#statusText')).toHaveText(`${fixtureDir}/docs`);
  await expect(win.locator('.row', { hasText: 'deep.txt' })).toBeVisible();
  await win.click('#btnUp');
  await expect(win.locator('#statusText')).toHaveText(fixtureDir);
});

test('面包屑跳转任意层级', async ({ win, fixtureDir }) => {
  const docsRow = win.locator('.row', { hasText: 'docs' });
  await docsRow.dblclick();
  await expect(win.locator('#statusText')).toHaveText(`${fixtureDir}/docs`);
  // 点击面包屑第一段（/）之外：点 fixtureDir 名那一段回根
  await win.click('.crumb', { });
  // 点击最后一级 crumb（当前层）无跳转；点上一级段
  const crumbs = win.locator('.crumb');
  const n = await crumbs.count();
  await crumbs.nth(n - 2).click(); // 倒数第二段 = 父目录
  await expect(win.locator('#statusText')).not.toHaveText(`${fixtureDir}/docs`);
});

// ---------- 多格式解压 ----------
test('右键解压 tar.gz：菜单出现、解压成功、内容正确', async ({ win, fixtureDir }) => {
  const row = win.locator('.row', { hasText: 'bundle.tar.gz' });
  await row.click({ button: 'right' });
  const item = win.locator('.ctx-item', { hasText: '解压到当前目录' });
  await expect(item).toBeVisible();
  await item.click();
  await expect(win.locator('#toast')).toContainText('解压完成');
  // 文件系统断言：解出 payload/inner.txt
  const inner = path.join(fixtureDir, 'payload/inner.txt');
  await expect
    .poll(() => fs.existsSync(inner), { message: 'payload/inner.txt 应存在' })
    .toBe(true);
  expect(fs.readFileSync(inner, 'utf8')).toBe('tar-content');
  // 列表刷新出现 payload
  await expect(win.locator('.row', { hasText: 'payload' })).toBeVisible();
});

test('右键解压 gz：单文件流式解压去后缀', async ({ win, fixtureDir }) => {
  const row = win.locator('.row', { hasText: 'note.txt.gz' });
  await row.click({ button: 'right' });
  await win.locator('.ctx-item', { hasText: '解压到当前目录' }).click();
  await expect(win.locator('#toast')).toContainText('解压完成');
  expect(fs.readFileSync(path.join(fixtureDir, 'note.txt'), 'utf8')).toBe('gz-content');
});

test('解压同名冲突：报错且不覆盖', async ({ win, fixtureDir }) => {
  // 预制造冲突：先解压 note.txt.gz 成功，再解压一次
  const row = win.locator('.row', { hasText: 'note.txt.gz' });
  await row.click({ button: 'right' });
  await win.locator('.ctx-item', { hasText: '解压到当前目录' }).click();
  await expect(win.locator('#toast')).toContainText('解压完成');
  await row.click({ button: 'right' });
  await win.locator('.ctx-item', { hasText: '解压到当前目录' }).click();
  await expect(win.locator('#toast')).toContainText('目标已存在');
  expect(fs.readFileSync(path.join(fixtureDir, 'note.txt'), 'utf8')).toBe('gz-content');
});

test('右键解压 zip', async ({ win, fixtureDir }) => {
  await win.locator('.row', { hasText: 'arch.zip' }).click({ button: 'right' });
  await win.locator('.ctx-item', { hasText: '解压到当前目录' }).click();
  await expect(win.locator('#toast')).toContainText('解压完成');
  expect(fs.readFileSync(path.join(fixtureDir, 'payload/inner.txt'), 'utf8')).toBe('tar-content');
});

test('非压缩文件无解压菜单项', async ({ win }) => {
  await win.locator('.row', { hasText: 'hello.txt' }).click({ button: 'right' });
  await expect(win.locator('.ctx-item', { hasText: '解压到当前目录' })).toHaveCount(0);
});

// ---------- 压缩 ----------
test('右键压缩为 zip', async ({ win, fixtureDir }) => {
  await win.locator('.row', { hasText: 'hello.txt' }).click({ button: 'right' });
  await win.locator('.ctx-item', { hasText: '压缩为 ZIP' }).click();
  await expect(win.locator('#toast')).toContainText('已压缩为 hello.txt.zip');
  await expect
    .poll(() => fs.existsSync(path.join(fixtureDir, 'hello.txt.zip')))
    .toBe(true);
});

// ---------- 废纸篓 ----------
test('删除移入废纸篓（确认弹窗）', async ({ win, fixtureDir }) => {
  await win.locator('.row', { hasText: 'hello.txt' }).click({ button: 'right' });
  await win.locator('.ctx-item', { hasText: /^删除$/ }).click();
  await expect(win.locator('.modal h3')).toHaveText('移到废纸篓');
  await win.locator('#modalOk').click();
  await expect(win.locator('#toast')).toContainText('已移到废纸篓');
  await expect
    .poll(() => fs.existsSync(path.join(fixtureDir, 'hello.txt')))
    .toBe(false);
});

// ---------- 过滤与排序 ----------
test('即时过滤', async ({ win }) => {
  await win.fill('#filterInput', 'tar');
  await expect(win.locator('#fileList .row')).toHaveCount(1);
  await win.fill('#filterInput', '');
  await expect(win.locator('#fileList .row')).toHaveCount(5);
});

test('目录置顶排序', async ({ win }) => {
  const first = win.locator('#fileList .row .name').first();
  await expect(first).toHaveText(/docs|payload/); // 目录在最前
});

// ---------- 主题 ----------
test('主题切换持久化', async ({ win }) => {
  await win.click('#btnTheme');
  await win.locator('.ctx-item', { hasText: '浅色' }).click();
  await expect(win.locator('html')).toHaveAttribute('data-theme', 'light');
  // localStorage 持久化
  const saved = await win.evaluate(() => localStorage.getItem('theme'));
  expect(saved).toBe('light');
});
