import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fixture} from './helpers.mjs';
import {onRequest as admin} from '../functions/api/star-admin.js';
import {onRequest as stars} from '../functions/api/stars.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const f=fixture(),root=resolve('public');
const server=createServer(async(req,res)=>{
 try{
  if(req.url.startsWith('/api/')){
   const bytes=[];for await(const b of req)bytes.push(b);
   const request=new Request('http://localhost:8765'+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(bytes)}:{})});
   const response=await (req.url.startsWith('/api/star-admin')?admin:stars)({request,env:f.env});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  let name=decodeURIComponent(req.url.split('?')[0]);if(name.endsWith('/'))name+='index.html';
  const path=resolve(root,'.'+name);if(!path.startsWith(root+'/'))throw Error('bad path');
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));
 }catch{res.writeHead(404);res.end('not found')}
});
await new Promise(ok=>server.listen(8765,ok));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const go=p=>page.goto('http://localhost:8765'+p,{waitUntil:'domcontentloaded'});
const waitText=(selector,text)=>page.waitForFunction(({selector,text})=>document.querySelector(selector)?.textContent.includes(text),{selector,text});
try{
 await go('/stars/admin/');await page.locator('#setup-sql').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#setup-sql').value.includes('INSERT'));
 const sql=await page.locator('#setup-sql').inputValue();f.sql.exec(sql);await page.reload();await page.waitForFunction(()=>document.querySelector('#setup-sql').value.includes('INSERT'));
 assert.equal(await page.locator('#setup-sql').inputValue(),sql,'setup code survives reload');
 await page.fill('#initial','x');await page.click('#init');await page.locator('#login').waitFor({state:'visible'});await page.fill('#password','x');await page.click('#enter');await page.locator('#panel').waitFor({state:'visible'});await waitText('#items','暂无');
 await go('/stars/');await page.fill('#wish','浏览器测试愿望');await page.fill('#nickname','测试星友');await page.click('#send');await waitText('#wish-status','许愿成功');
 await page.locator('summary').click();await page.locator('#wish-list button').click();await waitText('#star-comments','暂无留言');await page.fill('#comment-text','浏览器留言');await page.click('#comment-send');await waitText('#star-comments','浏览器留言');await page.click('#star-like');await waitText('#star-time','❤️ 1');
 await go('/stars/admin/');await page.selectOption('#kind','comment');await waitText('#items','浏览器留言');await page.locator('#items button').click();await waitText('#items','隐藏');await page.selectOption('#filter-status','hidden');await waitText('#items','浏览器留言');
 if(process.env.UI_SCREENSHOT_DIR)await page.screenshot({path:process.env.UI_SCREENSHOT_DIR+'/admin-mobile.png',fullPage:true});
 await go('/themes/');await page.click('#yun-theme-btn');
 for(const name of ['stars','ocean','snow','autumn','forest','night','minimal','sakura']){await page.click('[data-theme-name="'+name+'"]');assert.equal(await page.getAttribute('body','data-yun-theme'),name)}
 await page.selectOption('#yun-fx-select','twinkle');await page.fill('#yun-meteor-count','99');await page.locator('#yun-meteor-count').blur();await page.reload();assert.equal(await page.getAttribute('body','data-yun-effect'),'twinkle');assert.equal(await page.locator('#yun-theme-btn').count(),1);
 await go('/tools/');assert.equal(await page.locator('#grid button').count(),44);
 async function choose(name){await page.getByRole('button',{name,exact:true}).click()}
 await choose('正则匹配');await page.fill('#input','aaaa');await page.fill('#parameter','a');await page.click('#run');await waitText('#result','index');
 await page.fill('#input','a'.repeat(60)+'!');await page.fill('#parameter','(a+)+$');await page.click('#run');await waitText('#result','超时');
 await choose('文件信息');await page.locator('#file').setInputFiles({name:'hello.txt',mimeType:'text/plain',buffer:Buffer.from('abc')});await page.click('#run');await waitText('#result','hello.txt');
 await choose('文件 SHA-256');await page.locator('#file').setInputFiles({name:'hello.txt',mimeType:'text/plain',buffer:Buffer.from('abc')});await page.click('#run');await waitText('#result','ba7816bf8f01cfea');
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=20;c.height=10;return c.toDataURL().split(',')[1]});
 await choose('图片转 WebP');await page.locator('#file').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.fill('#parameter','10');await page.click('#run');await waitText('#result','10×5');
 if(process.env.UI_SCREENSHOT_DIR)await page.screenshot({path:process.env.UI_SCREENSHOT_DIR+'/tools-mobile.png',fullPage:true});
 for(const route of ['/themes/','/stars/','/tools/','/stars/admin/']){await go(route);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' fits mobile')}
 assert.deepEqual(errors,[]);console.log('PASS browser: admin setup/reload/login, wishes/comments/likes/moderation, eight themes, 44 tools, regex timeout, file hash, WebP resize, mobile layout; no page JS errors');
}finally{await browser.close();server.close()}
