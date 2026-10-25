export const VERSION='2026.10.25.2';
const ready=new WeakMap();
export const ddl=[
 'CREATE TABLE IF NOT EXISTS star_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL)',
 "CREATE TABLE IF NOT EXISTS star_wishes (id TEXT PRIMARY KEY,nickname TEXT NOT NULL,content TEXT NOT NULL,x REAL NOT NULL,y REAL NOT NULL,created_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'visible',likes INTEGER NOT NULL DEFAULT 0)",
 "CREATE TABLE IF NOT EXISTS star_comments (id TEXT PRIMARY KEY,wish_id TEXT NOT NULL,nickname TEXT NOT NULL,content TEXT NOT NULL,created_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'visible')",
 'CREATE TABLE IF NOT EXISTS star_limits_v2 (bucket TEXT PRIMARY KEY,expires_at INTEGER NOT NULL)',
 'CREATE INDEX IF NOT EXISTS idx_star_limits_v2_expiry ON star_limits_v2(expires_at)',
 "CREATE TABLE IF NOT EXISTS star_content_meta (kind TEXT NOT NULL,id TEXT NOT NULL,pinned INTEGER NOT NULL DEFAULT 0,admin_reply TEXT NOT NULL DEFAULT '',previous_status TEXT NOT NULL DEFAULT 'visible',deleted_at INTEGER,PRIMARY KEY(kind,id))"
];
export async function ensureSchema(db){if(!ready.has(db))ready.set(db,db.batch(ddl.map(s=>db.prepare(s))).catch(e=>{ready.delete(db);throw e}));await ready.get(db)}
export const defaults={wishEnabled:true,commentEnabled:true,likeEnabled:true,wishMax:100,commentMax:200,wishInterval:60,commentInterval:15,likeInterval:15,announcement:''};
export async function getSettings(db){const row=await db.prepare("SELECT value FROM star_settings WHERE key='site_settings'").first();return {...defaults,...(row?JSON.parse(row.value):{})}}
