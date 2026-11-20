//! 领域模型：IPC 契约的数据结构（serde 序列化给前端）。
//! 注意保持 snake_case 字段名（前端直接读 e.is_dir，勿加 camelCase rename）。

use serde::{Deserialize, Serialize};

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

#[derive(Serialize)]
pub struct SearchHit {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}
