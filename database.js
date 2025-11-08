const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'reading_data.db'));

// データベース初期化
function initDatabase() {
  // 児童マスター
  db.exec(`
    CREATE TABLE IF NOT EXISTS children (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      grade TEXT,
      birth_date TEXT,
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
      FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
      FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
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

  if (checkWordList.count === 0) {
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
  }
}

module.exports = {
  db,
  initDatabase,
  insertSampleData
};
