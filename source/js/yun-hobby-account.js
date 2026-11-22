/* 爱好板访客注册/登录 - 与管理员身份完全隔离 */
(() => {
"use strict";
const $=id=>document.getElementById(id);
const dialog=$("account-dialog"),form=$("account-form");
let mode="register",currentUser=null,myPage=1;
function status(value){$("account-status").textContent=value||"";}
function myStatus(value){$("my-status").textContent=value||"";}
const text=(tag,value,cls)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;};
async function api(action,data,params=""){
 const url="/api/hobby-account?action="+encodeURIComponent(action)+params;
 let response;
 try{response=await fetch(url,{
   method:data===undefined?"GET":"POST",credentials:"same-origin",cache:"no-store",
   headers:data===undefined?{}:{"content-type":"application/json"},
   body:data===undefined?undefined:JSON.stringify(data)
 });}catch {throw Error("无法连接账号服务，请检查网络。");}
 let result;try{result=await response.json();}catch{throw Error("账号服务没有返回 JSON，请检查部署。");}
 if(!response.ok)throw Error(result.error||"操作失败："+response.status);
 return result;
}
function setMode(next){
 mode=next;status("");
 const registering=mode==="register";
 $("account-title").textContent=registering?"注册爱好板账号":"登录爱好板";
 $("account-submit").textContent=registering?"创建账号":"登录";
 $("account-toggle").textContent=registering?"已有账号？去登录":"还没有账号？去注册";
 $("account-confirm-wrap").hidden=!registering;
 $("account-password").autocomplete=registering?"new-password":"current-password";
 $("account-confirm").value="";
}
function open(next){
 setMode(next);form.reset();
 if(typeof dialog.showModal==="function")dialog.showModal();
 else dialog.setAttribute("open","");
 $("account-username").focus();
}
function close(){
 if(typeof dialog.close==="function")dialog.close();
 else dialog.removeAttribute("open");
}
function setAccount(user){
 currentUser=user;
 const logged=!!user;
 $("account-register-open").hidden=logged;
 $("account-login-open").hidden=logged;
 $("account-info").hidden=!logged;
 $("account-logout").hidden=!logged;
 $("my-favorites-open").hidden=!logged;
 $("my-notifications-open").hidden=!logged;
 $("account-info").textContent=logged?"👤 "+user.name:"";
 $("my-posts").hidden=!logged;
 const nickname=document.querySelector('#hobby-form [name="nickname"]');
 if(nickname){
  nickname.readOnly=logged;
  nickname.value=logged?user.name:"";
  nickname.title=logged?"已登录，昵称由账号决定":"";
 }
 if(logged){myPage=1;loadMine();}
 else {$("my-list").replaceChildren();myStatus("");}
 document.dispatchEvent(new CustomEvent("yun-hobby-auth",{detail:{user:user||null}}));
}
async function check(){
 try{const result=await api("me");setAccount(result.user||null);}
 catch(err){console.warn("Hobby account endpoint unavailable",err.message);}
}
async function loadMine(){
 if(!currentUser)return;
 myStatus("正在加载你的投稿…");
 try{
  const response=await api("mine",undefined,"&page="+myPage);
  const list=$("my-list");list.replaceChildren();
  const statuses={pending:"⏳ 待管理员审核",visible:"✅ 已公开",hidden:"🙈 已隐藏"};
  if(!response.items.length)list.append(text("p","还没有账号投稿。你可以在下方写下第一份分享。"));
  for(const item of response.items){
   const card=text("article",undefined,"my-post");
   card.append(text("div",statuses[item.status]||item.status,"my-status"),text("h3",item.title),text("p",item.body));
   if(item.hasImage){
    const img=document.createElement("img");
    img.src="/api/hobby-image?id="+encodeURIComponent(item.id);
    img.alt=item.title+" 的图片";img.loading="lazy";card.append(img);
   }
   card.append(text("p","♡ "+item.likes+" · "+new Date(item.created_at).toLocaleString("zh-CN")));
   const edit=text("button","✎ 编辑");edit.type="button";
   edit.addEventListener("click",()=>document.dispatchEvent(new CustomEvent("yun-hobby-edit",{detail:item})));
   const del=text("button","删除这篇投稿");del.type="button";
   del.addEventListener("click",async()=>{
    if(!confirm("确定删除这条分享及其图片？删除后不能恢复。"))return;
    del.disabled=true;
    try{await api("delete-mine",{id:item.id});myStatus("投稿已删除");await loadMine();document.getElementById("refresh")?.click();}
    catch(e){myStatus(e.message);}
    finally{del.disabled=false;}
   });
   card.append(edit,del);list.append(card);
  }
  $("my-page").textContent="第 "+myPage+" 页";
  $("my-prev").disabled=myPage<=1;
  $("my-next").disabled=!response.hasMore;
  myStatus("本页显示 "+response.items.length+" 条账号投稿，可编辑或删除。");
 }catch(err){myStatus(err.message);}
}
$("account-register-open").addEventListener("click",()=>open("register"));
$("account-login-open").addEventListener("click",()=>open("login"));
$("account-close").addEventListener("click",close);
$("account-toggle").addEventListener("click",()=>setMode(mode==="register"?"login":"register"));
$("account-logout").addEventListener("click",async()=>{
 $("account-logout").disabled=true;
 try{await api("logout",{});setAccount(null);}
 catch(err){alert(err.message);}
 finally{$("account-logout").disabled=false;}
});
$("my-reload").addEventListener("click",loadMine);
$("my-prev").addEventListener("click",()=>{if(myPage>1){myPage--;loadMine();}});
$("my-next").addEventListener("click",()=>{if(!$("my-next").disabled){myPage++;loadMine();}});
form.addEventListener("submit",async e=>{
 e.preventDefault();
 const username=$("account-username").value.trim(),password=$("account-password").value;
 if(username.length<2||username.length>24){status("用户名长度为 2～24 字");return;}
 if(password.length<8||password.length>128){status("密码长度须为 8～128 位");return;}
 if(mode==="register"&&password!==$("account-confirm").value){status("两次密码不一致");return;}
 const submit=$("account-submit");submit.disabled=true;status("正在处理…");
 try{
  const response=await api(mode,{username,password});
  setAccount(response.user);
  close();
  form.reset();
 }catch(err){status(err.message);}
 finally{submit.disabled=false;}
});
document.addEventListener("yun-hobby-submitted",()=>{
 if(currentUser){
  const nickname=document.querySelector('#hobby-form [name="nickname"]');
  if(nickname)nickname.value=currentUser.name;
  loadMine();
 }
});
check();
})();