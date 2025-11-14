const { google } = require('googleapis');
require('dotenv').config();

/**
 * Google Sheets APIクライアントを初期化
 */
function getGoogleSheetsClient() {
  // サービスアカウントキーの確認
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    console.warn('[Google Sheets] サービスアカウント設定が見つかりません。Google Sheets連携は無効です。');
    return null;
  }

  try {
    const auth = new google.auth.JWT(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      null,
      // 環境変数の改行文字を実際の改行に置換
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    const sheets = google.sheets({ version: 'v4', auth });
    console.log('[Google Sheets] クライアント初期化成功');
    return sheets;
  } catch (error) {
    console.error('[Google Sheets] クライアント初期化エラー:', error.message);
    return null;
  }
}

/**
 * テスト結果をGoogle Sheetsに記録
 * @param {Object} data - テスト結果データ
 */
async function saveReadingRecordToSheets(data) {
  const sheets = getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  // Google Sheets設定がない場合はスキップ
  if (!sheets || !spreadsheetId) {
    console.log('[Google Sheets] 設定が無効のため、スキップします');
    return false;
  }

  try {
    const timestamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    // データ行を準備
    const row = [
      timestamp,                           // 記録日時
      data.child_name || '',              // 児童名
      data.child_grade || '',             // 学年
      data.word_text || '',               // 単語
      data.word_list_name || '',          // 単語リスト名
      data.could_read ? '○' : '×',        // 読めたか
      data.reading_time_seconds || 0,     // 読み時間（秒）
      data.misread_as || '',              // 読み間違い
      data.notes || '',                   // 備考
      data.font_name || ''                // 使用フォント
    ];

    // スプレッドシートに追加
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'テスト記録!A:J', // シート名「テスト記録」のA列からJ列
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [row]
      }
    });

    console.log('[Google Sheets] データ保存成功:', data.child_name, data.word_text);
    return true;
  } catch (error) {
    console.error('[Google Sheets] データ保存エラー:', error.message);
    return false;
  }
}

/**
 * Google Sheetsに初期ヘッダーを作成（初回のみ手動で実行）
 */
async function createSheetsHeader() {
  const sheets = getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  if (!sheets || !spreadsheetId) {
    console.error('[Google Sheets] 設定が見つかりません');
    return false;
  }

  try {
    const header = [
      '記録日時',
      '児童名',
      '学年',
      '単語',
      '単語リスト',
      '読めたか',
      '読み時間（秒）',
      '読み間違い',
      '備考',
      'フォント'
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'テスト記録!A1:J1',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [header]
      }
    });

    console.log('[Google Sheets] ヘッダー作成成功');
    return true;
  } catch (error) {
    console.error('[Google Sheets] ヘッダー作成エラー:', error.message);
    return false;
  }
}

module.exports = {
  saveReadingRecordToSheets,
  createSheetsHeader
};
