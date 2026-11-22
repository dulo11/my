/* 爱好板社区：分享链接、收藏、评论回复、个人主页、通知、分享卡片。
 * 所有用户内容只使用 textContent；不将正文注入 innerHTML。
 */
(() => {
"use strict";
const $=id=>document.getElementById(id);
const postDialog=$("post-dialog"),communityDialog=$("community-dialog");
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
let user=null,post=null,replyTo=null,communityKind="favorites",communityPage=1,profileId="";
let dialogSerial=0;
const make=(tag,value,cls)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;};
const status=(id,message)=>{$(id).textContent=message||"";};
async function api(action,data,params={}){
 const url=new URL("/api/hobby-social",location.origin);url.searchParams.set("action",action);
 for(const [name,value] of Object.entries(params))url.searchParams.set(name,String(value));
 let r;try{r=await fetch(url,{method:data===undefined?"GET":"POST",headers:data===undefined?{}:{"content-type":"application/json"},body:data===undefined?undefined:JSON.stringify(data),credentials:"same-origin",cache:"no-store"});}catch{throw Error("网络连接失败，请稍后重试");}
 let j;try{j=await r.json();}catch{throw Error("接口返回异常（HTTP "+r.status+"）");}
 if(!r.ok)throw Error(j.error||"请求失败（HTTP "+r.status+"）");
 return j;
}
function loginNeeded(){if(user)return false;status("post-dialog-status","收藏和评论需要登录爱好板账号。");$("account-login-open").click();return true;}
function date(value){const d=new Date(Number(value));return Number.isNaN(d.getTime())?"":d.toLocaleString("zh-CN",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});}
function postUrl(id){const url=new URL("/hobby/",location.origin);url.searchParams.set("post",id);return url.href;}
function profileUrl(id){const url=new URL("/hobby/",location.origin);url.searchParams.set("user",id);return url.href;}
function navigate(key,id){
 const url=new URL(location.href);
 url.searchParams.delete("post");url.searchParams.delete("user");
 if(key&&id)url.searchParams.set(key,id);
 history.pushState(null,"",url);
}
function clearParam(key){
 const url=new URL(location.href);
 if(url.searchParams.has(key)){url.searchParams.delete(key);history.replaceState(null,"",url);}
}
function show(d){if(!d.open){if(typeof d.showModal==="function")d.showModal();else d.setAttribute("open","");}}
function hide(d){if(d.open){if(typeof d.close==="function")d.close();else d.removeAttribute("open");}}
function button(textValue,fn,cls){const b=make("button",textValue,cls);b.type="button";b.addEventListener("click",fn);return b;}
function tip(message){status("post-dialog-status",message);}
function renderPost(){
 const box=$("post-detail-content");box.replaceChildren();
 if(!post)return;
 box.append(make("h3",post.title),make("p",post.body,"post-body"));
 const meta=make("div",undefined,"post-meta");
 meta.append(make("span","✦ "+({person:"人物",object:"物品",quote:"句子",memory:"回忆",other:"其他"}[post.category]||"珍藏")));
 if(post.ownerId){
  meta.append(button("👤 "+post.nickname,()=>openCommunity("profile",post.ownerId,true)));
 }else meta.append(make("span","@ "+post.nickname));
 meta.append(make("span",date(post.created_at)+" · ♡ "+post.likes+" · 💬 "+post.comments));
 if(post.status!=="visible")meta.append(make("span","⏳ 待审核"));
 box.append(meta);
 if(post.hasImage){const img=make("img",undefined,"post-image");img.loading="lazy";img.alt=post.title+" 的照片";img.src="/api/hobby-image?id="+encodeURIComponent(post.id);box.append(img);}
 $("post-favorite").textContent=(post.saved?"★ 已收藏":"☆ 收藏")+" · "+post.favorites;
 $("post-favorite").disabled=post.status!=="visible";
 $("post-comment-send").disabled=post.status!=="visible";
}
async function renderComments(serial){
 const list=$("post-comments");list.replaceChildren();
 if(!post||post.status!=="visible")return;
 try{
  const r=await api("comments",undefined,{id:post.id});
  if(serial!==dialogSerial)return;
  if(!r.items.length)list.append(make("p","还没有公开评论，来留下第一条吧。"));
  const byId=new Map(r.items.map(item=>[item.id,item]));
  for(const item of r.items){
   const card=make("div",undefined,"community-comment");
   const name=make("span","@ "+item.username,"author");
   name.addEventListener("click",()=>openCommunity("profile",item.user_id,true));
   card.append(name);
   if(item.parent_id&&byId.has(item.parent_id))card.append(make("p","回复 @"+byId.get(item.parent_id).username,"reply-context"));
   card.append(make("p",item.body,"comment-text"),make("span",date(item.created_at),"comment-meta"));
   const rep=button("↩ 回复",()=>{
    if(loginNeeded())return;
    replyTo=item.id;$("post-reply-label").hidden=false;$("post-reply-label").textContent="正在回复 @"+item.username;
    $("post-reply-cancel").hidden=false;$("post-comment-text").focus();
   },"reply-btn");
   card.append(rep);
   if(user?.id===item.user_id)card.append(button("删除",async()=>{
    if(!confirm("删除自己这条评论？"))return;
    try{await api("delete-comment",{id:item.id});await renderComments(dialogSerial);}catch(e){status("post-comment-status",e.message);}
   },"reply-btn"));
   list.append(card);
  }
 }catch(e){status("post-comment-status",e.message);}
}
async function openPost(id,changeURL=true){
 if(!UUID.test(id))return;
 const serial=++dialogSerial;
 hide(communityDialog);
 post=null;replyTo=null;$("post-comment-text").value="";$("post-reply-label").hidden=true;$("post-reply-cancel").hidden=true;
 $("post-detail-content").replaceChildren();$("post-comments").replaceChildren();
 status("post-dialog-status","正在加载分享…");status("post-comment-status","");
 show(postDialog);if(changeURL)navigate("post",id);
 try{
  const response=await api("post",undefined,{id});
  if(serial!==dialogSerial)return;
  post=response.post;renderPost();status("post-dialog-status","");
  renderComments(serial);
 }catch(e){if(serial===dialogSerial)status("post-dialog-status",e.message);}
}
async function openCommunity(kind,id="",changeURL=true){
 ++dialogSerial;
 hide(postDialog);
 communityKind=kind;communityPage=1;profileId=id;
 $("community-items").replaceChildren();
 show(communityDialog);
 if(changeURL)kind==="profile"?navigate("user",id):navigate(null,null);
 await loadCommunity();
}
async function loadCommunity(){
 const list=$("community-items");list.replaceChildren();status("community-status","正在加载…");
 const page=communityPage;
 const kinds={favorites:"☆ 我的收藏夹",profile:"👤 用户主页",notifications:"🔔 我的消息"};
 $("community-title").textContent=kinds[communityKind]||"社区";
 $("community-pagination").hidden=communityKind==="notifications";
 try{
  let result;
  if(communityKind==="favorites"){if(!user)throw Error("请先登录");result=await api("favorites",undefined,{page});}
  else if(communityKind==="profile"){result=await api("profile",undefined,{user:profileId,page});$("community-title").textContent="👤 "+result.account.display_name+" 的分享（"+result.total+"）";}
  else if(communityKind==="notifications"){if(!user)throw Error("请先登录");result=await api("notifications");}
  else return;
  const entries=communityKind==="notifications"?result.items:result.items;
  if(!entries.length)list.append(make("p",communityKind==="notifications"?"还没有新消息":"这里暂时没有内容。"));
  for(const entry of entries){
   const item=make("article",undefined,"community-list-item");
   if(communityKind==="notifications"){
    item.append(make("strong",entry.message,entry.read?"":"new-message"),make("small",date(entry.created_at)));
    if(entry.post_id)item.append(button("查看相关分享",()=>openPost(entry.post_id,true)));
   }else{
    item.append(make("strong",entry.title),make("p",entry.body),make("small",date(entry.created_at)+" · ♡ "+entry.likes));
    item.append(button("打开分享",()=>openPost(entry.id,true)));
   }
   list.append(item);
  }
  if(communityKind==="notifications"){
   if(result.unread>0)await api("read-notifications",{});
   $("unread-count").hidden=true;$("unread-count").textContent="";
   status("community-status","共 "+entries.length+" 条近期消息，最新 30 条。");
  }else{
   $("community-page").textContent="第 "+page+" 页";
   $("community-prev").disabled=page<=1;$("community-next").disabled=!result.hasMore;
   status("community-status","");
  }
 }catch(e){status("community-status",e.message);}
}
async function refreshUnread(){
 if(!user)return;
 try{
  const result=await api("notifications");
  $("unread-count").textContent=result.unread>99?"99+":String(result.unread);
  $("unread-count").hidden=!result.unread;
 }catch{ /* don't block other site features */ }
}
async function sharePost(){
 if(!post)return;
 const url=postUrl(post.id);
 try{
  if(navigator.share){await navigator.share({title:post.title,text:"看看我收藏的这份喜欢",url});tip("分享链接已发送给系统分享菜单");return;}
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);tip("已复制专属分享链接");return;}
 }catch(e){if(e.name==="AbortError")return;}
 window.prompt("复制这条专属分享链接",url);
}
function renderCard(){
 if(!post)return;
 const canvas=document.createElement("canvas");canvas.width=900;canvas.height=1200;
 const ctx=canvas.getContext("2d");if(!ctx)throw Error("浏览器不支持图片生成");
 const gradient=ctx.createLinearGradient(0,0,900,1200);
 gradient.addColorStop(0,"#b77dc7");gradient.addColorStop(.47,"#554d9d");gradient.addColorStop(1,"#193e67");
 ctx.fillStyle=gradient;ctx.fillRect(0,0,900,1200);
 for(let i=0;i<70;i++){
  const x=((i*419+77)%903),y=((i*241+97)%1210);
  ctx.fillStyle="rgba(255,255,255,"+(0.16+(i%5)*.08)+")";
  ctx.beginPath();ctx.arc(x,y,1.4+(i%4),0,Math.PI*2);ctx.fill();
 }
 ctx.fillStyle="#fff8e8";ctx.font="bold 30px system-ui";ctx.fillText("✦ 雲 · 爱好板",75,110);
 ctx.fillStyle="#ffdfec";ctx.font="bold 61px system-ui";
 function lines(value,x,y,maxWidth,lineHeight,limit){
  const arr=Array.from(value||"");let line="",drawn=0;
  for(let i=0;i<arr.length;i++){
   if(ctx.measureText(line+arr[i]).width>maxWidth&&line){
    ctx.fillText(line,x,y+drawn*lineHeight);drawn++;line="";
    if(drawn>=limit)return;
   }
   line+=arr[i];
  }
  if(line&&drawn<limit)ctx.fillText(line,x,y+drawn*lineHeight);
 }
 lines(post.title,75,290,750,81,3);
 ctx.fillStyle="#ffffff";ctx.font="34px system-ui";
 lines(post.body,75,620,750,60,6);
 ctx.font="26px system-ui";ctx.fillStyle="#e8d7ff";
 ctx.fillText("@ "+post.nickname.slice(0,30),75,1050);
 ctx.fillText(location.host+" /hobby/",75,1100);
 canvas.toBlob(blob=>{
  if(!blob){tip("生成图片失败");return;}
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="雲-爱好分享-"+post.id.slice(0,8)+".png";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1200);tip("分享卡片已生成");
 },"image/png");
}
document.addEventListener("yun-hobby-open-post",e=>openPost(e.detail?.id));
document.addEventListener("yun-hobby-open-profile",e=>openCommunity("profile",e.detail?.id));
document.addEventListener("yun-hobby-auth",e=>{user=e.detail?.user||null;refreshUnread();});
$("post-dialog-close").addEventListener("click",()=>hide(postDialog));
$("community-close").addEventListener("click",()=>hide(communityDialog));
postDialog.addEventListener("close",()=>clearParam("post"));
communityDialog.addEventListener("close",()=>clearParam("user"));
$("post-favorite").addEventListener("click",async()=>{
 if(!post||loginNeeded())return;
 const b=$("post-favorite");b.disabled=true;
 try{const response=await api("favorite",{id:post.id});post.saved=response.saved;post.favorites=response.count;renderPost();}
 catch(e){tip(e.message);}
 finally{b.disabled=false;}
});
$("post-share").addEventListener("click",sharePost);
$("post-card").addEventListener("click",()=>{try{renderCard();}catch(e){tip(e.message);}});
$("post-reply-cancel").addEventListener("click",()=>{
 replyTo=null;$("post-reply-label").hidden=true;$("post-reply-cancel").hidden=true;
});
$("post-comment-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!post||loginNeeded())return;
 const body=$("post-comment-text").value.trim();
 if(body.length<2||body.length>300){status("post-comment-status","评论需 2～300 字");return;}
 const b=$("post-comment-send");b.disabled=true;
 try{
  const result=await api("comment",{id:post.id,body,parentId:replyTo});
  status("post-comment-status",result.message||"已送审");
  $("post-comment-text").value="";replyTo=null;$("post-reply-label").hidden=true;$("post-reply-cancel").hidden=true;
 }catch(err){status("post-comment-status",err.message);}
 finally{b.disabled=false;}
});
$("my-favorites-open").addEventListener("click",()=>openCommunity("favorites"));
$("my-notifications-open").addEventListener("click",()=>openCommunity("notifications"));
$("community-prev").addEventListener("click",()=>{if(communityPage>1){communityPage--;loadCommunity();}});
$("community-next").addEventListener("click",()=>{if(!$("community-next").disabled){communityPage++;loadCommunity();}});
window.addEventListener("popstate",()=>{
 const url=new URL(location.href),id=url.searchParams.get("post"),uid=url.searchParams.get("user");
 if(id&&UUID.test(id))openPost(id,false);
 else if(uid&&UUID.test(uid))openCommunity("profile",uid,false);
 else{hide(postDialog);hide(communityDialog);}
});
(async()=>{
 try{
  const r=await fetch("/api/hobby-account?action=me",{credentials:"same-origin",cache:"no-store"});
  if(r.ok){const j=await r.json();user=j.user||null;refreshUnread();}
 }catch{}
 const params=new URL(location.href).searchParams;
 const id=params.get("post"),uid=params.get("user");
 if(id&&UUID.test(id))openPost(id,false);
 else if(uid&&UUID.test(uid))openCommunity("profile",uid,false);
})();
})();