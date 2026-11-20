// 入口：装配各模块（theme.js 加载即应用已存主题，早于首帧），init 拉起首屏数据。

import { state } from './js/state.js';
import { $ } from './js/utils.js';
import { homeDir, getEnv } from './js/commands.js';
import { loadDir } from './js/nav.js';
import { bindThemeMenu } from './js/theme.js';
import { bindEvents } from './js/events.js';
import { hideSplash } from './js/splash.js';
import { bindUpdaterMenu, autoCheck } from './js/updater.js';

bindEvents();
bindThemeMenu();
bindUpdaterMenu();
autoCheck();

(async function init() {
  state.home = await homeDir();
  $('btnHidden').classList.toggle('active', state.showHidden);
  // 支持 MFILE_START_DIR 环境变量指定启动目录（用于自动化验证）
  const startDir = await getEnv('MFILE_START_DIR');
  await loadDir(startDir && startDir.length > 0 ? startDir : state.home);
  // 开发自测：MFILE_SPLASH_TEST 指定 Splash 展示时长（毫秒），便于截图验证
  const splashTest = await getEnv('MFILE_SPLASH_TEST').catch(() => '');
  const testDelay = parseInt(splashTest, 10);
  // 数据就绪后淡出，但保证最短展示 1200ms（避免一闪而过）
  hideSplash(testDelay > 0 ? testDelay : 1200);
})();
