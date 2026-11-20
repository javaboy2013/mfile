// 调试 v5：附加到已运行的实例（脚本内只 connect，不 spawn）
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
console.log('attached');
const ctx = browser.contexts()[0];
const win = ctx.pages()[0];
await win.waitForSelector('#fileList .row', { timeout: 15000 });

await win.click('.side-item:has-text("应用程序")');
await win.waitForSelector('#fileList .row', { timeout: 10000 });
await win.waitForTimeout(3000);

const info = await win.evaluate(() => {
  const rows = [...document.querySelectorAll('#fileList .row')];
  return {
    total: rows.length,
    withImg: rows.filter((r) => r.querySelector('.ico img')).length,
    firstIco: rows[0]?.querySelector('.ico').innerHTML.slice(0, 80),
  };
});
console.log('DOM:', JSON.stringify(info));
console.log('IPC:', await win.evaluate(async () => {
  const r = await window.mfile.invoke('app_icon', { path: '/Applications/Safari.app', size: 32 });
  return r.ok ? `ok len=${r.data.length}` : `err=${r.error}`;
}));
await browser.close();
