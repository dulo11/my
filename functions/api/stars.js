import {ensureSchema,getSettings} from '../_lib/schema.js';
import {json,HttpError,readBody,sameOrigin,validId,bumpRevision,revision,cached,rate,moderate,failure} from '../_lib/stars.js';
const MAX=500,TTL=172800;
const clean=(v,n)=>String(v ?? '').trim().slice(0,n);
export async function onRequest({request,env}) {
  let stage='request';
  try {
    if (!env.WISH_DB) return json({error:'管理员尚未配置 D1 绑定 WISH_DB'},503);
    const db=env.WISH_DB,url=new URL(request.url),action=url.searchParams.get('action')||'list';
    stage='schema';await ensureSchema(db);stage=action;
    const settings=await getSettings(db);
    if(request.method==='GET'&&action==='config')return json({settings});
    if (request.method==='GET' && action==='list') {
      const version=await revision(db);
      const items=await cached(env,'stars:public:v2:'+version,()=>db.prepare("SELECT w.id,w.nickname,w.content,w.x,w.y,w.created_at,w.likes,COALESCE(m.pinned,0) AS pinned,COALESCE(m.admin_reply,'') AS admin_reply FROM star_wishes w LEFT JOIN star_content_meta m ON m.kind='wish' AND m.id=w.id WHERE w.status='visible' ORDER BY pinned DESC,w.created_at DESC,w.id DESC LIMIT ?").bind(MAX).all(),TTL);
      const integer=(v,d,max)=>Number.isFinite(Number(v))&&v!==null?Math.min(max,Math.max(1,Math.floor(Number(v)))):d;
      const page=integer(url.searchParams.get('page'),1,1000),size=integer(url.searchParams.get('size'),50,100);
      return json({items:items.slice((page-1)*size,page*size),total:items.length,page,size,hasMore:page*size<items.length,revision:version,cacheHours:48});
    }
    if (request.method==='GET' && action==='comments') {
      const id=url.searchParams.get('wish');
      if(!validId(id)) throw new HttpError(400,'星星编号无效');
      const parent=await db.prepare("SELECT id FROM star_wishes WHERE id=? AND status='visible'").bind(id).first();
      if(!parent) throw new HttpError(404,'星星不存在或已隐藏');
      const version=await revision(db);
      const items=await cached(env,'stars:comments:v2:'+version+':'+id,()=>db.prepare("SELECT c.id,c.nickname,c.content,c.created_at,COALESCE(m.admin_reply,'') AS admin_reply,COALESCE(m.pinned,0) AS pinned FROM star_comments c LEFT JOIN star_content_meta m ON m.kind='comment' AND m.id=c.id WHERE c.wish_id=? AND c.status='visible' ORDER BY pinned DESC,c.created_at DESC,c.id DESC LIMIT 50").bind(id).all(),86400);
      return json({items});
    }
    if(request.method!=='POST') return json({error:'方法不支持'},405);
    sameOrigin(request);
    const b=await readBody(request,16384);
    if(action==='wish') {
      if(!settings.wishEnabled)throw new HttpError(403,'管理员已暂停许愿');
      const content=clean(b.content,settings.wishMax+1),nickname=clean(b.nickname,24)||'匿名星友';
      if(content.length<2||content.length>settings.wishMax) throw new HttpError(400,'愿望长度需要 2～'+settings.wishMax+' 字');
      await rate(db,request,'wish',settings.wishInterval);
      const item={id:crypto.randomUUID(),nickname,content,x:Math.random()*.8+.1,y:Math.random()*.75+.1,created_at:Date.now(),likes:0};
      await db.batch([db.prepare('INSERT INTO star_wishes(id,nickname,content,x,y,created_at) VALUES(?,?,?,?,?,?)').bind(item.id,nickname,content,item.x,item.y,item.created_at),bumpRevision(db)]);
      return json({item},201);
    }
    if(action==='comment'||action==='like') {
      const id=b.wishId;
      if(!validId(id)) throw new HttpError(400,'星星编号无效');
      const parent=await db.prepare("SELECT id FROM star_wishes WHERE id=? AND status='visible'").bind(id).first();
      if(!parent) throw new HttpError(404,'星星不存在或已隐藏');
      if(action==='comment') {
        if(!settings.commentEnabled)throw new HttpError(403,'管理员已暂停留言');
        const content=clean(b.content,settings.commentMax+1),nickname=clean(b.nickname,24)||'匿名星友';
        if(content.length<2||content.length>settings.commentMax) throw new HttpError(400,'留言需 2～'+settings.commentMax+' 字');
        await rate(db,request,'comment',settings.commentInterval);
        const item={id:crypto.randomUUID(),nickname,content,created_at:Date.now()};
        const result=await db.batch([db.prepare("INSERT INTO star_comments(id,wish_id,nickname,content,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM star_wishes WHERE id=? AND status='visible') RETURNING id").bind(item.id,id,nickname,content,item.created_at,id),bumpRevision(db)]);
        if(!result[0].results?.length) throw new HttpError(404,'星星不存在或已隐藏');
        return json({item},201);
      }
      if(!settings.likeEnabled)throw new HttpError(403,'管理员已暂停点赞');
      await rate(db,request,'like',settings.likeInterval);
      const result=await db.batch([db.prepare("UPDATE star_wishes SET likes=likes+1 WHERE id=? AND status='visible' RETURNING likes").bind(id),bumpRevision(db)]);
      if(!result[0].results?.length) throw new HttpError(404,'星星不存在或已隐藏');
      return json({likes:result[0].results[0].likes});
    }
    // Compatibility for existing server-side scripts; the browser admin uses its HttpOnly session.
    if(action==='moderate') {
      if(!env.STAR_ADMIN_TOKEN||request.headers.get('authorization')!=='Bearer '+env.STAR_ADMIN_TOKEN) throw new HttpError(403,'无权限');
      await moderate(db,{...b,status:b.visible===true?'visible':'hidden'});
      return json({ok:true});
    }
    return json({error:'操作不支持'},404);
  } catch(error) { return failure(error,stage); }
}

