// 废纸篓：定位 ~/.Trash、清空（移入用 Electron shell.trashItems，走 Finder 同款行为）。

const fs = require('fs');
const path = require('path');
const os = require('os');

const trashDir = () => path.join(os.homedir(), '.Trash');

/** 清空废纸篓（逐项删除，报具体失败项） */
async function emptyTrash() {
  const dir = trashDir();
  if (!fs.existsSync(dir)) throw new Error('废纸篓不存在');
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    fs.rmSync(full, { recursive: true, force: true });
  }
}

module.exports = { trashDir, emptyTrash };
