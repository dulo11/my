import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fixture} from './helpers.mjs';
import {onRequest as hobby} from '../functions/api/hobby.js';
import {onRequest as account} from '../functions/api/hobby-account.js';
import {onRequest as social} from '../functions/api/hobby-social.js';
import {onRequest as admin} from '../functions/api/star-admin.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
test('hobby social: ordinary users cannot moderate; favorites/comments/profile/edit/notify all work',async()=>{
 const {env,db,sql}=fixture();
 const request=async(fn,action,body,cookie)=>{
  const url='https://test.invalid/api/test?action='+encodeURIComponent(action);
  const opts={method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','cf-connecting-ip':'203.0.113.44',...(cookie?{cookie}:{})}};
  if(body!==undefined)opts.body=JSON.stringify(body);
  const response=await fn({env,request:new Request(url,opts)});
  const data=await response.json();
  return {status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0]||null};
 };
 const get=async(fn,params,cookie)=>{
  const opts={headers:{'cf-connecting-ip':'203.0.113.44',...(cookie?{cookie}:{})}};
  const response=await fn({env,request:new Request('https://test.invalid/api/test?'+new URLSearchParams(params),opts)});
  return {status:response.status,data:await response.json()};
 };
 // Bootstrap old admin via D1 proof.
 const setupCode='a'.repeat(48);
 const digest=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode('star-setup-v1:'+setupCode))).toString('hex');
 sql.prepare("INSERT INTO star_settings(key,value) VALUES('setup_key_hash',?)").run(digest);
 assert.equal((await request(admin,'setup',{setupCode,password:'example-secure-pass'})).status,200);
 const logged=await request(admin,'login',{password:'example-secure-pass'});
 assert.equal(logged.status,200);
 const adminCookie=logged.cookie;
 assert.ok(adminCookie?.startsWith('star_session='));

 const signup=await request(account,'register',{username:'喜欢诗句',password:'example-user-password'});
 assert.equal(signup.status,201,JSON.stringify(signup.data));
 const userCookie=signup.cookie;
 assert.ok(userCookie?.startsWith('hobby_session='));
 const ownUser=signup.data.user;
 assert.ok(uuid.test(ownUser.id));

 const posted=await request(hobby,'submit',{category:'quote',nickname:'欺骗昵称',title:'我珍藏的句子',body:'云起时相逢，风过处相念。'},userCookie);
 assert.equal(posted.status,201,JSON.stringify(posted.data));
 const id=posted.data.id;
 assert.ok(uuid.test(id));
 const notPublic=await get(social,{action:'post',id});
 assert.equal(notPublic.status,404);
 const ownPending=await get(social,{action:'post',id},userCookie);
 assert.equal(ownPending.status,200);
 assert.equal(ownPending.data.post.nickname,'喜欢诗句');
 const triedMod=await request(hobby,'admin-update',{id,status:'visible'},userCookie);
 assert.equal(triedMod.status,401,'ordinary registered users have no admin authority');

 assert.equal((await request(hobby,'admin-update',{id,status:'visible',pinned:false},adminCookie)).status,200);
 const publicPost=await get(social,{action:'post',id});
 assert.equal(publicPost.status,200);
 assert.equal(publicPost.data.post.ownerId,ownUser.id);
 const searched=await get(hobby,{action:'list',category:'all',q:'相逢',sort:'latest'});
 assert.equal(searched.status,200);
 assert.equal(searched.data.total,1);
 assert.equal(searched.data.items[0].id,id);
 const prof=await get(social,{action:'profile',user:ownUser.id,page:'1'});
 assert.equal(prof.data.total,1);

 const favorited=await request(social,'favorite',{id},userCookie);
 assert.equal(favorited.status,200);
 assert.equal(favorited.data.saved,true);
 const myFavorites=await get(social,{action:'favorites',page:'1'},userCookie);
 assert.equal(myFavorites.status,200);
 assert.equal(myFavorites.data.items.length,1);
 const commented=await request(social,'comment',{id,body:'谢谢分享，十分喜欢。'},userCookie);
 assert.equal(commented.status,201,JSON.stringify(commented.data));
 const commentsBefore=await get(social,{action:'comments',id});
 assert.equal(commentsBefore.data.items.length,0,'comments require moderation');
 const pending=await get(social,{action:'admin-comments',status:'pending',page:'1'},adminCookie);
 assert.equal(pending.status,200);
 assert.equal(pending.data.items.length,1);
 const commentId=pending.data.items[0].id;
 assert.equal((await request(social,'admin-comment-update',{id:commentId,status:'visible'},adminCookie)).status,200);
 const commentsAfter=await get(social,{action:'comments',id});
 assert.equal(commentsAfter.data.items.length,1);
 const notices=await get(social,{action:'notifications'},userCookie);
 assert.ok(notices.data.items.length>=2,'approval generates in-app notifications');
 assert.equal((await request(social,'read-notifications',{},userCookie)).status,200);
 const afterRead=await get(social,{action:'notifications'},userCookie);
 assert.equal(afterRead.data.unread,0);

 const edited=await request(hobby,'edit',{id,title:'编辑后重新审核',body:'改写过的收藏内容。',category:'quote'},userCookie);
 assert.equal(edited.status,200,JSON.stringify(edited.data));
 assert.equal((await get(social,{action:'post',id})).status,404,'edited public posts return to pending');
 assert.equal((await get(social,{action:'post',id},userCookie)).status,200,'owner can preview pending edit');
 assert.equal((await request(hobby,'admin-update',{id,status:'visible',pinned:false},adminCookie)).status,200);
 assert.equal((await get(social,{action:'post',id})).data.post.title,'编辑后重新审核');

 assert.equal((await request(account,'delete-mine',{id},userCookie)).status,200);
 assert.equal((await get(social,{action:'post',id})).status,404);
 assert.equal((await get(social,{action:'favorites',page:'1'},userCookie)).data.items.length,0);
});
test('community pages and scripts link to all required controls without touching homepage',()=>{
 const html=readFileSync(new URL('../source/hobby/index.html',import.meta.url),'utf8');
 const adminHtml=readFileSync(new URL('../source/stars/admin/index.html',import.meta.url),'utf8');
 for(const id of ['post-dialog','post-detail-content','post-comments','post-favorite','community-dialog','hobby-search','hobby-search-run','my-favorites-open','my-notifications-open','edit-cancel'])
  assert.ok(html.includes('id="'+id+'"'),'missing public control: '+id);
 for(const id of ['hobby-comment-filter','hobby-comment-items','hobby-comment-refresh'])
  assert.ok(adminHtml.includes('id="'+id+'"'),'missing admin control: '+id);
 for(const path of ['../source/js/yun-hobby-community.js','../source/js/yun-hobby-comment-admin.js','../source/js/yun-hobby.js','../source/js/yun-hobby-account.js'])
  assert.doesNotThrow(()=>new Function(readFileSync(new URL(path,import.meta.url),'utf8')),'broken browser JS: '+path);
});
