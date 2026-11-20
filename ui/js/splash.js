// 启动画面：窗口 ready-to-show 后才显示（主进程已保证），HTML #splash 即首帧内容。
// 此处只负责：最短展示时长（避免一闪而过）+ 数据就绪后淡出 + 兜底放行。
// （Electron 架构下无原生层/相位续播——Chromium 随进程启动，无 WKWebView 冷启动问题）

import { $ } from './utils.js';

const SPLASH_MIN_MS = 1200; // 最短展示，保证动画可感知
let splashHidden = false;
let splashTimer = null;
let splashHideScheduled = false;

export function hideSplash(delay = 0) {
  const sp = $('splash');
  if (!sp) return;
  const doHide = () => {
    splashTimer = null;
    splashHideScheduled = false;
    if (splashHidden) return;
    splashHidden = true;
    sp.style.pointerEvents = 'none'; // 淡出动画期间即停止拦截鼠标
    sp.style.opacity = '0';
    sp.addEventListener('transitionend', () => (sp.style.display = 'none'), { once: true });
    setTimeout(() => (sp.style.display = 'none'), 300);
  };
  if (delay > 0) {
    if (splashTimer) clearTimeout(splashTimer);
    splashHideScheduled = true;
    splashTimer = setTimeout(doHide, delay);
  } else {
    doHide();
  }
}

// 兜底：仅在尚未安排隐藏时，4s 后强制放行，避免卡在启动页
setTimeout(() => {
  if (!splashHideScheduled && !splashHidden) hideSplash(0);
}, 4000);
