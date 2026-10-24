// Starry-space admin: D1-verified, one-time ownership bootstrap.
// Never place setup codes or administrator passwords in the source repository.
const enc = new TextEncoder();
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extra
  }
});
const hex = bytes => Array.from(new Uint8Array(bytes)).map(n => n.toString(16).padStart(2, '0')).join('');
const equal = (a, b) => {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
};
const randomHex = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return hex(bytes);
};
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({
    name: 'PBKDF2', salt: enc.encode(salt), iterations: 210000, hash: 'SHA-256'
  }, key, 256));
}
async function setupHash(code) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode('star-setup-v1:' + code)));
}
async function sign(secret, payload) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
}
async function setting(db, key) {
  const row = await db.prepare('SELECT value FROM star_settings WHERE key=?').bind(key).first();
  return row?.value || null;
}
async function ensureSettings(db) {
  try {
    await db.prepare('SELECT key FROM star_settings LIMIT 1').first();
  } catch (error) {
    if (!/no such table/i.test(String(error))) throw error;
    await db.exec('CREATE TABLE IF NOT EXISTS star_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  }
}
const setCookie = (value, age) =>
  'star_session=' + value + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + age;
async function sessionValid(req, db) {
  const cookie = (req.headers.get('cookie') || '').split(';').map(x => x.trim())
    .find(x => x.startsWith('star_session='))?.slice('star_session='.length);
  if (!cookie) return false;
  const [exp, nonce, mac, extra] = cookie.split('.');
  if (extra || !/^\d{13}$/.test(exp || '') || !/^[a-f0-9-]{36}$/i.test(nonce || '') ||
      !/^[a-f0-9]{64}$/i.test(mac || '')) return false;
  if (Number(exp) <= Date.now() || Number(exp) > Date.now() + 31 * 86400000) return false;
  const dbNonce = await setting(db, 'session_nonce');
  const key = await setting(db, 'session_secret');
  return Boolean(dbNonce && key && equal(dbNonce, nonce) &&
    equal(await sign(key, exp + '.' + nonce), mac));
}
async function loginBucket(env, request) {
  if (!env.STAR_CACHE) return null;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const hash = hex(await crypto.subtle.digest('SHA-256', enc.encode(ip)));
  return 'stars:admin:login:' + hash;
}
export async function onRequest({request, env}) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'me';
    if (request.method === 'GET' && action === 'health') {
      return json({
        wishDb: !!env.WISH_DB,
        starCache: !!env.STAR_CACHE,
        adminToken: typeof env.STAR_ADMIN_TOKEN === 'string' && !!env.STAR_ADMIN_TOKEN,
        adminTokenRequired: false,
        adminAuth: 'd1-verified-bootstrap',
        dbQueryable: !!env.WISH_DB?.prepare,
        checkedAt: new Date().toISOString()
      });
    }
    if (!env.WISH_DB) return json({error:'缺少 D1 数据库绑定 WISH_DB'}, 503);
    const db = env.WISH_DB;

    if (request.method === 'GET' && action === 'me') {
      await ensureSettings(db);
      const initialized = !!(await setting(db, 'password_hash'));
      return json({initialized, authenticated: initialized && await sessionValid(request, db),
        setupReady: !initialized && !!(await setting(db, 'setup_key_hash'))});
    }

    if (request.method !== 'POST') return json({error:'方法不支持'}, 405);
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({error:'跨站请求被拒绝'}, 403);
    if (Number(request.headers.get('content-length') || 0) > 4096) return json({error:'请求过大'}, 413);
    const b = await request.json();
    const password = String(b.password || '');

    if (action === 'setup') {
      await ensureSettings(db);
      if (await setting(db, 'password_hash')) return json({error:'管理员已初始化'}, 409);
      const code = String(b.setupCode || '');
      const authorizedHash = await setting(db, 'setup_key_hash');
      if (!authorizedHash || !/^[a-f0-9]{48}$/i.test(code) ||
          !equal(authorizedHash, await setupHash(code))) {
        return json({error:'尚未完成 D1 授权，或授权码不匹配'}, 403);
      }
      if (password.length < 12 || password.length > 128)
        return json({error:'管理员密码需 12～128 位'}, 400);
      const salt = crypto.randomUUID();
      const hashedPassword = await passwordHash(password, salt);
      const nonce = crypto.randomUUID();
      const secret = randomHex();
      // batch is transactional: a competing bootstrap cannot partially initialize the account.
      await db.batch([
        db.prepare("INSERT INTO star_settings(key,value) VALUES('password_hash',?)").bind(hashedPassword),
        db.prepare("INSERT INTO star_settings(key,value) VALUES('password_salt',?)").bind(salt),
        db.prepare("INSERT INTO star_settings(key,value) VALUES('session_nonce',?)").bind(nonce),
        db.prepare("INSERT INTO star_settings(key,value) VALUES('session_secret',?)").bind(secret),
        db.prepare("DELETE FROM star_settings WHERE key='setup_key_hash'")
      ]);
      return json({ok:true});
    }

    if (action === 'login') {
      const key = await loginBucket(env, request);
      const attempts = key ? Number(await env.STAR_CACHE.get(key) || 0) : 0;
      if (attempts >= 8) return json({error:'尝试过多，请15分钟后再试'}, 429);
      const salt = await setting(db, 'password_salt');
      const storedHash = await setting(db, 'password_hash');
      const ok = salt && storedHash && password.length <= 128 &&
        equal(await passwordHash(password, salt), storedHash);
      if (!ok) {
        if (key) await env.STAR_CACHE.put(key, String(attempts + 1), {expirationTtl:900});
        return json({error:'密码错误，或管理员尚未初始化'}, 403);
      }
      if (key) await env.STAR_CACHE.delete(key);
      const nonce = await setting(db, 'session_nonce');
      const secret = await setting(db, 'session_secret');
      if (!nonce || !secret) return json({error:'会话密钥尚未初始化'}, 503);
      const exp = Date.now() + 30 * 86400000;
      const payload = exp + '.' + nonce;
      return json({ok:true}, 200, {'set-cookie':setCookie(payload + '.' + await sign(secret, payload), 30 * 86400)});
    }

    if (!(await sessionValid(request, db))) return json({error:'请先登录'}, 401);

    if (action === 'logout') {
      return json({ok:true}, 200, {'set-cookie':setCookie('', 0)});
    }
    if (action === 'password') {
      const oldSalt = await setting(db, 'password_salt');
      const oldHash = await setting(db, 'password_hash');
      const next = String(b.newPassword || '');
      if (next.length < 12 || next.length > 128) return json({error:'新密码需 12～128 位'}, 400);
      if (!oldSalt || !oldHash || !equal(await passwordHash(password, oldSalt), oldHash))
        return json({error:'原密码错误'}, 403);
      const salt = crypto.randomUUID();
      await db.batch([
        db.prepare("UPDATE star_settings SET value=? WHERE key='password_salt'").bind(salt),
        db.prepare("UPDATE star_settings SET value=? WHERE key='password_hash'").bind(await passwordHash(next, salt)),
        db.prepare("UPDATE star_settings SET value=? WHERE key='session_nonce'").bind(crypto.randomUUID())
      ]);
      return json({ok:true}, 200, {'set-cookie':setCookie('', 0)});
    }
    if (action === 'list') {
      const items = await db.prepare(
        'SELECT id,nickname,content,created_at,status,likes FROM star_wishes ORDER BY created_at DESC LIMIT 300'
      ).all();
      return json({items: items.results || []});
    }
    if (action === 'moderate') {
      const id = String(b.id || '');
      if (!/^[a-f0-9-]{36}$/i.test(id)) return json({error:'ID 无效'}, 400);
      const status = b.status === 'visible' ? 'visible' : 'hidden';
      await db.prepare('UPDATE star_wishes SET status=? WHERE id=?').bind(status, id).run();
      if (env.STAR_CACHE) await env.STAR_CACHE.delete('stars:public:v1');
      return json({ok:true});
    }
    return json({error:'操作不支持'}, 404);
  } catch (error) {
    return json({error:'请求处理失败，请检查数据库表及服务配置'}, 500);
  }
}
