/**
 * Analytics.gs — dashboard guru, hasil, dan analisis butir soal.
 */

function round1_(x) {
  return Math.round(x * 10) / 10;
}
function avg_(arr) {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
}
function pct_(num, den) {
  return den ? round1_((num / den) * 100) : 0;
}

function median_(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function stdev_(arr) {
  if (arr.length < 2) return 0;
  const m = avg_(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) * (x - m), 0) / arr.length);
}

/** Ringkas teks untuk tabel: markup gambar -> "[gambar]". */
function snippet_(s, n) {
  s = String(s)
    .replace(/!\[[^\]]*\]\([^)\s]*\)/g, "[gambar]")
    .replace(/\s+/g, " ");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/**
 * Hanya PERCOBAAN TERAKHIR tiap siswa per ujian yang dihitung dalam analisis.
 * Mengembalikan array attempt (hanya yang berstatus submitted).
 */
function latestAttempts_(attempts) {
  const best = {};
  attempts.forEach((a) => {
    if (a.status !== "submitted") return;
    const k = a.userId + "|" + a.examId;
    if (!best[k] || a.submittedAt > best[k].submittedAt) best[k] = a;
  });
  return Object.keys(best).map((k) => best[k]);
}

/** Muat data yang sudah difilter (examId, class) untuk dipakai berbagai laporan. */
function loadCtx_(f) {
  f = f || {};
  const users = all_("Users");
  const uMap = mapBy_(users);
  const exams = all_("Exams");
  const eMap = mapBy_(exams);
  const questions = all_("Questions");
  const qMap = mapBy_(questions);
  const submitted = all_("Attempts").filter(
    (a) => a.status === "submitted" && uMap[a.userId] && eMap[a.examId],
  );
  const tries = {}; // jumlah percobaan per siswa+ujian
  submitted.forEach((a) => {
    const k = a.userId + "|" + a.examId;
    tries[k] = (tries[k] || 0) + 1;
  });
  let attempts = latestAttempts_(submitted);
  if (f.examId) attempts = attempts.filter((a) => a.examId === f.examId);
  if (f.class)
    attempts = attempts.filter((a) => uMap[a.userId].class === f.class);
  const ids = new Set(attempts.map((a) => a.id));
  const answers = all_("Answers").filter((r) => ids.has(r.attemptId));
  return {
    users: users,
    uMap: uMap,
    exams: exams,
    eMap: eMap,
    questions: questions,
    qMap: qMap,
    attempts: attempts,
    tries: tries,
    submitted: submitted,
    answers: answers,
  };
}

/** Statistik per soal: jumlah dijawab, benar, kosong, sebaran opsi. */
function questionStats_(answers) {
  const st = {};
  answers.forEach((r) => {
    const s =
      st[r.questionId] ||
      (st[r.questionId] = {
        n: 0,
        right: 0,
        blank: 0,
        opts: { a: 0, b: 0, c: 0, d: 0, e: 0 },
      });
    s.n++;
    if (r.isCorrect) s.right++;
    if (!r.chosen) s.blank++;
    else s.opts[r.chosen] = (s.opts[r.chosen] || 0) + 1;
  });
  return st;
}

function topWrongOption_(s, correct) {
  let best = null;
  OPTION_KEYS.forEach((k) => {
    if (k !== correct && s.opts[k] > 0 && (!best || s.opts[k] > best.count))
      best = { key: k, count: s.opts[k] };
  });
  return best;
}

function filtersOf_(ctx) {
  const classes = {};
  ctx.users.forEach((u) => {
    if (u.role === "student" && u.class) classes[u.class] = true;
  });
  return {
    exams: ctx.exams.map((e) => ({ id: e.id, title: e.title })),
    classes: Object.keys(classes).sort(),
  };
}

// ---------------------------------------------------------------- Dashboard

function dashboard_(p) {
  const ctx = loadCtx_(p);
  const { uMap, eMap, qMap, attempts, answers } = ctx;
  const students = ctx.users.filter((u) => u.role === "student");
  const scores = attempts.map((a) => a.score);
  const passed = attempts.filter(
    (a) => a.score >= eMap[a.examId].passScore,
  ).length;

  // Soal paling banyak salah
  const qs = questionStats_(answers);
  const mostMissed = Object.keys(qs)
    .filter((id) => qMap[id])
    .map((id) => {
      const s = qs[id],
        q = qMap[id];
      const wrong = s.n - s.right;
      return {
        id: id,
        text: snippet_(q.text, 160),
        topic: q.topic,
        correct: q.correct,
        answered: s.n,
        wrong: wrong,
        blank: s.blank,
        wrongRate: pct_(wrong, s.n),
        topWrong: topWrongOption_(s, q.correct),
      };
    })
    .filter((x) => x.wrong > 0)
    .sort((a, b) => b.wrongRate - a.wrongRate || b.wrong - a.wrong)
    .slice(0, 10);

  // Penguasaan per topik
  const tp = {};
  answers.forEach((r) => {
    const q = qMap[r.questionId];
    if (!q) return;
    const t = tp[q.topic] || (tp[q.topic] = { n: 0, right: 0 });
    t.n++;
    if (r.isCorrect) t.right++;
  });
  const topics = Object.keys(tp)
    .map((t) => ({
      topic: t,
      answered: tp[t].n,
      correctRate: pct_(tp[t].right, tp[t].n),
    }))
    .sort((a, b) => a.correctRate - b.correctRate);

  // Distribusi nilai (10 bin)
  const distribution = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  scores.forEach((s) => {
    distribution[Math.min(9, Math.floor(s / 10))]++;
  });

  // Ringkasan per ujian
  const byExam = {};
  attempts.forEach((a) => {
    (byExam[a.examId] = byExam[a.examId] || []).push(a);
  });
  const examSummary = Object.keys(byExam)
    .map((id) => {
      const arr = byExam[id];
      return {
        id: id,
        title: eMap[id].title,
        attempts: arr.length,
        avgScore: round1_(avg_(arr.map((a) => a.score))),
        passRate: pct_(
          arr.filter((a) => a.score >= eMap[id].passScore).length,
          arr.length,
        ),
      };
    })
    .sort((a, b) => b.attempts - a.attempts);

  // Siswa yang perlu perhatian (rata-rata terendah)
  const byUser = {};
  attempts.forEach((a) => {
    (byUser[a.userId] = byUser[a.userId] || []).push(a);
  });
  const atRisk = Object.keys(byUser)
    .map((id) => {
      const arr = byUser[id];
      return {
        id: id,
        name: uMap[id].name,
        class: uMap[id].class,
        attempts: arr.length,
        avgScore: round1_(avg_(arr.map((a) => a.score))),
      };
    })
    .sort((a, b) => a.avgScore - b.avgScore)
    .slice(0, 8);

  // Tren 14 hari terakhir
  const DAY = 86400000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t0 = today.getTime() - 13 * DAY;
  const daily = [];
  for (let i = 0; i < 14; i++) {
    const from = t0 + i * DAY;
    const arr = attempts.filter(
      (a) => a.submittedAt >= from && a.submittedAt < from + DAY,
    );
    daily.push({
      day: from,
      count: arr.length,
      avg: arr.length ? round1_(avg_(arr.map((a) => a.score))) : null,
    });
  }

  const recent = attempts
    .slice()
    .sort((a, b) => b.submittedAt - a.submittedAt)
    .slice(0, 8)
    .map((a) => ({
      name: uMap[a.userId].name,
      class: uMap[a.userId].class,
      exam: eMap[a.examId].title,
      score: a.score,
      at: a.submittedAt,
    }));

  return {
    filters: filtersOf_(ctx),
    totals: {
      students: students.length,
      participants: Object.keys(byUser).length,
      questions: ctx.questions.length,
      exams: ctx.exams.length,
      attempts: attempts.length,
      avgScore: round1_(avg_(scores)),
      passRate: pct_(passed, attempts.length),
      avgDurationMin: round1_(
        avg_(attempts.map((a) => (a.submittedAt - a.startedAt) / 60000)),
      ),
    },
    mostMissed: mostMissed,
    topics: topics,
    distribution: distribution,
    examSummary: examSummary,
    atRisk: atRisk,
    daily: daily,
    recent: recent,
  };
}

// -------------------------------------------------------------------- Hasil

function results_(p) {
  const ctx = loadCtx_(p);
  const { uMap, eMap } = ctx;
  return {
    filters: filtersOf_(ctx),
    rows: ctx.attempts
      .slice()
      .sort((a, b) => b.submittedAt - a.submittedAt)
      .map((a) => ({
        attemptId: a.id,
        userId: a.userId,
        name: uMap[a.userId].name,
        username: uMap[a.userId].username,
        class: uMap[a.userId].class,
        exam: eMap[a.examId].title,
        score: a.score,
        correct: a.correctCount,
        total: a.total,
        passed: a.score >= eMap[a.examId].passScore,
        durationMin: round1_((a.submittedAt - a.startedAt) / 60000),
        tries: ctx.tries[a.userId + "|" + a.examId] || 1,
        submittedAt: a.submittedAt,
      })),
  };
}

/** Analisis butir soal untuk satu ujian: tingkat kesukaran, daya beda, sebaran opsi. */
function examAnalysis_(p) {
  if (!p.examId) throw new UserError("Pilih ujian terlebih dahulu.");
  const ctx = loadCtx_(p);
  const exam = ctx.eMap[p.examId];
  if (!exam) throw new UserError("Ujian tidak ditemukan.");
  const { attempts, answers, qMap } = ctx;
  const scores = attempts.map((a) => a.score);

  // Kelompok atas/bawah 27% untuk daya pembeda
  const ranked = attempts.slice().sort((a, b) => b.score - a.score);
  const k = Math.max(1, Math.round(ranked.length * 0.27));
  const canDiscriminate = ranked.length >= 6;
  const upper = new Set(ranked.slice(0, k).map((a) => a.id));
  const lower = new Set(ranked.slice(-k).map((a) => a.id));

  const qs = questionStats_(answers);
  const ug = {},
    lg = {};
  answers.forEach((r) => {
    if (upper.has(r.attemptId) && r.isCorrect)
      ug[r.questionId] = (ug[r.questionId] || 0) + 1;
    if (lower.has(r.attemptId) && r.isCorrect)
      lg[r.questionId] = (lg[r.questionId] || 0) + 1;
  });

  const items = parseJson_(exam.questionIds, [])
    .filter((id) => qMap[id])
    .map((id, i) => {
      const q = qMap[id];
      const s = qs[id] || {
        n: 0,
        right: 0,
        blank: 0,
        opts: { a: 0, b: 0, c: 0, d: 0, e: 0 },
      };
      const rate = s.n ? s.right / s.n : null;
      const disc =
        canDiscriminate && s.n
          ? round1_((((ug[id] || 0) - (lg[id] || 0)) / k) * 100) / 100
          : null;
      const top = topWrongOption_(s, q.correct);
      const flags = [];
      if (s.n >= 5) {
        if (disc !== null && disc < 0.2) flags.push("Daya beda rendah");
        if (top && top.count > s.right)
          flags.push("Pengecoh lebih populer dari kunci — cek kunci jawaban");
      }
      return {
        no: i + 1,
        id: id,
        text: snippet_(q.text, 200),
        topic: q.topic,
        correct: q.correct,
        options: OPTION_KEYS.filter((x) => q[x]).map((x) => ({
          k: x,
          t: snippet_(q[x], 80),
          count: s.opts[x] || 0,
        })),
        answered: s.n,
        right: s.right,
        blank: s.blank,
        correctRate: s.n ? pct_(s.right, s.n) : null,
        level:
          rate === null
            ? "-"
            : rate >= 0.8
              ? "Mudah"
              : rate < 0.4
                ? "Sulit"
                : "Sedang",
        discrimination: disc,
        flags: flags,
      };
    });

  return {
    filters: filtersOf_(ctx),
    exam: { id: exam.id, title: exam.title, passScore: exam.passScore },
    summary: {
      attempts: attempts.length,
      avg: round1_(avg_(scores)),
      median: round1_(median_(scores)),
      min: scores.length ? Math.min.apply(null, scores) : 0,
      max: scores.length ? Math.max.apply(null, scores) : 0,
      stdev: round1_(stdev_(scores)),
      passRate: pct_(
        attempts.filter((a) => a.score >= exam.passScore).length,
        attempts.length,
      ),
    },
    items: items,
    discriminationAvailable: canDiscriminate,
  };
}

/** Daftar siswa yang menjawab salah suatu soal (untuk remedial). */
function wrongStudents_(p) {
  const ctx = loadCtx_({ examId: p.examId, class: p.class });
  const q = ctx.qMap[p.questionId];
  if (!q) throw new UserError("Soal tidak ditemukan.");
  const attMap = mapBy_(ctx.attempts);
  const seen = {};
  const list = [];
  ctx.answers
    .filter((r) => r.questionId === p.questionId && !r.isCorrect)
    .forEach((r) => {
      const a = attMap[r.attemptId],
        u = ctx.uMap[r.userId];
      if (!a || !u) return;
      if (seen[u.id] && seen[u.id].at >= a.submittedAt) return;
      seen[u.id] = { at: a.submittedAt };
      list.push({
        name: u.name,
        class: u.class,
        chosen: r.chosen,
        exam: ctx.eMap[r.examId].title,
        at: a.submittedAt,
      });
    });
  const opts = {};
  OPTION_KEYS.forEach((k) => {
    if (q[k]) opts[k] = q[k];
  });
  return {
    question: {
      id: q.id,
      text: q.text,
      topic: q.topic,
      correct: q.correct,
      options: opts,
      explanation: q.explanation,
    },
    students: list.sort((a, b) =>
      (a.class + a.name).localeCompare(b.class + b.name),
    ),
  };
}

function studentDetail_(p) {
  const ctx = loadCtx_({});
  const u = ctx.uMap[p.userId];
  if (!u) throw new UserError("Siswa tidak ditemukan.");
  const mine = ctx.attempts
    .filter((a) => a.userId === u.id)
    .sort((a, b) => b.submittedAt - a.submittedAt);
  const ids = new Set(mine.map((a) => a.id));
  const ans = all_("Answers").filter((r) => ids.has(r.attemptId));
  const tp = {};
  const missed = {};
  ans.forEach((r) => {
    const q = ctx.qMap[r.questionId];
    if (!q) return;
    const t = tp[q.topic] || (tp[q.topic] = { n: 0, right: 0 });
    t.n++;
    if (r.isCorrect) t.right++;
    if (!r.isCorrect) missed[q.id] = (missed[q.id] || 0) + 1;
  });
  return {
    user: { name: u.name, username: u.username, class: u.class },
    // Riwayat menampilkan semua percobaan; analisis topik di bawah hanya memakai yang terakhir
    attempts: ctx.submitted
      .filter((a) => a.userId === u.id)
      .sort((a, b) => b.submittedAt - a.submittedAt)
      .map((a) => ({
        exam: ctx.eMap[a.examId].title,
        score: a.score,
        correct: a.correctCount,
        total: a.total,
        passed: a.score >= ctx.eMap[a.examId].passScore,
        at: a.submittedAt,
        counted: ids.has(a.id),
      })),
    topics: Object.keys(tp)
      .map((t) => ({
        topic: t,
        answered: tp[t].n,
        correctRate: pct_(tp[t].right, tp[t].n),
      }))
      .sort((a, b) => a.correctRate - b.correctRate),
    weakQuestions: Object.keys(missed)
      .sort((a, b) => missed[b] - missed[a])
      .slice(0, 5)
      .map((id) => ({
        text: snippet_(ctx.qMap[id].text, 140),
        topic: ctx.qMap[id].topic,
        times: missed[id],
      })),
  };
}
