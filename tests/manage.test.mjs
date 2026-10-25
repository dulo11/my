import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.mjs';
import {onRequest as admin} from '../functions/api/star-admin.js';
import {onRequest as stars} from '../functions/api/stars.js';
import {defaults} from '../functions/_lib/schema.js';
async function setup(f){const code='a'.repeat(48),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('star-setup-v1:'+code))).toString('hex');f.sql.prepare('INSERT INTO star_settings VALUES(?,?)').run('setup_key_hash',hash);assert.equal((await f.req(admin,'action=setup',{password:'x',setupCode:code})).status,200);const login=await f.req(admin,'action=login',{password:'x'});assert.equal(login.status,200);return {cookie:login.headers.get('set-cookie').split(';')[0]}}
const wish=(f,id=crypto.randomUUID())=>{f.sql.prepare('INSERT INTO star_wishes(id,nickname,content,x,y,created_at) VALUES(?,?,?,?,?,?)').run(id,'name','hello 100%',.5,.5,Date.now());return id};
test('old installation without rate table upgrades and logs in without resetting password',async()=>{
 const f=fixture();f.sql.exec('DROP TABLE star_rate_limits');const auth=await setup(f);
 assert.equal((await f.req(admin,'action=me',undefined,auth)).data.authenticated,true);
 assert.ok(f.sql.prepare("SELECT name FROM sqlite_master WHERE name='star_limits_v2'").get());
 assert.equal((await f.req(admin,'action=health')).data.crypto,true);
});
test('settings enforce public switches and limits; search and batch trash restore purge preserve metadata',async()=>{
 const f=fixture(),auth=await setup(f),id=wish(f),child=crypto.randomUUID();f.sql.prepare('INSERT INTO star_comments(id,wish_id,nickname,content,created_at) VALUES(?,?,?,?,?)').run(child,id,'n','reply',Date.now());
 const call=(a,b)=>f.req(admin,'action='+a,b,auth);
 assert.equal((await call('list',{q:'100%'})).data.items.length,1);
 assert.equal((await call('list',{q:'not found'})).data.items.length,0);
 assert.equal((await call('annotate',{kind:'wish',id,pinned:true,reply:'admin says hi'})).status,200);
 assert.equal((await f.req(stars,'action=list')).data.items[0].admin_reply,'admin says hi');
 assert.equal((await call('batch',{kind:'wish',ids:[id],operation:'hidden'})).status,200);
 assert.equal((await call('batch',{kind:'wish',ids:[id],operation:'trash'})).status,200);
 assert.equal((await call('list',{status:'deleted'})).data.items.length,1);
 assert.equal((await f.req(stars,'action=comments&wish='+id)).status,404);
 assert.equal((await call('batch',{kind:'wish',ids:[id],operation:'restore'})).status,200);
 assert.equal(f.sql.prepare('SELECT status FROM star_wishes WHERE id=?').get(id).status,'hidden');
 assert.equal((await call('save-settings',{settings:{...defaults,wishEnabled:false,announcement:'hello'}})).status,200);
 assert.equal((await f.req(stars,'action=wish',{content:'new'})).status,403);
 assert.equal((await f.req(stars,'action=config')).data.settings.announcement,'hello');
 assert.equal((await call('save-settings',{settings:{...defaults,wishInterval:0}})).status,400);
 assert.equal((await call('batch',{kind:'wish',ids:[id],operation:'purge'})).status,400);
 await call('batch',{kind:'wish',ids:[id],operation:'trash'});
 assert.equal((await call('batch',{kind:'wish',ids:[id],operation:'purge',confirm:'永久删除'})).status,200);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM star_comments').get().n,0);
});
test('backup round-trip preserves content and annotations, skips duplicates, rejects secrets and malformed objects',async()=>{
 const f=fixture(),auth=await setup(f),id=wish(f);const call=(a,b)=>f.req(admin,'action='+a,b,auth);
 await call('annotate',{kind:'wish',id,pinned:true,reply:'keep me'});
 const exported=await call('export',{kind:'wish'});assert.equal(exported.data.items[0].meta.admin_reply,'keep me');assert.ok(!JSON.stringify(exported.data).includes('password_hash'));
 assert.equal((await call('restore-preview',{kind:'wish',items:exported.data.items})).data.duplicates,1);
 const target=fixture(),auth2=await setup(target);const importCall=(a,b)=>target.req(admin,'action='+a,b,auth2);
 assert.equal((await importCall('restore-import',{kind:'wish',items:exported.data.items})).data.added,1);
 assert.equal((await importCall('restore-import',{kind:'wish',items:exported.data.items})).data.skipped,1);
 assert.equal((await target.req(stars,'action=list')).data.items[0].admin_reply,'keep me');
 assert.equal((await importCall('restore-import',{kind:'wish',items:[{...exported.data.items[0],id:'bad'}]})).status,400);
 assert.equal((await target.req(admin,'action=restore-import',{kind:'wish',items:exported.data.items})).status,401);
 assert.equal((await importCall('save-settings',{settings:{...defaults,password_hash:'ATTACK'}})).status,200);
 assert.notEqual(target.sql.prepare("SELECT value FROM star_settings WHERE key='password_hash'").get().value,'ATTACK');
});
test('error response includes safe nested-cause category, stage and request ID',async()=>{
 const response=await admin({env:{WISH_DB:{prepare(){return {}},async batch(){throw new Error('D1 error',{cause:new Error('no such table: example secret-value')})}}},request:new Request('https://example.test/api/star-admin?action=me')});
 const data=await response.json();assert.equal(data.code,'SCHEMA_MISSING');assert.equal(data.stage,'schema');assert.ok(data.requestId);assert.ok(!JSON.stringify(data).includes('secret-value'));
});
