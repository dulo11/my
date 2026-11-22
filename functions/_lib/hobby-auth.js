/* Hobby visitor accounts (ordinary users only, never administrator permissions).
   Passwords: PBKDF2-SHA256 (100k) with unique random salt.
   Sessions: opaque 256-bit bearer cookie, SHA-256 digest stored in D1.
*/
const enc=new TextEncoder();
const ddl=[
 "CREATE TABLE IF NOT EXISTS hobby_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)",
 "CREATE TABLE IF NOT EXISTS hobby_user_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL)",
 "CREATE INDEX IF NOT EXISTS idx_hobby_user_sessions_user ON hobby_user_sessions(user_id,expires_at)",
 "CREATE TABLE IF NOT EXISTS hobby_auth_limits (bucket TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)",
 "CREATE TABLE IF NOT EXISTS hobby_post_owners (post_id TEXT PRIMARY KEY, user_id TEXT NOT NULL)",
 "CREATE INDEX IF NOT EXISTS idx_hobby_post_owners_user ON hobby_post_owners(user_id)"
];
const ready=new WeakMap();
export async function ensureHobbyAuthSchema(db){
 if(!ready.has(db))ready.set(db,db.batch(ddl.map(sql=>db.prepare(sql))).catch(e=>{ready.delete(db);throw e;}));
 await ready.get(db);
}
export const hex=bytes=>Array.from(bytes,n=>n.toString(16).padStart(2,"0")).join("");
export const randomHex=(size=32)=>{const bytes=new Uint8Array(size);crypto.getRandomValues(bytes);return hex(bytes);};
export async function sha(text){
 return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(text))));
}
export async function hashPassword(password,salt){
 const key=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);
 return hex(new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt:enc.encode(salt),iterations:100000,hash:"SHA-256"},key,256)));
}
export function equal(a,b){
 if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;
 let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);
 return mismatch===0;
}
export function normalizeUsername(value){
 if(typeof value!=="string")return null;
 const raw=value.normalize("NFKC").trim();
 if(!/^[\p{L}\p{N}_]{2,24}$/u.test(raw))return null;
 const lower=raw.toLowerCase();
 if(lower.length>40)return null;
 return {username:lower,displayName:raw};
}
export function hobbyCookie(token,maxAge){
 return "hobby_session="+token+"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age="+maxAge;
}
export async function hobbyUserFromRequest(request,db){
 const cookie=(request.headers.get("cookie")||"").split(";").map(s=>s.trim()).find(s=>s.startsWith("hobby_session="));
 const token=cookie?.slice(14);
 if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
 const tokenHash=await sha(token);
 const user=await db.prepare("SELECT u.id,u.username,u.display_name FROM hobby_user_sessions s JOIN hobby_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(tokenHash,Date.now()).first();
 return user||null;
}
export async function authRate(db,request,key,seconds){
 const ip=request.headers.get("CF-Connecting-IP")||"unknown";
 const bucket=key+":"+await sha(ip);
 const now=Date.now();
 const res=await db.prepare("INSERT INTO hobby_auth_limits(bucket,expires_at) VALUES(?,?) ON CONFLICT(bucket) DO UPDATE SET expires_at=excluded.expires_at WHERE hobby_auth_limits.expires_at<=?").bind(bucket,now+seconds*1000,now).run();
 return Boolean(res.meta?.changes);
}
export async function createHobbySession(db,userId){
 const token=randomHex(),now=Date.now();
 await db.prepare("INSERT INTO hobby_user_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha(token),userId,now+30*86400000).run();
 return hobbyCookie(token,30*86400);
}
export async function clearHobbySession(request,db){
 const cookie=(request.headers.get("cookie")||"").split(";").map(s=>s.trim()).find(s=>s.startsWith("hobby_session="));
 const token=cookie?.slice(14);
 if(token&&/^[a-f0-9]{64}$/.test(token))await db.prepare("DELETE FROM hobby_user_sessions WHERE token_hash=?").bind(await sha(token)).run();
 return hobbyCookie("",0);
}
