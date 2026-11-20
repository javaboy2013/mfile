// 废纸篓：定位 ~/.Trash、清空（移入用 Electron shell.trashItems，走 Finder 同款行为）。

const fs = require('fs');
const path = require('path');
const os = require('os');

const trashDir = () => path.join(os.homedir(), '.Trash');

/** 清空废纸篓（逐项删除，单项失败不中断整体，最后汇总报告）。
 *  已知坑：fs.rmSync(recursive) 对 ~/.Trash 下某些目录树会静默失败
 *  （返回成功但残留结构，ENOTDIR/ENOTEMPTY）——删后复查，残留走 /bin/rm -rf。 */
async function emptyTrash() {
  const dir = trashDir();
  if (!fs.existsSync(dir)) throw new Error('废纸篓不存在');
  const failed = [];
  for (const name of fs.readdirSync(dir)) {
    if (name === '.DS_Store') continue;
    const full = path.join(dir, name);
    try {
      fs.rmSync(full, { recursive: true, force: true });
      if (fs.existsSync(full)) {
        await new Promise((resolve) => {
          const { execFile } = require('child_process');
          execFile('/bin/rm', ['-rf', full], () => resolve());
        });
        if (fs.existsSync(full)) failed.push(`${name}: 系统删除也失败`);
      }
    } catch (e) {
      failed.push(`${name}: ${e.code || e.message}`);
    }
  }
  if (failed.length) throw new Error(`以下 ${failed.length} 项删除失败:\n${failed.join('\n')}`);
}

module.exports = { trashDir, emptyTrash };
