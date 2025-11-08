# ディスレクシア児童 音韻認識テストアプリ

## プロジェクト概要

ディスレクシア児童の音韻認識の発達を分析するための単語読み上げテストアプリケーション

## 技術スタック

- **言語**: JavaScript (Node.js)
- **フレームワーク**: Express v5.1.0
- **データベース**: SQLite (better-sqlite3)
- **テンプレートエンジン**: EJS
- **フロントエンド**: Vanilla JavaScript

## アーキテクチャ

### データベーススキーマ

#### children（児童マスター）
- id, name, grade, birth_date, notes, created_at

#### word_lists（単語リスト）
- id, name, description, created_at

#### words（単語）
- id, word_list_id, word_text, display_order

#### reading_records（読み上げテスト記録）
- id, child_id, word_id, test_date, could_read, reading_time_seconds, misread_as, notes

### ディレクトリ構成

```
dyslexia-reading-app/
├── server.js              # Expressサーバー
├── database.js            # DB初期化・スキーマ定義
├── package.json           # 依存関係
├── .gitignore            # Git除外設定
├── .env.example          # 環境変数テンプレート
├── reading_data.db       # SQLiteデータベース（Git管理外）
├── public/
│   ├── css/
│   │   └── style.css     # スタイルシート
│   └── js/               # クライアントサイドJS
└── views/
    ├── index.ejs         # 児童管理画面
    ├── word-lists.ejs    # 単語リスト一覧
    ├── word-list-detail.ejs # 単語リスト詳細
    ├── test.ejs          # 読み上げテスト画面
    └── analysis.ejs      # データ分析画面
```

## 実装済み機能

### v1.0.0（初回リリース）

1. **児童管理**
   - 児童の登録・削除
   - 基本情報管理（名前、学年、生年月日、備考）

2. **単語リスト管理**
   - 複数の単語リストの作成・管理
   - リストごとの単語登録・削除
   - サンプル「基本単語セット1」自動作成

3. **読み上げテスト**
   - タイマー機能（スタート/ストップ）
   - ミリ秒精度の読み時間計測
   - 正答/誤答の記録
   - 読み間違い内容の記録
   - 備考入力

4. **データ分析**
   - 児童別統計（テスト回数、正答数、平均読み時間、誤答回数）
   - テスト履歴の詳細表示

## 起動方法

```bash
# 依存パッケージのインストール
npm install

# サーバー起動
npm start

# ブラウザでアクセス
http://localhost:3001
```

## 開発ルール

- **TDD原則**: グローバル`~/.config/claude/claude.md`に従う
- **Git管理**: 変更前必ずコミット
- **小さな変更**: 1コミット = 1-10ファイル
- **エラー時**: 即座にロールバック

## 今後の拡張候補

- [ ] データエクスポート機能（CSV/Excel）
- [ ] グラフ表示（進捗の可視化）
- [ ] 複数児童の比較分析
- [ ] 単語の難易度設定
- [ ] テストの自動化（Jest/Mocha）

## 変更履歴

### 2025-11-08
- Gitリポジトリ初期化
- .gitignore追加
- .env.example追加
- プロジェクトドキュメント作成
