export const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), {
  status, headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}
});
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export async function readBody(request, limit = 65536) {
  if (Number(request.headers.get('content-length') || 0) > limit) throw new HttpError(413, '请求内容过长');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '缺少 JSON 请求内容');
  const chunks = []; let size = 0;
  while (true) {
    const {done,value} = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new HttpError(413, '请求内容过长'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError(400, 'JSON 格式错误'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, '请求内容应为 JSON 对象');
  return data;
}
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, '跨站请求被拒绝');
}
export const validId = id => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id || '');
// The D1 revision and content mutation commit together. Old KV snapshots cannot overwrite newer ones.
export const bumpRevision = db => db.prepare("INSERT INTO star_settings(key,value) VALUES('public_revision','1') ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT)");
export async function revision(db) {
  return (await db.prepare("SELECT value FROM star_settings WHERE key='public_revision'").first())?.value || '0';
}
export async function cached(env, key, query, ttl) {
  try { const value = await env.STAR_CACHE?.get(key,'json'); if (Array.isArray(value)) return value; } catch {}
  const items = (await query()).results || [];
  // Cache errors must not turn a successful D1 operation into a failed request.
  try { await env.STAR_CACHE?.put(key,JSON.stringify(items),{expirationTtl:ttl}); } catch {}
  return items;
}
export async function rate(db, request, action, seconds) {
  const bytes = new TextEncoder().encode((request.headers.get('CF-Connecting-IP') || 'unknown')+'|'+action);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
  const now = Date.now();
  await db.prepare('DELETE FROM star_rate_limits WHERE expires_at <= ?').bind(now).run();
  const claimed = await db.prepare('INSERT INTO star_rate_limits(bucket,expires_at) VALUES(?,?) ON CONFLICT(bucket) DO UPDATE SET expires_at=excluded.expires_at WHERE star_rate_limits.expires_at <= ? RETURNING bucket')
    .bind(action+':'+hash,now+seconds*1000,now).first();
  if (!claimed) throw new HttpError(429, '操作太频繁，请 '+seconds+' 秒后再试');
}
export async function moderate(db, body) {
  if (!validId(body.id)) throw new HttpError(400, 'ID 无效');
  if (!['visible','hidden'].includes(body.status)) throw new HttpError(400, '状态无效');
  const table = body.kind === 'comment' ? 'star_comments' : 'star_wishes';
  const row = await db.prepare('SELECT id FROM '+table+' WHERE id=?').bind(body.id).first();
  if (!row) throw new HttpError(404, '内容不存在');
  await db.batch([db.prepare('UPDATE '+table+' SET status=? WHERE id=?').bind(body.status,body.id),bumpRevision(db)]);
}
export function failure(error) {
  if (error instanceof HttpError) return json({error:error.message},error.status);
  const message = String(error?.message || error);
  const code = /no such table|no such column/i.test(message) ? 'SCHEMA_MISSING' : /PBKDF2|iteration/i.test(message) ? 'PASSWORD_CRYPTO' : 'SERVER_ERROR';
  // Log only a category; credentials, request bodies and SQL values are never logged.
  console.error('[stars]',code);
  return json({error:code==='SCHEMA_MISSING'?'数据库表结构不完整，请执行 stars-schema.sql':code==='PASSWORD_CRYPTO'?'密码加密服务不兼容，请更新部署':'服务暂时不可用，请稍后重试',code},500);
}
