// preload 桥（对应 Multica 的 contextBridge preload）：
// 唯一暴露一个 invoke(cmd, args) 直通主进程 ipcMain.handle，
// 返回统一信封 { ok, data | error }，前端 bridge.js 解包。

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mfile', {
  invoke: (cmd, args) => ipcRenderer.invoke(cmd, args),
  // 自动更新进度事件（主进程转发）
  onUpdaterEvent: (channel, cb) => {
    const listener = (_e, args) => cb(args);
    ipcRenderer.on(`updater:${channel}`, listener);
    return () => ipcRenderer.removeListener(`updater:${channel}`, listener);
  },
});
