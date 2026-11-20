// IPC 唯一出口（Electron preload 桥）：解包 { ok, data | error } 信封，
// 对上层暴露与 Tauri invoke 相同的形状——成功 resolve 数据、失败 reject 错误字符串，
// commands.js 契约层因此零改动。

const invoke = async (cmd, args) => {
  const res = await window.mfile.invoke(cmd, args);
  if (!res.ok) throw res.error;
  return res.data;
};

export { invoke };
