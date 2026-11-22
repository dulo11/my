/* 雲博客作者卡片动态头像（四款慢速轮播）
 * 每款停留 4 秒，四款一个完整循环约 16 秒。
 * 每次完整刷新，从上一轮的下一款开始。
 * PJAX 跳转、重复插入脚本不会创建多个定时器。
 */
(()=>{
"use strict";
if(window.__yunAvatarSlowCycleActive){
  window.__yunAvatarApply?.();
  return;
}
window.__yunAvatarSlowCycleActive=true;
const images=[
  "/img/avatar/star.gif",
  "/img/avatar/sakura.gif",
  "/img/avatar/moon.gif",
  "/img/avatar/heart.gif"
];
const intervalMs=4000;
let index=0;
try{
  const old=sessionStorage.getItem("yun-avatar-entry-v2");
  const n=old===null?-1:Number(old);
  if(Number.isInteger(n)&&n>=0&&n<images.length)index=(n+1)%images.length;
  sessionStorage.setItem("yun-avatar-entry-v2",String(index));
}catch{
  index=Math.floor(Math.random()*images.length);
}
function apply(){
  const selected=images[index];
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
    if(!(node instanceof HTMLImageElement))continue;
    if(node.getAttribute("src")!==selected)node.setAttribute("src",selected);
    node.alt="雲 · 粉紫四款慢速动态头像";
    node.decoding="async";
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
},intervalMs);
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible")apply();
});
})();