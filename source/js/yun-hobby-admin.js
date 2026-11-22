(() => {
 "use strict";
 const $=id=>document.getElementById(id);
 const state={page:1,filter:"pending"};
 const cats={person:"🫶 喜欢的人",object:"🎁 喜欢的物",quote:"📖 喜爱的句子",memory:"🌿 故事回忆",other:"🌈 其他珍藏"};
 const statuses={pending:"待审核",visible:"已公开",hidden:"隐藏"};
 const txt=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;};
 const msg=text=>$("message").textContent=text;
 async function api(action,body){
  const url="/api/hobby?action="+encodeURIComponent(action)+(body===undefined?"&status="+encodeURIComponent(state.filter)+"&page="+state.page:"");
  let response;
  try{response=await fetch(url,{method:body===undefined?"GET":"POST",cache:"no-store",credentials:"same-origin",headers:body===undefined?{}:{"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});}
  catch{throw Error("暂时无法连接到网站接口");}
  let data;try{data=await response.json();}catch{throw Error("接口返回内容不是 JSON（HTTP "+response.status+"）");}
  if(!response.ok)throw Error(data.error||"操作失败（HTTP "+response.status+"）");
  return data;
 }
 async function check(){
  try{
   const r=await fetch("/api/star-admin?action=me",{credentials:"same-origin",cache:"no-store"});
   const data=await r.json();
   if(data.authenticated){$("need-login").hidden=true;$("admin-content").hidden=false;await load();}
   else{$("need-login").hidden=false;$("admin-content").hidden=true;msg("请先使用星空管理员账号登录。");}
  }catch{msg("无法验证管理员会话，请检查 Cloudflare Pages Functions。");}
 }
 async function modify(item,status,pinned){
  try{
   await api("admin-update",{id:item.id,status,pinned});
   msg("操作成功");await load();
  }catch(e){msg(e.message);}
 }
 async function del(item){
  if(!confirm("永久删除《"+item.title+"》及其图片、点赞、举报记录？此操作不能撤销。"))return;
  try{await api("admin-delete",{id:item.id});msg("已经永久删除");await load();}
  catch(e){msg(e.message);}
 }
 function addButton(row,text,cb,cls){
  const button=txt("button",text,cls);
  button.type="button";
  button.addEventListener("click",cb);row.append(button);
 }
 function show(item){
  const root=txt("article","","admin-card");
  root.append(txt("div",(cats[item.category]||"其他")+" · "+(statuses[item.status]||item.status)+" · "+new Date(item.created_at).toLocaleString("zh-CN"),"meta"));
  root.append(txt("h3",item.title));
  root.append(txt("p",item.body));
  root.append(txt("div","作者："+item.nickname+" / 点赞："+item.likes+" / 举报："+item.reports,"meta"));
  if(item.hasImage){
   const img=document.createElement("img");
   img.src="/api/hobby-image?id="+encodeURIComponent(item.id);
   img.loading="lazy";img.alt="投稿配图";root.append(img);
  }
  const actions=txt("div","","actions");
  if(item.status!=="visible")addButton(actions,"✅ 审核通过 / 公开",()=>modify(item,"visible",item.pinned));
  if(item.status!=="hidden")addButton(actions,"🙈 隐藏",()=>modify(item,"hidden",item.pinned));
  if(item.status!=="pending")addButton(actions,"⏳ 设为待审核",()=>modify(item,"pending",item.pinned));
  addButton(actions,item.pinned?"📌 取消置顶":"📌 置顶",()=>modify(item,item.status,!item.pinned));
  if(item.reports>0)addButton(actions,"⚠ 查看举报",async()=>{
   try{
    const r=await fetch("/api/hobby?action=admin-reports&id="+encodeURIComponent(item.id),{credentials:"same-origin",cache:"no-store"});
    const d=await r.json();
    if(!r.ok)throw Error(d.error||"加载失败");
    alert(d.items.length?d.items.map(x=>"· "+x.reason).join("\n"):"暂无举报详情");
   }catch(e){msg(e.message);}
  });
  addButton(actions,"永久删除",()=>del(item),"delete");
  root.append(actions);return root;
 }
 async function load(){
  msg("正在加载投稿…");
  try{
   const r=await api("admin-list");
   const container=$("admin-items");container.replaceChildren();
   for(const item of r.items)container.append(show(item));
   if(!r.items.length)container.append(txt("p","此状态下暂无投稿。"));
   const count=Object.fromEntries(r.counts.map(x=>[x.status,x.total]));
   $("counts").textContent="待审核 "+(count.pending||0)+" 条 · 已公开 "+(count.visible||0)+" 条 · 已隐藏 "+(count.hidden||0)+" 条";
   $("prev").disabled=state.page<=1;$("next").disabled=!r.hasMore;
   $("page").textContent="第 "+state.page+" 页";msg("已刷新。");
  }catch(e){msg(e.message);if(e.message.includes("未登录")){$("need-login").hidden=false;$("admin-content").hidden=true;}}
 }
 $("filter").addEventListener("change",()=>{state.filter=$("filter").value;state.page=1;load();});
 $("reload").addEventListener("click",load);
 $("prev").addEventListener("click",()=>{if(state.page>1){state.page--;load();}});
 $("next").addEventListener("click",()=>{if(!$("next").disabled){state.page++;load();}});
 check();
})();