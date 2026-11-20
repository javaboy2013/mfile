# mfile

macOS 文件管理器，访达（Finder）替代品。Electron（Multica 同款架构）+ 原生 HTML/JS 前端，无前端框架。安装包 ~110 MB（含 Chromium）。

> **架构沿革**：v0.1.x 基于 Tauri 2 + Rust（安装包 7 MB），因 WKWebView 架构下启动闪屏无法根治（详见下文「为什么弃用 Tauri」），v0.2.0 起完全切换 Electron。

## 功能

### 浏览与导航
- 面包屑路径栏（可点击任意层级跳转，支持手输路径）
- 侧栏快速访问（主目录 / 文档 / 下载 / 桌面等）
- 后退（⌘←）、上一级、双击进入目录 / 打开文件
- 显示 / 隐藏隐藏文件（设置持久化到 localStorage）
- **应用内自动更新**（⟳ 按钮 + 启动静默检查，GitHub Releases 通道）

### 文件操作
- 新建文件 / 文件夹、重命名（⌘D / F2）
- **删除移入废纸篓**（带确认弹窗），侧栏可浏览废纸篓、右键清空
- **压缩为 ZIP / 解压多格式**：右键压缩为 zip；右键解压支持 zip / tar / tar.gz / tgz / tar.bz2 / tar.xz / tar.zst / gz / bz2 / xz / zst / rar / 7z（解压前查同名冲突与路径穿越；rar/7z/zst 需 `brew install unrar / p7zip / zstd`，缺失时提示安装）
- 复制（⌘C）/ 剪切（⌘X）/ 粘贴（⌘V），目录递归复制
- 右键菜单分组 + 二级菜单（参考访达）：打开 / 剪贴板（复制⌘C·剪切⌘X·粘贴⌘V）/ 拷贝为 ▸（路径·文件名）/ 压缩 ▸（压缩为 ZIP·解压）/ 在终端中打开 / 重命名 F2 / 新建 ▸（文件夹·文件）/ 删除 ⌫，快捷键提示内联显示
- 复制路径 / 错误信息后按钮上显示"已复制"回执（toast + 按钮变色）

### 排序 / 过滤 / 搜索
- 排序：名称 / 大小 / 修改时间 / 类型，目录置顶
- 当前目录即时过滤 + 标签（tag）多关键词过滤
- 深度搜索（⌘F）：从当前目录递归搜文件名，最多 500 条结果、10 秒超时
- 目录大小：选中后计算（同步递归遍历，大目录会有耗时）

### 外观
- 6 套主题：dark（默认）/ light / sepia（羊皮纸）/ ocean（海洋）/ purple（暗紫）/ glass（毛玻璃）
- hiddenInset 标题栏（红绿灯内嵌），topbar 可拖动窗口

## 架构

```
mfile/
├── electron/                 # 主进程（Node）
│   ├── main.js               # 窗口（show:false + ready-to-show）+ IPC 注册 + electron-updater
│   ├── preload.js            # contextBridge 桥：window.mfile.invoke(cmd, args)
│   ├── fs-ops.js             # 文件操作实现（列目录/复制/移动/搜索/打开…）
│   ├── archive.js            # zip/unzip（系统命令，含路径穿越检查）
│   ├── trash.js              # 废纸篓定位/清空（移入走 shell.trashItems）
│   └── test/core.test.js     # node --test 单测（zip 往返/冲突/复制移动语义）
├── ui/                       # 渲染进程（原生 ES modules，无框架，file:// 直载）
│   ├── index.html            # 布局 + 全部 CSS（6 套主题）+ 内联 #splash 加载页
│   ├── app.js                # 入口：装配模块 + init 首屏
│   └── js/
│       ├── tauri.js          # IPC 唯一出口（解包 {ok,data|error} 信封；文件名系沿革）
│       ├── commands.js       # IPC 契约层：命令集中封装（与 ipcMain.handle 一一对应）
│       ├── state.js          # 全局状态单例
│       ├── utils.js          # 工具（$/esc/格式化/toast/SVG 图标）
│       ├── render.js         # 纯 DOM 渲染（无行为绑定，data-* 标记）
│       ├── nav.js            # 导航（loadDir/选择/路径编辑）
│       ├── actions.js        # 文件操作（新建/删除/压缩/剪贴板…）
│       ├── search.js         # 深度搜索面板（⌘F）
│       ├── theme.js          # 主题（明暗基调同步主进程 prefs.json）
│       ├── menu.js           # 右键菜单
│       ├── events.js         # 全部事件绑定（按钮直绑 + 容器事件委托）
│       ├── splash.js         # 加载页收尾（最短展示 + 数据就绪淡出 + 4s 兜底）
│       └── updater.js        # 自动更新（⟳ 手动 + 启动静默检查）
├── build/icon.icns           # 打包图标源
├── electron-builder.yml      # 打包配置（dmg + zip，GitHub Releases 发布）
└── package.json              # electron / electron-builder（dev）+ electron-updater（runtime）
```

**分层原则（Multica 同款）**：
- **IPC 契约层**（`commands.js` ↔ `ipcMain.handle` + `preload.js`）：命令名 / 参数 / 返回结构两侧集中定义，前端不裸写字符串调用
- **渲染与行为分离**：`render.js` 只产 DOM（`data-*` 标记），交互统一在 `events.js` 事件委托，模块依赖严格单向无循环
- **统一信封**：IPC 返回 `{ ok, data | error }`，`tauri.js` 解包为 resolve/reject，上层零感知

**数据流**：`state` → `commands.js` → preload → ipcMain → 实现（fs-ops 等）→ 返回 JSON → 重新渲染。

### 启动加载（参考 Multica，无闪屏）

```
main.js:  new BrowserWindow({ show:false, backgroundColor: 主题底色 })
          win.on('ready-to-show', () => win.show())
```

- Chromium 随应用进程启动（无系统 WebView 冷启动问题），窗口**显示的第一帧就是完整页面**（HTML #splash 加载动画已内联渲染）
- 窗口 `backgroundColor` 从 `~/Library/Application Support/mfile/prefs.json` 读主题明暗基调（首启跟随系统），与前端主题一致
- splash 由前端收尾：最短展示 1.2s（避免一闪而过）→ 数据就绪淡出；4s 兜底强制放行

### IPC 命令清单（`ipcMain.handle`）

| 命令 | 实现 | 说明 |
|---|---|---|
| `list_dir(path, showHidden)` | fs-ops | 列目录（目录置顶、按名排序、跟随符号链接判型） |
| `home_dir()` | main | 用户主目录 |
| `create_dir` / `create_file` / `rename` | fs-ops | 基础操作 |
| `move_entries` / `copy_entries` | fs-ops | 移动 / 递归复制（同名目标直接报错，不静默覆盖） |
| `delete_entries` | fs-ops | 递归删除 |
| `trash_entries` | shell.trashItems | **移入废纸篓**（Finder 同款行为） |
| `trash_dir` / `empty_trash` | trash | 废纸篓路径 / 清空 |
| `zip_entries` / `extract_here` | archive | 压缩为 zip / 多格式解压（zip·tar 系·gz 系·rar·7z，含 `is_archive` 识别、冲突与穿越检查） |
| `dir_size(path)` | fs-ops | 递归计算目录大小 |
| `search_files(root, query, maxResults)` | fs-ops | 深度搜索，10s 超时上限 |
| `open_path` / `open_in_terminal` | fs-ops | 系统 `open` / Terminal.app |
| `exists` / `get_env` / `test_error` | main/fs-ops | 工具（⌘E 测错误通道） |
| `app_version` / `save_theme` | main | 版本号 / 主题基调持久化 |
| `updater_check` / `updater_install` | main | electron-updater 封装 |

## 开发

```bash
npm install
npm start           # electron .（前端 file:// 直载，改前端需重启）
npm test            # 单元测试（node --test，毫秒级，IPC 实现层）
npm run test:e2e    # E2E（Playwright 驱动真实 app，后台无窗口弹跳）
npm run test:all    # 单测 + E2E 全量
npm run dist        # electron-builder 打 dmg + zip（dist/）
npm run deploy      # 打包 + 覆盖安装到 /Applications（交付验收用）
```

> 打包安装的完整流程、产物说明与踩坑见 [docs/打包安装指南.md](docs/打包安装指南.md)。

### 自测体系（分层）

> 完整的开发/测试/踩坑经验见 [docs/开发测试经验.md](docs/开发测试经验.md)——架构决策、Electron/Playwright 踩坑、测试体系设计与实证。

| 层 | 命令 | 覆盖 | 速度 |
|---|---|---|---|
| **单元**（`electron/test/`） | `npm test` | fs-ops/archive 纯逻辑：zip/tar.gz 往返、同名冲突、路径穿越、复制移动语义、压缩类型识别矩阵 | <1s |
| **E2E**（`e2e/`，Playwright for Electron） | `npm run test:e2e` | 真实 app 全链路（preload→IPC→实现→渲染）：启动首屏、导航/面包屑、右键多格式解压（含冲突）、压缩、废纸篓确认、即时过滤、目录置顶、主题持久化 | ~1.5min |

E2E 要点：
- **每个用例独立临时目录**（`e2e/helpers.mjs` 的 `makeFixture` 预置 tar.gz/gz/zip/普通文件），用完即清，互不干扰
- **`MFILE_HEADLESS=1` 后台运行**：窗口创建但不 `show()`（渲染/DOM 照常工作），不抢前台焦点，可边跑边干活；3 并行
- 断言**程序化**（DOM 状态 + 文件系统结果双重断言），替代人工截图肉眼判断
- **已经抓到过 2 个真 bug**：`shell.trashItems` API 版本不符（Electron 38 只有单数 `trashItem`）、即时过滤从未把输入写进 `state.filter`（功能自始就是坏的）——这类问题肉眼回归很难发现

新功能自测建议：先写单测覆盖主进程逻辑 → E2E 固化一条用户旅程（右键菜单存在 + 执行 + 文件系统断言 + toast 断言）→ 提交前 `npm run test:all`。

- Electron 二进制下载慢时：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install`
- 构建产物：`dist/mac-arm64/mfile.app`、`dist/mfile-0.2.0-arm64.dmg`
- 本地安装：`cp -R dist/mac-arm64/mfile.app /Applications/`
- 打包无签名警告（未配 Apple 开发者证书）属正常

## 自动更新

- 机制：electron-updater + GitHub Releases（`latest-mac.yml` 由 electron-builder 生成，指向 zip 产物）
- 发布：打 tag `v*` → GitHub Actions 自动 `electron-builder --mac --publish always` 挂 Release（含更新清单）
- 前端：⟳ 手动检查；启动 3s 静默检查；确认后下载 → `quitAndInstall` 自动重启
- dev 模式（未打包）自动跳过检查，⟳ 显示「已是最新版本」

## 为什么弃用 Tauri（v0.1.x 治闪屏史，血泪存档）

Tauri 用系统 WKWebView，本机（M 系列 macOS）存在**无法根治的启动闪屏**，尝试过：
1. 内联 HTML splash —— webview 首个页面加载 7~9s（WebContent 进程冷启动），期间窗口只能看到静态窗口底色
2. 原生 CALayer splash（`native_splash.rs`）+ HTML 层相位续播 —— 修掉 layer-hosting/CATextLayer 字体/深浅色三大 bug 后仍无法根治：三段内容（原生层/HTML splash/主界面）配色基准无法完全统一（原生层只能近似，系统外观≠应用主题），切换帧仍有可见闪变
3. WKWebView 附加坑：窗口被完全遮挡时渲染/rAF 全停但 JS 定时器继续（调试诡异）；`screencapture -l` 对 webview 返回陈旧帧（验证干扰）

Electron 用 ~100MB 体积换启动行为完全可预期（`show:false` + `ready-to-show` 三行方案即根治），且多窗口/后台进程能力更强。Tauri 版最终代码存档于 tag `v0.1.x`（git 历史 `feat: Tauri 版最终存档` 提交）。

## 修改图标

图标源 `build/icon.icns`。改完重新生成：

```bash
# 从 SVG 源生成（源文件在 git 历史 src-tauri/icons/app-icon.svg）
rsvg-convert -w 1024 -h 1024 app-icon.svg -o /tmp/icon.png
mkdir iconbuilder.iconset
for s in 16 32 64 128 256 512; do
  rsvg-convert -w $s -h $s /tmp/icon.png -o iconbuilder.iconset/icon_${s}x${s}.png
  rsvg-convert -w $((s*2)) -h $((s*2)) /tmp/icon.png -o iconbuilder.iconset/icon_${s}x${s}@2x.png
done
iconutil -c icns iconbuilder.iconset -o build/icon.icns
```
