const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { db, initDatabase, insertSampleData } = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

// Multer設定（フォントファイルアップロード用）
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public', 'fonts'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.ttf', '.otf', '.woff', '.woff2'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('フォントファイル (.ttf, .otf, .woff, .woff2) のみアップロード可能です'));
    }
  }
});

// データベース初期化
initDatabase();
insertSampleData();

// ミドルウェア設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ======== 児童管理 ========

// 児童一覧・登録画面
app.get('/', (req, res) => {
  const children = db.prepare('SELECT * FROM children ORDER BY created_at DESC').all();
  res.render('index', { children });
});

// 児童登録API
app.post('/api/children', (req, res) => {
  const { name, grade, birth_date, notes } = req.body;
  const stmt = db.prepare('INSERT INTO children (name, grade, birth_date, notes) VALUES (?, ?, ?, ?)');
  const result = stmt.run(name, grade, birth_date, notes);
  res.json({ success: true, id: result.lastInsertRowid });
});

// 児童削除API
app.delete('/api/children/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM children WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ success: true });
});

// ======== 単語リスト管理 ========

// 単語リスト管理画面
app.get('/word-lists', (req, res) => {
  const wordLists = db.prepare('SELECT * FROM word_lists ORDER BY created_at DESC').all();
  res.render('word-lists', { wordLists });
});

// 単語リスト詳細・編集画面
app.get('/word-lists/:id', (req, res) => {
  const wordList = db.prepare('SELECT * FROM word_lists WHERE id = ?').get(req.params.id);
  const words = db.prepare('SELECT * FROM words WHERE word_list_id = ? ORDER BY display_order').all(req.params.id);
  res.render('word-list-detail', { wordList, words });
});

// 単語リスト作成API
app.post('/api/word-lists', (req, res) => {
  const { name, description } = req.body;
  const stmt = db.prepare('INSERT INTO word_lists (name, description) VALUES (?, ?)');
  const result = stmt.run(name, description);
  res.json({ success: true, id: result.lastInsertRowid });
});

// 単語リスト一覧取得API（簡易版）
app.get('/api/word-lists-simple', (req, res) => {
  const wordLists = db.prepare('SELECT id, name, description FROM word_lists ORDER BY created_at DESC').all();
  res.json(wordLists);
});

// 単語追加API
app.post('/api/words', (req, res) => {
  const { word_list_id, word_text } = req.body;

  // 最大のdisplay_orderを取得
  const maxOrder = db.prepare('SELECT MAX(display_order) as max FROM words WHERE word_list_id = ?').get(word_list_id);
  const displayOrder = (maxOrder.max || 0) + 1;

  const stmt = db.prepare('INSERT INTO words (word_list_id, word_text, display_order) VALUES (?, ?, ?)');
  const result = stmt.run(word_list_id, word_text, displayOrder);
  res.json({ success: true, id: result.lastInsertRowid });
});

// 単語削除API
app.delete('/api/words/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM words WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ success: true });
});

// ======== フォント管理 ========

// フォント管理画面
app.get('/fonts', (req, res) => {
  res.render('fonts');
});

// フォント一覧取得API
app.get('/api/fonts', (req, res) => {
  const fonts = db.prepare('SELECT * FROM fonts WHERE is_active = 1 ORDER BY font_type, name').all();
  res.json(fonts);
});

// フォントアップロードAPI
app.post('/api/fonts/upload', upload.single('fontFile'), (req, res) => {
  console.log('[DEBUG] フォントアップロード開始:', req.file);

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'ファイルがアップロードされていません' });
  }

  const { fontName } = req.body;
  if (!fontName) {
    // アップロードされたファイルを削除
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ success: false, message: 'フォント名が指定されていません' });
  }

  const fontPath = '/fonts/' + req.file.filename;
  const fontFamily = `'${fontName}'`;

  try {
    const stmt = db.prepare('INSERT INTO fonts (name, font_family, font_type, file_path) VALUES (?, ?, ?, ?)');
    const result = stmt.run(fontName, fontFamily, 'custom', fontPath);

    console.log('[SUCCESS] フォント登録完了:', { id: result.lastInsertRowid, fontName });
    res.json({ success: true, id: result.lastInsertRowid, fontPath });
  } catch (error) {
    console.error('[ERROR] フォント登録失敗:', error);
    // エラー時はファイルを削除
    fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: 'データベース登録に失敗しました' });
  }
});

// フォント削除API
app.delete('/api/fonts/:id', (req, res) => {
  console.log('[DEBUG] フォント削除:', req.params.id);

  const font = db.prepare('SELECT * FROM fonts WHERE id = ?').get(req.params.id);

  if (!font) {
    return res.status(404).json({ success: false, message: 'フォントが見つかりません' });
  }

  // カスタムフォントの場合はファイルも削除
  if (font.font_type === 'custom' && font.file_path) {
    const filePath = path.join(__dirname, 'public', font.file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('[DEBUG] フォントファイル削除:', filePath);
    }
  }

  const stmt = db.prepare('DELETE FROM fonts WHERE id = ?');
  stmt.run(req.params.id);

  console.log('[SUCCESS] フォント削除完了:', font.name);
  res.json({ success: true });
});

// ======== 読み上げテスト ========

// テスト実施画面
app.get('/test/:childId/:wordListId', (req, res) => {
  const child = db.prepare('SELECT * FROM children WHERE id = ?').get(req.params.childId);
  const wordList = db.prepare('SELECT * FROM word_lists WHERE id = ?').get(req.params.wordListId);
  const words = db.prepare('SELECT * FROM words WHERE word_list_id = ? ORDER BY display_order').all(req.params.wordListId);
  const fonts = db.prepare('SELECT * FROM fonts WHERE is_active = 1 ORDER BY font_type, name').all();

  res.render('test', { child, wordList, words, fonts });
});

// テスト結果記録API
app.post('/api/reading-records', (req, res) => {
  const { child_id, word_id, could_read, reading_time_seconds, misread_as, notes, font_id } = req.body;

  console.log('[DEBUG] テスト結果記録:', { child_id, word_id, could_read, reading_time_seconds, font_id });

  const stmt = db.prepare(`
    INSERT INTO reading_records (child_id, word_id, could_read, reading_time_seconds, misread_as, notes, font_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(child_id, word_id, could_read, reading_time_seconds, misread_as, notes, font_id);

  console.log('[SUCCESS] テスト結果記録完了:', result.lastInsertRowid);
  res.json({ success: true, id: result.lastInsertRowid });
});

// ======== データ分析 ========

// データ閲覧・分析画面
app.get('/analysis', (req, res) => {
  const children = db.prepare('SELECT * FROM children ORDER BY name').all();
  res.render('analysis', { children });
});

// 児童別の成績データ取得API
app.get('/api/analysis/:childId', (req, res) => {
  const records = db.prepare(`
    SELECT
      rr.id,
      rr.test_date,
      w.word_text,
      wl.name as word_list_name,
      rr.could_read,
      rr.reading_time_seconds,
      rr.misread_as,
      rr.notes
    FROM reading_records rr
    JOIN words w ON rr.word_id = w.id
    JOIN word_lists wl ON w.word_list_id = wl.id
    WHERE rr.child_id = ?
    ORDER BY rr.test_date DESC
  `).all(req.params.childId);

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_tests,
      SUM(could_read) as successful_reads,
      AVG(reading_time_seconds) as avg_time,
      COUNT(CASE WHEN misread_as IS NOT NULL THEN 1 END) as misread_count
    FROM reading_records
    WHERE child_id = ?
  `).get(req.params.childId);

  res.json({ records, stats });
});

app.listen(PORT, () => {
  console.log(`サーバーが起動しました: http://localhost:${PORT}`);
});
