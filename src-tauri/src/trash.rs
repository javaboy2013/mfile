//! 废纸篓：移入（Finder 同款 ~/.Trash）、定位、清空。

use crate::fs_ops::dirs_home;
use std::fs;
use std::path::{Path, PathBuf};

/// 移入废纸篓（Finder 同款：~/.Trash，自动处理同名冲突）
#[tauri::command]
pub fn trash_entries(items: Vec<String>) -> Result<(), String> {
    let paths: Vec<PathBuf> = items.iter().map(PathBuf::from).collect();
    trash::delete_all(&paths).map_err(|e| format!("移入废纸篓失败: {}", e))
}

/// 废纸篓目录（~/.Trash）
#[tauri::command]
pub fn trash_dir() -> Result<String, String> {
    dirs_home()
        .map(|h| format!("{}/.Trash", h))
        .ok_or_else(|| "无法获取主目录".to_string())
}

/// 清空废纸篓
#[tauri::command]
pub fn empty_trash() -> Result<(), String> {
    let trash = trash_dir()?;
    let p = Path::new(&trash);
    if !p.is_dir() {
        return Err("废纸篓不存在".to_string());
    }
    for item in fs::read_dir(p).map_err(|e| format!("读取废纸篓失败: {}", e))? {
        let item = item.map_err(|e| format!("读取废纸篓失败: {}", e))?;
        let path = item.path();
        if path.is_dir() {
            fs::remove_dir_all(&path).map_err(|e| format!("清空失败 {}: {}", path.display(), e))?;
        } else {
            fs::remove_file(&path).map_err(|e| format!("清空失败 {}: {}", path.display(), e))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trash_moves_file_to_trash_dir() {
        let dir = std::env::temp_dir().join("mfile-test");
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("单测-trash.txt");
        std::fs::write(&f, "x").unwrap();
        trash_entries(vec![f.to_string_lossy().to_string()]).unwrap();
        assert!(!f.exists(), "原文件应已移走");
        let in_trash = PathBuf::from(format!("{}/.Trash/单测-trash.txt", dirs_home().unwrap()));
        assert!(in_trash.exists(), "废纸篓中应存在该文件");
    }
}
