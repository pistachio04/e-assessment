/**
 * Teacher.gs — manajemen bank soal, paket ujian, dan siswa.
 */

function str_(v) { return String(v == null ? '' : v).trim(); }

// ---------------------------------------------------------------- Bank soal

function listQuestions_() {
  return all_('Questions').map(q => { delete q._row; return q; })
    .sort((a, b) => b.createdAt - a.createdAt);
}

function cleanQuestion_(q) {
  const o = {
    id: str_(q.id), topic: str_(q.topic) || 'Umum', text: str_(q.text),
    a: str_(q.a), b: str_(q.b), c: str_(q.c), d: str_(q.d), e: str_(q.e),
    correct: str_(q.correct).toLowerCase(), explanation: str_(q.explanation)
  };
  if (!o.text) throw new UserError('Teks soal wajib diisi.');
  if (!o.a || !o.b) throw new UserError('Minimal opsi A dan B harus diisi.');
  if (OPTION_KEYS.indexOf(o.correct) < 0 || !o[o.correct]) {
    throw new UserError('Kunci jawaban harus salah satu opsi yang terisi.');
  }
  return o;
}

function saveQuestion_(p) {
  const o = cleanQuestion_(p);
  return withLock_(() => {
    if (o.id) {
      const old = get_('Questions', o.id);
      if (!old) throw new UserError('Soal tidak ditemukan.');
      o.createdAt = old.createdAt;
      update_('Questions', o);
    } else {
      o.id = newId_('Q');
      o.createdAt = Date.now();
      insert_('Questions', o);
    }
    return { id: o.id };
  });
}

function deleteQuestion_(p) {
  return withLock_(() => {
    delete_('Questions', p.id);
    // Lepaskan dari paket ujian yang memakainya
    all_('Exams').forEach(e => {
      const ids = parseJson_(e.questionIds, []);
      if (ids.indexOf(p.id) >= 0) {
        e.questionIds = JSON.stringify(ids.filter(x => x !== p.id));
        update_('Exams', e);
      }
    });
    return true;
  });
}

function importQuestions_(p) {
  const rows = p.rows || [];
  if (!rows.length) throw new UserError('Tidak ada data untuk diimpor.');
  if (rows.length > 500) throw new UserError('Maksimal 500 soal per impor.');
  const good = [], errors = [];
  const now = Date.now();
  rows.forEach((r, i) => {
    try {
      const o = cleanQuestion_(r);
      o.id = newId_('Q');
      o.createdAt = now + i;
      good.push(o);
    } catch (e) {
      errors.push('Baris ' + (i + 1) + ': ' + e.message);
    }
  });
  withLock_(() => insertMany_('Questions', good));
  return { added: good.length, errors: errors };
}

// -------------------------------------------------------------- Paket ujian

function listExamsTeacher_() {
  const attempts = latestAttempts_(all_('Attempts'));
  const qMap = mapBy_(all_('Questions'));
  return all_('Exams').map(e => {
    const ids = parseJson_(e.questionIds, []).filter(id => qMap[id]);
    const mine = attempts.filter(a => a.examId === e.id);
    delete e._row;
    e.questionIds = ids;
    e.attemptCount = mine.length;
    e.avgScore = mine.length ? Math.round(mine.reduce((s, a) => s + a.score, 0) / mine.length * 10) / 10 : null;
    return e;
  }).sort((a, b) => b.createdAt - a.createdAt);
}

function saveExam_(p) {
  const qMap = mapBy_(all_('Questions'));
  const ids = (p.questionIds || []).filter((id, i, arr) => qMap[id] && arr.indexOf(id) === i);
  const o = {
    id: str_(p.id), title: str_(p.title), description: str_(p.description),
    duration: Math.max(0, Math.floor(Number(p.duration) || 0)),
    questionIds: JSON.stringify(ids),
    shuffle: !!p.shuffle, showReview: !!p.showReview,
    maxAttempts: Math.max(0, Math.floor(Number(p.maxAttempts) || 0)),
    passScore: Math.min(100, Math.max(0, Number(p.passScore) || 0)),
    targetClass: str_(p.targetClass), active: !!p.active
  };
  if (!o.title) throw new UserError('Judul ujian wajib diisi.');
  if (!ids.length) throw new UserError('Pilih minimal satu soal.');
  return withLock_(() => {
    if (o.id) {
      const old = get_('Exams', o.id);
      if (!old) throw new UserError('Ujian tidak ditemukan.');
      o.createdAt = old.createdAt;
      update_('Exams', o);
    } else {
      o.id = newId_('E');
      o.createdAt = Date.now();
      insert_('Exams', o);
    }
    return { id: o.id };
  });
}

function deleteExam_(p) {
  return withLock_(() => {
    const attIds = new Set(all_('Attempts').filter(a => a.examId === p.id).map(a => a.id));
    delete_('Exams', p.id);
    deleteWhere_('Answers', 'examId', new Set([p.id]));
    deleteWhere_('Attempts', 'examId', new Set([p.id]));
    return { removedAttempts: attIds.size };
  });
}

// ------------------------------------------------------------------- Siswa

function listStudents_() {
  const attempts = latestAttempts_(all_('Attempts'));
  return all_('Users').filter(u => u.role === 'student').map(u => {
    const mine = attempts.filter(a => a.userId === u.id);
    return {
      id: u.id, username: u.username, name: u.name, class: u.class, active: u.active,
      attemptCount: mine.length,
      avgScore: mine.length ? Math.round(mine.reduce((s, a) => s + a.score, 0) / mine.length * 10) / 10 : null
    };
  }).sort((a, b) => (a.class + a.name).localeCompare(b.class + b.name));
}

function randomPassword_() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';   // tanpa karakter yang mirip (l, 1, o, 0, i)
  let s = '';
  for (let i = 0; i < 6; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function usernameTaken_(username, exceptId) {
  const lower = username.toLowerCase();
  return all_('Users').some(u => u.username.toLowerCase() === lower && u.id !== exceptId);
}

function saveStudent_(p) {
  const username = str_(p.username).toLowerCase();
  const name = str_(p.name);
  if (!username || !name) throw new UserError('Username dan nama wajib diisi.');
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    throw new UserError('Username 3–30 karakter: huruf kecil, angka, titik, strip, atau underscore.');
  }
  const password = String(p.password || '');
  return withLock_(() => {
    if (p.id) {
      const u = get_('Users', p.id);
      if (!u || u.role !== 'student') throw new UserError('Siswa tidak ditemukan.');
      if (usernameTaken_(username, u.id)) throw new UserError('Username sudah dipakai.');
      u.username = username; u.name = name; u.class = str_(p.class); u.active = !!p.active;
      if (password) {
        if (password.length < 4) throw new UserError('Password minimal 4 karakter.');
        u.pass = hashPassword_(password);
      }
      update_('Users', u);
      return { id: u.id };
    }
    if (usernameTaken_(username)) throw new UserError('Username sudah dipakai.');
    if (password.length < 4) throw new UserError('Password minimal 4 karakter.');
    const u = {
      id: newId_('U'), username: username, name: name, class: str_(p.class),
      role: 'student', pass: hashPassword_(password), active: p.active !== false,
      createdAt: Date.now()
    };
    insert_('Users', u);
    return { id: u.id };
  });
}

function deleteStudent_(p) {
  return withLock_(() => {
    const u = get_('Users', p.id);
    if (!u || u.role !== 'student') throw new UserError('Siswa tidak ditemukan.');
    delete_('Users', u.id);
    deleteWhere_('Answers', 'userId', new Set([u.id]));
    deleteWhere_('Attempts', 'userId', new Set([u.id]));
    return true;
  });
}

function resetPassword_(p) {
  return withLock_(() => {
    const u = get_('Users', p.id);
    if (!u || u.role !== 'student') throw new UserError('Siswa tidak ditemukan.');
    const pw = randomPassword_();
    u.pass = hashPassword_(pw);
    update_('Users', u);
    return { username: u.username, name: u.name, password: pw };
  });
}

/** Impor massal siswa. Password kosong -> dibuatkan acak, dikembalikan untuk dicetak. */
function importStudents_(p) {
  const rows = p.rows || [];
  if (!rows.length) throw new UserError('Tidak ada data untuk diimpor.');
  if (rows.length > 500) throw new UserError('Maksimal 500 siswa per impor.');
  return withLock_(() => {
    const taken = new Set(all_('Users').map(u => u.username.toLowerCase()));
    const users = [], credentials = [], errors = [];
    const now = Date.now();
    rows.forEach((r, i) => {
      const username = str_(r.username).toLowerCase();
      const name = str_(r.name);
      if (!username || !name) { errors.push('Baris ' + (i + 1) + ': username/nama kosong'); return; }
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) { errors.push('Baris ' + (i + 1) + ': username "' + username + '" tidak valid'); return; }
      if (taken.has(username)) { errors.push('Baris ' + (i + 1) + ': username "' + username + '" sudah ada'); return; }
      taken.add(username);
      const pw = str_(r.password) || randomPassword_();
      users.push({
        id: newId_('U'), username: username, name: name, class: str_(r.class),
        role: 'student', pass: hashPassword_(pw), active: true, createdAt: now + i
      });
      credentials.push({ username: username, name: name, class: str_(r.class), password: pw });
    });
    insertMany_('Users', users);
    return { added: users.length, errors: errors, credentials: credentials };
  });
}
