(()=>{'use strict';
const $=id=>document.getElementById(id),c=$('sky'),ctx=c.getContext('2d'),box=c.parentElement;
let w=0,h=0,stars=[],meteors=[],wishes=[],page=1,more=true,galaxy=false,t=0,selected=null,loading=false,version=null,detailRequest=0;
let config={wishEnabled:true,commentEnabled:true,likeEnabled:true,wishMax:100,commentMax:200};
const CACHE='yun-public-wishes-v2',reduced=matchMedia('(prefers-reduced-motion: reduce)');
const status=s=>$('wish-status').textContent=s;
async function call(action,method='GET',data){
 const url='/api/stars?action='+action+(method==='GET'&&data?'&'+new URLSearchParams(data):'');
 const r=await fetch(url,{method,headers:method==='POST'?{'content-type':'application/json'}:{},body:method==='POST'?JSON.stringify(data):undefined,cache:'no-store'});
 let j;try{j=await r.json()}catch{throw Error('接口返回异常，请检查部署')}
 if(!r.ok)throw Error(j.error||'请求失败');return j;
}
function resize(){w=c.width=box.clientWidth;h=c.height=box.clientHeight;stars=Array.from({length:innerWidth<768?90:190},()=>({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.8+.4,p:Math.random()*7}));paint()}
function shoot(n){if(reduced.matches)return;for(let i=0;i<n;i++)meteors.push({x:Math.random()*w*.7,y:Math.random()*h*.5,v:5+Math.random()*5})}
function paint(){
 ctx.clearRect(0,0,w,h);
 // Include the sky in exported PNGs, not just transparent stars.
 const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#090d27');bg.addColorStop(1,'#273d77');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
 if(galaxy){const g=ctx.createRadialGradient(w*.5,h*.5,1,w*.5,h*.5,w*.6);g.addColorStop(0,'#795aaf88');g.addColorStop(1,'#0000');ctx.fillStyle=g;ctx.fillRect(0,0,w,h)}
 for(const s of stars){ctx.fillStyle='rgba(240,240,255,'+(.35+.6*Math.abs(Math.sin(t*.01+s.p)))+')';ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,7);ctx.fill()}
 for(const m of meteors){ctx.strokeStyle='#cfe9ff';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(m.x,m.y);ctx.lineTo(m.x-70,m.y-35);ctx.stroke();m.x+=m.v;m.y+=m.v*.5}
 meteors=meteors.filter(m=>m.x<w+80&&m.y<h+80);
 for(const a of wishes){ctx.fillStyle='#ffe5a1';ctx.font='20px sans-serif';ctx.fillText('✦',a.x*w,a.y*h)}
}
let frameId=null;
function frame(){frameId=null;if(document.hidden)return;t++;paint();schedule()}
function schedule(){if(frameId===null&&!document.hidden&&!reduced.matches&&document.body.dataset.yunPowerSave!=='true')frameId=requestAnimationFrame(frame)}
function resume(){if(frameId!==null){cancelAnimationFrame(frameId);frameId=null}paint();schedule()}
document.addEventListener('visibilitychange',resume);document.addEventListener('yun:effect',resume);reduced.addEventListener('change',resume);addEventListener('resize',resize);resize();schedule();
function remember(){try{localStorage.setItem(CACHE,JSON.stringify({items:wishes.slice(0,200),time:Date.now()}))}catch{}}
function renderList(){const list=$('wish-list');list.replaceChildren();for(const wish of wishes){const button=document.createElement('button');button.textContent=(wish.pinned?'📌 ':'')+wish.nickname+'：'+wish.content;button.onclick=()=>openStar(wish);list.append(button)}paint()}
async function load(reset=false){
 if(loading||(!reset&&!more))return;loading=true;$('reload').disabled=$('more').disabled=true;
 try{
  let nextPage=reset?1:page,j=await call('list','GET',{page:nextPage,size:50});
  if(!reset&&version!==null&&j.revision!==version){nextPage=1;reset=true;j=await call('list','GET',{page:1,size:50})}
  if(reset)wishes=[];
  const ids=new Set(wishes.map(x=>x.id));for(const item of j.items)if(!ids.has(item.id)){wishes.push(item);ids.add(item.id)}
  more=j.hasMore;page=nextPage+1;version=j.revision;
  if(selected&&reset){selected=null;detailRequest++;$('star-detail').hidden=true}
  remember();renderList();status('已同步 '+wishes.length+' 颗公开许愿星'+(more?'，可继续查看更多':'（已显示当前列表全部内容）'));
 }catch(e){status('同步失败：'+e.message+'；保留已加载内容')}
 finally{loading=false;$('reload').disabled=false;$('more').disabled=!more}
}
try{const cached=JSON.parse(localStorage.getItem(CACHE)||'null');if(Array.isArray(cached?.items)&&Date.now()-cached.time<172800000){wishes=cached.items;renderList();status('正在显示本地缓存，等待同步…')}}catch{}
function line(text,parent){const p=document.createElement('p');p.textContent=text;parent.append(p)}
async function openStar(a){
 selected=a;const ticket=++detailRequest;$('star-detail').hidden=false;$('star-name').textContent='⭐ '+a.nickname;$('star-text').textContent=a.content;$('star-reply').hidden=!a.admin_reply;$('star-reply').textContent=a.admin_reply?'管理员回复：'+a.admin_reply:'';$('star-time').textContent=new Date(a.created_at).toLocaleString()+' · ❤️ '+(a.likes||0);$('star-comments').replaceChildren();
 $('star-detail').scrollIntoView({behavior:reduced.matches?'auto':'smooth',block:'start'});
 try{const j=await call('comments','GET',{wish:a.id});if(ticket!==detailRequest)return;
 if(!j.items.length)line('暂无留言',$('star-comments'));for(const x of j.items){line((x.pinned?'📌 ':'')+x.nickname+'：'+x.content,$('star-comments'));if(x.admin_reply)line('管理员回复：'+x.admin_reply,$('star-comments'))};
 }catch(e){if(ticket===detailRequest)line('加载留言失败：'+e.message,$('star-comments'))}
}
c.addEventListener('pointerdown',e=>{const r=c.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;const a=wishes.map(v=>({v,d:Math.hypot(v.x*w-x,v.y*h-y)})).sort((a,b)=>a.d-b.d)[0];if(a&&a.d<24)openStar(a.v);else{stars.push({x,y,r:3,p:1});if(stars.length>300)stars.shift();paint()}});
$('meteor').onclick=()=>shoot(25);$('galaxy').onclick=()=>{galaxy=!galaxy;paint()};$('reload').onclick=()=>load(true);$('more').onclick=()=>load();
$('send').onclick=async()=>{const content=$('wish').value.trim(),nickname=$('nickname').value.trim();if(content.length<2)return status('请至少输入两个字');$('send').disabled=true;try{const j=await call('wish','POST',{content,nickname});wishes.unshift(j.item);remember();renderList();$('wish').value='';shoot(18);status('许愿成功！已保存到共享数据库')}catch(e){status(e.message)}finally{$('send').disabled=!config.wishEnabled}};
$('star-like').onclick=async()=>{if(!selected)return;const target=selected;$('star-like').disabled=true;try{const j=await call('like','POST',{wishId:target.id});target.likes=j.likes;remember();if(selected?.id===target.id)$('star-time').textContent=new Date(target.created_at).toLocaleString()+' · ❤️ '+j.likes}catch(e){status(e.message)}finally{$('star-like').disabled=!config.likeEnabled}};
$('comment-send').onclick=async()=>{if(!selected)return;const target=selected,content=$('comment-text').value.trim();if(content.length<2)return status('留言请至少输入两个字');$('comment-send').disabled=true;try{await call('comment','POST',{wishId:target.id,content,nickname:$('nickname').value});if(selected?.id===target.id){$('comment-text').value='';await openStar(target)}status('留言成功')}catch(e){status(e.message)}finally{$('comment-send').disabled=!config.commentEnabled}};
$('save').onclick=()=>{paint();const a=document.createElement('a');a.download='yun-stars.png';a.href=c.toDataURL('image/png');a.click()};
async function configure(){try{const r=await call('config');config=r.settings;$('announcement').hidden=!config.announcement;$('announcement').textContent=config.announcement;$('wish').maxLength=config.wishMax;$('comment-text').maxLength=config.commentMax;for(const [id,key] of [['send','wishEnabled'],['star-like','likeEnabled'],['comment-send','commentEnabled']]){$(id).disabled=!config[key];$(id).title=config[key]?'':'管理员已暂停此功能'}}catch(e){status('设置加载失败：'+e.message)}}
configure();load(true);
})();

