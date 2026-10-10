/**
 * Seed.gs — data contoh agar aplikasi bisa langsung dicoba.
 * Jalankan `seedDemo()` sekali dari editor Apps Script (opsional).
 */

function seedDemo() {
  setup();
  if (all_('Questions').length) {
    console.log('Bank soal sudah berisi data, seedDemo dilewati.');
    return;
  }
  const S = (topic, text, a, b, c, d, correct, explanation) =>
    ({ topic: topic, text: text, a: a, b: b, c: c, d: d, e: '', correct: correct, explanation: explanation });

  const demo = [
    S('Aljabar', 'Hasil dari 3x + 2x adalah ...', '5x', '5x²', '6x', '6x²', 'a', 'Suku sejenis dijumlahkan: 3x + 2x = 5x.'),
    S('Aljabar', 'Jika 2x + 6 = 14, maka nilai x adalah ...', '3', '4', '5', '10', 'b', '2x = 14 − 6 = 8, sehingga x = 4.'),
    S('Aljabar', 'Bentuk sederhana dari 4(x + 3) − 2x adalah ...', '2x + 12', '2x + 3', '6x + 12', '6x + 3', 'a', '4x + 12 − 2x = 2x + 12.'),
    S('Geometri', 'Luas persegi panjang dengan panjang 8 cm dan lebar 5 cm adalah ...', '13 cm²', '26 cm²', '40 cm²', '80 cm²', 'c', 'Luas = panjang × lebar = 8 × 5 = 40 cm².'),
    S('Geometri', 'Keliling lingkaran berjari-jari 7 cm (π = 22/7) adalah ...', '22 cm', '44 cm', '154 cm', '308 cm', 'b', 'K = 2πr = 2 × 22/7 × 7 = 44 cm.'),
    S('Geometri', 'Jumlah sudut dalam segitiga adalah ...', '90°', '180°', '270°', '360°', 'b', 'Jumlah sudut dalam segitiga selalu 180°.'),
    S('Aritmetika', 'Hasil dari 25% dari 240 adalah ...', '48', '60', '72', '120', 'b', '25% = 1/4, sehingga 240 / 4 = 60.'),
    S('Aritmetika', 'FPB dari 12 dan 18 adalah ...', '2', '3', '6', '36', 'c', 'Faktor persekutuan terbesar dari 12 dan 18 adalah 6.')
  ];

  const now = Date.now();
  const qs = demo.map((q, i) => Object.assign({ id: newId_('Q'), createdAt: now + i }, q));
  insertMany_('Questions', qs);

  insert_('Exams', {
    id: newId_('E'), title: 'Latihan Matematika Dasar', description: 'Aljabar, geometri, dan aritmetika dasar.',
    duration: 15, questionIds: JSON.stringify(qs.map(q => q.id)), shuffle: true, showReview: true,
    maxAttempts: 0, passScore: 70, targetClass: '', active: true, createdAt: now
  });

  const students = [
    ['siswa01', 'Andi Pratama', '7A'], ['siswa02', 'Bunga Lestari', '7A'],
    ['siswa03', 'Citra Dewi', '7B'], ['siswa04', 'Dimas Saputra', '7B']
  ];
  students.forEach((s, i) => insert_('Users', {
    id: newId_('U'), username: s[0], name: s[1], class: s[2], role: 'student',
    pass: hashPassword_('siswa123'), active: true, createdAt: now + i
  }));
  console.log('Demo siap. Siswa: siswa01..siswa04 / siswa123 — Guru: guru / guru123');
}
