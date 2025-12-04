const express = require('express');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { execSync } = require('child_process');
const { pool, initDatabase, insertSampleData } = require('./database');
const { saveReadingRecordToFirebase } = require('./firebaseService');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const PASSWORD = '000000'; // アプリのパスワード

// Gitコミットハッシュを取得
let COMMIT_HASH = 'unknown';
try {
  COMMIT_HASH = execSync('git rev-parse --short HEAD').toString().trim();
  console.log(`現在のコミット: ${COMMIT_HASH}`);
} catch (error) {
  console.warn('Gitコミットハッシュの取得に失敗しました:', error.message);
}

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

// データベース初期化（async IIFE）
(async () => {
  try {
    await initDatabase();
    await insertSampleData();
    console.log('データベース初期化完了');
  } catch (error) {
    console.error('データベース初期化エラー:', error);
    process.exit(1);
  }
})();

// ミドルウェア設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// セッション設定
app.use(session({
  secret: 'dyslexia-reading-app-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000 // 24時間
  }
}));

// ======== 認証関連 ========

// ログイン画面表示
app.get('/login', (req, res) => {
  res.render('login', { error: null, commitHash: COMMIT_HASH });
});

// ログイン処理
app.post('/login', (req, res) => {
  const { password } = req.body;

  if (password === PASSWORD) {
    req.session.authenticated = true;
    res.redirect('/');
  } else {
    res.render('login', { error: 'パスワードが正しくありません', commitHash: COMMIT_HASH });
  }
});

// ログアウト
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// 認証チェックミドルウェア（ログイン関連以外のすべてのルートに適用）
app.use((req, res, next) => {
  // ログインページとログアウトは認証不要
  if (req.path === '/login' || req.path === '/logout') {
    return next();
  }

  // 認証されているかチェック
  if (req.session.authenticated) {
    next();
  } else {
    res.redirect('/login');
  }
});

// ======== 児童管理 ========

// 児童一覧・登録画面
app.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM children ORDER BY created_at DESC');
    res.render('index', { children: result.rows, commitHash: COMMIT_HASH });
  } catch (error) {
    console.error('児童一覧取得エラー:', error);
    res.status(500).send('エラーが発生しました');
  }
});

// 児童登録API
app.post('/api/children', async (req, res) => {
  try {
    const { name, grade, birth_year, birth_month, enrollment_year, enrollment_month, notes } = req.body;
    const result = await pool.query(
      'INSERT INTO children (name, grade, birth_year, birth_month, enrollment_year, enrollment_month, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [name, grade, birth_year || null, birth_month || null, enrollment_year || null, enrollment_month || null, notes]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('児童登録エラー:', error);
    res.status(500).json({ success: false, message: 'エラーが発生しました' });
  }
});

// 児童削除API
app.delete('/api/children/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM children WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('児童削除エラー:', error);
    res.status(500).json({ success: false, message: 'エラーが発生しました' });
  }
});

// ======== 単語リスト管理 ========

// 単語リスト管理画面
app.get('/word-lists', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM word_lists ORDER BY created_at DESC');
    res.render('word-lists', { wordLists: result.rows, commitHash: COMMIT_HASH });
  } catch (error) {
    console.error('単語リスト取得エラー:', error);
    res.status(500).send('エラーが発生しました');
  }
});

// 単語リスト詳細・編集画面
app.get('/word-lists/:id', async (req, res) => {
  try {
    const wordListResult = await pool.query('SELECT * FROM word_lists WHERE id = $1', [req.params.id]);
    const wordsResult = await pool.query('SELECT * FROM words WHERE word_list_id = $1 ORDER BY display_order', [req.params.id]);

    if (wordListResult.rows.length === 0) {
      return res.status(404).send('単語リストが見つかりません');
    }

    res.render('word-list-detail', { wordList: wordListResult.rows[0], words: wordsResult.rows, commitHash: COMMIT_HASH });
  } catch (error) {
    console.error('単語リスト詳細取得エラー:', error);
    res.status(500).send('エラーが発生しました');
  }
});

// 単語リスト作成API
app.post('/api/word-lists', async (req, res) => {
  try {
    const { name, description } = req.body;
    const result = await pool.query(
      'INSERT INTO word_lists (name, description) VALUES ($1, $2) RETURNING id',
      [name, description]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('単語リスト作成エラー:', error);
    res.status(500).json({ success: false, message: 'エラーが発生しました' });
  }
});

// 単語リスト一覧取得API（簡易版）
app.get('/api/word-lists-simple', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, description FROM word_lists ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('単語リスト一覧取得エラー:', error);
    res.status(500).json({ success: false, message: 'エラーが発生しました' });
  }
});

// 単語追加API
app.post('/api/words', async (req, res) => {
  try {
    const { word_list_id, word_text } = req.body;

    // 最大のdisplay_orderを取得
    const maxOrderResult = await pool.query(
      'SELECT MAX(display_order) as max FROM words WHERE word_list_id = $1',
      [word_list_id]
    );
    const displayOrder = (maxOrderResult.rows[0].max || 0) + 1;

    const result = await pool.query(
      'INSERT INTO words (word_list_id, word_text, display_order) VALUES ($1, $2, $3) RETURNING id',
      [word_list_id, word_text, displayOrder]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('単語追加エラー:', error);
    res.status(500).json({ success: false, message: 'エラーが発生しました' });
  }
});

// 単語一括追加API（スペース区切り対応）
app.post('/api/words/bulk', async (req, res) => {
  try {
    const { word_list_id, words } = req.body;

    if (!Array.isArray(words) || words.length === 0) {
      return res.status(400).json({ success: false, message: '単語が指定されていません' });
    }

    // 最大のdisplay_orderを取得
    const maxOrderResult = await pool.query(
      'SELECT MAX(display_order) as max FROM words WHERE word_list_id = $1',
      [word_list_id]
    );
    let displayOrder = (maxOrderResult.rows[0].max || 0) + 1;

    // トランザクションで複数の単語を追加
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const insertedIds = [];
      for (const word of words) {
        const result = await client.query(
          'INSERT INTO words (word_list_id, word_text, display_order) VALUES ($1, $2, $3) RETURNING id',
          [word_list_id, word.trim(), displayOrder]
        );
        insertedIds.push(result.rows[0].id);
        displayOrder++;
      }

      await client.query('COMMIT');
      console.log(`[SUCCESS] ${words.length}個の単語を追加しました`);
      res.json({ success: true, count: words.length, ids: insertedIds });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('単語一括追加エラー:', error);
    res.status(500).json({ success: false, message: 'エラーが発生しました' });
  }
});

// 単語削除API
app.delete('/api/words/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM words WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('単語削除エラー:', error);
    res.status(500).json({ success: false, message: 'エラーが発生しました' });
  }
});

// 単語ファイルアップロード用のMulter設定
const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const documentUpload = multer({
  storage: documentStorage,
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.pdf', '.docx', '.doc'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('PDF、Word文書 (.pdf, .docx, .doc) のみアップロード可能です'));
    }
  }
});

// 文書から単語を抽出してリストに追加するAPI
app.post('/api/word-lists/:id/import', documentUpload.single('documentFile'), async (req, res) => {
  console.log('[DEBUG] 文書ファイルアップロード開始:', req.file);

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'ファイルがアップロードされていません' });
  }

  const wordListId = req.params.id;
  const filePath = req.file.path;
  const fileExt = path.extname(req.file.originalname).toLowerCase();

  try {
    let text = '';

    // ファイル形式に応じてテキスト抽出
    if (fileExt === '.pdf') {
      console.log('[DEBUG] PDFファイルをパース中');
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      text = pdfData.text;
    } else if (fileExt === '.docx' || fileExt === '.doc') {
      console.log('[DEBUG] Wordファイルをパース中');
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value;
    }

    console.log('[DEBUG] 抽出されたテキスト長:', text.length);

    // テキストから単語を抽出（改行・スペースで区切り、空白や記号のみの行を除外）
    const words = text
      .split(/[\r\n\s]+/)
      .map(word => word.trim())
      .filter(word => word.length > 0 && /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\w]+/.test(word)); // ひらがな、カタカナ、漢字、英数字を含む

    console.log('[DEBUG] 抽出された単語数:', words.length);

    if (words.length === 0) {
      // アップロードファイル削除
      fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, message: '単語が抽出できませんでした' });
    }

    // 最大のdisplay_orderを取得
    const maxOrderResult = await pool.query(
      'SELECT MAX(display_order) as max FROM words WHERE word_list_id = $1',
      [wordListId]
    );
    let displayOrder = (maxOrderResult.rows[0].max || 0) + 1;

    // 単語をデータベースに追加（トランザクション使用）
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const word of words) {
        await client.query(
          'INSERT INTO words (word_list_id, word_text, display_order) VALUES ($1, $2, $3)',
          [wordListId, word, displayOrder]
        );
        displayOrder++;
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // アップロードファイル削除
    fs.unlinkSync(filePath);

    console.log('[SUCCESS] 単語インポート完了:', words.length, '件');
    res.json({ success: true, count: words.length, words: words.slice(0, 10) }); // 最初の10件のみ返す
  } catch (error) {
    console.error('[ERROR] 文書パースエラー:', error);
    // エラー時はファイルを削除
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.status(500).json({ success: false, message: 'ファイルの読み込みに失敗しました: ' + error.message });
  }
});

// ======== フォント管理 ========

// フォント管理画面
app.get('/fonts', (req, res) => {
  res.render('fonts', { commitHash: COMMIT_HASH });
});

// フォント一覧取得API
app.get('/api/fonts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM fonts WHERE is_active = true ORDER BY font_type, name');
    res.json(result.rows);
  } catch (error) {
    console.error('フォント一覧取得エラー:', error);
    res.status(500).json({ success: false, message: 'エラーが発生しました' });
  }
});

// フォントアップロードAPI
app.post('/api/fonts/upload', upload.single('fontFile'), async (req, res) => {
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
    const result = await pool.query(
      'INSERT INTO fonts (name, font_family, font_type, file_path) VALUES ($1, $2, $3, $4) RETURNING id',
      [fontName, fontFamily, 'custom', fontPath]
    );

    console.log('[SUCCESS] フォント登録完了:', { id: result.rows[0].id, fontName });
    res.json({ success: true, id: result.rows[0].id, fontPath });
  } catch (error) {
    console.error('[ERROR] フォント登録失敗:', error);
    // エラー時はファイルを削除
    fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: 'データベース登録に失敗しました' });
  }
});

// フォント削除API
app.delete('/api/fonts/:id', async (req, res) => {
  console.log('[DEBUG] フォント削除:', req.params.id);

  try {
    const fontResult = await pool.query('SELECT * FROM fonts WHERE id = $1', [req.params.id]);

    if (fontResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'フォントが見つかりません' });
    }

    const font = fontResult.rows[0];

    // カスタムフォントの場合はファイルも削除
    if (font.font_type === 'custom' && font.file_path) {
      const filePath = path.join(__dirname, 'public', font.file_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('[DEBUG] フォントファイル削除:', filePath);
      }
    }

    await pool.query('DELETE FROM fonts WHERE id = $1', [req.params.id]);

    console.log('[SUCCESS] フォント削除完了:', font.name);
    res.json({ success: true });
  } catch (error) {
    console.error('フォント削除エラー:', error);
    res.status(500).json({ success: false, message: 'エラーが発生しました' });
  }
});

// ======== 読み上げテスト ========

// テスト実施画面
app.get('/test/:childId/:wordListId', async (req, res) => {
  try {
    const childResult = await pool.query('SELECT * FROM children WHERE id = $1', [req.params.childId]);
    const wordListResult = await pool.query('SELECT * FROM word_lists WHERE id = $1', [req.params.wordListId]);
    const wordsResult = await pool.query('SELECT * FROM words WHERE word_list_id = $1 ORDER BY display_order', [req.params.wordListId]);
    const fontsResult = await pool.query('SELECT * FROM fonts WHERE is_active = true ORDER BY font_type, name');

    if (childResult.rows.length === 0 || wordListResult.rows.length === 0) {
      return res.status(404).send('データが見つかりません');
    }

    res.render('test', {
      child: childResult.rows[0],
      wordList: wordListResult.rows[0],
      words: wordsResult.rows,
      fonts: fontsResult.rows,
      commitHash: COMMIT_HASH
    });
  } catch (error) {
    console.error('テスト画面取得エラー:', error);
    res.status(500).send('エラーが発生しました');
  }
});

// テスト結果記録API
app.post('/api/reading-records', async (req, res) => {
  const { child_id, word_id, could_read, reading_time_seconds, misread_as, notes, font_id } = req.body;

  console.log('[DEBUG] テスト結果記録:', { child_id, word_id, could_read, reading_time_seconds, font_id });

  try {
    const result = await pool.query(
      `INSERT INTO reading_records (child_id, word_id, could_read, reading_time_seconds, misread_as, notes, font_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [child_id, word_id, could_read, reading_time_seconds, misread_as, notes, font_id]
    );

    console.log('[SUCCESS] テスト結果記録完了:', result.rows[0].id);

    // Firebaseにも保存（追加情報を取得して送信）
    try {
      const recordDetailsResult = await pool.query(
        `SELECT
          c.name as child_name,
          c.grade as child_grade,
          w.word_text,
          wl.name as word_list_name,
          f.name as font_name
        FROM children c
        JOIN words w ON w.id = $1
        JOIN word_lists wl ON w.word_list_id = wl.id
        LEFT JOIN fonts f ON f.id = $2
        WHERE c.id = $3`,
        [word_id, font_id, child_id]
      );

      if (recordDetailsResult.rows.length > 0) {
        const recordDetails = recordDetailsResult.rows[0];
        await saveReadingRecordToFirebase({
          ...recordDetails,
          could_read,
          reading_time_seconds,
          misread_as,
          notes
        });
      }
    } catch (error) {
      console.error('[ERROR] Firebase保存エラー:', error.message);
      // エラーが発生してもローカルDBには保存されているので続行
    }

    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('テスト結果記録エラー:', error);
    res.status(500).json({ success: false, message: 'エラーが発生しました' });
  }
});

// ======== データ分析 ========

// データ閲覧・分析画面
app.get('/analysis', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM children ORDER BY name');
    res.render('analysis', { children: result.rows, commitHash: COMMIT_HASH });
  } catch (error) {
    console.error('分析画面取得エラー:', error);
    res.status(500).send('エラーが発生しました');
  }
});

// 児童別の成績データ取得API
app.get('/api/analysis/:childId', async (req, res) => {
  try {
    const recordsResult = await pool.query(
      `SELECT
        rr.id,
        rr.test_date,
        w.word_text,
        wl.name as word_list_name,
        rr.could_read,
        rr.reading_time_seconds,
        rr.misread_as,
        rr.notes,
        rr.font_id,
        f.name as font_name
      FROM reading_records rr
      JOIN words w ON rr.word_id = w.id
      JOIN word_lists wl ON w.word_list_id = wl.id
      LEFT JOIN fonts f ON rr.font_id = f.id
      WHERE rr.child_id = $1
      ORDER BY rr.test_date DESC`,
      [req.params.childId]
    );

    const statsResult = await pool.query(
      `SELECT
        COUNT(*) as total_tests,
        SUM(CASE WHEN could_read THEN 1 ELSE 0 END) as successful_reads,
        AVG(reading_time_seconds) as avg_time,
        COUNT(CASE WHEN misread_as IS NOT NULL THEN 1 END) as misread_count,
        COUNT(DISTINCT DATE(test_date)) as test_days
      FROM reading_records
      WHERE child_id = $1`,
      [req.params.childId]
    );

    res.json({
      records: recordsResult.rows,
      stats: statsResult.rows[0]
    });
  } catch (error) {
    console.error('分析データ取得エラー:', error);
    res.status(500).json({ success: false, message: 'エラーが発生しました' });
  }
});

// ======== 管理機能 ========

// 単語リストリセットAPI（パスワード保護）
app.post('/api/admin/reset-word-lists', async (req, res) => {
  const { password } = req.body;

  // パスワード確認
  if (password !== PASSWORD) {
    return res.status(403).json({ success: false, message: 'パスワードが正しくありません' });
  }

  console.log('[DEBUG] 単語リストリセット開始');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 既存の単語リストと単語を削除
    await client.query('DELETE FROM words');
    await client.query('DELETE FROM word_lists');
    console.log('[DEBUG] 既存の単語リストを削除しました');

    // 新しい単語リストを追加
    const wordListInsert = await client.query(
      'INSERT INTO word_lists (name, description) VALUES ($1, $2) RETURNING id',
      ['Basic English Words', 'Common English words for beginners']
    );
    const wordListId = wordListInsert.rows[0].id;

    // 新しい単語を追加
    const sampleWords = [
      'em', 'tad', 'pev', 'ret', 'hame', 'flate', 'drap', 'wick'
    ];

    for (let i = 0; i < sampleWords.length; i++) {
      await client.query(
        'INSERT INTO words (word_list_id, word_text, display_order) VALUES ($1, $2, $3)',
        [wordListId, sampleWords[i], i + 1]
      );
    }

    await client.query('COMMIT');
    console.log('[SUCCESS] 単語リストをリセットしました');

    res.json({ success: true, message: '単語リストをリセットしました', wordCount: sampleWords.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[ERROR] 単語リストリセットエラー:', error);
    res.status(500).json({ success: false, message: 'エラーが発生しました: ' + error.message });
  } finally {
    client.release();
  }
});

app.listen(PORT, () => {
  console.log(`サーバーが起動しました: http://localhost:${PORT}`);
});
