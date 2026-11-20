// 原生应用菜单（中文，参考访达组织）。动作统一经 IPC 下发渲染层执行
// （menu:action 通道），主进程不持有 UI 状态。
// 带 accelerator 的快捷键由菜单接管（页面 keydown 不再收到，天然防双触发）。

const { Menu, app, shell } = require('electron');
const path = require('path');

const send = (win) => (action) => () => win.webContents.send('menu:action', { action });

const THEMES = [
  ['深色', 'dark'],
  ['浅色', 'light'],
  ['护眼', 'sepia'],
  ['海洋', 'ocean'],
  ['暗紫', 'purple'],
  ['毛玻璃', 'glass'],
];

const SORTS = [
  ['名称', 'name'],
  ['大小', 'size'],
  ['修改日期', 'date'],
  ['类型', 'type'],
];

function buildTemplate(win, act) {
  return [
    {
      label: 'mfile',
      submenu: [
        { label: '关于 mfile', role: 'about' },
        { label: '检查更新…', accelerator: 'CmdOrCtrl+U', click: act('app:checkUpdate') },
        { type: 'separator' },
        { label: '服务', role: 'services', submenu: [] },
        { type: 'separator' },
        { label: '隐藏 mfile', role: 'hide' },
        { label: '隐藏其他', role: 'hideOthers' },
        { label: '显示全部', role: 'unhide' },
        { type: 'separator' },
        { label: '退出 mfile', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
      ],
    },
    {
      label: '文件',
      submenu: [
        { label: '新建文件夹', accelerator: 'CmdOrCtrl+Shift+N', click: act('file:newFolder') },
        { label: '新建文件', accelerator: 'CmdOrCtrl+Alt+N', click: act('file:newFile') },
        { type: 'separator' },
        { label: '打开', accelerator: 'CmdOrCtrl+Down', click: act('file:open') },
        { label: '在终端中打开', click: act('file:openTerminal') },
        { type: 'separator' },
        { label: '压缩为 ZIP', click: act('file:zip') },
        { label: '解压到当前目录', click: act('file:extract') },
        { type: 'separator' },
        { label: '移到废纸篓', accelerator: 'CmdOrCtrl+Backspace', click: act('file:trash') },
        { label: '清空废纸篓', accelerator: 'CmdOrCtrl+Shift+Backspace', click: act('file:emptyTrash') },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '剪切', accelerator: 'CmdOrCtrl+X', click: act('edit:cut') },
        { label: '复制', accelerator: 'CmdOrCtrl+C', click: act('edit:copy') },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', click: act('edit:paste') },
        { label: '全选', accelerator: 'CmdOrCtrl+A', click: act('edit:selectAll') },
        { type: 'separator' },
        { label: '重命名', accelerator: 'F2', click: act('edit:rename') },
      ],
    },
    {
      label: '显示',
      submenu: [
        { label: '显示隐藏文件', accelerator: 'CmdOrCtrl+Shift+Dot', click: act('view:toggleHidden') },
        { type: 'separator' },
        {
          label: '排序方式',
          submenu: SORTS.map(([label, id]) => ({
            label,
            click: act(`view:sort:${id}`),
          })),
        },
        {
          label: '主题',
          submenu: THEMES.map(([label, id]) => ({
            label,
            click: act(`view:theme:${id}`),
          })),
        },
      ],
    },
    {
      label: '前往',
      submenu: [
        { label: '后退', accelerator: 'CmdOrCtrl+Left', click: act('go:back') },
        { label: '上一级', accelerator: 'CmdOrCtrl+Up', click: act('go:up') },
        { type: 'separator' },
        { label: '主目录', accelerator: 'CmdOrCtrl+Shift+H', click: act('go:home') },
        { label: '应用程序', accelerator: 'CmdOrCtrl+Shift+A', click: act('go:applications') },
        { label: '文稿', accelerator: 'CmdOrCtrl+Shift+O', click: act('go:documents') },
        { label: '下载', accelerator: 'CmdOrCtrl+Shift+L', click: act('go:downloads') },
        { label: '桌面', accelerator: 'CmdOrCtrl+Shift+D', click: act('go:desktop') },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '缩放', role: 'zoom' },
        { type: 'separator' },
        { label: '前置全部窗口', role: 'front' },
        { type: 'separator' },
        { label: '关闭窗口', accelerator: 'CmdOrCtrl+W', role: 'close' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: 'mfile 使用说明',
          click: () => {
            const doc = path.join(__dirname, '..', 'docs', '用户功能说明书.md');
            shell.openPath(doc).catch(() => shell.openExternal('https://github.com/javaboy2013/mfile'));
          },
        },
      ],
    },
  ];
}

function installAppMenu(win) {
  const act = send(win);
  const menu = Menu.buildFromTemplate(buildTemplate(win, act));
  Menu.setApplicationMenu(menu);

  // 原生「关于」面板信息
  app.setAboutPanelOptions({
    applicationName: 'mfile',
    applicationVersion: app.getVersion(),
    credits: 'macOS 文件管理器（Electron）',
    copyright: 'MIT License',
  });
}

module.exports = { installAppMenu };
