/* /api/hobby-account: visitor-only registration/login, independent of administrator */
import {ensureHobbyAuthSchema,normalizeUsername,randomHex,hashPassword,equal,authRate,createHobbySession,clearHobbySession,hobbyUserFromRequest,sha} from "../_lib/hobby-auth.js";
import {ensureHobbyCommunity} from "../_lib/hobby-community.js";

const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...headers}});
class AuthError extends Error{constructor(code,msg){super(msg);this.code=code;}}
function sameOrigin(req) {
 const origin=req.headers.get("origin");
 if(origin&&origin!==new URL(req.url).origin)throw new AuthError(403,"禁止跨站提交");
}
async function bodyJSON(req) {
 if(!/^application\/json/i.test(req.headers.get("content-type")||""))throw new AuthError(415,"请求格式错误");
 if(Number(req.headers.get("content-length")||0)>4096)throw new AuthError(413,"请求内容太长");
 const reader=req.body?.getReader();if(!reader)throw new AuthError(400,"缺少请求");
 const parts=[];let length=0;
 while(true) {
  const {done,value}=await reader.read();if(done)break;
  length+=value.byteLength;if(length>4096){await reader.cancel();throw new AuthError(413,"请求内容太长");}parts.push(value);
 }
 const bytes=new Uint8Array(length);let pos=0;
 for(const x of parts){bytes.set(x,pos);pos+=x.byteLength;}
 let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new AuthError(400,"JSON 格式错误");}
 if(!data||typeof data!=="object"||Array.isArray(data))throw new AuthError(400,"请求内容错误");
 return data;
}
const uuid=s=>typeof s==="string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export async function onRequest({request,env}){
 try{
  if(!env.WISH_DB)throw new AuthError(503,"未绑定云端数据库");
  const db=env.WISH_DB,url=new URL(request.url),action=url.searchParams.get("action")||"me";
  await ensureHobbyAuthSchema(db);
  const user=await hobbyUserFromRequest(request,db);
  if(request.method==="GET"&&action==="me")
   return json({authenticated:!!user,user:user?{id:user.id,name:user.display_name,username:user.username}:null});
  if(request.method==="GET"&&action==="mine"){
   if(!user)throw new AuthError(401,"请先登录爱好板账号");
   const page=Math.max(1,Math.min(100,parseInt(url.searchParams.get("page")||"1",10)||1));
   const rows=(await db.prepare("SELECT p.id,p.title,p.body,p.category,p.nickname,p.status,p.likes,p.created_at,CASE WHEN p.image_webp IS NULL THEN 0 ELSE 1 END AS hasImage FROM hobby_post_owners o JOIN hobby_posts p ON p.id=o.post_id WHERE o.user_id=? ORDER BY p.created_at DESC LIMIT 21 OFFSET ?").bind(user.id,(page-1)*20).all()).results||[];
   return json({items:rows.slice(0,20),hasMore:rows.length>20,page});
  }
  if(request.method!=="POST")return json({error:"仅支持 GET/POST"},405);
  sameOrigin(request);
  const data=await bodyJSON(request);
  if(action==="register"){
   const normalized=normalizeUsername(data.username);
   if(!normalized)throw new AuthError(400,"用户名仅支持中文、字母、数字和下划线，长度 2～24 字");
   const password=data.password;
   if(typeof password!=="string"||password.length<8||password.length>128)
    throw new AuthError(400,"密码必须为 8～128 个字符");
   if(user)throw new AuthError(409,"当前已有账号登录，请先退出");
   if(!await authRate(db,request,"register",90))throw new AuthError(429,"操作太频繁，请稍后再注册");
   const found=await db.prepare("SELECT id FROM hobby_users WHERE username=?").bind(normalized.username).first();
   if(found)throw new AuthError(409,"该用户名已被使用");
   const id=crypto.randomUUID(),salt=randomHex(16),hashed=await hashPassword(password,salt);
   try {
    await db.prepare("INSERT INTO hobby_users(id,username,display_name,salt,password_hash,created_at) VALUES(?,?,?,?,?,?)").bind(id,normalized.username,normalized.displayName,salt,hashed,Date.now()).run();
   }catch(e){
    if(/UNIQUE|constraint/i.test(String(e)))throw new AuthError(409,"该用户名已存在");
    throw e;
   }
   const cookie=await createHobbySession(db,id);
   return json({ok:true,user:{id,name:normalized.displayName,username:normalized.username}},201,{"set-cookie":cookie});
  }
  if(action==="login"){
   const normalized=normalizeUsername(data.username);
   if(!normalized || typeof data.password!=="string"||data.password.length>128)
    throw new AuthError(400,"用户名或密码格式错误");
   if(!await authRate(db,request,"login",3))throw new AuthError(429,"登录过于频繁，请稍后再试");
   const candidate=await db.prepare("SELECT id,username,display_name,salt,password_hash FROM hobby_users WHERE username=?").bind(normalized.username).first();
   // Always perform a PBKDF2 derivation to reduce username enumeration via timing.
   const hashed=await hashPassword(data.password,candidate?.salt||"00000000000000000000000000000000");
   if(!candidate||!equal(hashed,candidate.password_hash))throw new AuthError(403,"用户名或密码错误");
   const cookie=await createHobbySession(db,candidate.id);
   return json({ok:true,user:{id:candidate.id,name:candidate.display_name,username:candidate.username}},200,{"set-cookie":cookie});
  }
  if(action==="logout"){
   return json({ok:true},200,{"set-cookie":await clearHobbySession(request,db)});
  }
  if(action==="delete-mine"){
   if(!user)throw new AuthError(401,"请先登录");
   if(!uuid(data.id))throw new AuthError(400,"投稿编号不正确");
   await ensureHobbyCommunity(db);
   const owns=await db.prepare("SELECT post_id FROM hobby_post_owners WHERE post_id=? AND user_id=?").bind(data.id,user.id).first();
   if(!owns)throw new AuthError(403,"只能删除自己账号发布的内容");
   await db.batch([
    db.prepare("DELETE FROM hobby_likes WHERE post_id=?").bind(data.id),
    db.prepare("DELETE FROM hobby_reports WHERE post_id=?").bind(data.id),
    db.prepare("DELETE FROM hobby_favorites WHERE post_id=?").bind(data.id),
    db.prepare("DELETE FROM hobby_comments WHERE post_id=?").bind(data.id),
    db.prepare("DELETE FROM hobby_notifications WHERE post_id=?").bind(data.id),
    db.prepare("DELETE FROM hobby_post_owners WHERE post_id=? AND user_id=?").bind(data.id,user.id),
    db.prepare("DELETE FROM hobby_posts WHERE id=?").bind(data.id)
   ]);
   return json({ok:true});
  }
  return json({error:"不支持的操作"},404);
 }catch(e){
  if(e instanceof AuthError)return json({error:e.message},e.code);
  console.error("[hobby-account]",e?.name||"unknown");
  return json({error:"服务暂时不可用，请稍后重试"},500);
 }
}
