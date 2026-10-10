/**
 * Auth.gs — login, sesi (token di CacheService), hash password.
 */

const SESSION_TTL = 21600;   // 6 jam (maksimum CacheService)
const MAX_FAILS = 5;
const LOCK_SECONDS = 300;

function hashPassword_(pw, salt) {
  salt = salt || Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pw, Utilities.Charset.UTF_8);
  const hex = digest.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
  return 's1$' + salt + '$' + hex;
}

function verifyPassword_(pw, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 3) return false;
  return hashPassword_(pw, parts[1]) === stored;
}

function publicUser_(u) {
  return { id: u.id, username: u.username, name: u.name, class: u.class, role: u.role };
}

function login_(p) {
  const username = String(p.username || '').trim().toLowerCase();
  const password = String(p.password || '');
  if (!username || !password) throw new UserError('Username dan password wajib diisi.');

  const cache = CacheService.getScriptCache();
  const failKey = 'fail:' + username;
  if (Number(cache.get(failKey) || 0) >= MAX_FAILS) {
    throw new UserError('Terlalu banyak percobaan gagal. Coba lagi dalam 5 menit.');
  }

  const user = all_('Users').find(x => x.username.toLowerCase() === username);
  if (!user || !user.active || !verifyPassword_(password, user.pass)) {
    cache.put(failKey, String(Number(cache.get(failKey) || 0) + 1), LOCK_SECONDS);
    throw new UserError('Username atau password salah.');
  }
  cache.remove(failKey);

  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('sess:' + token, user.id, SESSION_TTL);
  return {
    token: token,
    user: publicUser_(user),
    serverNow: Date.now(),
    warnDefaultPassword: user.role === 'teacher' && verifyPassword_(DEFAULT_TEACHER_PASSWORD, user.pass)
  };
}

function session_(token) {
  if (!token) throw new AuthError();
  const uid = CacheService.getScriptCache().get('sess:' + token);
  if (!uid) throw new AuthError();
  const user = get_('Users', uid);
  if (!user || !user.active) throw new AuthError();
  return user;
}

function logout_(token) {
  CacheService.getScriptCache().remove('sess:' + token);
  return true;
}

function changePassword_(p, user) {
  const oldPw = String(p.oldPassword || '');
  const newPw = String(p.newPassword || '');
  if (!verifyPassword_(oldPw, user.pass)) throw new UserError('Password lama salah.');
  if (newPw.length < 6) throw new UserError('Password baru minimal 6 karakter.');
  user.pass = hashPassword_(newPw);
  update_('Users', user);
  return true;
}
