//! 压缩解压：系统 zip/unzip 命令封装（零额外依赖），解压前查同名冲突与路径穿越。

use std::fs;
use std::path::Path;

/// 压缩为 zip（用系统 zip 命令，零额外依赖）
#[tauri::command]
pub fn zip_entries(items: Vec<String>, dest_zip: String) -> Result<(), String> {
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
pub fn unzip_here(zip_path: String, dest_dir: String) -> Result<(), String> {
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

#[cfg(test)]
mod tests {
    use super::*;

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
