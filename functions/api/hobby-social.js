/* /api/hobby-social — favorites, comments, public profiles, notifications and comment moderation */
import {sessionValid} from "./star-admin.js";
import {schema as ensurePosts} from "./hobby.js";
import {ensureHobbyAuthSchema,hobbyUserFromRequest,sha} from "../_lib/hobby-auth.js";
import {ensureHobbyCommunity,addHobbyNotification} from "../_lib/hobby-community.js";
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json;charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const uuid=s=>typeof s==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
const pageOf=u=>Math.max(1,Math.min(100,parseInt(u.searchParams.get("page")||"1",10)||1));
const validContent=s=>typeof s==="string"&&s.trim().length>=2&&s.trim().length<=300;
async function parseJSON(req){
 if(!/^application\/json/i.test(req.headers.get("content-type")||""))throw new HttpError(415,"只接受 JSON 请求");
 if(Number(req.headers.get("content-length")||0)>4096)throw new HttpError(413,"请求超出大小限制");
 const reader=req.body?.getReader();if(!reader)throw new HttpError(400,"请求没有正文");
 let n=0,parts=[];while(true){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;
  if(n>4096){await reader.cancel();throw new HttpError(413,"请求超出大小限制");}parts.push(value);}
 const bytes=new Uint8Array(n);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
 try{const v=JSON.parse(new TextDecoder().decode(bytes));if(v&&typeof v==="object"&&!Array.isArray(v))return v;}
 catch{}throw new HttpError(400,"无效的请求 JSON");
}
async function rate(db,request,userId,action,seconds){
 const ip=request.headers.get("CF-Connecting-IP")||"unknown";
 const bucket=action+":"+userId+":"+await sha(ip),now=Date.now();
 const r=await db.prepare("INSERT INTO hobby_social_rates(bucket,expires_at) VALUES(?,?) ON CONFLICT(bucket) DO UPDATE SET expires_at=excluded.expires_at WHERE hobby_social_rates.expires_at<=?").bind(bucket,now+seconds*1000,now).run();
 if(!r.meta?.changes)throw new HttpError(429,"操作太频繁，请稍后再试");
}
function requireUser(user){if(!user)throw new HttpError(401,"请先登录爱好板账号");return user;}
function sameOrigin(req){
 const origin=req.headers.get("origin");
 if(origin&&origin!==new URL(req.url).origin)throw new HttpError(403,"禁止跨站操作");
}
async function requireAdmin(req,db){if(!await sessionValid(req,db))throw new HttpError(401,"请先登录统一管理员后台");}
async function visiblePost(db,id){
 if(!uuid(id))throw new HttpError(400,"投稿编号无效");
 const post=await db.prepare("SELECT id,title,status FROM hobby_posts WHERE id=?").bind(id).first();
 if(!post||post.status!=="visible")throw new HttpError(404,"投稿尚未公开或已经隐藏");
 return post;
}
export async function onRequest({request,env}){
 try{
  if(!env.WISH_DB)throw new HttpError(503,"数据库未配置");
  const db=env.WISH_DB,url=new URL(request.url),action=url.searchParams.get("action")||"post";
  await ensurePosts(db);
  await ensureHobbyAuthSchema(db);
  await ensureHobbyCommunity(db);
  let user;
  if(request.method==="GET"){
   if(action==="post"){
    const id=url.searchParams.get("id");
    if(!uuid(id))throw new HttpError(400,"投稿编号无效");
    const current=await hobbyUserFromRequest(request,db);
    const post=await db.prepare("SELECT p.id,p.nickname,p.category,p.title,p.body,CASE WHEN p.image_webp IS NULL THEN 0 ELSE 1 END AS hasImage,p.status,p.pinned,p.likes,p.created_at,o.user_id AS ownerId FROM hobby_posts p LEFT JOIN hobby_post_owners o ON o.post_id=p.id WHERE p.id=? AND (p.status='visible' OR o.user_id=?)").bind(id,current?.id||"").first();
    if(!post)throw new HttpError(404,"投稿不存在、正在审核或已隐藏");
    const fav=await db.prepare("SELECT COUNT(*) AS total FROM hobby_favorites WHERE post_id=?").bind(id).first();
    const mine=current?await db.prepare("SELECT post_id FROM hobby_favorites WHERE post_id=? AND user_id=?").bind(id,current.id).first():null;
    const comments=await db.prepare("SELECT COUNT(*) AS total FROM hobby_comments WHERE post_id=? AND status='visible'").bind(id).first();
    return json({post:{...post,favorites:fav?.total||0,comments:comments?.total||0,saved:!!mine},authenticated:!!current});
   }
   if(action==="comments"){
    await visiblePost(db,url.searchParams.get("id"));
    const id=url.searchParams.get("id");
    const rows=(await db.prepare("SELECT c.id,c.post_id,c.parent_id,c.user_id,c.body,c.created_at,u.display_name AS username FROM hobby_comments c JOIN hobby_users u ON u.id=c.user_id WHERE c.post_id=? AND c.status='visible' ORDER BY c.created_at ASC LIMIT 100").bind(id).all()).results||[];
    return json({items:rows});
   }
   if(action==="profile"){
    const id=url.searchParams.get("user");
    if(!uuid(id))throw new HttpError(400,"用户编号无效");
    const account=await db.prepare("SELECT id,display_name,created_at FROM hobby_users WHERE id=?").bind(id).first();
    if(!account)throw new HttpError(404,"找不到该用户");
    const page=pageOf(url);
    const rows=(await db.prepare("SELECT p.id,p.title,p.body,p.nickname,p.category,p.likes,p.created_at,CASE WHEN p.image_webp IS NULL THEN 0 ELSE 1 END AS hasImage FROM hobby_post_owners o JOIN hobby_posts p ON p.id=o.post_id WHERE o.user_id=? AND p.status='visible' ORDER BY p.created_at DESC LIMIT 13 OFFSET ?").bind(id,(page-1)*12).all()).results||[];
    const total=await db.prepare("SELECT COUNT(*) AS total FROM hobby_post_owners o JOIN hobby_posts p ON p.id=o.post_id WHERE o.user_id=? AND p.status='visible'").bind(id).first();
    return json({account,items:rows.slice(0,12),total:total?.total||0,hasMore:rows.length>12,page});
   }
   if(action==="favorites"){
    user=requireUser(await hobbyUserFromRequest(request,db));
    const page=pageOf(url);
    const rows=(await db.prepare("SELECT p.id,p.title,p.body,p.nickname,p.category,p.likes,p.created_at,CASE WHEN p.image_webp IS NULL THEN 0 ELSE 1 END AS hasImage FROM hobby_favorites f JOIN hobby_posts p ON p.id=f.post_id WHERE f.user_id=? AND p.status='visible' ORDER BY f.created_at DESC LIMIT 13 OFFSET ?").bind(user.id,(page-1)*12).all()).results||[];
    return json({items:rows.slice(0,12),hasMore:rows.length>12,page});
   }
   if(action==="notifications"){
    user=requireUser(await hobbyUserFromRequest(request,db));
    const rows=(await db.prepare("SELECT id,post_id,kind,message,read,created_at FROM hobby_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30").bind(user.id).all()).results||[];
    const unread=await db.prepare("SELECT COUNT(*) AS total FROM hobby_notifications WHERE user_id=? AND read=0").bind(user.id).first();
    return json({items:rows,unread:unread?.total||0});
   }
   if(action==="admin-comments"){
    await requireAdmin(request,db);
    const status=url.searchParams.get("status")||"pending";
    if(!["pending","visible","hidden","all"].includes(status))throw new HttpError(400,"状态无效");
    const page=pageOf(url);
    const rows=(await db.prepare("SELECT c.id,c.post_id,c.user_id,c.parent_id,c.body,c.status,c.created_at,p.title AS postTitle,u.display_name AS username FROM hobby_comments c JOIN hobby_posts p ON p.id=c.post_id JOIN hobby_users u ON u.id=c.user_id WHERE (?='all' OR c.status=?) ORDER BY c.created_at DESC LIMIT 31 OFFSET ?").bind(status,status,(page-1)*30).all()).results||[];
    const counts=(await db.prepare("SELECT status,COUNT(*) AS total FROM hobby_comments GROUP BY status").all()).results||[];
    return json({items:rows.slice(0,30),hasMore:rows.length>30,page,counts});
   }
   return json({error:"未知接口"},404);
  }
  if(request.method!=="POST")return json({error:"仅支持 GET / POST"},405);
  sameOrigin(request);const b=await parseJSON(request);
  if(action==="favorite"){
   user=requireUser(await hobbyUserFromRequest(request,db));
   const post=await visiblePost(db,b.id);
   await rate(db,request,user.id,"favorite",2);
   const found=await db.prepare("SELECT post_id FROM hobby_favorites WHERE user_id=? AND post_id=?").bind(user.id,post.id).first();
   if(found)await db.prepare("DELETE FROM hobby_favorites WHERE user_id=? AND post_id=?").bind(user.id,post.id).run();
   else await db.prepare("INSERT OR IGNORE INTO hobby_favorites(user_id,post_id,created_at) VALUES(?,?,?)").bind(user.id,post.id,Date.now()).run();
   const count=await db.prepare("SELECT COUNT(*) AS total FROM hobby_favorites WHERE post_id=?").bind(post.id).first();
   return json({ok:true,saved:!found,count:count?.total||0});
  }
  if(action==="comment"){
   user=requireUser(await hobbyUserFromRequest(request,db));
   const post=await visiblePost(db,b.id);
   if(!validContent(b.body))throw new HttpError(400,"评论需要 2～300 字");
   const content=b.body.trim();
   if(/https?:\/\/|www\./i.test(content))throw new HttpError(400,"评论暂不支持外部链接");
   let parent=null;
   if(b.parentId!==undefined&&b.parentId!==null&&b.parentId!==""){
    if(!uuid(b.parentId))throw new HttpError(400,"回复对象无效");
    const found=await db.prepare("SELECT id FROM hobby_comments WHERE id=? AND post_id=? AND status='visible'").bind(b.parentId,post.id).first();
    if(!found)throw new HttpError(404,"回复对象已删除或未审核");
    parent=b.parentId;
   }
   await rate(db,request,user.id,"comment",30);
   const now=Date.now(),id=crypto.randomUUID();
   await db.prepare("INSERT INTO hobby_comments(id,post_id,user_id,parent_id,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").bind(id,post.id,user.id,parent,content,now,now).run();
   return json({ok:true,status:"pending",message:"评论已提交，等待管理员审核"},201);
  }
  if(action==="delete-comment"){
   user=requireUser(await hobbyUserFromRequest(request,db));
   if(!uuid(b.id))throw new HttpError(400,"评论编号无效");
   const found=await db.prepare("SELECT id FROM hobby_comments WHERE id=? AND user_id=?").bind(b.id,user.id).first();
   if(!found)throw new HttpError(403,"只能删除自己的评论");
   await db.batch([db.prepare("UPDATE hobby_comments SET parent_id=NULL WHERE parent_id=?").bind(b.id),db.prepare("DELETE FROM hobby_comments WHERE id=? AND user_id=?").bind(b.id,user.id)]);
   return json({ok:true});
  }
  if(action==="read-notifications"){
   user=requireUser(await hobbyUserFromRequest(request,db));
   await db.prepare("UPDATE hobby_notifications SET read=1 WHERE user_id=? AND read=0").bind(user.id).run();
   return json({ok:true});
  }
  if(action==="admin-comment-update"){
   await requireAdmin(request,db);
   if(!uuid(b.id)||!["pending","visible","hidden"].includes(b.status))throw new HttpError(400,"参数错误");
   const old=await db.prepare("SELECT id,post_id,user_id,status,parent_id FROM hobby_comments WHERE id=?").bind(b.id).first();
   if(!old)throw new HttpError(404,"评论不存在");
   await db.prepare("UPDATE hobby_comments SET status=?,updated_at=? WHERE id=?").bind(b.status,Date.now(),b.id).run();
   if(old.status!=="visible"&&b.status==="visible"){
    const post=await db.prepare("SELECT p.title,o.user_id AS ownerId FROM hobby_posts p LEFT JOIN hobby_post_owners o ON o.post_id=p.id WHERE p.id=?").bind(old.post_id).first();
    let recipient=post?.ownerId;
    if(old.parent_id){
     const parent=await db.prepare("SELECT user_id FROM hobby_comments WHERE id=?").bind(old.parent_id).first();
     if(parent?.user_id && parent.user_id!==old.user_id)recipient=parent.user_id;
    }
    if(recipient&&recipient!==old.user_id)await addHobbyNotification(db,recipient,old.post_id,"comment","你的分享《"+String(post?.title||"投稿").slice(0,35)+"》收到一条新评论或回复");
    await addHobbyNotification(db,old.user_id,old.post_id,"comment-approved","你的评论审核通过，已经公开显示");
   }
   return json({ok:true});
  }
  if(action==="admin-comment-delete"){
   await requireAdmin(request,db);
   if(!uuid(b.id))throw new HttpError(400,"评论编号错误");
   await db.batch([db.prepare("UPDATE hobby_comments SET parent_id=NULL WHERE parent_id=?").bind(b.id),db.prepare("DELETE FROM hobby_comments WHERE id=?").bind(b.id)]);
   return json({ok:true});
  }
  return json({error:"操作不存在"},404);
 }catch(e){
  if(e instanceof HttpError)return json({error:e.message},e.status);
  console.error("[hobby-social]",e?.name||"unknown");
  return json({error:"社区服务暂时不可用，请稍后重试"},500);
 }
}
