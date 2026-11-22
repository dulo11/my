import {sessionValid} from "./star-admin.js";
/* 爱好板 · Cloudflare Pages + D1，全部投稿先审核 */
const TYPES=["person","object","quote","memory","other"];
const STATE=["pending","visible","hidden"];
const MAX_UPLOAD=165000;
const ddl=[
"CREATE TABLE IF NOT EXISTS hobby_posts (id TEXT PRIMARY KEY,nickname TEXT NOT NULL,category TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,image_webp TEXT,status TEXT NOT NULL DEFAULT 'pending',pinned INTEGER NOT NULL DEFAULT 0,likes INTEGER NOT NULL DEFAULT 0,reports INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)",
"CREATE INDEX IF NOT EXISTS idx_hobby_public ON hobby_posts(status,pinned,created_at)",
"CREATE INDEX IF NOT EXISTS idx_hobby_category ON hobby_posts(status,category,created_at)",
"CREATE TABLE IF NOT EXISTS hobby_rates (bucket TEXT PRIMARY KEY,expires_at INTEGER NOT NULL)",
"CREATE TABLE IF NOT EXISTS hobby_likes (post_id TEXT NOT NULL,ip_hash TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(post_id,ip_hash))",
"CREATE TABLE IF NOT EXISTS hobby_reports (post_id TEXT NOT NULL,ip_hash TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(post_id,ip_hash))"
];
const responses={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"};
const ok=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:responses});
class Bad extends Error{constructor(status,message){super(message);this.status=status;}}
const clean=(s,n)=>typeof s==="string"?s.trim().slice(0,n+1):"";
const uuid=s=>typeof s==="string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
const enc=new TextEncoder();
const hex=buffer=>Array.from(new Uint8Array(buffer)).map(x=>x.toString(16).padStart(2,"0")).join("");
async function digest(s){return hex(await crypto.subtle.digest("SHA-256",enc.encode(s)));}
async function ipKey(request) {return digest(request.headers.get("CF-Connecting-IP")||"unknown");}
async function schema(db){await db.batch(ddl.map(q=>db.prepare(q)));}
async function readBody(req){
 if(!/^application\/json/i.test(req.headers.get("content-type")||""))throw new Bad(415,"需要 JSON 请求");
 if(Number(req.headers.get("content-length")||0)>MAX_UPLOAD)throw new Bad(413,"内容超过上传限制");
 const reader=req.body?.getReader();if(!reader)throw new Bad(400,"请求为空");
 const chunks=[];let len=0;
 while(true){const {done,value}=await reader.read();if(done)break;len+=value.byteLength;
  if(len>MAX_UPLOAD){await reader.cancel();throw new Bad(413,"图片或文字过大");}chunks.push(value);}
 const merged=new Uint8Array(len);let off=0;for(const chunk of chunks){merged.set(chunk,off);off+=chunk.byteLength;}
 let data;try{data=JSON.parse(new TextDecoder().decode(merged));}catch{throw new Bad(400,"JSON 数据有误");}
 if(!data||typeof data!=="object"||Array.isArray(data))throw new Bad(400,"请求格式有误");
 return data;
}
async function limit(db,request,action,seconds){
 const key=action+":"+await ipKey(request);
 const now=Date.now();
 const r=await db.prepare("INSERT INTO hobby_rates(bucket,expires_at) VALUES(?,?) ON CONFLICT(bucket) DO UPDATE SET expires_at=excluded.expires_at WHERE hobby_rates.expires_at <= ?")
    .bind(key,now+seconds*1000,now).run();
 if(!r.meta?.changes)throw new Bad(429,"操作频繁，请稍后再试");
}
function imageData(s) {
 if(!s)return null;
 if(typeof s!=="string"||s.length>140000||s.length<80||!/^[A-Za-z0-9+/]+={0,2}$/.test(s))
  throw new Bad(400,"图片不能超过约100KB（建议缩小尺寸）");
 let raw;try{raw=atob(s);}catch{throw new Bad(400,"图片编码不正确");}
 if(raw.length>104000||raw.length<20 ||raw.slice(0,4)!=="RIFF"||raw.slice(8,12)!=="WEBP")
  throw new Bad(400,"图片格式必须是 WebP");
 return s;
}
async function requireAdmin(req,db){
 if(!await sessionValid(req,db))throw new Bad(401,"未登录管理员，请先前往 /stars/admin/ 登录");
}
function sameOrigin(request){
 const origin=request.headers.get("origin");
 if(origin && origin!==new URL(request.url).origin)throw new Bad(403,"跨站请求禁止");
}
export async function onRequest({request,env}){
 try{
  if(!env.WISH_DB)throw new Bad(503,"未绑定 WISH_DB 数据库");
  const db=env.WISH_DB,url=new URL(request.url);
  const action=url.searchParams.get("action")||"list";
  await schema(db);
  if(request.method==="GET"&&action==="list"){
   const cat=url.searchParams.get("category")||"all";
   if(cat!=="all"&&!TYPES.includes(cat))throw new Bad(400,"分类不正确");
   const page=Math.max(1,Math.min(1000,Number.parseInt(url.searchParams.get("page")||"1",10)||1));
   const sort=url.searchParams.get("sort")==="popular"?"popular":"latest";
   const sql="SELECT id,nickname,category,title,body,CASE WHEN image_webp IS NULL THEN 0 ELSE 1 END AS hasImage,pinned,likes,created_at FROM hobby_posts WHERE status='visible' AND (?='all' OR category=?) ORDER BY pinned DESC, "+(sort==="popular"?"likes DESC,":"")+"created_at DESC LIMIT 13 OFFSET ?";
   const items=(await db.prepare(sql).bind(cat,cat,(page-1)*12).all()).results||[];
   const count=await db.prepare("SELECT COUNT(*) AS total FROM hobby_posts WHERE status='visible' AND (?='all' OR category=?)").bind(cat,cat).first();
   return ok({items:items.slice(0,12),page,hasMore:items.length>12,total:count?.total||0});
  }
  if(request.method==="GET"&&action==="admin-list"){
   await requireAdmin(request,db);
   const status=url.searchParams.get("status")||"pending";
   if(status!=="all"&&!STATE.includes(status))throw new Bad(400,"状态不正确");
   const page=Math.max(1,Math.min(1000,parseInt(url.searchParams.get("page")||"1",10)||1));
   const items=(await db.prepare("SELECT id,nickname,category,title,body,CASE WHEN image_webp IS NULL THEN 0 ELSE 1 END AS hasImage,status,pinned,likes,reports,created_at FROM hobby_posts WHERE (?='all' OR status=?) ORDER BY created_at DESC LIMIT 31 OFFSET ?").bind(status,status,(page-1)*30).all()).results||[];
   const counts=(await db.prepare("SELECT status,COUNT(*) AS total FROM hobby_posts GROUP BY status").all()).results||[];
   return ok({items:items.slice(0,30),page,hasMore:items.length>30,counts});
  }
  if(request.method!=="POST")return ok({error:"不支持的请求方法"},405);
  sameOrigin(request);
  const body=await readBody(request);
  if(action==="submit"){
   const category=clean(body.category,24),nickname=clean(body.nickname,24)||"匿名收藏家";
   const title=clean(body.title,50),content=clean(body.body,600);
   if(!TYPES.includes(category))throw new Bad(400,"请选择一个有效分类");
   if(nickname.length>24||title.length<2||title.length>50||content.length<2||content.length>600)
    throw new Bad(400,"标题 2～50 字，分享内容 2～600 字，昵称最多 24 字");
   if(/https?:\/\/|www\.|(?:t\.me|bit\.ly|tinyurl\.com)/i.test(title+" "+content))
    throw new Bad(400,"为了避免广告和诈骗，暂不支持外部网址");
   const image=imageData(body.image||null);
   await limit(db,request,"submit",180);
   const id=crypto.randomUUID(),now=Date.now();
   await db.prepare("INSERT INTO hobby_posts(id,nickname,category,title,body,image_webp,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
    .bind(id,nickname,category,title,content,image,now,now).run();
   return ok({ok:true,id,status:"pending",message:"投稿成功，等待管理员审核后公开展示"},201);
  }
  if(action==="like"){
   const id=body.id;if(!uuid(id))throw new Bad(400,"文章编号无效");
   const exists=await db.prepare("SELECT id FROM hobby_posts WHERE id=? AND status='visible'").bind(id).first();
   if(!exists)throw new Bad(404,"该内容不存在或未公开");
   const ip=await ipKey(request),now=Date.now();
   const r=await db.prepare("INSERT OR IGNORE INTO hobby_likes(post_id,ip_hash,created_at) VALUES(?,?,?)").bind(id,ip,now).run();
   if(!r.meta?.changes)throw new Bad(409,"你已经为这条内容点过赞了");
   const result=await db.prepare("UPDATE hobby_posts SET likes=likes+1 WHERE id=? AND status='visible' RETURNING likes").bind(id).first();
   return ok({ok:true,likes:result?.likes||0});
  }
  if(action==="report"){
   const id=body.id;if(!uuid(id))throw new Bad(400,"文章编号无效");
   const reason=clean(body.reason,90);
   if(reason.length<2||reason.length>90)throw new Bad(400,"请填写 2～90 字的举报原因");
   const exists=await db.prepare("SELECT id FROM hobby_posts WHERE id=? AND status='visible'").bind(id).first();
   if(!exists)throw new Bad(404,"内容不存在或已下架");
   const ip=await ipKey(request),now=Date.now();
   const r=await db.prepare("INSERT OR IGNORE INTO hobby_reports(post_id,ip_hash,reason,created_at) VALUES(?,?,?,?)").bind(id,ip,reason,now).run();
   if(!r.meta?.changes)throw new Bad(409,"你已举报过这条内容");
   await db.prepare("UPDATE hobby_posts SET reports=reports+1 WHERE id=?").bind(id).run();
   return ok({ok:true});
  }
  if(action==="admin-update"){
   await requireAdmin(request,db);
   if(!uuid(body.id))throw new Bad(400,"编号不正确");
   const status=clean(body.status,20);
   if(!STATE.includes(status))throw new Bad(400,"状态不正确");
   const pinned=body.pinned?1:0;
   const r=await db.prepare("UPDATE hobby_posts SET status=?,pinned=?,updated_at=? WHERE id=?")
    .bind(status,pinned,Date.now(),body.id).run();
   if(!r.meta?.changes)throw new Bad(404,"内容不存在");
   return ok({ok:true});
  }
  if(action==="admin-delete"){
   await requireAdmin(request,db);
   if(!uuid(body.id))throw new Bad(400,"编号不正确");
   await db.batch([
    db.prepare("DELETE FROM hobby_likes WHERE post_id=?").bind(body.id),
    db.prepare("DELETE FROM hobby_reports WHERE post_id=?").bind(body.id),
    db.prepare("DELETE FROM hobby_posts WHERE id=?").bind(body.id)
   ]);
   return ok({ok:true});
  }
  return ok({error:"操作不支持"},404);
 }catch(err){
  if(err instanceof Bad)return ok({error:err.message},err.status);
  console.error("[hobby]",err?.name||"unknown");
  return ok({error:"服务暂时不可用，请稍后再试"},500);
 }
}
