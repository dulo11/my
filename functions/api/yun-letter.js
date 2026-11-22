/*
 * 云的另一面 · 私人时光胶囊
 * Cloudflare Pages Function: POST /api/yun-letter
 * 文字存入已有 WISH_DB D1，明文保存（不是端到端加密）。
 * 不设公开列表，随机取回码作为访问凭据；DB 不保留取回码原文。
 */
const VERSION = "2026-11-22.1";
const MAX_BYTES = 4096;
const MAX_CHARS = 240;
const CODE_RE = /^[a-f0-9]{48}$/;
const ready = new WeakMap();
const DDL = [
  "CREATE TABLE IF NOT EXISTS yun_letter_capsules (token_hash TEXT PRIMARY KEY, body TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS yun_letter_limits (bucket TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_yun_letter_limits_expiry ON yun_letter_limits (expires_at)"
];

function result(data, status = 200) {
  return new Response(JSON.stringify({ ...data, version: VERSION }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}
class HTTPError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function hex(bytes) {
  return Array.from(bytes, n => n.toString(16).padStart(2,"0")).join("");
}
async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256",bytes);
  return hex(new Uint8Array(digest));
}
function randomCode() {
  const bytes = new Uint8Array(24); // 192-bit unguessable bearer credential
  crypto.getRandomValues(bytes);
  return hex(bytes);
}
async function ensureSchema(db) {
  if (!ready.has(db)) {
    ready.set(db,db.batch(DDL.map(sql=>db.prepare(sql))).catch(err=>{ready.delete(db);throw err;}));
  }
  await ready.get(db);
}
async function limitedBody(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("application/json")) throw new HTTPError(415,"请发送 JSON 格式数据。");
  if (Number(request.headers.get("content-length") || 0) > MAX_BYTES) {
    throw new HTTPError(413,"请求内容太长。");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new HTTPError(400,"缺少请求内容。");
  const chunks = [];
  let size = 0;
  while (true) {
    const {done,value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new HTTPError(413,"请求内容太长。");
    }
    chunks.push(value);
  }
  const raw = new Uint8Array(size);
  let offset=0;
  for (const chunk of chunks) { raw.set(chunk,offset); offset += chunk.byteLength; }
  let body;
  try { body=JSON.parse(new TextDecoder().decode(raw)); }
  catch { throw new HTTPError(400,"JSON 数据格式错误。"); }
  if (!body || typeof body!=="object" || Array.isArray(body)) throw new HTTPError(400,"JSON 数据格式错误。");
  return body;
}
async function limitCreate(db,request) {
  // 对匿名新增记录做短窗口限流；不保存明文 IP
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = await sha256(ip+"|yun-letter:create");
  const now = Date.now();
  // 将清理操作限制在该 IP 的记录上，不全表扫描
  const res = await db.prepare(
    "INSERT INTO yun_letter_limits(bucket,expires_at) VALUES(?,?) ON CONFLICT(bucket) DO UPDATE SET expires_at=excluded.expires_at WHERE yun_letter_limits.expires_at <= ?"
  ).bind(key,now+60000,now).run();
  if (!res.meta?.changes) throw new HTTPError(429,"操作过于频繁，请稍后再新建云端记录。");
}
function validateText(value) {
  if (typeof value!=="string") throw new HTTPError(400,"请输入文字内容。");
  const content = value.trim();
  if (!content || content.length > MAX_CHARS) throw new HTTPError(400,"留言必须是 1～240 字。");
  return content;
}
function validateCode(code) {
  if (typeof code!=="string" || !CODE_RE.test(code.toLowerCase())) throw new HTTPError(400,"取回码格式错误。");
  return code.toLowerCase();
}
export async function onRequest({request,env}) {
  try {
    if (request.method !== "POST") return result({error:"仅支持 POST。"},405);
    const url = new URL(request.url);
    // 只向当前站点开放浏览器调用。此检查不替代限流，也不构成用户身份验证。
    const origin = request.headers.get("origin");
    if (origin && origin!==url.origin) throw new HTTPError(403,"跨站请求被拒绝。");
    if (!env.WISH_DB) throw new HTTPError(503,"网站尚未绑定 WISH_DB 数据库。");
    const body = await limitedBody(request);
    const action = body.action;
    if (!["create","update","load","delete"].includes(action)) throw new HTTPError(400,"操作不支持。");
    await ensureSchema(env.WISH_DB);
    const db=env.WISH_DB;

    if (action==="create") {
      const content=validateText(body.content);
      await limitCreate(db,request);
      const code=randomCode();
      const tokenHash=await sha256(code);
      const now=Date.now();
      await db.prepare("INSERT INTO yun_letter_capsules(token_hash,body,created_at,updated_at) VALUES(?,?,?,?)")
        .bind(tokenHash,content,now,now).run();
      return result({ok:true,code,updatedAt:now},201);
    }

    const code=validateCode(body.code);
    const tokenHash=await sha256(code);
    if (action==="load") {
      const row=await db.prepare("SELECT body,updated_at FROM yun_letter_capsules WHERE token_hash=?")
        .bind(tokenHash).first();
      if (!row) throw new HTTPError(404,"找不到这条云端记录，请检查取回码。");
      return result({ok:true,content:row.body,updatedAt:row.updated_at});
    }
    if (action==="update") {
      const content=validateText(body.content);
      const now=Date.now();
      const updated=await db.prepare("UPDATE yun_letter_capsules SET body=?,updated_at=? WHERE token_hash=?")
        .bind(content,now,tokenHash).run();
      if (!updated.meta?.changes) throw new HTTPError(404,"找不到这条云端记录，请检查取回码。");
      return result({ok:true,updatedAt:now});
    }
    if (action==="delete") {
      const removed=await db.prepare("DELETE FROM yun_letter_capsules WHERE token_hash=?").bind(tokenHash).run();
      if (!removed.meta?.changes) throw new HTTPError(404,"记录不存在或已删除。");
      return result({ok:true,deleted:true});
    }
    return result({error:"操作不支持。"},400);
  } catch (error) {
    if (error instanceof HTTPError) return result({error:error.message},error.status);
    // 不记录信件原文、不记录取回码或原始 IP
    console.error("[yun-letter] API internal error",error?.name || "unknown");
    return result({error:"云端服务暂时不可用，请稍后再试。"},500);
  }
}
