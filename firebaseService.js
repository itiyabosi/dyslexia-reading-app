const admin = require('firebase-admin');
require('dotenv').config();

let firebaseInitialized = false;

/**
 * Firebase Admin SDKを初期化
 */
function initializeFirebase() {
  if (firebaseInitialized) {
    return true;
  }

  // 環境変数から認証情報を取得
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!serviceAccount) {
    console.warn('[Firebase] サービスアカウント設定が見つかりません。Firebase連携は無効です。');
    return false;
  }

  try {
    // JSON文字列をパース
    const serviceAccountObj = JSON.parse(serviceAccount);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountObj),
      databaseURL: process.env.FIREBASE_DATABASE_URL || undefined
    });

    firebaseInitialized = true;
    console.log('[Firebase] 初期化成功');
    return true;
  } catch (error) {
    console.error('[Firebase] 初期化エラー:', error.message);
    return false;
  }
}

/**
 * テスト結果をFirestoreに保存
 * @param {Object} data - テスト結果データ
 */
async function saveReadingRecordToFirebase(data) {
  if (!initializeFirebase()) {
    console.log('[Firebase] 設定が無効のため、スキップします');
    return false;
  }

  try {
    const db = admin.firestore();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    // Firestoreに保存するデータ
    const record = {
      child_name: data.child_name || '',
      child_grade: data.child_grade || '',
      word_text: data.word_text || '',
      word_list_name: data.word_list_name || '',
      could_read: data.could_read ? true : false,
      reading_time_seconds: data.reading_time_seconds || 0,
      misread_as: data.misread_as || '',
      notes: data.notes || '',
      font_name: data.font_name || '',
      created_at: timestamp
    };

    // reading_recordsコレクションに追加
    const docRef = await db.collection('reading_records').add(record);

    console.log('[Firebase] データ保存成功:', docRef.id, '-', data.child_name, data.word_text);
    return true;
  } catch (error) {
    console.error('[Firebase] データ保存エラー:', error.message);
    return false;
  }
}

/**
 * 児童の全テスト記録を取得（オプション機能）
 * @param {string} childName - 児童名
 */
async function getReadingRecordsByChild(childName) {
  if (!initializeFirebase()) {
    console.log('[Firebase] 設定が無効のため、スキップします');
    return [];
  }

  try {
    const db = admin.firestore();
    const snapshot = await db.collection('reading_records')
      .where('child_name', '==', childName)
      .orderBy('created_at', 'desc')
      .get();

    const records = [];
    snapshot.forEach(doc => {
      records.push({
        id: doc.id,
        ...doc.data()
      });
    });

    console.log('[Firebase] データ取得成功:', records.length, '件');
    return records;
  } catch (error) {
    console.error('[Firebase] データ取得エラー:', error.message);
    return [];
  }
}

/**
 * すべてのテスト記録を取得（オプション機能）
 */
async function getAllReadingRecords() {
  if (!initializeFirebase()) {
    console.log('[Firebase] 設定が無効のため、スキップします');
    return [];
  }

  try {
    const db = admin.firestore();
    const snapshot = await db.collection('reading_records')
      .orderBy('created_at', 'desc')
      .limit(100) // 最新100件
      .get();

    const records = [];
    snapshot.forEach(doc => {
      records.push({
        id: doc.id,
        ...doc.data()
      });
    });

    console.log('[Firebase] 全データ取得成功:', records.length, '件');
    return records;
  } catch (error) {
    console.error('[Firebase] 全データ取得エラー:', error.message);
    return [];
  }
}

module.exports = {
  initializeFirebase,
  saveReadingRecordToFirebase,
  getReadingRecordsByChild,
  getAllReadingRecords
};
