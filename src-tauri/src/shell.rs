//! 系统交互：用 open 命令打开文件/目录、在终端中打开、测试错误通道。

use std::path::PathBuf;

#[tauri::command]
pub fn open_in_terminal(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err(format!("不是目录: {}", path));
    }
    // 优先 Terminal.app；用户装了 iTerm2 时也可用 open -a iTerm
    let status = std::process::Command::new("open")
        .args(["-a", "Terminal"]).arg(&p)
        .status()
        .map_err(|e| format!("启动终端失败: {}", e))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("open 退出码: {}", status))
    }
}

#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    let status = std::process::Command::new("open")
        .arg(&p)
        .status()
        .map_err(|e| format!("启动失败: {}", e))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("open 退出码: {}", status))
    }
}

/// 测试用：返回一段长错误信息（含路径），验证错误提示可复制
#[tauri::command]
pub fn test_error() -> Result<(), String> {
    Err(format!(
        "模拟错误：无法访问 /Users/vincent/Library/Application Support/某目录/子目录/目标文件.txt —— Permission denied (os error 13)。当前时间: {}",
        chrono_now_secs()
    ))
}

fn chrono_now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
