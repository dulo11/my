/* 按需读取经审核的 WebP 小图片；待审核图片仅管理员可见 */
import {sessionValid} from "./star-admin.js";
const uuid=s=>typeof s==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
const fail=(n)=>new Response(n,{status:n==="未找到"?404:503,headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store"}});
export async function onRequestGet({request,env}){
 try{
  if(!env.WISH_DB)return fail("服务未配置");
  const id=new URL(request.url).searchParams.get("id");
  if(!uuid(id))return fail("未找到");
  const row=await env.WISH_DB.prepare("SELECT image_webp,status FROM hobby_posts WHERE id=?").bind(id).first();
  if(!row?.image_webp)return fail("未找到");
  if(row.status!=="visible" && !await sessionValid(request,env.WISH_DB))return fail("未找到");
  const binary=atob(row.image_webp);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Response(bytes,{status:200,headers:{
   "content-type":"image/webp","cache-control":"private, no-store",
   "x-content-type-options":"nosniff","content-security-policy":"default-src 'none'; sandbox",
   "referrer-policy":"no-referrer"
  }});
 }catch(e){console.error("[hobby-image]",e?.name||"unknown");return fail("服务未配置");}
}
