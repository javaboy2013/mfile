//! 深度搜索：从指定目录递归按文件名搜索（10s 超时 + 结果数上限）。

use crate::model::SearchHit;
use std::fs;
use std::path::PathBuf;

#[tauri::command]
pub async fn search_files(
    root: String,
    query: String,
    max_results: usize,
) -> Result<Vec<SearchHit>, String> {
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
