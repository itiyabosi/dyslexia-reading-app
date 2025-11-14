#!/bin/bash

# Firebaseセットアップスクリプト
# このスクリプトはFirebaseの設定を自動化します

echo "========================================="
echo "Firebase 自動セットアップスクリプト"
echo "========================================="
echo ""

# 色設定
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Firebase CLIの確認
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}✗ Firebase CLIがインストールされていません${NC}"
    echo ""
    echo "以下のコマンドでインストールしてください:"
    echo "  npm install -g firebase-tools"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ Firebase CLIが見つかりました${NC}"
echo ""

# Firebaseログイン確認
echo "Firebaseにログインしています..."
firebase login --no-localhost 2>/dev/null

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}Firebaseへのログインが必要です${NC}"
    firebase login
fi

echo -e "${GREEN}✓ Firebaseにログイン済み${NC}"
echo ""

# プロジェクト選択
echo "========================================="
echo "ステップ 1: Firebaseプロジェクトの選択"
echo "========================================="
echo ""
echo "既存のプロジェクトを使用しますか？それとも新規作成しますか？"
echo ""
echo "1) 既存のプロジェクトを使用"
echo "2) 新規プロジェクトを作成（Firebase Consoleで手動作成が必要）"
echo ""
read -p "選択 (1 or 2): " project_choice

if [ "$project_choice" = "1" ]; then
    echo ""
    echo "利用可能なプロジェクト一覧:"
    firebase projects:list
    echo ""
    read -p "プロジェクトIDを入力してください: " PROJECT_ID
elif [ "$project_choice" = "2" ]; then
    echo ""
    echo -e "${YELLOW}新規プロジェクトは Firebase Console で作成してください${NC}"
    echo "1. https://console.firebase.google.com/ を開く"
    echo "2. 「プロジェクトを追加」をクリック"
    echo "3. プロジェクト名を入力して作成"
    echo ""
    read -p "作成したプロジェクトIDを入力してください: " PROJECT_ID
else
    echo -e "${RED}無効な選択です${NC}"
    exit 1
fi

# プロジェクトIDの確認
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}プロジェクトIDが入力されませんでした${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✓ プロジェクト: $PROJECT_ID${NC}"
echo ""

# Firebaseプロジェクトを設定
firebase use "$PROJECT_ID" --add 2>/dev/null

# Firestoreの有効化確認
echo "========================================="
echo "ステップ 2: Firestoreの確認"
echo "========================================="
echo ""
echo "Firestoreが有効化されているか確認してください"
echo ""
echo "Firebase Consoleで以下を確認:"
echo "1. https://console.firebase.google.com/project/$PROJECT_ID/firestore を開く"
echo "2. Firestoreが有効化されていない場合は「データベースを作成」をクリック"
echo "3. 「本番環境モード」を選択し、ロケーションを選択"
echo ""
read -p "Firestoreは有効化されていますか？ (y/n): " firestore_ready

if [ "$firestore_ready" != "y" ]; then
    echo -e "${YELLOW}Firestoreを有効化してから再度実行してください${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Firestore有効化確認完了${NC}"
echo ""

# サービスアカウントキーの取得
echo "========================================="
echo "ステップ 3: サービスアカウントキーの取得"
echo "========================================="
echo ""
echo "サービスアカウントキーを取得します..."
echo ""

# サービスアカウントキーのダウンロード
SERVICE_ACCOUNT_FILE="serviceAccountKey.json"

echo "Firebase Consoleでサービスアカウントキーをダウンロードしてください:"
echo ""
echo "1. https://console.firebase.google.com/project/$PROJECT_ID/settings/serviceaccounts/adminsdk を開く"
echo "2. 「新しい秘密鍵の生成」をクリック"
echo "3. ダウンロードしたJSONファイルをこのディレクトリに配置"
echo ""
read -p "JSONファイルのパスを入力 (例: ~/Downloads/your-project-firebase-adminsdk.json): " json_path

# ファイルの存在確認
if [ ! -f "$json_path" ]; then
    echo -e "${RED}ファイルが見つかりません: $json_path${NC}"
    exit 1
fi

# JSONファイルをコピー
cp "$json_path" "$SERVICE_ACCOUNT_FILE"
echo -e "${GREEN}✓ サービスアカウントキーを保存しました${NC}"
echo ""

# .envファイルの作成
echo "========================================="
echo "ステップ 4: 環境変数の設定"
echo "========================================="
echo ""

# JSONファイルの内容を1行にする
JSON_CONTENT=$(cat "$SERVICE_ACCOUNT_FILE" | tr -d '\n' | tr -d ' ')

# .envファイルに追加
if [ -f ".env" ]; then
    echo -e "${YELLOW}.envファイルが既に存在します${NC}"
    read -p "上書きしますか？ (y/n): " overwrite
    if [ "$overwrite" != "y" ]; then
        echo "スキップしました"
        exit 0
    fi
fi

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

# サービスアカウントキーを削除（セキュリティのため）
rm "$SERVICE_ACCOUNT_FILE"
echo -e "${GREEN}✓ 一時ファイルを削除しました${NC}"
echo ""

# 完了メッセージ
echo "========================================="
echo "🎉 セットアップ完了！"
echo "========================================="
echo ""
echo "次のステップ:"
echo "1. アプリを再起動してください:"
echo "   npm start"
echo ""
echo "2. テストを実施すると、Firestoreに自動保存されます"
echo ""
echo "3. データを確認:"
echo "   https://console.firebase.google.com/project/$PROJECT_ID/firestore"
echo ""
echo -e "${GREEN}セットアップが完了しました！${NC}"
