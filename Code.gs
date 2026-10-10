/**
 * Code.gs — entry point web app + router API.
 *
 * Semua pemanggilan dari browser lewat satu fungsi `api(method, token, payload)`
 * sehingga otorisasi (login + role) dicek di satu tempat.
 */

const APP_NAME = 'E-Assessment';

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Dipakai di template HTML: <?!= include('Styles') ?> */
function include(file) {
  return HtmlService.createHtmlOutputFromFile(file).getContent();
}

// role: 'public' (tanpa login) | 'any' (guru & siswa) | 'student' | 'teacher'
const ROUTES = {
  // --- auth ---
  login:          { role: 'public',  fn: (p) => login_(p) },
  logout:         { role: 'any',     fn: (p, u, t) => logout_(t) },
  me:             { role: 'any',     fn: (p, u) => ({ user: publicUser_(u) }) },
  changePassword: { role: 'any',     fn: (p, u) => changePassword_(p, u) },

  // --- siswa ---
  listExams:      { role: 'student', fn: (p, u) => listExams_(u) },
  startExam:      { role: 'student', fn: (p, u) => startExam_(p, u) },
  getAttempt:     { role: 'student', fn: (p, u) => getAttempt_(p, u) },
  saveAnswers:    { role: 'student', fn: (p, u) => saveAnswers_(p, u) },
  submit:         { role: 'student', fn: (p, u) => submitAttempt_(p, u) },
  getResult:      { role: 'student', fn: (p, u) => getResult_(p, u) },
  myHistory:      { role: 'student', fn: (p, u) => myHistory_(u) },

  // --- guru: konten ---
  listQuestions:  { role: 'teacher', fn: () => listQuestions_() },
  saveQuestion:   { role: 'teacher', fn: (p) => saveQuestion_(p) },
  deleteQuestion: { role: 'teacher', fn: (p) => deleteQuestion_(p) },
  importQuestions:{ role: 'teacher', fn: (p) => importQuestions_(p) },
  uploadImage:    { role: 'teacher', fn: (p) => uploadImage_(p) },
  listExamsT:     { role: 'teacher', fn: () => listExamsTeacher_() },
  saveExam:       { role: 'teacher', fn: (p) => saveExam_(p) },
  deleteExam:     { role: 'teacher', fn: (p) => deleteExam_(p) },
  listStudents:   { role: 'teacher', fn: () => listStudents_() },
  saveStudent:    { role: 'teacher', fn: (p) => saveStudent_(p) },
  deleteStudent:  { role: 'teacher', fn: (p) => deleteStudent_(p) },
  importStudents: { role: 'teacher', fn: (p) => importStudents_(p) },
  resetPassword:  { role: 'teacher', fn: (p) => resetPassword_(p) },

  // --- guru: analitik ---
  dashboard:      { role: 'teacher', fn: (p) => dashboard_(p) },
  results:        { role: 'teacher', fn: (p) => results_(p) },
  examAnalysis:   { role: 'teacher', fn: (p) => examAnalysis_(p) },
  wrongStudents:  { role: 'teacher', fn: (p) => wrongStudents_(p) },
  studentDetail:  { role: 'teacher', fn: (p) => studentDetail_(p) }
};

function api(method, token, payload) {
  try {
    const route = ROUTES[method];
    if (!route) throw new UserError('Metode tidak dikenal: ' + method);
    let user = null;
    if (route.role !== 'public') {
      user = session_(token);
      if (route.role !== 'any' && user.role !== route.role) throw new UserError('Akses ditolak.');
    }
    return { ok: true, data: route.fn(payload || {}, user, token) };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, auth: true, error: 'Sesi berakhir, silakan login kembali.' };
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error(e && e.stack ? e.stack : e);
    return { ok: false, error: 'Terjadi kesalahan sistem: ' + (e && e.message) };
  }
}
