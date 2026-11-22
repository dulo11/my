/* 爱好板 · 公共浏览/投稿。只使用 textContent 渲染投稿内容以防脚本注入。 */
(() => {
 "use strict";
 const $=id=>document.getElementById(id);
 const API="/api/hobby";
 const categories={person:"🫶 喜欢的人",object:"🎁 喜欢的物",quote:"📖 喜爱的句子",memory:"🌿 故事回忆",other:"🌈 其他珍藏"};
 const state={category:"all",sort:"latest",page:1,loading:false};
 const form=$("hobby-form"),file=$("image-upload"),grid=$("hobby-list");
 const status=(id,message)=>{$(id).textContent=message||"";};
 const el=(tag,className,text)=>{
  const n=document.createElement(tag);
  if(className)n.className=className;
  if(text!==undefined)n.textContent=text;
  return n;
 };
 async function api(action,body,params={}){
  const url=new URL(API,location.origin);
  url.searchParams.set("action",action);
  Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,String(v)));
  let response;
  try {response=await fetch(url,{
   method:body===undefined?"GET":"POST",
   credentials:"same-origin",cache:"no-store",
   headers:body===undefined?{}:{"content-type":"application/json"},
   body:body===undefined?undefined:JSON.stringify(body)
  });}catch {throw Error("服务器暂时无法连接，请检查网络后重试。");}
  let data;try{data=await response.json();}catch{throw Error("服务未返回 JSON，请检查 Pages Functions 部署。");}
  if(!response.ok)throw Error(data.error||"操作失败（HTTP "+response.status+"）");
  return data;
 }
 function dateOf(ms){
  const date=new Date(Number(ms));
  return Number.isNaN(date.getTime())?"":date.toLocaleDateString("zh-CN",{year:"numeric",month:"2-digit",day:"2-digit"});
 }
 function itemCard(item){
  const card=el("article","hobby-card");
  if(item.hasImage){
   const img=el("img","card-photo");
   img.loading="lazy";img.decoding="async";
   img.alt=item.title+" 的分享照片";
   img.referrerPolicy="no-referrer";
   img.src="/api/hobby-image?id="+encodeURIComponent(item.id);
   card.append(img);
  }
  const inner=el("div","card-inner"),top=el("div","card-top");
  top.append(el("span","card-tag",categories[item.category]||"🌈 其他珍藏"));
  if(item.pinned)top.append(el("span","card-pin","✦ 站长精选"));
  inner.append(top,el("h3","",item.title),el("p","card-body",item.body));
  const foot=el("div","card-foot");
  const by=el("span","by","@ "+item.nickname+" · "+dateOf(item.created_at));
  const like=el("button","","♡ "+Number(item.likes||0));
  like.type="button";like.setAttribute("aria-label","喜欢这条分享");
  like.addEventListener("click",async()=>{
   like.disabled=true;
   try{
    const result=await api("like",{id:item.id});
    like.textContent="♥ "+result.likes;like.title="感谢你的喜欢";
   }catch(e){status("list-status",e.message);}
   finally{like.disabled=false;}
  });
  const report=el("button","","举报");report.type="button";
  report.addEventListener("click",async()=>{
   const reason=window.prompt("如有涉及隐私、侵权、攻击或其他不当内容，请填写举报原因（2～90字）。");
   if(reason===null)return;
   const val=reason.trim();
   if(val.length<2||val.length>90){status("list-status","举报原因须为 2～90 字。");return;}
   report.disabled=true;
   try{await api("report",{id:item.id,reason:val});status("list-status","举报已记录，管理员可在后台看到举报数量。");}
   catch(e){status("list-status",e.message);}
   finally{report.disabled=false;}
  });
  foot.append(by,like,report);inner.append(foot);card.append(inner);
  return card;
 }
 async function load(){
  if(state.loading)return;
  state.loading=true;
  status("list-status","正在加载分享…");
  try{
   const data=await api("list",undefined,{category:state.category,sort:state.sort,page:state.page});
   grid.replaceChildren();
   for(const post of data.items)grid.append(itemCard(post));
   if(!data.items.length){
    const empty=el("div","empty");
    empty.append(el("strong","","✦ 这里还没有分享"),el("p","","来写下第一份喜欢吧，等管理员审核后就能被大家看见。"));
    grid.append(empty);
   }
   $("total").textContent=String(data.total||0)+" 则";
   $("page").textContent="第 "+state.page+" 页";
   $("prev").disabled=state.page<=1;
   $("next").disabled=!data.hasMore;
   status("list-status","");
  }catch(e){grid.replaceChildren();status("list-status",e.message);}
  finally{state.loading=false;}
 }
 document.querySelectorAll("[data-category]").forEach(button=>{
  button.addEventListener("click",()=>{
   if(state.category===button.dataset.category)return;
   state.category=button.dataset.category;state.page=1;
   document.querySelectorAll("[data-category]").forEach(b=>{
    b.classList.toggle("active",b===button);b.setAttribute("aria-pressed",String(b===button));
   });
   load();
  });
 });
 $("sort").addEventListener("change",e=>{state.sort=e.target.value;state.page=1;load();});
 $("refresh").addEventListener("click",load);
 $("prev").addEventListener("click",()=>{if(state.page>1){state.page--;load();}});
 $("next").addEventListener("click",()=>{if(!$("next").disabled){state.page++;load();}});
 const textarea=form.elements.namedItem("body");
 textarea.addEventListener("input",()=>{$("char-count").textContent=textarea.value.length+" / 600";});
 let previewURL=null;
 function clearImage(){
  if(previewURL)URL.revokeObjectURL(previewURL);
  previewURL=null;file.value="";$("photo-preview").hidden=true;$("preview-img").removeAttribute("src");
 }
 file.addEventListener("change",()=>{
  if(previewURL)URL.revokeObjectURL(previewURL);
  previewURL=null;
  const uploaded=file.files?.[0];
  if(!uploaded){$("photo-preview").hidden=true;return;}
  if(uploaded.size>8*1024*1024){clearImage();status("form-status","图片不能超过 8MB，请换一张。");return;}
  if(!["image/jpeg","image/png","image/webp","image/heic","image/heif"].includes(uploaded.type)){
   clearImage();status("form-status","只支持 JPG、PNG、WebP、HEIC 图片。");return;
  }
  previewURL=URL.createObjectURL(uploaded);
  $("preview-img").src=previewURL;$("photo-preview").hidden=false;
  status("form-status","");
 });
 $("remove-photo").addEventListener("click",clearImage);

 function loadPicture(inputFile){
  return new Promise((resolve,reject)=>{
   const img=new Image();
   const url=URL.createObjectURL(inputFile);
   img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
   img.onerror=()=>{URL.revokeObjectURL(url);reject(Error("手机无法解码该图片，请转成 JPG/PNG 后重试。"));};
   img.src=url;
  });
 }
 async function compactPhoto(inputFile){
  if(!inputFile)return null;
  if(inputFile.size>8*1024*1024)throw Error("照片超过 8MB。");
  const img=await loadPicture(inputFile);
  let scale=Math.min(1,850/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement("canvas");
  for(let i=0;i<9;i++){
   canvas.width=Math.max(1,Math.floor(img.naturalWidth*scale));
   canvas.height=Math.max(1,Math.floor(img.naturalHeight*scale));
   const ctx=canvas.getContext("2d");
   if(!ctx)throw Error("当前浏览器不支持图片压缩。");
   ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(img,0,0,canvas.width,canvas.height);
   const q=Math.max(.43,.77-i*.045);
   const data=canvas.toDataURL("image/webp",q);
   if(!data.startsWith("data:image/webp;base64,"))throw Error("浏览器不支持 WebP 压缩，请不用图片投稿。");
   const encoded=data.split(",")[1];
   if(encoded.length<132000)return encoded;
   scale*=.74;
  }
  throw Error("图片仍然过大，请换张简单一些的照片。");
 }
 form.addEventListener("submit",async e=>{
  e.preventDefault();if(!form.reportValidity())return;
  const title=form.elements.namedItem("title").value.trim();
  const body=textarea.value.trim();
  const nickname=form.elements.namedItem("nickname").value.trim();
  const category=form.elements.namedItem("category").value;
  if(title.length<2||body.length<2){status("form-status","标题和内容都至少需要 2 字。");return;}
  const submit=$("submit");submit.disabled=true;submit.textContent="正在上传…";
  try{
   const image=await compactPhoto(file.files?.[0]);
   const response=await api("submit",{title,body,nickname,category,image});
   status("form-status",response.message||"投稿成功，等待审核。");
   form.reset();clearImage();$("char-count").textContent="0 / 600";
   document.dispatchEvent(new CustomEvent("yun-hobby-submitted"));
  }catch(err){status("form-status",err.message||"上传失败，请稍后再试。");}
  finally{submit.disabled=false;submit.textContent="✦ 提交分享";}
 });
 load();
})();