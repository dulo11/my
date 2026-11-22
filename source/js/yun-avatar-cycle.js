/* 雲博客作者头像：四款粉紫动态 GIF，每次完整刷新切换一款。
 * PJAX 页面切换时不重新抽签；只修改作者卡片，不动正文/其他头像。
 */
(()=>{
"use strict";
if(window.__yunAvatarCycleActive){window.__yunAvatarApply?.();return;}
window.__yunAvatarCycleActive=true;
const images=[
 "/img/avatar/star.gif",
 "/img/avatar/sakura.gif",
 "/img/avatar/moon.gif",
 "/img/avatar/heart.gif"
];
let index=Math.floor(Math.random()*images.length);
try{
 const old=sessionStorage.getItem("yun-avatar-last-v1");
 const previous=old===null?-1:Number(old);
 if(Number.isInteger(previous)&&previous>=0&&previous<images.length)index=(previous+1)%images.length;
 sessionStorage.setItem("yun-avatar-last-v1",String(index));
}catch{}
const selected=images[index];
function apply(){
 const selectors=[
  "#aside-content .card-widget.card-info .avatar-img img",
  "#aside-content .card-info .avatar-img img",
  "#aside-content .card-info img.avatar-img",
  "#aside-content .card-widget.card-info img.avatar-img",
  "#aside-content .card-info .avatar img",
  "#aside-content .card-info .avatar-img"
 ];
 const nodes=document.querySelectorAll(selectors.join(","));
 for(const node of nodes){
  if(node.getAttribute("src")!==selected)node.setAttribute("src",selected);
  node.alt="雲 · 动态头像";
  node.decoding="async";
 }
}
window.__yunAvatarApply=apply;
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",apply,{once:true});
else apply();
document.addEventListener("pjax:complete",apply);
document.addEventListener("pjax:success",apply);
})();
