/* 雲博客：高清粉紫矢量头像
 * 修复旧 104px GIF 放大模糊、两帧折叠跳动以及 WebP 插帧重影。
 * 四个 SVG 不拉伸位图，图形本体固定，只让光点缓慢闪烁。
 * 完整刷新切换下一款；PJAX 导航不切换；不创建任何定时器。
 */
(()=>{
"use strict";
if(window.__yunAvatarCrispActive){window.__yunAvatarApply?.();return;}
window.__yunAvatarCrispActive=true;
const images=[
 "/img/avatar/star-vector.svg",
 "/img/avatar/sakura-vector.svg",
 "/img/avatar/moon-vector.svg",
 "/img/avatar/heart-vector.svg"
];
let index=0;
try{
 const key="yun-avatar-visit-crisp-v1",raw=sessionStorage.getItem(key);
 const prev=raw===null?-1:Number(raw);
 index=(Number.isInteger(prev)&&prev>=0&&prev<images.length)?(prev+1)%images.length:0;
 sessionStorage.setItem(key,String(index));
}catch{}
const imgURL=images[index];
function apply(){
 const list=document.querySelectorAll([
  "#aside-content .card-widget.card-info .avatar-img img",
  "#aside-content .card-info .avatar-img img",
  "#aside-content .card-info img.avatar-img",
  "#aside-content .card-widget.card-info img.avatar-img",
  "#aside-content .card-info .avatar img",
  "#aside-content .card-info .avatar-img"
 ].join(","));
 for(const node of list){
  if(!(node instanceof HTMLImageElement))continue;
  if(node.getAttribute("src")!==imgURL)node.src=imgURL;
  node.alt="雲 · 粉紫梦幻头像";
  node.decoding="async";
  node.style.imageRendering="auto";
  node.style.filter="none";
  node.style.transition="none";
 }
}
window.__yunAvatarApply=apply;
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",apply,{once:true});
else apply();
document.addEventListener("pjax:complete",apply);
document.addEventListener("pjax:success",apply);
})();