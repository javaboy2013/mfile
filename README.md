# mfile

macOS 文件管理器，访达（Finder）替代品。基于 Tauri 2，Rust 后端 + 原生 HTML/JS 前端，无重量级前端框架，安装包约 7 MB。

## 功能

### 浏览与导航
- 面包屑路径栏（可点击任意层级跳转，支持手输路径）
- 侧栏快速访问（主目录 / 文档 / 下载 / 桌面等）
- 后退（⌘←）、上一级、双击进入目录 / 打开文件
- 显示 / 隐藏隐藏文件（设置持久化到 localStorage）
- **应用内自动更新**（⟳ 按钮 + 启动静默检查，GitHub Releases 签名通道）

### 文件操作
- 新建文件 / 文件夹、重命名（⌘D / F2）
- **删除移入废纸篓**（带确认弹窗），侧栏可浏览废纸篓、右键清空
- **压缩为 ZIP / 解压**（右键菜单，系统 zip/unzip，解压前查同名冲突与路径穿越）
- 复制（⌘C）/ 剪切（⌘X）/ 粘贴（⌘V），目录递归复制
- 右键菜单：打开、在终端中打开（Terminal.app）、复制路径 / 文件名、计算目录大小
- 复制路径 / 错误信息后按钮上显示"已复制"回执（toast + 按钮变色）

### 排序 / 过滤 / 搜索
- 排序：名称 / 大小 / 修改时间 / 类型，目录置顶
- 当前目录即时过滤 + 标签（tag）多关键词过滤
- 深度搜索（⌘F）：从当前目录递归搜文件名，最多 500 条结果、10 秒超时
- 目录大小：选中后计算（同步递归遍历，大目录会有耗时）

### 外观
- 6 套主题：dark（默认）/ light / sepia（羊皮纸）/ ocean（海洋）/ purple（暗紫）/ glass（毛玻璃）

## 架构

```
mfile/
├── ui/                      # 前端（原生 ES modules，无框架）
│   ├── index.html           # 布局 + 全部 CSS（含 6 套主题）+ 内联 #splash 覆盖层
│   ├── app.js               # 入口：装配模块 + init 首屏
│   └── js/
│       ├── tauri.js         # IPC 唯一出口（invoke 的唯一 import 点）
│       ├── commands.js      # IPC 契约层：后端命令集中封装（对应 Multica preload 桥）
│       ├── state.js         # 全局状态单例
│       ├── utils.js         # 工具（$/esc/格式化/toast/SVG 图标）
│       ├── render.js        # 纯 DOM 渲染（无行为绑定，data-* 标记）
│       ├── nav.js           # 导航（loadDir/选择/路径编辑）
│       ├── actions.js       # 文件操作（新建/删除/压缩/剪贴板…）
│       ├── search.js        # 深度搜索面板（⌘F）
│       ├── theme.js         # 6 套主题（模块加载即应用）
│       ├── menu.js          # 右键菜单
│       ├── events.js        # 全部事件绑定（按钮直绑 + 容器事件委托）
│       ├── splash.js        # 启动画面收尾（相位续播 + 最短展示 + 淡出）
│       └── updater.js       # 自动更新（⟳ 手动 + 启动静默检查）
├── src-tauri/
│   ├── src/lib.rs           # 应用装配：插件注册 + invoke_handler + 原生 splash 挂载
│   ├── src/model.rs         # IPC 契约数据结构（FileEntry / DirResult / SearchHit）
│   ├── src/fs_ops.rs        # 文件系统操作
│   ├── src/trash.rs         # 废纸篓
│   ├── src/archive.rs       # zip 压缩解压
│   ├── src/search.rs        # 深度搜索
│   ├── src/shell.rs         # open / 终端 / 错误通道
│   ├── src/native_splash.rs # 原生 CALayer 启动画面（macOS，窗口出现瞬间渲染）
│   ├── tauri.conf.json      # 窗口 / 打包 / updater 配置
│   ├── capabilities/default.json  # 插件权限（opener 全路径放行 / updater / process 重启）
│   └── icons/               # 图标集 + app-icon.svg 源文件
└── package.json             # tauri CLI + vite（dev）+ updater/process 插件 JS 绑定（runtime）
```

**分层原则（参考 Multica 架构，保留无框架轻量特性）**：
- **IPC 契约层**（`commands.js` ↔ `model.rs`）：命令名 / 参数 / 返回结构两侧集中定义，前端不裸写 `invoke('字符串')`
- **渲染与行为分离**：`render.js` 只产 DOM（`data-*` 标记），交互统一在 `events.js` 事件委托，模块依赖严格单向（commands → render → nav → actions → events），无循环
- **Rust 按领域分模块**，`lib.rs` 只做装配

**数据流**：前端 `state`（cwd / entries / selected / clipboard 等）→ `commands.js` → Rust command → 返回 JSON → 重新渲染。无路由、无状态库。

### Rust 命令清单（按模块，`lib.rs` 集中注册）

| 命令 | 模块 | 说明 |
|---|---|---|
| `splash_ready()` | lib | 前端首帧就绪后撤掉原生启动画面，返回原生动画已播放秒数（前端以负 `animation-delay` 续播相位，两段动画无缝衔接） |
| `app_version()` | lib | 应用版本（Cargo 包版本） |
| `list_dir(path, show_hidden)` | fs_ops | 列目录，返回 `FileEntry[]`（目录置顶、按名排序） |
| `home_dir()` | fs_ops | 取 `$HOME` |
| `create_dir` / `create_file` / `rename` | fs_ops | 基础操作 |
| `move_entries(items, dest)` | fs_ops | 移动（同盘 rename） |
| `copy_entries(items, dest)` | fs_ops | 递归复制 |
| `delete_entries(items)` | fs_ops | 删除（目录用 `remove_dir_all`，UI 已不再调用） |
| `dir_size(path)` | fs_ops | 递归计算目录大小 |
| `exists(path)` / `get_env(key)` | fs_ops | 工具函数 |
| `trash_entries(items)` | trash | **移入废纸篓**（trash crate → `~/.Trash`） |
| `trash_dir()` / `empty_trash()` | trash | 废纸篓路径 / 清空废纸篓 |
| `zip_entries(items, dest_zip)` | archive | 压缩为 zip（系统 zip 命令，递归保留结构） |
| `unzip_here(zip_path, dest_dir)` | archive | 解压（系统 unzip，先检查同名冲突 + 拒绝 `../` 路径穿越） |
| `search_files(root, query, max_results)` | search | 深度搜索，10s 超时上限 |
| `open_path(path)` | shell | 用系统 `open` 打开 |
| `open_in_terminal(path)` | shell | 在 Terminal.app 打开目录 |
| `test_error()` | shell | 测试用：返回长错误信息验证复制功能 |

## 自动更新

- 机制：`tauri-plugin-updater` + GitHub Releases `latest.json`（tauri-action CI 打 tag 自动生成并挂 Release），私钥签名的 `mfile.app.tar.gz`
- 前端：⟳ 按钮手动检查；启动 3s 后静默检查（有新版弹窗，展示 release notes，下载进度显示在按钮上，装完 `relaunch`）
- 签名密钥：`~/.tauri/mfile.key`（本地，**不入库**）；公钥已写进 `tauri.conf.json` 的 `plugins.updater.pubkey`
- **CI 需配 Secrets**（否则 Release 里的更新包无签名，客户端会拒绝）：
  - `TAURI_SIGNING_PRIVATE_KEY`：`~/.tauri/mfile.key` 文件内容
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：空字符串（本地生成密钥未设密码）
- 本地打带更新签名的包：`TAURI_SIGNING_PRIVATE_KEY=~/.tauri/mfile.key TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" npm run build`

### 已知设计决策 / 踩坑记录
- `FileEntry` 字段保持 **snake_case**（不加 `#[serde(rename_all="camelCase")]`），前端直接读 `e.is_dir`——一旦加 camelCase 前端会读到 `undefined` 导致双击目录误走 `open_path`。
- `list_dir` 用 `fs::metadata()`（**跟随符号链接**）判断类型，损坏软链接回退 `DirEntry::metadata()`；否则指向目录的软链会被误判为文件。
- 插件权限在 `capabilities/default.json` 显式放行 `opener:allow-open-path` 且作用域 `{"path":"**"}`，修改后需重启 `tauri dev`（capability 编译进 Rust）。
- 复制/移动到已存在同名目标会直接报错，不静默覆盖。
- **启动动画必须用单窗口内联覆盖层，不要用独立 splash 窗口**：本机 WKWebView 首个页面加载需 7~9s（WebContent 进程冷启动），独立 splash 窗口在页面渲染前就会被兜底逻辑关掉，用户只看到空白窗。`visible:false` 的隐藏窗口其 webview 加载还会被 macOS 进一步推迟。内联 `#splash` 覆盖层（index.html）随页面首帧渲染，1.2s 最短展示后淡出，无跨窗口时序依赖。
- **原生 splash 层（`native_splash.rs`）必须是 layer-hosting 而非 layer-backed**：`setWantsLayer(true)` 后取 `layer()` 是 layer-backed 模式，AppKit 拥有该 layer，setup 阶段直接 `addSublayer` 的子层会在窗口首帧合成时被丢弃（表现为只见背景色不见内容）。正确做法：先 `container.setLayer(Some(&root))` 再 `setWantsLayer(true)`，自建 layer 树完全由自己掌控。
- **CATextLayer 不设置 `font` 时不渲染任何文字**（静默无输出）：需 `setFont`（传字体名字符串即可，NSString 与 CFType toll-free bridge）+ `setFontSize`。
- **原生层配色跟随系统深浅色**（`NSAppearance::currentDrawingAppearance().bestMatchFromAppearancesWithNames`），与前端 `prefers-color-scheme` 兜底配色一致（dark: #1e1e20/#e8e8ea，light: #f5f5f7/#1d1d1f）。
- **两段动画相位续播**：原生 CA 侧与 HTML CSS 侧的动画参数必须严格一致（float 2.2s ease-in-out；dots 单程 1.2s autoreverse = 周期 2.4s + delay i×0.2s），`splash_ready` 返回原生层起播至今秒数，前端计算 `-(elapsed % 周期)` 注入负 `animation-delay`，衔接时图标位置/点亮程度无跳变。
- **验证 splash 时的三个坑**：① `screencapture -l<winId>` 对 WKWebView 常返回**陈旧帧**（窗口明明在播动画却拍到静止旧图），验证动画请用全屏截图再裁剪；② 窗口被判定完全遮挡时 macOS 会暂停该窗口渲染（`CGWindowList` 标 offscreen、CA/CSS 动画全停、`rAF` 挂起，但 JS 的 setTimeout/事件继续跑），此时截到的都是冻结帧，**不是应用 bug**；③ `osascript 'tell application "mfile" to activate'` 会把 `/Applications` 里的正式版拉起来（与 dev 窗口同位置同大小、完全盖住 dev 窗口），干扰验证——激活 dev 实例应按 PID（System Events `set frontmost of first process whose unix id is N`）。`MFILE_NATIVE_HOLD=<ms>` 环境变量可延迟原生层撤除，用于模拟慢 webview 观察衔接。
- **tauri-plugin-updater 没有 `init()`**：注册用 `Builder::new().build()`（2.x 实际 API）；`createUpdaterArtifacts: true` 后本地 build 必须提供 `TAURI_SIGNING_PRIVATE_KEY`，否则打包报错。
- **架构参考**：分层 / IPC 契约层 / 应用内更新借鉴了 Electron 应用 Multica（ai.multica.desktop）的工程组织（monorepo core/ui/views 分包 + preload 类型化桥 + electron-updater），但保留 Tauri + 无框架前端的轻量路线（安装包 10MB vs 804MB）。

## 开发

```bash
npm install
npm run dev    # tauri dev（vite 提供前端热重载）
npm run build  # 打 .app / .dmg
```

- Rust 镜像：`~/.cargo/config.toml` 已配 rsproxy，且 `[http]/[https] proxy=""` 清空失效代理。
- npm 用官方源 `https://registry.npmjs.org`。
- 构建产物：`src-tauri/target/release/bundle/macos/mfile.app`

### 自动化验证

支持环境变量注入启动目录，跳过脆弱的路径点击：

```bash
MFILE_START_DIR=/some/path npm run dev
```

窗口截图验证：用 `screencapture -x -o -l<winId>` 截离屏窗口（winId 从 Quartz `CGWindowListCopyWindowInfo` 查）。

## 修改图标

图标源文件是 `src-tauri/icons/app-icon.svg`（1024×1024，深蓝渐变背板 + 蓝色文件夹 + 文件列表卡片）。改完重新生成全平台图标集：

```bash
rsvg-convert -w 1024 -h 1024 src-tauri/icons/app-icon.svg -o /tmp/icon.png
npx tauri icon /tmp/icon.png -o src-tauri/icons
```

会重新生成 macOS `.icns`、Windows `.ico`、iOS / Android 全套。
