/**
 * Database.gs — lapisan akses data berbasis Google Sheets.
 *
 * Setiap "tabel" adalah satu sheet. Skema didefinisikan di SCHEMA:
 *   's' = string (kolom diformat teks agar "001" atau "1/2" tidak diubah Sheets)
 *   'n' = number, 'b' = boolean
 * Kolom pertama selalu menjadi primary key (id).
 */

const SCHEMA = {
  Users: [
    ['id', 's'], ['username', 's'], ['name', 's'], ['class', 's'], ['role', 's'],
    ['pass', 's'], ['active', 'b'], ['createdAt', 'n']
  ],
  Questions: [
    ['id', 's'], ['topic', 's'], ['text', 's'], ['a', 's'], ['b', 's'], ['c', 's'],
    ['d', 's'], ['e', 's'], ['correct', 's'], ['explanation', 's'], ['createdAt', 'n']
  ],
  Exams: [
    ['id', 's'], ['title', 's'], ['description', 's'], ['duration', 'n'],
    ['questionIds', 's'], ['shuffle', 'b'], ['showReview', 'b'], ['maxAttempts', 'n'],
    ['passScore', 'n'], ['targetClass', 's'], ['active', 'b'], ['createdAt', 'n']
  ],
  Attempts: [
    ['id', 's'], ['examId', 's'], ['userId', 's'], ['startedAt', 'n'], ['deadline', 'n'],
    ['submittedAt', 'n'], ['status', 's'], ['order', 's'], ['answers', 's'],
    ['score', 'n'], ['correctCount', 'n'], ['total', 'n']
  ],
  // Satu baris per soal per percobaan (diisi saat submit) — dasar analisis butir soal.
  Answers: [
    ['attemptId', 's'], ['examId', 's'], ['userId', 's'], ['questionId', 's'],
    ['chosen', 's'], ['correct', 's'], ['isCorrect', 'b']
  ]
};

let SS_CACHE_ = null;
const SHEET_CACHE_ = {};

class UserError extends Error {}
class AuthError extends Error {}

/** Mengambil spreadsheet database (bound, tersimpan di properti, atau dibuat baru). */
function getSS_() {
  if (SS_CACHE_) return SS_CACHE_;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SS_ID');
  let ss = null;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
    if (!ss) ss = SpreadsheetApp.create('E-Assessment DB');
    props.setProperty('SS_ID', ss.getId());
  }
  SS_CACHE_ = ss;
  return ss;
}

function sheet_(name) {
  if (SHEET_CACHE_[name]) return SHEET_CACHE_[name];
  const ss = getSS_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = createSheet_(ss, name);
  SHEET_CACHE_[name] = sh;
  return sh;
}

function createSheet_(ss, name) {
  const sc = SCHEMA[name];
  const sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, sc.length).setValues([sc.map(c => c[0])])
    .setFontWeight('bold').setBackground('#e8eaf6');
  sh.setFrozenRows(1);
  sc.forEach((c, i) => {
    if (c[1] === 's') sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
  });
  // Hapus sheet kosong bawaan ("Sheet1"/"Lembar1") bila ada
  ss.getSheets().forEach(s => {
    if (s.getName() !== name && /^(Sheet|Lembar)\s?1$/.test(s.getName()) && s.getLastRow() === 0 && ss.getSheets().length > 1) {
      try { ss.deleteSheet(s); } catch (e) { /* abaikan */ }
    }
  });
  if (name === 'Users') seedTeacher_(sh);
  return sh;
}

/** Akun guru bawaan agar aplikasi langsung bisa dipakai. Segera ganti password-nya! */
function seedTeacher_(sh) {
  const row = toRow_('Users', {
    id: newId_('U'), username: 'guru', name: 'Guru Admin', class: '', role: 'teacher',
    pass: hashPassword_(DEFAULT_TEACHER_PASSWORD), active: true, createdAt: Date.now()
  });
  sh.getRange(2, 1, 1, row.length).setValues([row]);
}

const DEFAULT_TEACHER_PASSWORD = 'guru123';

function newId_(prefix) {
  return prefix + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
}

function cols_(name) { return SCHEMA[name].map(c => c[0]); }

function coerce_(v, t) {
  if (t === 'n') {
    if (v === '' || v == null) return 0;
    const x = Number(v);
    return isNaN(x) ? 0 : x;
  }
  if (t === 'b') return v === true || String(v).toUpperCase() === 'TRUE';
  return v == null ? '' : String(v);
}

function toRow_(name, o) {
  return SCHEMA[name].map(c => {
    const v = o[c[0]];
    if (c[1] === 'n') return Number(v) || 0;
    if (c[1] === 'b') return !!v;
    return v == null ? '' : String(v);
  });
}

function fromRow_(name, r, rowNum) {
  const o = { _row: rowNum };
  SCHEMA[name].forEach((c, j) => { o[c[0]] = coerce_(r[j], c[1]); });
  return o;
}

/** Baca seluruh baris tabel sebagai array objek. */
function all_(name) {
  const sh = sheet_(name);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, SCHEMA[name].length).getValues();
  return vals.map((r, i) => fromRow_(name, r, i + 2));
}

function mapBy_(arr, key) {
  key = key || 'id';
  const m = {};
  arr.forEach(x => { m[x[key]] = x; });
  return m;
}

function findRow_(name, id) {
  const sh = sheet_(name);
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  const target = String(id);
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === target) return i + 2;
  return 0;
}

function get_(name, id) {
  const row = findRow_(name, id);
  if (!row) return null;
  const sh = sheet_(name);
  const r = sh.getRange(row, 1, 1, SCHEMA[name].length).getValues()[0];
  return fromRow_(name, r, row);
}

function insert_(name, o) {
  insertMany_(name, [o]);
}

function insertMany_(name, objs) {
  if (!objs.length) return;
  const sh = sheet_(name);
  const rows = objs.map(o => toRow_(name, o));
  const start = sh.getLastRow() + 1;
  const need = start + rows.length - 1;
  if (need > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  sh.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
}

/** Update baris berdasarkan id (id harus sudah ada). */
function update_(name, o) {
  const row = findRow_(name, o[SCHEMA[name][0][0]]);
  if (!row) throw new UserError('Data tidak ditemukan.');
  const r = toRow_(name, o);
  sheet_(name).getRange(row, 1, 1, r.length).setValues([r]);
}

function delete_(name, id) {
  const row = findRow_(name, id);
  if (row) sheet_(name).deleteRow(row);
}

/** Hapus semua baris yang nilai kolom `colName`-nya ada di Set `values`. */
function deleteWhere_(name, colName, values) {
  const sh = sheet_(name);
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const n = SCHEMA[name].length;
  const idx = cols_(name).indexOf(colName);
  const rng = sh.getRange(2, 1, last - 1, n);
  const data = rng.getValues();
  const keep = data.filter(r => !values.has(String(r[idx])));
  const removed = data.length - keep.length;
  if (!removed) return 0;
  rng.clearContent();
  if (keep.length) sh.getRange(2, 1, keep.length, n).setValues(keep);
  return removed;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/** Pastikan semua sheet ada. Aman dijalankan berulang kali. */
function setup() {
  Object.keys(SCHEMA).forEach(sheet_);
  const url = getSS_().getUrl();
  console.log('Database siap: ' + url);
  console.log('Login guru bawaan -> username: guru | password: ' + DEFAULT_TEACHER_PASSWORD);
  return url;
}
