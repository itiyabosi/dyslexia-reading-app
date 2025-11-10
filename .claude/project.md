# ディスレクシア児童 音韻認識テストアプリ

## プロジェクト概要

ディスレクシア児童の音韻認識の発達を分析するための単語読み上げテストアプリケーション

## 技術スタック

- **言語**: JavaScript (Node.js)
- **フレームワーク**: Express v5.1.0
- **データベース**: SQLite (better-sqlite3)
- **テンプレートエンジン**: EJS
- **フロントエンド**: Vanilla JavaScript
- **グラフ描画**: Chart.js v4.4.0
- **ファイルアップロード**: Multer
- **文書解析**: pdf-parse, mammoth
- **Webフォント**: Google Fonts, jsDelivr CDN

## アーキテクチャ

### データベーススキーマ

#### children（児童マスター）
- id, name, grade, birth_date, notes, created_at

#### word_lists（単語リスト）
- id, name, description, created_at

#### words（単語）
- id, word_list_id, word_text, display_order

#### fonts（フォント管理）
- id, name, font_family, font_type (webfont/system/custom), file_path, is_active, created_at

#### reading_records（読み上げテスト記録）
- id, child_id, word_id, test_date, could_read, reading_time_seconds, misread_as, notes, font_id

### ディレクトリ構成

```
dyslexia-reading-app/
├── server.js              # Expressサーバー
├── database.js            # DB初期化・スキーマ定義
├── package.json           # 依存関係
├── .gitignore            # Git除外設定
├── .env.example          # 環境変数テンプレート
├── reading_data.db       # SQLiteデータベース（Git管理外）
├── .claude/
│   └── project.md        # プロジェクトドキュメント
├── public/
│   ├── css/
│   │   └── style.css     # スタイルシート
│   └── fonts/            # カスタムフォント（Git管理外）
├── uploads/              # 一時ファイル保存先（Git管理外）
└── views/
    ├── index.ejs         # 児童管理画面
    ├── word-lists.ejs    # 単語リスト一覧
    ├── word-list-detail.ejs # 単語リスト詳細
    ├── fonts.ejs         # フォント管理画面
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

### v1.1.0（フォント機能追加）

5. **フォント管理**
   - UDフォント10種類の搭載
     - BIZ UDPゴシック、BIZ UDP明朝
     - OpenDyslexic（ディスレクシア特化）
     - Lexend（可読性向上）
     - UDデジタル教科書体、游ゴシック、メイリオ など
   - カスタムフォントのアップロード（.ttf, .otf, .woff, .woff2）
   - テスト時のリアルタイムフォント切り替え
   - 使用フォントの記録（reading_recordsにfont_id追加）

### v1.2.0（ドキュメントインポート機能）

6. **PDF・Word文書インポート**
   - PDF（.pdf）からの単語自動抽出
   - Word文書（.docx, .doc）からの単語自動抽出
   - ひらがな、カタカナ、漢字、英数字の自動認識
   - 改行・スペースで区切られた単語の一括インポート

### v1.3.0（UI改善）

7. **キーボードショートカット**
   - スペースキー: テストのスタート/ストップ切り替え
   - Enterキー: 結果記録と次の単語へ進む
   - 画面上に操作ヒントを表示

8. **テストフロー改善**
   - スタートボタン押下時に単語表示とタイマー開始を同時実行
   - 準備完了状態でのプレビュー非表示（集中力維持のため）

### v1.4.0（データ可視化強化）

9. **グラフ機能（Chart.js）**
   - 成績推移グラフ（時系列）
   - 読み時間の推移
   - 正答率の内訳（円グラフ）
   - 単語リスト別成績（棒グラフ）

10. **統計情報の拡張**
    - 正答率、最速・最遅時間
    - テスト実施日数
    - 印刷・PDF保存機能

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

### 2025-11-10
- **ドキュメント更新** (コミット予定)
  - README.mdを最新機能に合わせて全面更新
  - .claude/project.mdを最新情報に更新

### 2025-11-09
- **commit 1004de9**: スタートボタン押下時に単語表示するよう変更
  - 初期状態で単語を非表示に変更
  - スタートボタン押下で単語表示とタイマー開始を同時実行

- **commit 69c7787**: キーボードショートカット追加
  - スペースキー: スタート/ストップ切り替え
  - Enterキー: 結果記録と次へ
  - 画面上に操作ヒント表示

- **commit d9c49b1**: テスト画面のUI改善（初回試作）
  - ページ読み込み時に単語を表示
  - スタートボタンでタイマーのみ開始

- **commit c1eb1a1**: PDF・Word文書インポート機能追加
  - pdf-parse、mammothパッケージ追加
  - /api/word-lists/:id/import エンドポイント実装
  - word-list-detail.ejsにファイルアップロードUI追加

- **commit 9ae37a4**: フォント管理機能追加
  - fontsテーブル追加（id, name, font_family, font_type, file_path, is_active, created_at）
  - reading_recordsにfont_id列追加
  - UDフォント10種類をデフォルト登録
  - multerによるフォントファイルアップロード機能
  - fonts.ejs画面追加
  - test.ejsにフォント選択機能追加

- **commit 4cc54b5**: Gitリポジトリ初期化
  - .gitignore追加
  - .env.example追加
  - .claude/project.md作成

### 2025-11-08
- 初回開発（アプリ基本機能実装）
  - 児童管理機能
  - 単語リスト管理機能
  - 読み上げテスト機能
  - データ分析機能（Chart.js使用）
