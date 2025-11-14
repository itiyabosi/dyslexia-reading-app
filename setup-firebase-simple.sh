#!/bin/bash

# Firebase簡易セットアップスクリプト
# サービスアカウントキーファイルから.envを自動生成

echo "========================================="
echo "Firebase 簡易セットアップ"
echo "========================================="
echo ""

# 色設定
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 引数チェック
if [ $# -eq 0 ]; then
    echo -e "${YELLOW}使い方:${NC}"
    echo "  ./setup-firebase-simple.sh <サービスアカウントキーのパス>"
    echo ""
    echo "例:"
    echo "  ./setup-firebase-simple.sh ~/Downloads/my-project-firebase-adminsdk.json"
    echo ""
    echo -e "${YELLOW}サービスアカウントキーの取得方法:${NC}"
    echo "1. https://console.firebase.google.com/ を開く"
    echo "2. プロジェクトを選択"
    echo "3. ⚙️ → プロジェクトの設定 → サービスアカウント"
    echo "4. 「新しい秘密鍵の生成」をクリック"
    echo "5. ダウンロードしたJSONファイルのパスを指定"
    echo ""
    exit 1
fi

JSON_FILE="$1"

# ファイルの存在確認
if [ ! -f "$JSON_FILE" ]; then
    echo -e "${RED}✗ ファイルが見つかりません: $JSON_FILE${NC}"
    exit 1
fi

echo -e "${GREEN}✓ サービスアカウントキーを確認しました${NC}"
echo ""

# JSONファイルの検証
if ! jq empty "$JSON_FILE" 2>/dev/null; then
    echo -e "${RED}✗ 無効なJSONファイルです${NC}"
    exit 1
fi

# プロジェクトIDを抽出
PROJECT_ID=$(jq -r '.project_id' "$JSON_FILE")
echo "プロジェクトID: $PROJECT_ID"
echo ""

# JSONファイルの内容を1行にする
JSON_CONTENT=$(cat "$JSON_FILE" | jq -c .)

# .envファイルの作成確認
if [ -f ".env" ]; then
    echo -e "${YELLOW}⚠ .envファイルが既に存在します${NC}"
    read -p "上書きしますか？ (y/n): " overwrite
    if [ "$overwrite" != "y" ]; then
        echo "キャンセルしました"
        exit 0
    fi
fi

# .envファイルを作成
cat > .env << EOF
# サーバー設定
PORT=3001

# 開発モード設定
NODE_ENV=development

# Firebase連携設定
FIREBASE_SERVICE_ACCOUNT='$JSON_CONTENT'
EOF

echo -e "${GREEN}✓ .envファイルを作成しました${NC}"
echo ""

# 完了メッセージ
echo "========================================="
echo "🎉 セットアップ完了！"
echo "========================================="
echo ""
echo "次のステップ:"
echo "1. アプリを起動してください:"
echo "   npm start"
echo ""
echo "2. テストを実施すると、Firestoreに自動保存されます"
echo ""
echo "3. データを確認:"
echo "   https://console.firebase.google.com/project/$PROJECT_ID/firestore"
echo ""
echo -e "${GREEN}✓ Firebase連携が有効になりました！${NC}"
