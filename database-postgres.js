const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

console.log(`環境: ${process.env.NODE_ENV || 'development'}`);

// PostgreSQL接続設定
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// 接続テスト
pool.on('connect', () => {
  console.log('PostgreSQLデータベースに接続しました');
});

pool.on('error', (err) => {
  console.error('予期しないデータベースエラー:', err);
});

// データベース初期化
async function initDatabase() {
  console.log('データベーステーブルを初期化中...');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 児童マスター
    await client.query(`
      CREATE TABLE IF NOT EXISTS children (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        grade TEXT,
        birth_year INTEGER,
        birth_month INTEGER,
        enrollment_year INTEGER,
        enrollment_month INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 単語リスト（テストで使用する単語セット）
    await client.query(`
      CREATE TABLE IF NOT EXISTS word_lists (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 単語（各単語リストに含まれる単語）
    await client.query(`
      CREATE TABLE IF NOT EXISTS words (
        id SERIAL PRIMARY KEY,
        word_list_id INTEGER NOT NULL,
        word_text TEXT NOT NULL,
        display_order INTEGER,
        FOREIGN KEY (word_list_id) REFERENCES word_lists(id) ON DELETE CASCADE
      )
    `);

    // フォント管理
    await client.query(`
      CREATE TABLE IF NOT EXISTS fonts (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        font_family TEXT NOT NULL,
        font_type TEXT NOT NULL,
        file_path TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 読み上げテスト記録
    await client.query(`
      CREATE TABLE IF NOT EXISTS reading_records (
        id SERIAL PRIMARY KEY,
        child_id INTEGER NOT NULL,
        word_id INTEGER NOT NULL,
        test_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        could_read INTEGER NOT NULL,
        reading_time_seconds REAL,
        misread_as TEXT,
        notes TEXT,
        font_id INTEGER,
        FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
        FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
        FOREIGN KEY (font_id) REFERENCES fonts(id) ON DELETE SET NULL
      )
    `);

    // インデックス作成
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reading_records_child
      ON reading_records(child_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reading_records_word
      ON reading_records(word_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reading_records_date
      ON reading_records(test_date)
    `);

    await client.query('COMMIT');
    console.log('データベースの初期化が完了しました');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('データベース初期化エラー:', err);
    throw err;
  } finally {
    client.release();
  }
}

// サンプルデータの投入
async function insertSampleData() {
  const client = await pool.connect();

  try {
    const wordListResult = await client.query('SELECT COUNT(*) as count FROM word_lists');
    const childrenResult = await client.query('SELECT COUNT(*) as count FROM children');

    console.log(`既存データ: 単語リスト=${wordListResult.rows[0].count}件, 児童=${childrenResult.rows[0].count}件`);

    if (parseInt(wordListResult.rows[0].count) === 0) {
      console.log('サンプルデータを投入中...');

      await client.query('BEGIN');

      // サンプル単語リスト
      const wordListInsert = await client.query(
        'INSERT INTO word_lists (name, description) VALUES ($1, $2) RETURNING id',
        ['基本単語セット1', 'ひらがな・カタカナの基本単語']
      );
      const wordListId = wordListInsert.rows[0].id;

      // サンプル単語
      const sampleWords = [
        'あめ', 'かさ', 'いぬ', 'ねこ', 'ほん',
        'つくえ', 'えんぴつ', 'ノート', 'カバン', 'くつした'
      ];

      for (let i = 0; i < sampleWords.length; i++) {
        await client.query(
          'INSERT INTO words (word_list_id, word_text, display_order) VALUES ($1, $2, $3)',
          [wordListId, sampleWords[i], i + 1]
        );
      }

      await client.query('COMMIT');
      console.log('サンプルデータを投入しました');
    } else {
      console.log('既存のデータが存在するため、サンプルデータの投入をスキップします');
    }

    // デフォルトフォントの投入
    const fontsResult = await client.query('SELECT COUNT(*) as count FROM fonts');

    if (parseInt(fontsResult.rows[0].count) === 0) {
      console.log('デフォルトフォントを登録中...');

      await client.query('BEGIN');

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

      for (const font of defaultFonts) {
        await client.query(
          'INSERT INTO fonts (name, font_family, font_type, file_path) VALUES ($1, $2, $3, $4)',
          [font.name, font.font_family, font.font_type, null]
        );
      }

      await client.query('COMMIT');
      console.log('デフォルトフォントを登録しました');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('サンプルデータ投入エラー:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  initDatabase,
  insertSampleData
};
