//! 文件系统操作：列目录 / 增删改 / 复制移动 / 目录大小 / 环境变量。

use crate::model::{DirResult, FileEntry};
use std::fs;
use std::path::Path;

#[tauri::command]
pub fn list_dir(path: String, show_hidden: bool) -> Result<DirResult, String> {
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
pub fn home_dir() -> Result<String, String> {
    dirs_home().ok_or_else(|| "无法获取主目录".to_string())
}

pub(crate) fn dirs_home() -> Option<String> {
    std::env::var("HOME").ok().filter(|s| !s.is_empty())
}

#[tauri::command]
pub fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("创建失败: {}", e))
}

#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err("文件已存在".to_string());
    }
    fs::File::create(&path).map_err(|e| format!("创建失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn rename(from: String, to: String) -> Result<(), String> {
    fs::rename(&from, &to).map_err(|e| format!("重命名失败: {}", e))
}

#[tauri::command]
pub fn move_entries(items: Vec<String>, dest: String) -> Result<(), String> {
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
pub fn copy_entries(items: Vec<String>, dest: String) -> Result<(), String> {
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
pub fn delete_entries(items: Vec<String>) -> Result<(), String> {
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
pub fn dir_size(path: String) -> Result<u64, String> {
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
pub fn get_env(key: String) -> Option<String> {
    std::env::var(&key).ok()
}

#[tauri::command]
pub fn exists(path: String) -> bool {
    Path::new(&path).exists()
}
