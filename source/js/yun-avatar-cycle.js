/* 雲博客作者头像修复版
 * 旧 GIF: 104x104 / 每款仅两帧，每 0.4 秒突然切帧，易锯齿/抖动。
 * 新 WebP: 320x320 / 8 帧过渡，位置归一，减少跳帧感。
 * 四款每隔 4 秒循环；不同款之间以 CSS 透明度淡入淡出。
 * PJAX 切换页面不会重复注册定时器。
 */
(()=>{
"use strict";
if(window.__yunAvatarSmoothActive){window.__yunAvatarApply?.();return;}
window.__yunAvatarSmoothActive=true;

const images=[
 "/img/avatar/star-smooth.webp",
 "/img/avatar/sakura-smooth.webp",
 "/img/avatar/moon-smooth.webp",
 "/img/avatar/heart-smooth.webp"
];
const selectors=[
 "#aside-content .card-widget.card-info .avatar-img img",
 "#aside-content .card-info .avatar-img img",
 "#aside-content .card-info img.avatar-img",
 "#aside-content .card-widget.card-info img.avatar-img",
 "#aside-content .card-info .avatar img",
 "#aside-content .card-info .avatar-img"
];
let index=0;
try{
 const last=sessionStorage.getItem("yun-avatar-last-smooth");
 const n=last===null?-1:Number(last);
 if(Number.isInteger(n)&&n>=0&&n<images.length)index=(n+1)%images.length;
 sessionStorage.setItem("yun-avatar-last-smooth",String(index));
}catch{index=Math.floor(Math.random()*images.length);}
const reducedMotion=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches||false;
function targets(){
 const list=new Set(document.querySelectorAll(selectors.join(",")));
 return Array.from(list).filter(el=>el instanceof HTMLImageElement&&!el.hasAttribute("data-yun-avatar-overlay"));
}
function initial(img){
 if(img.dataset.yunAvatarSrc===images[index])return;
 img.src=images[index];
 img.alt="雲 · 粉紫动态头像";
 img.decoding="async";
 img.dataset.yunAvatarSrc=images[index];
 img.style.imageRendering="auto";
}
function fadeTo(img,next){
 if(!img.isConnected || img.dataset.yunAvatarSrc===next)return;
 if(img.dataset.yunAvatarBusy==="1"){img.dataset.yunAvatarQueued=next;return;}
 img.dataset.yunAvatarBusy="1";
 const preloader=new Image();preloader.src=next;
 const ready=preloader.decode?preloader.decode().catch(()=>{}):Promise.resolve();
 ready.then(()=>{
  if(!img.isConnected)return;
  const parent=img.parentElement;
  if(!parent){img.src=next;return;}
  const imageBox=img.getBoundingClientRect(),parentBox=parent.getBoundingClientRect();
  const css=window.getComputedStyle(img);
  if(window.getComputedStyle(parent).position==="static")parent.style.position="relative";
  const overlay=document.createElement("img");
  overlay.setAttribute("data-yun-avatar-overlay","");
  overlay.src=next;overlay.alt="";overlay.setAttribute("aria-hidden","true");
  Object.assign(overlay.style,{
   position:"absolute",
   left:(imageBox.left-parentBox.left-parent.clientLeft)+"px",
   top:(imageBox.top-parentBox.top-parent.clientTop)+"px",
   width:imageBox.width+"px",height:imageBox.height+"px",
   margin:"0",padding:"0",border:"0",
   borderRadius:css.borderRadius,
   objectFit:css.objectFit||"contain",
   boxShadow:"none",background:"transparent",imageRendering:"auto",
   pointerEvents:"none",zIndex:"2",
   opacity:"0",
   transition:reducedMotion?"none":"opacity 620ms ease-in-out"
  });
  parent.appendChild(overlay);
  const finish=()=>{
   img.src=next;
   img.dataset.yunAvatarSrc=next;
   img.alt="雲 · 粉紫动态头像";
   overlay.remove();
   img.dataset.yunAvatarBusy="";
   const queued=img.dataset.yunAvatarQueued;
   img.dataset.yunAvatarQueued="";
   if(queued&&queued!==next)fadeTo(img,queued);
  };
  if(reducedMotion){finish();return;}
  requestAnimationFrame(()=>requestAnimationFrame(()=>{overlay.style.opacity="1";}));
  window.setTimeout(finish,690);
 }).catch(()=>{
  if(img.isConnected){img.src=next;img.dataset.yunAvatarSrc=next;}
  img.dataset.yunAvatarBusy="";
 });
}
function apply(){
 const desired=images[index];
 for(const img of targets()){
  if(!img.dataset.yunAvatarSrc)initial(img);
  else if(img.dataset.yunAvatarSrc!==desired)fadeTo(img,desired);
 }
}
window.__yunAvatarApply=apply;
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",apply,{once:true});
else apply();
document.addEventListener("pjax:complete",apply);
document.addEventListener("pjax:success",apply);
window.setInterval(()=>{
 index=(index+1)%images.length;
 if(document.visibilityState!=="hidden")apply();
},4000);
document.addEventListener("visibilitychange",()=>{
 if(document.visibilityState==="visible")apply();
});
})();