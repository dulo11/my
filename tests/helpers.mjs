import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {onRequest as admin} from '../functions/api/star-admin.js';
export function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../stars-schema.sql',import.meta.url),'utf8'));
 const db={prepare(query){let args=[];return {bind(...a){args=a;return this},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return {meta:sql.prepare(query).run(...args)}},exec(){const s=sql.prepare(query);return s.columns().length?{results:s.all(...args)}:{results:[],meta:s.run(...args)}}}},async batch(ss){sql.exec('BEGIN');try{const r=ss.map(s=>s.exec());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}},async exec(q){sql.exec(q)}};
 const cache=new Map();let broken=false;
 const env={WISH_DB:db,STAR_CACHE:{async get(k,type){if(broken)throw Error('KV unavailable');const v=cache.get(k);return v&&type==='json'?JSON.parse(v):v??null},async put(k,v,o){if(broken)throw Error('KV unavailable');assert.ok(o.expirationTtl>=60);cache.set(k,v)},async delete(k){cache.delete(k)}}};
 const req=async(handler,action,body,extra={})=>{
  const response=await handler({env,request:new Request('https://test.invalid/api/'+(handler===admin?'star-admin':'stars')+'?'+action,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','cf-connecting-ip':'127.0.0.1',...extra},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})})});
  return {status:response.status,headers:response.headers,data:await response.json()};
 };
 return {sql,db,env,cache,req,breakCache(){broken=true}};
}
