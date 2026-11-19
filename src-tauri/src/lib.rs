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

/// 移入废纸篓（Finder 同款：~/.Trash，自动处理同名冲突）
#[tauri::command]
fn trash_entries(items: Vec<String>) -> Result<(), String> {
    let paths: Vec<PathBuf> = items.iter().map(PathBuf::from).collect();
    trash::delete_all(&paths).map_err(|e| format!("移入废纸篓失败: {}", e))
}

/// 废纸篓目录（~/.Trash）
#[tauri::command]
fn trash_dir() -> Result<String, String> {
    dirs_home()
        .map(|h| format!("{}/.Trash", h))
        .ok_or_else(|| "无法获取主目录".to_string())
}

/// 清空废纸篓
#[tauri::command]
fn empty_trash() -> Result<(), String> {
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

/// 压缩为 zip（用系统 zip 命令，零额外依赖）
#[tauri::command]
fn zip_entries(items: Vec<String>, dest_zip: String) -> Result<(), String> {
    let dest = Path::new(&dest_zip);
    if dest.exists() {
        return Err(format!("目标已存在: {}", dest_zip));
    }
    // items 必须在同一父目录下（前端保证），zip -j 会丢目录结构，这里保留结构：-r 递归
    let parent = Path::new(
        items
            .first()
            .and_then(|p| Path::new(p).parent())
            .ok_or("非法路径")?,
    );
    let names: Vec<String> = items
        .iter()
        .map(|p| {
            Path::new(p)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default()
        })
        .collect();
    if names.iter().any(|n| n.is_empty()) {
        return Err("非法路径".to_string());
    }
    let status = std::process::Command::new("zip")
        .arg("-r")
        .arg("-q")
        .arg(&dest_zip)
        .args(&names)
        .current_dir(parent)
        .status()
        .map_err(|e| format!("启动 zip 失败: {}", e))?;
    if status.success() {
        Ok(())
    } else {
        // 失败清理半成品
        let _ = fs::remove_file(&dest_zip);
        Err(format!("zip 退出码: {}", status))
    }
}

/// 解压 zip 到指定目录（用系统 unzip，覆盖前先检查同名冲突）
#[tauri::command]
fn unzip_here(zip_path: String, dest_dir: String) -> Result<(), String> {
    let zp = Path::new(&zip_path);
    if !zp.exists() || zp.extension().map(|e| e != "zip").unwrap_or(true) {
        return Err(format!("不是 zip 文件: {}", zip_path));
    }
    let dest = Path::new(&dest_dir);
    if !dest.is_dir() {
        return Err(format!("不是目录: {}", dest_dir));
    }
    // 先列出 zip 内容检查目标目录是否已有同名项（unzip 默认交互询问，避免卡死）
    let list = std::process::Command::new("unzip")
        .arg("-Z1")
        .arg(&zip_path)
        .output()
        .map_err(|e| format!("读取 zip 失败: {}", e))?;
    if !list.status.success() {
        return Err("读取 zip 内容失败".to_string());
    }
    let list_str = String::from_utf8_lossy(&list.stdout).into_owned();
    let names: Vec<&str> = list_str
        .lines()
        .filter(|l| !l.is_empty())
        .collect();
    if names.is_empty() {
        return Err("zip 内容为空".to_string());
    }
    // 安全检查：防止路径穿越（../）和绝对路径
    if names.iter().any(|n| n.starts_with('/') || n.contains("../")) {
        return Err("zip 含不安全路径，拒绝解压".to_string());
    }
    for n in &names {
        let top = n.split('/').next().unwrap_or("");
        if !top.is_empty() && dest.join(top).exists() {
            return Err(format!("目标已存在: {}", dest.join(top).display()));
        }
    }
    let status = std::process::Command::new("unzip")
        .arg("-q")
        .arg("-o")
        .arg(&zip_path)
        .arg("-d")
        .arg(&dest_dir)
        .output()
        .map_err(|e| format!("启动 unzip 失败: {}", e))?;
    if status.status.success() {
        Ok(())
    } else {
        Err(format!(
            "解压失败: {}",
            String::from_utf8_lossy(&status.stderr)
        ))
    }
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
            trash_entries,
            trash_dir,
            empty_trash,
            zip_entries,
            unzip_here,
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

    #[test]
    fn zip_and_unzip_roundtrip() {
        let dir = std::env::temp_dir().join("mfile-test");
        let _ = std::fs::remove_dir_all(&dir); // 清理上次残留
        std::fs::create_dir_all(dir.join("roundtrip/inner")).unwrap();
        std::fs::write(dir.join("roundtrip/a.txt"), "A").unwrap();
        std::fs::write(dir.join("roundtrip/inner/b.txt"), "B").unwrap();
        let zip_path = dir.join("roundtrip.zip").to_string_lossy().to_string();
        zip_entries(
            vec![dir.join("roundtrip").to_string_lossy().to_string()],
            zip_path.clone(),
        )
        .unwrap();
        assert!(Path::new(&zip_path).exists(), "zip 应已生成");
        // 解压到新目录
        let out = dir.join("unzip-out");
        std::fs::create_dir_all(&out).unwrap();
        unzip_here(zip_path, out.to_string_lossy().to_string()).unwrap();
        assert_eq!(std::fs::read_to_string(out.join("roundtrip/a.txt")).unwrap(), "A");
        assert_eq!(std::fs::read_to_string(out.join("roundtrip/inner/b.txt")).unwrap(), "B");
    }

    #[test]
    fn unzip_rejects_existing_target() {
        let dir = std::env::temp_dir().join("mfile-test-conflict");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("inner")).unwrap();
        std::fs::write(dir.join("inner/a.txt"), "A").unwrap();
        let zip_path = dir.join("x.zip").to_string_lossy().to_string();
        zip_entries(
            vec![dir.join("inner").to_string_lossy().to_string()],
            zip_path.clone(),
        )
        .unwrap();
        // 移走源目录，确保解压目标是干净的
        std::fs::rename(dir.join("inner"), dir.join("inner-src")).unwrap();
        // 先解压一次（生成 inner/）
        unzip_here(zip_path.clone(), dir.to_string_lossy().to_string()).unwrap();
        // 再解压一次应报同名冲突
        let err = unzip_here(zip_path, dir.to_string_lossy().to_string()).unwrap_err();
        assert!(err.contains("目标已存在"), "应报同名冲突，实际: {}", err);
    }
}
