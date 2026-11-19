# mfile

macOS 文件管理器，访达（Finder）替代品。基于 Tauri 2，Rust 后端 + 原生 HTML/JS 前端，无重量级前端框架，安装包约 7 MB。

## 功能

### 浏览与导航
- 面包屑路径栏（可点击任意层级跳转，支持手输路径）
- 侧栏快速访问（主目录 / 文档 / 下载 / 桌面等）
- 后退（⌘←）、上一级、双击进入目录 / 打开文件
- 显示 / 隐藏隐藏文件（设置持久化到 localStorage）

### 文件操作
- 新建文件 / 文件夹、重命名（⌘D / F2）、删除（带确认弹窗，目录会提示递归删除）
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
├── ui/                  # 前端（原生 HTML/JS，无框架）
│   ├── index.html       # 布局 + 全部 CSS（含 6 套主题）
│   └── app.js           # 全部交互逻辑（状态管理 + 渲染）
├── src-tauri/
│   ├── src/lib.rs       # Rust 后端：全部 Tauri command
│   ├── tauri.conf.json  # 窗口 / 打包配置
│   ├── capabilities/default.json  # 插件权限（opener 全路径放行）
│   └── icons/           # 图标集 + app-icon.svg 源文件
└── package.json         # 仅 tauri CLI + vite 两个 devDependencies
```

**数据流**：前端 `state`（cwd / entries / selected / clipboard 等）→ `invoke()` 调 Rust command → 返回 JSON → 重新渲染。无路由、无状态库，单文件 `app.js`。

### Rust 命令清单（`src-tauri/src/lib.rs`）

| 命令 | 说明 |
|---|---|
| `list_dir(path, show_hidden)` | 列目录，返回 `FileEntry[]`（目录置顶、按名排序） |
| `home_dir()` | 取 `$HOME` |
| `create_dir` / `create_file` / `rename` | 基础操作 |
| `move_entries(items, dest)` | 移动（同盘 rename） |
| `copy_entries(items, dest)` | 递归复制 |
| `delete_entries(items)` | 删除（目录用 `remove_dir_all`） |
| `dir_size(path)` | 递归计算目录大小 |
| `search_files(root, query, max_results)` | 深度搜索，10s 超时上限 |
| `open_path(path)` | 用系统 `open` 打开 |
| `open_in_terminal(path)` | 在 Terminal.app 打开目录 |
| `exists(path)` / `get_env(key)` | 工具函数 |
| `test_error()` | 测试用：返回长错误信息验证复制功能 |

### 已知设计决策 / 踩坑记录
- `FileEntry` 字段保持 **snake_case**（不加 `#[serde(rename_all="camelCase")]`），前端直接读 `e.is_dir`——一旦加 camelCase 前端会读到 `undefined` 导致双击目录误走 `open_path`。
- `list_dir` 用 `fs::metadata()`（**跟随符号链接**）判断类型，损坏软链接回退 `DirEntry::metadata()`；否则指向目录的软链会被误判为文件。
- 插件权限在 `capabilities/default.json` 显式放行 `opener:allow-open-path` 且作用域 `{"path":"**"}`，修改后需重启 `tauri dev`（capability 编译进 Rust）。
- 复制/移动到已存在同名目标会直接报错，不静默覆盖。

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
