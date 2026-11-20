//! mfile：macOS 文件管理器（Tauri 2）。
//! 模块划分（参考分层架构：领域模型 / 文件操作 / 废纸篓 / 压缩 / 搜索 / 系统交互 / 启动画面）：
//! - model       IPC 契约数据结构
//! - fs_ops      文件系统操作
//! - trash       废纸篓
//! - archive     zip 压缩解压
//! - search      深度搜索
//! - shell       open/终端 等系统交互
//! - native_splash  原生 CALayer 启动画面（仅 macOS）

#[cfg(target_os = "macos")]
mod native_splash;

mod archive;
mod fs_ops;
mod model;
mod search;
mod shell;
mod trash;

/// 移除原生启动画面（须在主线程调用；找不到时为 no-op）
#[cfg(target_os = "macos")]
fn dismiss_splash() {
    native_splash::dismiss();
}

/// 当前应用版本（Cargo 包版本）
#[tauri::command]
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

// ---------- 主题偏好（供原生 splash 与前端配色一致，杜绝启动闪变） ----------

/// ~/Library/Application Support/com.vincent.mfile/prefs.json
fn prefs_path() -> Option<std::path::PathBuf> {
    fs_ops::dirs_home().map(|h| {
        std::path::PathBuf::from(format!(
            "{}/Library/Application Support/com.vincent.mfile/prefs.json",
            h
        ))
    })
}

/// 启动时原生 splash 的明暗基调：优先主题偏好文件，缺失（首启）跟随系统外观
/// ——首启时前端也无存储主题、同样跟随系统，两边天然一致。
#[cfg(target_os = "macos")]
fn splash_theme_dark() -> bool {
    use std::fs;
    if let Some(p) = prefs_path() {
        if let Ok(text) = fs::read_to_string(&p) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                return v.get("themeBase").and_then(|t| t.as_str()) != Some("light");
            }
        }
    }
    native_splash::system_dark()
}

/// 前端切换主题时同步基调（light/dark），下次启动原生 splash 据此配色
#[tauri::command]
fn save_theme(base: String) -> Result<(), String> {
    use std::fs;
    let p = prefs_path().ok_or("无法定位主目录")?;
    if let Some(dir) = p.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("创建配置目录失败: {}", e))?;
    }
    let json = serde_json::json!({ "themeBase": base });
    fs::write(&p, json.to_string()).map_err(|e| format!("写入主题偏好失败: {}", e))
}

/// 前端首帧就绪后调用：撤掉原生启动画面，露出底下的 HTML #splash 覆盖层。
/// 返回原生 splash 已播放秒数，前端以负 animation-delay 让 HTML 动画续播同一相位
#[tauri::command]
fn splash_ready(app: tauri::AppHandle) -> f64 {
    #[cfg(target_os = "macos")]
    {
        let elapsed = native_splash::elapsed_secs();
        let _ = app.run_on_main_thread(dismiss_splash);
        elapsed
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        0.0
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // 原生启动画面：窗口出现的瞬间即有动画（不等 WKWebView）
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                let mtm = objc2_foundation::MainThreadMarker::new();
                if let (Some(mtm), Some(win)) = (mtm, app.get_webview_window("main")) {
                    if let Ok(ptr) = win.ns_window() {
                        let ns: &objc2_app_kit::NSWindow = unsafe { &*(ptr as *const _) };
                        if let Some(content) = ns.contentView() {
                            // 与应用主题同色（偏好文件优先、系统兜底），杜绝层间色差闪变
                            native_splash::install(mtm, &content, splash_theme_dark());
                        }
                    }
                }
                // 5s 兜底：前端未就绪也移除，避免永久遮挡
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(5));
                    let _ = handle.run_on_main_thread(dismiss_splash);
                });
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = app;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            splash_ready,
            app_version,
            save_theme,
            fs_ops::list_dir,
            fs_ops::home_dir,
            fs_ops::create_dir,
            fs_ops::create_file,
            fs_ops::rename,
            fs_ops::move_entries,
            fs_ops::copy_entries,
            fs_ops::delete_entries,
            fs_ops::dir_size,
            fs_ops::exists,
            fs_ops::get_env,
            trash::trash_entries,
            trash::trash_dir,
            trash::empty_trash,
            archive::zip_entries,
            archive::unzip_here,
            search::search_files,
            shell::open_path,
            shell::open_in_terminal,
            shell::test_error
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
