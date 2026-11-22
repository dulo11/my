/* 爱好板社区增量数据表；不会修改原博客、星空或旧投稿 */
const ddl=[
 "CREATE TABLE IF NOT EXISTS hobby_favorites (user_id TEXT NOT NULL,post_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,post_id))",
 "CREATE INDEX IF NOT EXISTS idx_hobby_favorites_post ON hobby_favorites(post_id)",
 "CREATE TABLE IF NOT EXISTS hobby_comments (id TEXT PRIMARY KEY,post_id TEXT NOT NULL,user_id TEXT NOT NULL,parent_id TEXT,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)",
 "CREATE INDEX IF NOT EXISTS idx_hobby_comments_post ON hobby_comments(post_id,status,created_at)",
 "CREATE INDEX IF NOT EXISTS idx_hobby_comments_status ON hobby_comments(status,created_at)",
 "CREATE TABLE IF NOT EXISTS hobby_notifications (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,post_id TEXT,kind TEXT NOT NULL,message TEXT NOT NULL,read INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL)",
 "CREATE INDEX IF NOT EXISTS idx_hobby_notifications_user ON hobby_notifications(user_id,read,created_at)",
 "CREATE TABLE IF NOT EXISTS hobby_social_rates (bucket TEXT PRIMARY KEY,expires_at INTEGER NOT NULL)"
];
const ready=new WeakMap();
export async function ensureHobbyCommunity(db){
 if(!ready.has(db)) ready.set(db,db.batch(ddl.map(s=>db.prepare(s))).catch(e=>{ready.delete(db);throw e;}));
 await ready.get(db);
}
export async function addHobbyNotification(db,userId,postId,kind,message){
 if(!userId)return;
 await db.prepare("INSERT INTO hobby_notifications(id,user_id,post_id,kind,message,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),userId,postId,kind,String(message).slice(0,180),Date.now()).run();
}
