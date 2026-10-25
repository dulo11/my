// Run after `wrangler pages functions build functions --outdir /tmp/my-new-functions`.
const {Miniflare}=require(process.env.MINIFLARE_PATH||'miniflare');
const {readFileSync}=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
const mf=new Miniflare({workers:[{config:{name:'test',compatibilityDate:'2026-10-24',manifest:{mainModule:'index.js',modules:{'index.js':{type:'esm',contents:readFileSync(process.env.WORKER_BUNDLE||'/tmp/my-new-functions/index.js','utf8')}}},env:{WISH_DB:{type:'d1',id:'test-db'},STAR_CACHE:{type:'kv',id:'test-cache'}}}}],host:'127.0.0.1',port:0});
try{
 const request=async(path,body,cookie)=>{const r=await mf.dispatchFetch('https://example.test/api/'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};
 const db=await mf.getD1Database('WISH_DB');
 // Emulate the earlier manual setup: only star_settings exists before upgrade.
 await db.prepare('CREATE TABLE star_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)').run();
 const code='a'.repeat(48),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('star-setup-v1:'+code))).toString('hex');
 await db.prepare('INSERT INTO star_settings VALUES(?,?)').bind('setup_key_hash',hash).run();
 assert.equal((await request('star-admin?action=health')).status,200);
 assert.equal((await request('star-admin?action=setup',{setupCode:code,password:'x'})).status,200);
 const login=await request('star-admin?action=login',{password:'x'});assert.equal(login.status,200,JSON.stringify(login.data));assert.ok(login.cookie);
 const created=await request('stars?action=wish',{content:'runtime test'});assert.equal(created.status,201,JSON.stringify(created.data));
 const id=created.data.item.id;
 assert.equal((await request('stars?action=comment',{wishId:id,content:'runtime comment'})).status,201);
 assert.equal((await request('stars?action=like',{wishId:id})).data.likes,1);
 assert.equal((await request('star-admin?action=batch',{kind:'wish',ids:[id],operation:'trash'},login.cookie)).status,200);
 assert.equal((await request('stars?action=comments&wish='+id)).status,404);
 assert.equal((await request('star-admin?action=batch',{kind:'wish',ids:[id],operation:'restore'},login.cookie)).status,200);
 assert.equal((await request('star-admin?action=list',{q:'long search query '.repeat(8)},login.cookie)).status,200);
 assert.equal((await request('star-admin?action=stats',{},login.cookie)).status,200);
 assert.equal((await request('star-admin?action=annotate',{kind:'wish',id,pinned:true,reply:'admin reply'},login.cookie)).status,200);
 const backup=await request('star-admin?action=export',{kind:'wish'},login.cookie);assert.equal(backup.data.items.length,1);assert.equal(backup.data.items[0].meta.admin_reply,'admin reply');
 assert.equal((await request('star-admin?action=restore-preview',{kind:'wish',items:backup.data.items},login.cookie)).data.duplicates,1);
 console.log('PASS workerd + D1: additive legacy upgrade, crypto, setup, login, wish, comment, like, trash/restore, backup');
}finally{await mf.dispose()}
})().catch(e=>{console.error(e);process.exitCode=1});
