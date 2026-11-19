use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub modified: Option<u64>,
    pub is_hidden: bool,
    pub ext: Option<String>,
}

#[derive(Serialize)]
pub struct DirResult {
    pub entries: Vec<FileEntry>,
    pub parent: Option<String>,
}

#[tauri::command]
fn list_dir(path: String, show_hidden: bool) -> Result<DirResult, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("不是目录: {}", path));
    }
    let mut entries = Vec::new();
    let read = fs::read_dir(dir).map_err(|e| format!("读取失败: {}", e))?;
    for item in read {
        let item = item.map_err(|e| format!("读取失败: {}", e))?;
        let name = item.file_name().to_string_lossy().to_string();
        let is_hidden = name.starts_with('.');
        if is_hidden && !show_hidden {
            continue;
        }
        // 用 fs::metadata（跟随符号链接），否则指向目录的软链接会被误判为文件
        let meta = match fs::metadata(item.path()) {
            Ok(m) => Some(m),
            // 损坏的软链接：回退到链接自身属性（symlink_metadata）
            Err(_) => item.metadata().ok(),
        };
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = meta.as_ref().map(|m| m.len());
        let modified = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs());
        let ext = Path::new(&name)
            .extension()
            .map(|e| e.to_string_lossy().to_string());
        entries.push(FileEntry {
            name,
            path: item.path().to_string_lossy().to_string(),
            is_dir,
            size,
            modified,
            is_hidden,
            ext,
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    let parent = dir.parent().map(|p| p.to_string_lossy().to_string());
    Ok(DirResult { entries, parent })
}

#[tauri::command]
fn home_dir() -> Result<String, String> {
    dirs_home().ok_or_else(|| "无法获取主目录".to_string())
}

fn dirs_home() -> Option<String> {
    std::env::var("HOME").ok().filter(|s| !s.is_empty())
}

#[tauri::command]
fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("创建失败: {}", e))
}

#[tauri::command]
fn create_file(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err("文件已存在".to_string());
    }
    fs::File::create(&path).map_err(|e| format!("创建失败: {}", e))?;
    Ok(())
}

#[tauri::command]
fn rename(from: String, to: String) -> Result<(), String> {
    fs::rename(&from, &to).map_err(|e| format!("重命名失败: {}", e))
}

#[tauri::command]
fn move_entries(items: Vec<String>, dest: String) -> Result<(), String> {
    for from in items {
        let name = Path::new(&from)
            .file_name()
            .ok_or("非法路径")?
            .to_string_lossy()
            .to_string();
        let to = Path::new(&dest).join(&name);
        if to.exists() {
            return Err(format!("目标已存在: {}", to.to_string_lossy()));
        }
        fs::rename(&from, &to).map_err(|e| format!("移动失败 {}: {}", from, e))?;
    }
    Ok(())
}

#[tauri::command]
fn copy_entries(items: Vec<String>, dest: String) -> Result<(), String> {
    for from in items {
        let name = Path::new(&from)
            .file_name()
            .ok_or("非法路径")?
            .to_string_lossy()
            .to_string();
        let to = Path::new(&dest).join(&name);
        if to.exists() {
            return Err(format!("目标已存在: {}", to.to_string_lossy()));
        }
        copy_recursive(Path::new(&from), &to)?;
    }
    Ok(())
}

fn copy_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    if src.is_dir() {
        fs::create_dir_all(dst).map_err(|e| format!("复制失败: {}", e))?;
        for item in fs::read_dir(src).map_err(|e| format!("复制失败: {}", e))? {
            let item = item.map_err(|e| format!("复制失败: {}", e))?;
            copy_recursive(&item.path(), &dst.join(item.file_name()))?;
        }
    } else {
        fs::copy(src, dst).map_err(|e| format!("复制失败: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn delete_entries(items: Vec<String>) -> Result<(), String> {
    for path in items {
        let p = Path::new(&path);
        if p.is_dir() {
            fs::remove_dir_all(p).map_err(|e| format!("删除失败 {}: {}", path, e))?;
        } else {
            fs::remove_file(p).map_err(|e| format!("删除失败 {}: {}", path, e))?;
        }
    }
    Ok(())
}

#[tauri::command]
fn dir_size(path: String) -> Result<u64, String> {
    fn walk(p: &Path) -> u64 {
        if p.is_dir() {
            let mut total = 0;
            if let Ok(read) = fs::read_dir(p) {
                for item in read.flatten() {
                    total += walk(&item.path());
                }
            }
            total
        } else {
            p.metadata().map(|m| m.len()).unwrap_or(0)
        }
    }
    Ok(walk(Path::new(&path)))
}

#[tauri::command]
fn get_env(key: String) -> Option<String> {
    std::env::var(&key).ok()
}

/// 测试用：返回一段长错误信息（含路径），验证错误提示可复制
#[tauri::command]
fn test_error() -> Result<(), String> {
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

#[tauri::command]
fn exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[derive(Serialize)]
pub struct SearchHit {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

#[tauri::command]
async fn search_files(root: String, query: String, max_results: usize) -> Result<Vec<SearchHit>, String> {
    if query.is_empty() {
        return Ok(vec![]);
    }
    let query_lower = query.to_lowercase();
    let root_path = PathBuf::from(&root);
    let mut hits = Vec::new();
    let mut stack = vec![root_path];
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    while let Some(dir) = stack.pop() {
        if hits.len() >= max_results || std::time::Instant::now() > deadline {
            break;
        }
        if let Ok(read) = fs::read_dir(&dir) {
            for item in read.flatten() {
                let name = item.file_name().to_string_lossy().to_string();
                if name.starts_with('.') {
                    continue;
                }
                let is_dir = item.file_type().map(|t| t.is_dir()).unwrap_or(false);
                if name.to_lowercase().contains(&query_lower) {
                    hits.push(SearchHit {
                        name: name.clone(),
                        path: item.path().to_string_lossy().to_string(),
                        is_dir,
                        size: item.metadata().ok().map(|m| m.len()),
                    });
                    if hits.len() >= max_results {
                        break;
                    }
                }
                if is_dir {
                    stack.push(item.path());
                }
            }
        }
    }
    Ok(hits)
}

#[tauri::command]
fn open_in_terminal(path: String) -> Result<(), String> {
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
fn open_path(path: String) -> Result<(), String> {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_dir,
            home_dir,
            create_dir,
            create_file,
            rename,
            move_entries,
            copy_entries,
            delete_entries,
            dir_size,
            exists,
            get_env,
            test_error,
            search_files,
            open_path,
            open_in_terminal
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
