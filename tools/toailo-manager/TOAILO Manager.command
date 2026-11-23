#!/bin/zsh
# TOAILO Manager の起動（Finder でダブルクリック）。停止はこのウィンドウで Ctrl + C、または管理画面の「停止」。
cd "$(dirname "$0")/../.." || exit 1

# Homebrew の Node.js を優先（ダブルクリック起動ではシェルの設定が読まれないことがあるため）
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "TOAILO Manager を準備しています…"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js が見つかりません。Node.js 24 LTS をインストールしてください（例：brew install node@24）。"
  read -k 1 "?何かキーを押すと閉じます…"; exit 1
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "Node.js 24 以上が必要です（現在：$(node -v)）。brew install node@24 && brew link --force --overwrite node@24 を実行してください。"
  read -k 1 "?何かキーを押すと閉じます…"; exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo "git が見つかりません。Xcode Command Line Tools をインストールしてください（xcode-select --install）。"
  read -k 1 "?何かキーを押すと閉じます…"; exit 1
fi
if ! command -v gh >/dev/null 2>&1; then
  echo "注意：GitHub CLI（gh）が見つかりません。記事の取り込み・プレビュー・承認はできますが、公開（PR作成）には gh が必要です。"
elif ! gh auth status >/dev/null 2>&1; then
  echo "注意：GitHub CLI にログインしていません。公開（PR作成）の前に、ターミナルで gh auth login を実行してください。"
fi
if [ ! -d node_modules ]; then
  echo "初回の準備（npm ci）を実行します…"
  npm ci || { echo "npm ci に失敗しました。"; read -k 1 "?何かキーを押すと閉じます…"; exit 1; }
fi

exec node tools/toailo-manager/server.mjs
