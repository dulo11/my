import {json,HttpError,readBody,sameOrigin,validId,bumpRevision,revision,cached,rate,moderate,failure} from '../_lib/stars.js';
const MAX=500,TTL=172800;
const clean=(v,n)=>String(v ?? '').trim().slice(0,n);
export async function onRequest({request,env}) {
  try {
    if (!env.WISH_DB) return json({error:'管理员尚未配置 D1 绑定 WISH_DB'},503);
    const db=env.WISH_DB,url=new URL(request.url),action=url.searchParams.get('action')||'list';
    if (request.method==='GET' && action==='list') {
      const version=await revision(db);
      const items=await cached(env,'stars:public:v2:'+version,()=>db.prepare("SELECT id,nickname,content,x,y,created_at,likes FROM star_wishes WHERE status='visible' ORDER BY created_at DESC,id DESC LIMIT ?").bind(MAX).all(),TTL);
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
      const items=await cached(env,'stars:comments:v2:'+version+':'+id,()=>db.prepare("SELECT id,nickname,content,created_at FROM star_comments WHERE wish_id=? AND status='visible' ORDER BY created_at DESC,id DESC LIMIT 50").bind(id).all(),86400);
      return json({items});
    }
    if(request.method!=='POST') return json({error:'方法不支持'},405);
    sameOrigin(request);
    const b=await readBody(request,4096);
    if(action==='wish') {
      const content=clean(b.content,101),nickname=clean(b.nickname,24)||'匿名星友';
      if(content.length<2||content.length>100) throw new HttpError(400,'愿望长度需要 2～100 字');
      await rate(db,request,'wish',60);
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
        const content=clean(b.content,201),nickname=clean(b.nickname,24)||'匿名星友';
        if(content.length<2||content.length>200) throw new HttpError(400,'留言需 2～200 字');
        await rate(db,request,'comment',15);
        const item={id:crypto.randomUUID(),nickname,content,created_at:Date.now()};
        const result=await db.batch([db.prepare("INSERT INTO star_comments(id,wish_id,nickname,content,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM star_wishes WHERE id=? AND status='visible') RETURNING id").bind(item.id,id,nickname,content,item.created_at,id),bumpRevision(db)]);
        if(!result[0].results?.length) throw new HttpError(404,'星星不存在或已隐藏');
        return json({item},201);
      }
      await rate(db,request,'like',15);
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
  } catch(error) { return failure(error); }
}
