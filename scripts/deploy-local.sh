#!/bin/bash
# 本地部署：绕过 electron-builder 重打包的 Framework（其 GPU 进程在本机
# 远程桌面环境下持续 crash，exit_code=5 → FATAL Goodbye），改用原始
# node_modules/electron/dist/Electron.app 手搓打包，GPU 稳定。
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=node_modules/electron/dist/Electron.app
DST=dist/mfile-local.app
ICON=build/icon.icns

rm -rf "$DST"
cp -R "$SRC" "$DST"
mv "$DST/Contents/MacOS/Electron" "$DST/Contents/MacOS/mfile"
P="$DST/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleName mfile' \
  -c 'Set :CFBundleDisplayName mfile' \
  -c 'Set :CFBundleIdentifier com.vincent.mfile' \
  -c 'Set :CFBundleExecutable mfile' "$P" 2>/dev/null || {
  # 键不存在则逐个添加
  for kv in "CFBundleName mfile" "CFBundleDisplayName mfile" "CFBundleIdentifier com.vincent.mfile" "CFBundleExecutable mfile"; do
    /usr/libexec/PlistBuddy -c "Add :${kv% *} string ${kv#* }" "$P"
  done
}
[ -f "$ICON" ] && cp "$ICON" "$DST/Contents/Resources/app.icns"
# 应用图标：覆盖默认 electron.icns 引用（改名后必须，否则 Dock/启动台显示 Electron 图标）
/usr/libexec/PlistBuddy -c 'Set :CFBundleIconFile app.icns' "$P"
# 清残留的 electron.icns，避免误用
rm -f "$DST/Contents/Resources/electron.icns"

# 应用代码：asar 打包（与 electron-builder 产物同构；pack 只接受单目录，先归拢）
STAGE=$(mktemp -d)
cp -R electron ui package.json "$STAGE/"
rm -rf "$STAGE/electron/test"
npx --yes @electron/asar pack "$STAGE" "$DST/Contents/Resources/app.asar"
rm -rf "$STAGE"
# 生产依赖 electron-updater 需在 asar 内可解析：平铺 node_modules 到 Resources/app.asar.unpacked
mkdir -p "$DST/Contents/Resources/app.asar.unpacked"
[ -d node_modules/electron-updater ] && cp -R node_modules/electron-updater "$DST/Contents/Resources/app.asar.unpacked/"
[ -d node_modules/fs-extra ] && cp -R node_modules/fs-extra "$DST/Contents/Resources/app.asar.unpacked/" 2>/dev/null || true

# ad-hoc 签名（无证书环境，本机运行）
codesign --force --deep -s - "$DST" >/dev/null 2>&1 || true

# ---------- 产物自检：任一项失败即报错退出，杜绝「修一点漏一片」 ----------
fail=0
check() { # check <描述> <命令>
  if eval "$2" >/dev/null 2>&1; then echo "  ✓ $1"; else echo "  ✗ $1" >&2; fail=1; fi
}
check "可执行名 mfile"               "[ -x '$DST/Contents/MacOS/mfile' ]"
check "Bundle ID com.vincent.mfile"  "[ \"\$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' '$P' 2>/dev/null)\" = 'com.vincent.mfile' ]"
check "名称 CFBundleName=mfile"      "[ \"\$(/usr/libexec/PlistBuddy -c 'Print :CFBundleName' '$P' 2>/dev/null)\" = 'mfile' ]"
check "图标引用 app.icns"            "[ \"\$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconFile' '$P' 2>/dev/null)\" = 'app.icns' ]"
check "图标文件存在"                 "[ -f '$DST/Contents/Resources/app.icns' ]"
check "无 electron.icns 残留"        "[ ! -f '$DST/Contents/Resources/electron.icns' ]"
check "asar 存在"                    "[ -f '$DST/Contents/Resources/app.asar' ]"
check "签名有效"                     "codesign -v '$DST' 2>/dev/null"
[ "$fail" = 0 ] || { echo "自检未通过，中止" >&2; exit 1; }

echo "✓ 本地版构建完成: $DST"
