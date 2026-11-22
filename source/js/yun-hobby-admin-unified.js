/* Unified site admin: hobby moderation panel inside /stars/admin/ */
(() => {
"use strict";
const $=id=>document.getElementById(id);
let authorized=false,filter="pending",page=1,loading=false,activated=false;
const types={person:"🫶 喜欢的人",object:"🎁 喜欢的物",quote:"📖 喜爱的句子",memory:"🌿 故事回忆",other:"🌈 其他"};
const states={pending:"待审核",visible:"公开",hidden:"隐藏"};
function say(message){$("hobby-message").textContent=message;}
const element=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
async function api(action,data,id){
 const url="/api/hobby?action="+encodeURIComponent(action)+(data===undefined?"&status="+encodeURIComponent(filter)+"&page="+page:"")+(id?"&id="+encodeURIComponent(id):"");
 let response;
 try{response=await fetch(url,{method:data===undefined?"GET":"POST",body:data===undefined?undefined:JSON.stringify(data),headers:data===undefined?{}:{"content-type":"application/json"},cache:"no-store",credentials:"same-origin"});}
 catch{throw Error("无法连接爱好板接口");}
 let result;try{result=await response.json();}catch{throw Error("爱好板接口未返回 JSON (HTTP "+response.status+")");}
 if(!response.ok)throw Error(result.error||"操作失败 (HTTP "+response.status+")");
 return result;
}
async function update(item,status,pinned) {
 try{await api("admin-update",{id:item.id,status,pinned});say("操作已完成");await load();}
 catch(err){say(err.message);}
}
async function remove(item) {
 if(!confirm("永久删除《"+item.title+"》及其配图和互动记录？此操作无法撤销。"))return;
 try{await api("admin-delete",{id:item.id});say("已删除");await load();}
 catch(err){say(err.message);}
}
function button(parent,text,fn,cls=""){
 const b=element("button",text,cls);b.type="button";b.addEventListener("click",fn);parent.append(b);
}
function draw(item) {
 const card=element("article"),meta=element("div",(types[item.category]||"其他")+" · "+(states[item.status]||item.status)+" · "+new Date(item.created_at).toLocaleString("zh-CN"),"hobby-meta");
 card.append(meta,element("h3",item.title),element("p",item.body,"hobby-body"),element("p","作者："+item.nickname+" · 点赞："+item.likes+" · 举报："+item.reports,"hobby-meta"));
 if(item.hasImage){const img=element("img",undefined,"hobby-image");img.src="/api/hobby-image?id="+encodeURIComponent(item.id);img.alt="用户投稿图片";img.loading="lazy";card.append(img);}
 const actions=element("div",undefined,"hobby-actions");
 if(item.status!=="visible")button(actions,"✅ 通过并公开",()=>update(item,"visible",Boolean(item.pinned)));
 if(item.status!=="hidden")button(actions,"隐藏",()=>update(item,"hidden",Boolean(item.pinned)));
 if(item.status!=="pending")button(actions,"设为待审核",()=>update(item,"pending",Boolean(item.pinned)));
 button(actions,item.pinned?"取消置顶":"📌 置顶",()=>update(item,item.status,!item.pinned));
 if(item.reports>0)button(actions,"查看举报",async()=>{
  try{const data=await api("admin-reports",undefined,item.id);window.alert(data.items.length?data.items.map(e=>"• "+e.reason).join("\n"):"暂无举报");}
  catch(err){say(err.message);}
 });
 button(actions,"永久删除",()=>remove(item),"danger");
 card.append(actions);
 return card;
}
async function load(){
 if(!authorized||loading)return;
 loading=true;say("正在加载投稿…");
 try{
  const r=await api("admin-list");
  $("hobby-items").replaceChildren(...r.items.map(draw));
  if(!r.items.length)$("hobby-items").append(element("p","此状态下没有投稿。"));
  const stats=Object.fromEntries(r.counts.map(x=>[x.status,x.total]));
  $("hobby-counts").textContent="待审核 "+(stats.pending||0)+" 条 · 已公开 "+(stats.visible||0)+" 条 · 已隐藏 "+(stats.hidden||0)+" 条";
  $("hobby-page").textContent="第 "+page+" 页";
  $("hobby-prev").disabled=page===1;$("hobby-next").disabled=!r.hasMore;
  say("投稿列表已更新");
 }catch(err){say(err.message);}
 finally{loading=false;}
}
function tab(which){
 if(!authorized)return;
 const hobby=which==="hobby";
 $("stars-panel").hidden=hobby;$("hobby-panel").hidden=!hobby;
 $("tab-stars").setAttribute("aria-pressed",String(!hobby));
 $("tab-hobby").setAttribute("aria-pressed",String(hobby));
 if(hobby&&!activated){activated=true;load();}
}
function current(){return location.hash==="#hobby"?"hobby":"stars";}
$("tab-stars").addEventListener("click",()=>{history.replaceState(null,"","#stars");tab("stars");});
$("tab-hobby").addEventListener("click",()=>{history.replaceState(null,"","#hobby");tab("hobby");if(authorized)load();});
window.addEventListener("hashchange",()=>tab(current()));
window.addEventListener("yun-admin-auth",e=>{
 authorized=Boolean(e.detail?.authenticated);
 if(!authorized){activated=false;$("hobby-panel").hidden=true;$("stars-panel").hidden=false;return;}
 tab(current());
});
$("hobby-filter").addEventListener("change",()=>{filter=$("hobby-filter").value;page=1;load();});
$("hobby-reload").addEventListener("click",load);
$("hobby-prev").addEventListener("click",()=>{if(page>1&&!loading){page--;load();}});
$("hobby-next").addEventListener("click",()=>{if(!$("hobby-next").disabled&&!loading){page++;load();}});
})();
