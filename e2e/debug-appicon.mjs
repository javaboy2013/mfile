// 收集渲染层 console 诊断
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9342');
const ctx = browser.contexts()[0];
const win = ctx.pages()[0];
const logs = [];
win.on('console', (m) => { if (m.text().includes('[icon-dbg')) logs.push(m.text()); });
// 触发重渲染（filter 技巧）
await win.evaluate(() => {
  const input = document.querySelector('#filterInput');
  input.value = 'zz';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 2000));
console.log('console 诊断条数:', logs.length);
logs.slice(0, 4).forEach((l) => console.log(l));
await browser.close();
