import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {onRequest as stars} from '../functions/api/stars.js';
import {onRequest as admin} from '../functions/api/star-admin.js';
const derive=crypto.subtle.deriveBits.bind(crypto.subtle);
crypto.subtle.deriveBits=(p,...args)=>{assert.ok(p.iterations<=100000,'Cloudflare PBKDF2 ceiling');return derive(p,...args)};
import {fixture} from './helpers.mjs';

async function initialize(f){
 const code='a'.repeat(48),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('star-setup-v1:'+code))).toString('hex');
 f.sql.prepare('INSERT INTO star_settings VALUES(?,?)').run('setup_key_hash',hash);
 assert.equal((await f.req(admin,'action=setup',{password:'x',setupCode:'b'.repeat(48)})).status,403);
 assert.equal((await f.req(admin,'action=setup',{password:'x',setupCode:code})).status,200);
 const login=await f.req(admin,'action=login',{password:'x'});assert.equal(login.status,200);
 return {cookie:login.headers.get('set-cookie').split(';')[0]};
}
test('full wish/comment/like/admin workflow and versioned cache moderation',async()=>{
 const f=fixture(),auth=await initialize(f);
 assert.equal((await f.req(stars,'action=wish',{content:'hello'})).status,201);
 const first=await f.req(stars,'action=list');const wish=first.data.items[0];assert.equal(wish.content,'hello');
 assert.equal((await f.req(stars,'action=wish',{content:'too fast'})).status,429);
 const comment=await f.req(stars,'action=comment',{wishId:wish.id,content:'hi there'});assert.equal(comment.status,201);
 assert.equal((await f.req(stars,'action=comments&wish='+wish.id)).data.items.length,1);
 assert.equal((await f.req(stars,'action=like',{wishId:wish.id})).data.likes,1);
 assert.equal((await f.req(stars,'action=list')).data.items[0].likes,1);
 assert.equal((await f.req(admin,'action=list',{})).status,401);
 assert.equal((await f.req(admin,'action=list&kind=comment',undefined,auth)).data.items.length,1);
 assert.equal((await f.req(admin,'action=moderate',{kind:'comment',id:comment.data.item.id,status:'hidden'},auth)).status,200);
 assert.equal((await f.req(stars,'action=comments&wish='+wish.id)).data.items.length,0);
 assert.equal((await f.req(admin,'action=list',{kind:'comment',status:'hidden'},auth)).data.items.length,1);
 assert.equal((await f.req(admin,'action=moderate',{id:wish.id,status:'hidden'},auth)).status,200);
 assert.equal((await f.req(stars,'action=list')).data.items.length,0);
 assert.equal((await f.req(stars,'action=comments&wish='+wish.id)).status,404);
 assert.equal((await f.req(admin,'action=moderate',{id:wish.id,status:'visible'},auth)).status,200);
 assert.equal((await f.req(stars,'action=list')).data.items.length,1);
 assert.equal((await f.req(admin,'action=moderate',{id:crypto.randomUUID(),status:'hidden'},auth)).status,404);
 assert.equal((await f.req(admin,'action=password',{password:'x',newPassword:'你好'.repeat(2048)},auth)).status,200);
 assert.equal((await f.req(admin,'action=me',undefined,auth)).data.authenticated,false);
 f.sql.exec('DELETE FROM star_limits_v2');
 assert.equal((await f.req(admin,'action=login',{password:'你好'.repeat(2048)})).status,200);
});
test('input errors, cross-origin rejection, pagination, authorization',async()=>{
 const f=fixture();
 assert.equal((await f.req(stars,'action=wish','{')).status,400);
 assert.equal((await f.req(stars,'action=wish','null')).status,400);
 assert.equal((await f.req(stars,'action=wish',{content:'hi'},{origin:'https://evil.invalid'})).status,403);
 assert.equal((await f.req(stars,'action=wish',{content:'a'.repeat(20000)})).status,413);
 assert.equal((await f.req(stars,'action=wish',{content:'x'})).status,400);
 const auth=await initialize(f);
 for(let i=0;i<60;i++)f.sql.prepare('INSERT INTO star_wishes(id,nickname,content,x,y,created_at) VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),'n','c',.5,.5,i);
 assert.equal((await f.req(admin,'action=list',{page:1},auth)).data.items.length,50);
 assert.equal((await f.req(admin,'action=list',{page:2},auth)).data.items.length,10);
 assert.equal((await f.req(stars,'action=list&page=Infinity&size=2.5')).data.items.length,2);
 assert.equal((await f.req(admin,'action=moderate',{id:'bad',status:'hidden'},auth)).status,400);
});
test('KV outage cannot lose successful writes; cached versions never overwrite the current revision',async()=>{
 const f=fixture();await initialize(f);
 const old=await f.req(stars,'action=list');assert.equal(old.data.items.length,0);
 f.breakCache();
 assert.equal((await f.req(stars,'action=wish',{content:'saved despite KV'})).status,201);
 const list=await f.req(stars,'action=list');assert.equal(list.data.items.length,1);assert.notEqual(list.data.revision,old.data.revision);
});
test('login rate limits work without KV',async()=>{
 const f=fixture();await initialize(f);delete f.env.STAR_CACHE;
 for(let i=0;i<8;i++){
  f.sql.prepare("DELETE FROM star_limits_v2 WHERE bucket LIKE 'admin-login:%'").run();
  assert.equal((await f.req(admin,'action=login',{password:'wrong'})).status,403);
 }
 f.sql.prepare("DELETE FROM star_limits_v2 WHERE bucket LIKE 'admin-login:%'").run();
 assert.equal((await f.req(admin,'action=login',{password:'x'})).status,429);
});

