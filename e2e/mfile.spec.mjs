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
  // 状态栏计数：至少 1 个文件夹（docs）且文件数 ≥ 夹具样本
  await expect(win.locator('#sbItems')).toHaveText(/1 个文件夹，\d+ 个文件/);
  const rows = await win.locator('#fileList .row').count();
  expect(rows).toBeGreaterThanOrEqual(30);
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

// ---------- 多格式解压（二级菜单：压缩 ▸） ----------
async function openSubmenu(win, parentLabel) {
  await win.locator('.ctx-item.has-sub', { hasText: parentLabel }).hover();
}

test('右键解压 tar.gz：菜单出现、解压成功、内容正确', async ({ win, fixtureDir }) => {
  const row = win.locator('.row', { hasText: 'bundle.tar.gz' });
  await row.click({ button: 'right' });
  await openSubmenu(win, '压缩');
  const item = win.locator('.ctx-sub .ctx-item', { hasText: '解压到当前目录' });
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
  await openSubmenu(win, '压缩');
  await win.locator('.ctx-sub .ctx-item', { hasText: '解压到当前目录' }).click();
  await expect(win.locator('#toast')).toContainText('解压完成');
  expect(fs.readFileSync(path.join(fixtureDir, 'note.txt'), 'utf8')).toBe('gz-content');
});

test('解压冲突：重命名解压（x → x 2），原文件不动', async ({ win, fixtureDir }) => {
  const row = win.locator('.row', { hasText: 'note.txt.gz' });
  await row.click({ button: 'right' });
  await openSubmenu(win, '压缩');
  await win.locator('.ctx-sub .ctx-item', { hasText: '解压到当前目录' }).click();
  await expect(win.locator('#toast')).toContainText('解压完成');
  // 修改现有文件内容以区分「磁盘现状」与「包内快照」
  fs.writeFileSync(path.join(fixtureDir, 'note.txt'), 'DISK-CHANGED');
  // 再解压一次 → 冲突弹窗
  await row.click({ button: 'right' });
  await openSubmenu(win, '压缩');
  await win.locator('.ctx-sub .ctx-item', { hasText: '解压到当前目录' }).click();
  await expect(win.locator('.modal h3')).toHaveText('解压目标已存在');
  await win.locator('#modalRename').click();
  await expect(win.locator('#toast')).toContainText('note.txt → note 2.txt');
  expect(fs.readFileSync(path.join(fixtureDir, 'note.txt'), 'utf8')).toBe('DISK-CHANGED', '原文件不动');
  expect(fs.readFileSync(path.join(fixtureDir, 'note 2.txt'), 'utf8')).toBe('gz-content', '包内容到新名');
});

test('解压冲突：覆盖解压，包内容替换现有文件', async ({ win, fixtureDir }) => {
  const row = win.locator('.row', { hasText: 'note.txt.gz' });
  await row.click({ button: 'right' });
  await openSubmenu(win, '压缩');
  await win.locator('.ctx-sub .ctx-item', { hasText: '解压到当前目录' }).click();
  await expect(win.locator('#toast')).toContainText('解压完成');
  fs.writeFileSync(path.join(fixtureDir, 'note.txt'), 'DISK-CHANGED');
  await row.click({ button: 'right' });
  await openSubmenu(win, '压缩');
  await win.locator('.ctx-sub .ctx-item', { hasText: '解压到当前目录' }).click();
  await win.locator('#modalOverwrite').click();
  await expect(win.locator('#toast')).toContainText('解压完成');
  expect(fs.readFileSync(path.join(fixtureDir, 'note.txt'), 'utf8')).toBe('gz-content', '被包内容覆盖');
});

test('解压冲突：取消则什么都不做', async ({ win, fixtureDir }) => {
  const row = win.locator('.row', { hasText: 'note.txt.gz' });
  await row.click({ button: 'right' });
  await openSubmenu(win, '压缩');
  await win.locator('.ctx-sub .ctx-item', { hasText: '解压到当前目录' }).click();
  await expect(win.locator('#toast')).toContainText('解压完成');
  fs.writeFileSync(path.join(fixtureDir, 'note.txt'), 'DISK-CHANGED');
  await row.click({ button: 'right' });
  await openSubmenu(win, '压缩');
  await win.locator('.ctx-sub .ctx-item', { hasText: '解压到当前目录' }).click();
  await win.locator('#modalCancel').click();
  expect(fs.readFileSync(path.join(fixtureDir, 'note.txt'), 'utf8')).toBe('DISK-CHANGED', '取消无副作用');
  expect(fs.existsSync(path.join(fixtureDir, 'note 2.txt'))).toBe(false);
});

test('tar.gz 冲突重命名：目录按「名称 2」规则', async ({ win, fixtureDir }) => {
  const row = win.locator('.row', { hasText: 'bundle.tar.gz' });
  // 第一次：正常解出 payload/
  await row.click({ button: 'right' });
  await openSubmenu(win, '压缩');
  await win.locator('.ctx-sub .ctx-item', { hasText: '解压到当前目录' }).click();
  await expect(win.locator('#toast')).toContainText('解压完成');
  // 第二次：冲突弹窗 → 重命名
  await row.click({ button: 'right' });
  await openSubmenu(win, '压缩');
  await win.locator('.ctx-sub .ctx-item', { hasText: '解压到当前目录' }).click();
  await expect(win.locator('.modal h3')).toHaveText('解压目标已存在');
  await win.locator('#modalRename').click();
  await expect(win.locator('#toast')).toContainText('payload → payload 2');
  await expect
    .poll(() => fs.existsSync(path.join(fixtureDir, 'payload 2/inner.txt')))
    .toBe(true);
});

test('右键解压 zip', async ({ win, fixtureDir }) => {
  await win.locator('.row', { hasText: 'arch.zip' }).click({ button: 'right' });
  await openSubmenu(win, '压缩');
  await win.locator('.ctx-sub .ctx-item', { hasText: '解压到当前目录' }).click();
  await expect(win.locator('#toast')).toContainText('解压完成');
  expect(fs.readFileSync(path.join(fixtureDir, 'payload/inner.txt'), 'utf8')).toBe('tar-content');
});

test('非压缩文件无解压菜单项', async ({ win }) => {
  await win.locator('.row', { hasText: 'hello.txt' }).click({ button: 'right' });
  await openSubmenu(win, '压缩');
  await expect(win.locator('.ctx-sub .ctx-item', { hasText: '解压到当前目录' })).toBeHidden();
});

// ---------- 压缩 ----------
test('右键压缩为 zip', async ({ win, fixtureDir }) => {
  await win.locator('.row', { hasText: 'hello.txt' }).click({ button: 'right' });
  await openSubmenu(win, '压缩');
  await win.locator('.ctx-sub .ctx-item', { hasText: '压缩为 ZIP' }).click();
  await expect(win.locator('#toast')).toContainText('已压缩为 hello.txt.zip');
  await expect
    .poll(() => fs.existsSync(path.join(fixtureDir, 'hello.txt.zip')))
    .toBe(true);
});

// ---------- 文件类型图标 ----------
test('各类型文件配类型徽标图标', async ({ win }) => {
  // Office 系：底色徽标断言（docx 蓝 W / xlsx 绿 X / pptx 橙红 P）
  const iconOf = async (name) => {
    const html = await win
      .locator('.row', { hasText: name })
      .locator('.ico svg')
      .innerHTML();
    return html;
  };
  expect(await iconOf('报告.docx')).toContain('#2b579a');
  expect(await iconOf('表格.xlsx')).toContain('#217346');
  expect(await iconOf('演示.pptx')).toContain('#d24726');
  // 代码系：各语言底色
  expect(await iconOf('脚本.js')).toContain('#f0db4f');
  expect(await iconOf('服务.ts')).toContain('#3178c6');
  expect(await iconOf('爬虫.py')).toContain('#3776ab');
  expect(await iconOf('引擎.rs')).toContain('#ce422b');
  // 磁盘镜像：圆盘徽标
  expect(await iconOf('安装包.dmg')).toContain('circle');
  // 纯文本：白线文档图形
  expect(await iconOf('笔记.txt')).toContain('4a7ce0');
  // 媒体/文档保持
  expect(await iconOf('手册.pdf')).toContain('PDF');
});

// ---------- 右键菜单结构 ----------
test('右键菜单分组与二级菜单结构', async ({ win }) => {
  await win.locator('.row', { hasText: 'hello.txt' }).click({ button: 'right' });
  // 一级项（精确匹配，避免「打开」误中「在终端中打开」）
  for (const label of ['打开', '复制', '剪切', '粘贴', '在终端中打开', '重命名', '删除']) {
    await expect(win.locator(`#ctxMenu > .ctx-item[data-label="${label}"]`)).toBeVisible();
  }
  // 二级父项 + 分隔线存在
  for (const label of ['拷贝为', '压缩', '新建']) {
    await expect(win.locator(`#ctxMenu > .ctx-item.has-sub[data-label="${label}"]`)).toBeVisible();
  }
  await expect(win.locator('#ctxMenu > .ctx-sep').first()).toBeVisible();
  // 快捷键提示
  await expect(
    win.locator('#ctxMenu > .ctx-item[data-label="复制"] .ctx-hint')
  ).toHaveText('⌘C');
});

// ---------- 废纸篓 ----------
test('删除移入废纸篓（确认弹窗）', async ({ win, fixtureDir }) => {
  await win.locator('.row', { hasText: 'hello.txt' }).click({ button: 'right' });
  await win.locator('#ctxMenu > .ctx-item[data-label="删除"]').click();
  await expect(win.locator('.modal h3')).toHaveText('移到废纸篓');
  await win.locator('#modalOk').click();
  await expect(win.locator('#toast')).toContainText('已移到废纸篓');
  await expect
    .poll(() => fs.existsSync(path.join(fixtureDir, 'hello.txt')))
    .toBe(false);
});

// ---------- 鼠标框选多选 ----------
test('鼠标框选：拖动跨行批量选中', async ({ win }) => {
  const rows = win.locator('#fileList .row');
  const n = Math.min(await rows.count(), 4);
  const first = await rows.nth(0).boundingBox();
  const last = await rows.nth(n - 1).boundingBox();
  // 从第一行左侧拖到第 n 行右侧（拖动超阈值即转框选，起点在行上亦可）
  await win.mouse.move(first.x + 20, first.y + first.height / 2);
  await win.mouse.down();
  await win.mouse.move(last.x + (last.width - 20), last.y + last.height / 2, { steps: 10 });
  await win.mouse.up();
  await expect(win.locator('#sbSelected')).toHaveText(`已选 ${n} 项`);
  const selectedCount = await win.locator('#fileList .row.selected').count();
  expect(selectedCount).toBe(n);
});

test('框选后点击空白清空选择', async ({ win }) => {
  // 过滤到单行，便于点击行下方空白
  await win.fill('#filterInput', 'bundle');
  await expect(win.locator('#fileList .row')).toHaveCount(1);
  const row = win.locator('#fileList .row');
  await row.click();
  await expect(win.locator('#sbSelected')).toHaveText('已选 1 项');
  // 点击行下方空白区域
  const rb = await row.boundingBox();
  const list = win.locator('#fileList');
  const lb = await list.boundingBox();
  await win.mouse.click(lb.x + lb.width / 2, Math.min(rb.y + rb.height + 20, lb.y + lb.height - 5));
  await expect(win.locator('#sbSelected')).toHaveText('');
});

test('⌘ + 框选：累加到现有选择', async ({ win }) => {
  const rows = win.locator('#fileList .row');
  // 先选中第一行
  await rows.nth(0).click();
  await expect(win.locator('#sbSelected')).toHaveText('已选 1 项');
  // ⌘ 框选第三到四行
  const r3 = await rows.nth(2).boundingBox();
  const r4 = await rows.nth(3).boundingBox();
  await win.keyboard.down('Meta');
  await win.mouse.move(r3.x + 20, r3.y + r3.height / 2);
  await win.mouse.down();
  await win.mouse.move(r4.x + 40, r4.y + r4.height / 2, { steps: 8 });
  await win.mouse.up();
  await win.keyboard.up('Meta');
  await expect(win.locator('#sbSelected')).toHaveText('已选 3 项');
});

// ---------- 过滤与排序 ----------
test('即时过滤', async ({ win }) => {
  const total = await win.locator('#fileList .row').count();
  await win.fill('#filterInput', 'tar');
  await expect(win.locator('#fileList .row')).toHaveCount(1);
  await win.fill('#filterInput', '');
  await expect(win.locator('#fileList .row')).toHaveCount(total);
});

test('目录置顶排序', async ({ win }) => {
  const first = win.locator('#fileList .row .name').first();
  await expect(first).toHaveText(/docs|payload/); // 目录在最前
});

// ---------- 原生菜单 ----------
test('原生应用菜单：中文六大菜单与关键项就位', async ({ app }) => {
  const labels = await app.evaluate(({ Menu }) => {
    return Menu.getApplicationMenu().items.map((i) => i.label);
  });
  for (const label of ['mfile', '文件', '编辑', '显示', '前往', '窗口', '帮助']) {
    expect(labels, labels.join(',')).toContain(label);
  }
  // 文件菜单含关键动作项
  const fileItems = await app.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu().items.find((i) => i.label === '文件');
    return file.submenu.items.map((i) => i.label);
  });
  for (const label of ['新建文件夹', '压缩为 ZIP', '移到废纸篓']) {
    expect(fileItems, fileItems.join(',')).toContain(label);
  }
});

test('菜单动作 IPC 通路：主进程下发 → 渲染层执行', async ({ app, win }) => {
  // 主进程发「前往：主目录」动作 → 渲染层导航
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('menu:action', { action: 'go:home' });
  });
  await expect(win.locator('#statusText')).toHaveText(process.env.HOME ?? '', { timeout: 5_000 });
  // 菜单动作切主题
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('menu:action', { action: 'view:theme:sepia' });
  });
  await expect(win.locator('html')).toHaveAttribute('data-theme', 'sepia');
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
