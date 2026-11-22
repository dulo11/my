/* 统一后台：爱好板评论审核，复用星空管理员登录会话 */
(() => {
"use strict";
const $=id=>document.getElementById(id);
const state={authorized:false,filter:"pending",page:1,loading:false};
const el=(tag,value,cls)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;};
const say=value=>{$("hobby-comment-message").textContent=value;};
async function api(action,data){
 const url=new URL("/api/hobby-social",location.origin);
 url.searchParams.set("action",action);
 if(data===undefined){url.searchParams.set("status",state.filter);url.searchParams.set("page",String(state.page));}
 const r=await fetch(url,{method:data===undefined?"GET":"POST",credentials:"same-origin",cache:"no-store",headers:data===undefined?{}:{"content-type":"application/json"},body:data===undefined?undefined:JSON.stringify(data)});
 let j;try{j=await r.json();}catch{throw Error("评论接口未返回 JSON，HTTP "+r.status);}
 if(!r.ok)throw Error(j.error||"操作失败（HTTP "+r.status+"）");
 return j;
}
async function update(item,status){
 try{await api("admin-comment-update",{id:item.id,status});say("评论状态已更新");await load();}
 catch(e){say(e.message);}
}
async function del(item){
 if(!confirm("永久删除这条评论？无法恢复。"))return;
 try{await api("admin-comment-delete",{id:item.id});say("已删除评论");await load();}
 catch(e){say(e.message);}
}
function button(parent,value,cb,danger=false){
 const b=el("button",value,danger?"danger":"");b.type="button";b.onclick=cb;parent.append(b);
}
function draw(item){
 const box=el("article");
 const link=el("a","《"+item.postTitle+"》");
 link.href="/hobby/?post="+encodeURIComponent(item.post_id);
 link.target="_blank";link.rel="noopener noreferrer";
 box.append(link,
  el("p","作者："+item.username+" · "+new Date(item.created_at).toLocaleString("zh-CN")+" · "+({pending:"待审核",visible:"公开",hidden:"隐藏"}[item.status]||item.status),"hobby-meta"),
  el("p",item.body,"hobby-body"));
 const actions=el("div",undefined,"hobby-actions");
 if(item.status!=="visible")button(actions,"✅ 审核通过",()=>update(item,"visible"));
 if(item.status!=="hidden")button(actions,"隐藏",()=>update(item,"hidden"));
 if(item.status!=="pending")button(actions,"退回待审核",()=>update(item,"pending"));
 button(actions,"永久删除",()=>del(item),true);
 box.append(actions);
 return box;
}
async function load(){
 if(!state.authorized||state.loading)return;
 state.loading=true;say("正在加载评论…");
 try{
  const result=await api("admin-comments");
  const area=$("hobby-comment-items");area.replaceChildren(...result.items.map(draw));
  if(!result.items.length)area.append(el("p","这个状态下暂无评论。"));
  const counts=Object.fromEntries(result.counts.map(x=>[x.status,x.total]));
  $("hobby-comment-counts").textContent="待审核 "+(counts.pending||0)+" 条 · 已公开 "+(counts.visible||0)+" 条 · 已隐藏 "+(counts.hidden||0)+" 条";
  $("hobby-comment-page").textContent="第 "+state.page+" 页";
  $("hobby-comment-prev").disabled=state.page<=1;$("hobby-comment-next").disabled=!result.hasMore;
  say("评论列表已更新");
 }catch(e){say(e.message);}
 finally{state.loading=false;}
}
window.addEventListener("yun-admin-auth",event=>{
 state.authorized=!!event.detail?.authenticated;
 if(state.authorized)load();
 else $("hobby-comment-items").replaceChildren();
});
$("hobby-comment-filter").addEventListener("change",()=>{state.filter=$("hobby-comment-filter").value;state.page=1;load();});
$("hobby-comment-refresh").addEventListener("click",load);
$("hobby-comment-prev").addEventListener("click",()=>{if(state.page>1){state.page--;load();}});
$("hobby-comment-next").addEventListener("click",()=>{if(!$("hobby-comment-next").disabled){state.page++;load();}});
})();