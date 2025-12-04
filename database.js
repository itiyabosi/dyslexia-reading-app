const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// データベースファイルのパスを環境変数から取得（Render用）、なければローカルパス
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'reading_data.db');

// Render環境の場合、ディレクトリが存在するか確認
if (process.env.DATABASE_PATH) {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    console.log(`データベースディレクトリを作成: ${dbDir}`);
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

console.log(`データベースパス: ${dbPath}`);
console.log(`環境: ${process.env.NODE_ENV || 'development'}`);

// データベースファイルが存在するかチェック
if (fs.existsSync(dbPath)) {
  const stats = fs.statSync(dbPath);
  console.log(`既存のデータベースファイルを使用（サイズ: ${stats.size} bytes）`);
} else {
  console.log('新しいデータベースファイルを作成します');
}

const db = new Database(dbPath);

// WALモードを有効にして、パフォーマンスと同時アクセスを改善
db.pragma('journal_mode = WAL');
console.log('データベースをWALモードに設定しました');

// データベースマイグレーション（スキーマ変更対応）
function migrateDatabase() {
  // children テーブルが存在するか確認
  const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='children'").get();

  if (!tableExists) {
    console.log('children テーブルが存在しないため、マイグレーションをスキップします');
    return;
  }

  // children テーブルに birth_date カラムが存在するか確認
  const tableInfo = db.prepare("PRAGMA table_info(children)").all();
  const hasBirthDate = tableInfo.some(col => col.name === 'birth_date');
  const hasEnrollmentYear = tableInfo.some(col => col.name === 'enrollment_year');
  const hasBirthYear = tableInfo.some(col => col.name === 'birth_year');

  // 旧スキーマ（birth_dateあり、enrollment_year/monthなし）の場合、マイグレーション実行
  if (hasBirthDate && !hasEnrollmentYear && tableInfo.length > 0) {
    console.log('データベーススキーマをマイグレーション中...');

    // 新しいテーブルを作成
    db.exec(`
      CREATE TABLE children_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        grade TEXT,
        birth_year INTEGER,
        birth_month INTEGER,
        enrollment_year INTEGER,
        enrollment_month INTEGER,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // データをコピー
    db.exec(`
      INSERT INTO children_new (id, name, grade, notes, created_at)
      SELECT id, name, grade, notes, created_at FROM children
    `);

    // 古いテーブルを削除
    db.exec('DROP TABLE children');

    // 新しいテーブルをリネーム
    db.exec('ALTER TABLE children_new RENAME TO children');

    console.log('マイグレーション完了');
  }

  // birth_year/birth_month カラムがない場合は追加
  if (tableInfo.length > 0 && !hasBirthYear && hasEnrollmentYear) {
    console.log('birth_year と birth_month カラムを追加中...');
    db.exec('ALTER TABLE children ADD COLUMN birth_year INTEGER');
    db.exec('ALTER TABLE children ADD COLUMN birth_month INTEGER');
    console.log('カラム追加完了');
  }
}

// データベース初期化
function initDatabase() {
  console.log('データベーステーブルを初期化中...');

  // 児童マスター（新スキーマ）
  db.exec(`
    CREATE TABLE IF NOT EXISTS children (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      grade TEXT,
      birth_year INTEGER,
      birth_month INTEGER,
      enrollment_year INTEGER,
      enrollment_month INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 単語リスト（テストで使用する単語セット）
  db.exec(`
    CREATE TABLE IF NOT EXISTS word_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 単語（各単語リストに含まれる単語）
  db.exec(`
    CREATE TABLE IF NOT EXISTS words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_list_id INTEGER NOT NULL,
      word_text TEXT NOT NULL,
      display_order INTEGER,
      FOREIGN KEY (word_list_id) REFERENCES word_lists(id) ON DELETE CASCADE
    )
  `);

  // フォント管理
  db.exec(`
    CREATE TABLE IF NOT EXISTS fonts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      font_family TEXT NOT NULL,
      font_type TEXT NOT NULL, -- 'system', 'webfont', 'custom'
      file_path TEXT, -- カスタムフォントの場合のみ
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 読み上げテスト記録
  db.exec(`
    CREATE TABLE IF NOT EXISTS reading_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      word_id INTEGER NOT NULL,
      test_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      could_read INTEGER NOT NULL, -- 0: 読めなかった, 1: 読めた
      reading_time_seconds REAL, -- 読むのにかかった秒数
      misread_as TEXT, -- 読み間違えた場合の内容
      notes TEXT,
      font_id INTEGER, -- 使用したフォント
      FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
      FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
      FOREIGN KEY (font_id) REFERENCES fonts(id) ON DELETE SET NULL
    )
  `);

  // インデックス作成
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_reading_records_child
    ON reading_records(child_id);

    CREATE INDEX IF NOT EXISTS idx_reading_records_word
    ON reading_records(word_id);

    CREATE INDEX IF NOT EXISTS idx_reading_records_date
    ON reading_records(test_date);
  `);

  console.log('データベースの初期化が完了しました');
}

// サンプルデータの投入
function insertSampleData() {
  const checkWordList = db.prepare('SELECT COUNT(*) as count FROM word_lists').get();
  const checkChildren = db.prepare('SELECT COUNT(*) as count FROM children').get();

  console.log(`既存データ: 単語リスト=${checkWordList.count}件, 児童=${checkChildren.count}件`);

  if (checkWordList.count === 0) {
    console.log('サンプルデータを投入中...');
    // サンプル単語リスト
    const insertWordList = db.prepare('INSERT INTO word_lists (name, description) VALUES (?, ?)');
    const wordListId = insertWordList.run('基本単語セット1', 'ひらがな・カタカナの基本単語').lastInsertRowid;

    // サンプル単語
    const sampleWords = [
      'あめ', 'かさ', 'いぬ', 'ねこ', 'ほん',
      'つくえ', 'えんぴつ', 'ノート', 'カバン', 'くつした'
    ];

    const insertWord = db.prepare('INSERT INTO words (word_list_id, word_text, display_order) VALUES (?, ?, ?)');
    sampleWords.forEach((word, index) => {
      insertWord.run(wordListId, word, index + 1);
    });

    console.log('サンプルデータを投入しました');
  } else {
    console.log('既存のデータが存在するため、サンプルデータの投入をスキップします');
  }

  // デフォルトフォントの投入
  const checkFonts = db.prepare('SELECT COUNT(*) as count FROM fonts').get();

  if (checkFonts.count === 0) {
    const defaultFonts = [
      { name: 'BIZ UDPゴシック', font_family: "'BIZ UDPGothic', sans-serif", font_type: 'webfont' },
      { name: 'BIZ UDP明朝', font_family: "'BIZ UDPMincho', serif", font_type: 'webfont' },
      { name: 'OpenDyslexic', font_family: "'OpenDyslexic', sans-serif", font_type: 'webfont' },
      { name: 'Lexend', font_family: "'Lexend', sans-serif", font_type: 'webfont' },
      { name: 'UD デジタル 教科書体 NK-R', font_family: "'UD デジタル 教科書体 NK-R', sans-serif", font_type: 'system' },
      { name: 'Arial', font_family: 'Arial, sans-serif', font_type: 'system' },
      { name: 'Verdana', font_family: 'Verdana, sans-serif', font_type: 'system' },
      { name: 'Comic Sans MS', font_family: "'Comic Sans MS', cursive", font_type: 'system' },
      { name: '游ゴシック', font_family: "'Yu Gothic', 'YuGothic', sans-serif", font_type: 'system' },
      { name: 'メイリオ', font_family: 'Meiryo, sans-serif', font_type: 'system' }
    ];

    const insertFont = db.prepare('INSERT INTO fonts (name, font_family, font_type, file_path) VALUES (?, ?, ?, ?)');
    defaultFonts.forEach(font => {
      insertFont.run(font.name, font.font_family, font.font_type, null);
    });

    console.log('デフォルトフォントを登録しました');
  }
}

module.exports = {
  db,
  migrateDatabase,
  initDatabase,
  insertSampleData
};
