/**
 * Student.gs — alur ujian siswa.
 *
 * Prinsip keamanan: kunci jawaban TIDAK PERNAH dikirim ke siswa sebelum submit,
 * penilaian dilakukan di server, dan batas waktu dicek di server.
 */

const GRACE_MS = 15000;   // toleransi keterlambatan jaringan saat submit

const OPTION_KEYS = ['a', 'b', 'c', 'd', 'e'];

function shuffle_(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function parseJson_(s, fallback) {
  try { return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; }
}

function isExpired_(att) {
  return att.deadline > 0 && Date.now() > att.deadline + GRACE_MS;
}

function examVisibleTo_(exam, user) {
  if (!exam.active) return false;
  if (!exam.targetClass) return true;
  return exam.targetClass.toLowerCase() === String(user.class).toLowerCase();
}

/** Kumpulkan otomatis percobaan yang waktunya sudah habis. */
function finalizeExpiredFor_(userId) {
  all_('Attempts')
    .filter(a => a.userId === userId && a.status === 'in_progress' && isExpired_(a))
    .forEach(a => finalizeAttempt_(a.id));
}

function listExams_(user) {
  finalizeExpiredFor_(user.id);
  const attempts = all_('Attempts').filter(a => a.userId === user.id);
  const questions = mapBy_(all_('Questions'));
  return all_('Exams').filter(e => examVisibleTo_(e, user)).map(e => {
    const mine = attempts.filter(a => a.examId === e.id);
    const done = mine.filter(a => a.status === 'submitted').sort((x, y) => y.submittedAt - x.submittedAt);
    const running = mine.find(a => a.status === 'in_progress');
    const qCount = parseJson_(e.questionIds, []).filter(id => questions[id]).length;
    return {
      id: e.id, title: e.title, description: e.description, duration: e.duration,
      questionCount: qCount, passScore: e.passScore, maxAttempts: e.maxAttempts,
      showReview: e.showReview,
      attemptsUsed: done.length,
      lastScore: done.length ? done[0].score : null,
      lastAttemptId: done.length ? done[0].id : null,
      runningAttemptId: running ? running.id : null
    };
  }).filter(e => e.questionCount > 0);
}

function startExam_(p, user) {
  finalizeExpiredFor_(user.id);
  return withLock_(() => {
    const exam = get_('Exams', p.examId);
    if (!exam || !examVisibleTo_(exam, user)) throw new UserError('Ujian tidak tersedia.');

    const mine = all_('Attempts').filter(a => a.userId === user.id && a.examId === exam.id);
    const running = mine.find(a => a.status === 'in_progress');
    if (running) return { attemptId: running.id };

    const used = mine.filter(a => a.status === 'submitted').length;
    if (exam.maxAttempts > 0 && used >= exam.maxAttempts) {
      throw new UserError('Kesempatan mengerjakan ujian ini sudah habis.');
    }

    const questions = mapBy_(all_('Questions'));
    let order = parseJson_(exam.questionIds, []).filter(id => questions[id]);
    if (!order.length) throw new UserError('Ujian ini belum memiliki soal.');
    if (exam.shuffle) order = shuffle_(order);

    const now = Date.now();
    const att = {
      id: newId_('A'), examId: exam.id, userId: user.id, startedAt: now,
      deadline: exam.duration > 0 ? now + exam.duration * 60000 : 0,
      submittedAt: 0, status: 'in_progress', order: JSON.stringify(order),
      answers: '{}', score: 0, correctCount: 0, total: order.length
    };
    insert_('Attempts', att);
    return { attemptId: att.id };
  });
}

function ownAttempt_(id, user) {
  const att = get_('Attempts', id);
  if (!att || att.userId !== user.id) throw new UserError('Percobaan tidak ditemukan.');
  return att;
}

function getAttempt_(p, user) {
  let att = ownAttempt_(p.attemptId, user);
  if (att.status === 'in_progress' && isExpired_(att)) att = finalizeAttempt_(att.id);
  if (att.status === 'submitted') return { finished: true, attemptId: att.id };

  const exam = get_('Exams', att.examId);
  const qMap = mapBy_(all_('Questions'));
  const order = parseJson_(att.order, []);
  const questions = order.filter(id => qMap[id]).map(id => {
    const q = qMap[id];
    return {
      id: q.id, text: q.text,
      options: OPTION_KEYS.filter(k => q[k]).map(k => ({ k: k, t: q[k] }))
    };
  });
  return {
    attempt: {
      id: att.id, examTitle: exam ? exam.title : '', startedAt: att.startedAt,
      deadline: att.deadline, answers: parseJson_(att.answers, {})
    },
    questions: questions,
    serverNow: Date.now()
  };
}

/** Autosave: klien selalu mengirim seluruh peta jawaban (last-write-wins, tanpa race). */
function saveAnswers_(p, user) {
  const first = ownAttempt_(p.attemptId, user);
  if (first.status !== 'in_progress') return { expired: true };
  if (isExpired_(first)) { finalizeAttempt_(first.id); return { expired: true }; }

  const saved = withLock_(() => {
    // Baca ulang di dalam lock: submit bisa saja selesai di antara dua pemanggilan.
    const att = get_('Attempts', first.id);
    if (!att || att.status !== 'in_progress') return false;
    const json = JSON.stringify(sanitizeAnswers_(p.answers, parseJson_(att.order, [])));
    const col = cols_('Attempts').indexOf('answers') + 1;
    sheet_('Attempts').getRange(att._row, col).setValue(json);
    return true;
  });
  return saved ? { serverNow: Date.now() } : { expired: true };
}

function sanitizeAnswers_(answers, order) {
  const allowed = new Set(order);
  const clean = {};
  Object.keys(answers || {}).forEach(qid => {
    const v = String(answers[qid] || '').toLowerCase();
    if (allowed.has(qid) && OPTION_KEYS.indexOf(v) >= 0) clean[qid] = v;
  });
  return clean;
}

function submitAttempt_(p, user) {
  const att = ownAttempt_(p.attemptId, user);
  if (att.status === 'submitted') return { attemptId: att.id };
  // Jawaban terakhir dari klien dipakai hanya jika masih dalam batas waktu
  const useClient = p.answers && !isExpired_(att);
  const answers = useClient ? sanitizeAnswers_(p.answers, parseJson_(att.order, [])) : null;
  finalizeAttempt_(att.id, answers);
  return { attemptId: att.id };
}

/** Menilai & mengunci percobaan. Idempoten (aman dipanggil berulang). */
function finalizeAttempt_(attemptId, answersOverride) {
  return withLock_(() => {
    const att = get_('Attempts', attemptId);
    if (!att || att.status === 'submitted') return att;

    const answers = answersOverride || parseJson_(att.answers, {});
    const qMap = mapBy_(all_('Questions'));
    const rows = [];
    let correct = 0;
    parseJson_(att.order, []).forEach(qid => {
      const q = qMap[qid];
      if (!q) return;
      const chosen = answers[qid] || '';
      const ok = chosen !== '' && chosen === q.correct;
      if (ok) correct++;
      rows.push({
        attemptId: att.id, examId: att.examId, userId: att.userId,
        questionId: qid, chosen: chosen, correct: q.correct, isCorrect: ok
      });
    });

    const now = Date.now();
    att.answers = JSON.stringify(answers);
    att.status = 'submitted';
    att.submittedAt = (att.deadline > 0 && now > att.deadline) ? att.deadline : now;
    att.total = rows.length;
    att.correctCount = correct;
    att.score = rows.length ? Math.round(correct / rows.length * 1000) / 10 : 0;
    update_('Attempts', att);
    insertMany_('Answers', rows);
    return att;
  });
}

function getResult_(p, user) {
  const att = ownAttempt_(p.attemptId, user);
  if (att.status !== 'submitted') throw new UserError('Ujian belum dikumpulkan.');
  const exam = get_('Exams', att.examId) || { title: '(ujian dihapus)', passScore: 0, showReview: false };
  const result = {
    attemptId: att.id, examTitle: exam.title, score: att.score,
    correctCount: att.correctCount, total: att.total,
    wrongCount: att.total - att.correctCount,
    passScore: exam.passScore, passed: att.score >= exam.passScore,
    durationMs: Math.max(0, att.submittedAt - att.startedAt),
    submittedAt: att.submittedAt, review: null
  };
  if (exam.showReview) {
    const qMap = mapBy_(all_('Questions'));
    const answers = parseJson_(att.answers, {});
    result.review = parseJson_(att.order, []).filter(id => qMap[id]).map(id => {
      const q = qMap[id];
      return {
        id: q.id, text: q.text, topic: q.topic,
        options: OPTION_KEYS.filter(k => q[k]).map(k => ({ k: k, t: q[k] })),
        chosen: answers[id] || '', correct: q.correct, explanation: q.explanation
      };
    });
  }
  return result;
}

function myHistory_(user) {
  const exams = mapBy_(all_('Exams'));
  return all_('Attempts')
    .filter(a => a.userId === user.id && a.status === 'submitted')
    .sort((x, y) => y.submittedAt - x.submittedAt)
    .map(a => ({
      attemptId: a.id, examTitle: exams[a.examId] ? exams[a.examId].title : '(dihapus)',
      score: a.score, correctCount: a.correctCount, total: a.total,
      submittedAt: a.submittedAt,
      passed: exams[a.examId] ? a.score >= exams[a.examId].passScore : false,
      canReview: exams[a.examId] ? exams[a.examId].showReview : false
    }));
}
