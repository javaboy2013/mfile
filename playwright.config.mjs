// Playwright for Electron 配置：E2E 直接驱动真实 app 进程
// （preload → IPC → 实现 → 渲染全链路），无需下载浏览器。
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  // 每用例独立临时目录（文件系统隔离）+ headless（不抢焦点），可并行
  workers: process.env.CI ? 1 : 3,
  reporter: [['list']],
});
