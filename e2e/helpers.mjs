// E2E 公共设施：临时目录夹具（每个用例独立目录 + 预置文件）+ app 启动。

import { test as base, _electron, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';

export const sh = (cmd, args, opts = {}) =>
  new Promise((res, rej) =>
    execFile(cmd, args, opts, (e, stdout, stderr) => (e ? rej(Object.assign(e, { stderr })) : res(stdout)))
  );

/** 预置夹具：普通文件/目录 + tar.gz + gz + zip */
export async function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mfile-e2e-'));
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'hello.txt'), 'hello mfile');
  fs.writeFileSync(path.join(dir, 'docs/deep.txt'), 'deep');
  // tar.gz（含顶层目录 payload/）
  fs.mkdirSync(path.join(dir, '.staging/payload'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.staging/payload/inner.txt'), 'tar-content');
  await sh('tar', ['-czf', 'bundle.tar.gz', 'payload'], { cwd: path.join(dir, '.staging') });
  // gz 单文件
  fs.writeFileSync(path.join(dir, '.staging/note.txt'), 'gz-content');
  await sh('gzip', ['-kf', 'note.txt'], { cwd: path.join(dir, '.staging') });
  // zip
  await sh('zip', ['-q', '-r', 'arch.zip', 'payload'], { cwd: path.join(dir, '.staging') });
  fs.cpSync(path.join(dir, '.staging/bundle.tar.gz'), path.join(dir, 'bundle.tar.gz'));
  fs.cpSync(path.join(dir, '.staging/note.txt.gz'), path.join(dir, 'note.txt.gz'));
  fs.cpSync(path.join(dir, '.staging/arch.zip'), path.join(dir, 'arch.zip'));
  // 图标验证样本：各类型空文件（扩展名即类型）
  for (const name of [
    '报告.docx', '表格.xlsx', '演示.pptx', '草稿.pages', '数字.numbers', '幻灯.key',
    '说明.md', '配置.json', '脚本.js', '服务.ts', '爬虫.py', '引擎.rs', '后端.go',
    'Main.java', 'IOSwift.swift', '工具.sh', '页面.html', '样式.css', '字体.ttf',
    '安装包.dmg', '笔记.txt', '图片.png', '影片.mp4', '音乐.mp3', '手册.pdf',
  ]) {
    fs.writeFileSync(path.join(dir, name), '');
  }
  fs.rmSync(path.join(dir, '.staging'), { recursive: true });
  return dir;
}

/** 启动 app（指向给定启动目录），返回 { app, win }。
 * MFILE_HEADLESS=1：窗口不显示，后台跑测试不抢前台焦点 */
export async function launchApp(startDir) {
  const app = await _electron.launch({
    args: ['.'],
    env: { ...process.env, MFILE_START_DIR: startDir, MFILE_HEADLESS: '1' },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  // 等 init 首屏：状态栏出现路径文本（loadDir 完成）
  await expect(win.locator('#statusText')).toHaveText(startDir, { timeout: 10_000 });
  return { app, win };
}

// 组合夹具：独立临时目录 + 自动启动 + 用例后关闭清理
// app / win 均从同一 ctx 派生（_ctx 内部夹具）
export const test = base.extend({
  fixtureDir: async ({}, use) => {
    const dir = await makeFixture();
    await use(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  },
  _ctx: async ({ fixtureDir }, use) => {
    const ctx = await launchApp(fixtureDir);
    await use(ctx);
    await ctx.app.close();
  },
  app: async ({ _ctx }, use) => use(_ctx.app),
  win: async ({ _ctx }, use) => use(_ctx.win),
});

export { expect };
