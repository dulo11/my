import {json,HttpError,validId,bumpRevision,revision} from './stars.js';
import {defaults,getSettings} from './schema.js';
const tableFor=kind=>{if(!['wish','comment'].includes(kind))throw new HttpError(400,'内容类型无效');return kind==='wish'?'star_wishes':'star_comments'};
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
export function validateSettings(raw){
 if(!raw||typeof raw!=='object')throw new HttpError(400,'设置格式无效');const s={...defaults};
 for(const k of ['wishEnabled','commentEnabled','likeEnabled']){if(typeof raw[k]!=='boolean')throw new HttpError(400,'开关设置无效');s[k]=raw[k]}
 for(const [k,min,max] of [['wishMax',2,1000],['commentMax',2,2000],['wishInterval',1,86400],['commentInterval',1,86400],['likeInterval',1,86400]]){if(!integer(raw[k],min,max))throw new HttpError(400,k+' 数值超出范围');s[k]=raw[k]}
 if(typeof raw.announcement!=='string'||raw.announcement.length>1000)throw new HttpError(400,'公告最多1000字');s.announcement=raw.announcement;return s;
}
const fieldsFor=kind=>kind==='wish'?['id','nickname','content','x','y','created_at','status','likes']:['id','wish_id','nickname','content','created_at','status'];
function validateRow(kind,row){
 if(!row||!validId(row.id)||typeof row.nickname!=='string'||row.nickname.length>24||typeof row.content!=='string'||row.content.length>(kind==='wish'?1000:2000)||!integer(row.created_at,0,8640000000000000)||!['visible','hidden','deleted'].includes(row.status))throw new HttpError(400,'备份内容格式无效');
 if(kind==='wish'&&(!Number.isFinite(row.x)||row.x<0||row.x>1||!Number.isFinite(row.y)||row.y<0||row.y>1||!integer(row.likes,0,Number.MAX_SAFE_INTEGER)))throw new HttpError(400,'愿望坐标或点赞数无效');
 if(kind==='comment'&&!validId(row.wish_id))throw new HttpError(400,'留言所属愿望无效');
 const meta=row.meta||{};
 if(meta.pinned!==undefined&&![0,1].includes(meta.pinned))throw new HttpError(400,'置顶标记无效');
 if(meta.admin_reply!==undefined&&(typeof meta.admin_reply!=='string'||meta.admin_reply.length>2000))throw new HttpError(400,'回复格式无效');
 if(meta.previous_status!==undefined&&!['visible','hidden'].includes(meta.previous_status))throw new HttpError(400,'回收站状态无效');
 return {...row,meta:{pinned:meta.pinned||0,admin_reply:meta.admin_reply||'',previous_status:meta.previous_status||'visible',deleted_at:row.status==='deleted'?(integer(meta.deleted_at,0,8640000000000000)?meta.deleted_at:Date.now()):null}};
}
export async function manage(db,action,b){
 if(action==='stats'){
  const start=Math.floor((Date.now()+28800000)/86400000)*86400000-28800000;
  const counts=await db.prepare("SELECT 'wish' AS kind,status,COUNT(*) AS total,SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) AS today FROM star_wishes GROUP BY status UNION ALL SELECT 'comment',status,COUNT(*),SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) FROM star_comments GROUP BY status").bind(start,start).all();return json({counts:counts.results||[]});
 }
 if(action==='settings')return json({settings:await getSettings(db)});
 if(action==='validate-settings')return json({settings:validateSettings(b.settings)});
 if(action==='save-settings'){
  const settings=validateSettings(b.settings);await db.batch([db.prepare("INSERT INTO star_settings(key,value) VALUES('site_settings',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(settings)),bumpRevision(db)]);return json({ok:true,settings});
 }
 if(action==='list'){
  const kind=b.kind||'wish',table=tableFor(kind),page=Math.max(1,Math.min(100000,Math.floor(Number(b.page)||1))),size=50,clauses=[],args=[];
  if(['visible','hidden','deleted'].includes(b.status)){clauses.push('c.status=?');args.push(b.status)}else clauses.push("c.status!='deleted'");
  if(b.q){clauses.push('(instr(lower(c.nickname),lower(?))>0 OR instr(lower(c.content),lower(?))>0)');const q=String(b.q).slice(0,200);args.push(q,q)}
  for(const [key,op,offset] of [['from','>=',0],['to','<',86400000]])if(b[key]){const time=Date.parse(b[key]+'T00:00:00+08:00');if(!/^\d{4}-\d{2}-\d{2}$/.test(b[key])||!Number.isFinite(time))throw new HttpError(400,'日期格式无效');clauses.push('c.created_at'+op+'?');args.push(time+offset)}
  const rows=await db.prepare('SELECT c.*,COALESCE(m.pinned,0) AS pinned,COALESCE(m.admin_reply,\'\') AS admin_reply FROM '+table+' c LEFT JOIN star_content_meta m ON m.kind=? AND m.id=c.id WHERE '+clauses.join(' AND ')+' ORDER BY c.created_at DESC,c.id DESC LIMIT ? OFFSET ?').bind(kind,...args,size+1,(page-1)*size).all();return json({items:(rows.results||[]).slice(0,size),hasMore:(rows.results||[]).length>size,page,kind});
 }
 if(action==='moderate'||action==='batch'){
  const kind=b.kind||'wish',table=tableFor(kind),ids=action==='moderate'?[b.id]:b.ids;
  if(!Array.isArray(ids)||!ids.length||ids.length>8||ids.some(id=>!validId(id))||new Set(ids).size!==ids.length)throw new HttpError(400,'每批选择1～8条有效内容');
  const operation=action==='moderate'?b.status:b.operation;if(!['visible','hidden','trash','restore','purge'].includes(operation))throw new HttpError(400,'操作无效');
  if(operation==='purge'&&b.confirm!=='永久删除')throw new HttpError(400,'请确认永久删除');
  const rows=(await db.prepare('SELECT id,status FROM '+table+' WHERE id IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).all()).results||[];
  if(rows.length!==ids.length)throw new HttpError(404,'部分内容不存在，请刷新');const statements=[];
  for(const row of rows){
   if(operation==='trash'){
    if(row.status==='deleted')continue;
    statements.push(db.prepare("INSERT INTO star_content_meta(kind,id,previous_status,deleted_at) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET previous_status=excluded.previous_status,deleted_at=excluded.deleted_at").bind(kind,row.id,row.status,Date.now()),db.prepare("UPDATE "+table+" SET status='deleted' WHERE id=?").bind(row.id));
   }else if(operation==='restore'){
    if(row.status!=='deleted')throw new HttpError(400,'只能恢复回收站中的内容');
    statements.push(db.prepare("UPDATE "+table+" SET status=COALESCE((SELECT previous_status FROM star_content_meta WHERE kind=? AND id=?),'visible') WHERE id=?").bind(kind,row.id,row.id),db.prepare('UPDATE star_content_meta SET deleted_at=NULL WHERE kind=? AND id=?').bind(kind,row.id));
   }else if(operation==='purge'){
    if(row.status!=='deleted')throw new HttpError(400,'只能永久删除回收站中的内容');
    if(kind==='wish')statements.push(db.prepare("DELETE FROM star_content_meta WHERE kind='comment' AND id IN (SELECT id FROM star_comments WHERE wish_id=?)").bind(row.id),db.prepare('DELETE FROM star_comments WHERE wish_id=?').bind(row.id));
    statements.push(db.prepare('DELETE FROM '+table+' WHERE id=?').bind(row.id),db.prepare('DELETE FROM star_content_meta WHERE kind=? AND id=?').bind(kind,row.id));
   }else{if(row.status==='deleted')throw new HttpError(400,'请先从回收站恢复');statements.push(db.prepare('UPDATE '+table+' SET status=? WHERE id=?').bind(operation,row.id))}
  }
  await db.batch([...statements,bumpRevision(db)]);return json({ok:true,count:ids.length});
 }
 if(action==='annotate'){
  const kind=b.kind||'wish',table=tableFor(kind);
  if(!validId(b.id)||typeof b.reply!=='string'||b.reply.length>2000||typeof b.pinned!=='boolean')throw new HttpError(400,'回复最多2000字');
  if(!(await db.prepare('SELECT id FROM '+table+' WHERE id=?').bind(b.id).first()))throw new HttpError(404,'内容不存在');
  await db.batch([db.prepare('INSERT INTO star_content_meta(kind,id,pinned,admin_reply) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET pinned=excluded.pinned,admin_reply=excluded.admin_reply').bind(kind,b.id,b.pinned?1:0,b.reply),bumpRevision(db)]);return json({ok:true});
 }
 if(action==='export'){
  const before=await revision(db);
  const kind=b.kind||'wish',table=tableFor(kind),after=b.after||'';if(after&&!validId(after))throw new HttpError(400,'备份游标无效');
  const items=(await db.prepare('SELECT c.*,m.pinned,m.admin_reply,m.previous_status,m.deleted_at FROM '+table+' c LEFT JOIN star_content_meta m ON m.kind=? AND m.id=c.id WHERE c.id>? ORDER BY c.id LIMIT 201').bind(kind,after).all()).results||[];
  const settings=after?undefined:await getSettings(db);if(await revision(db)!==before)throw new HttpError(409,'导出期间有更新，请重新导出');
  return json({items:items.slice(0,200).map(row=>{const {pinned,admin_reply,previous_status,deleted_at,...item}=row;return {...item,meta:{pinned:pinned||0,admin_reply:admin_reply||'',previous_status:previous_status||'visible',deleted_at}}}),hasMore:items.length>200,next:items.slice(0,200).at(-1)?.id||'',revision:before,settings});
 }
 if(action==='restore-preview'||action==='restore-import'){
  const kind=b.kind,table=tableFor(kind);if(!Array.isArray(b.items)||b.items.length>10)throw new HttpError(400,'每批最多10条');
  const rows=b.items.map(row=>validateRow(kind,row));if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new HttpError(400,'同一批中有重复ID');
  const existing=rows.length?(await db.prepare('SELECT id FROM '+table+' WHERE id IN ('+rows.map(()=>'?').join(',')+')').bind(...rows.map(r=>r.id)).all()).results:[];
  const seen=new Set(existing.map(r=>r.id)),fresh=rows.filter(r=>!seen.has(r.id));if(action==='restore-preview')return json({total:rows.length,duplicates:seen.size,add:fresh.length});
  const statements=[];
  for(const row of fresh){
   if(kind==='comment'&&!(await db.prepare('SELECT id FROM star_wishes WHERE id=?').bind(row.wish_id).first()))throw new HttpError(400,'留言缺少所属愿望，请先导入愿望');
   const fields=fieldsFor(kind);
   statements.push(db.prepare('INSERT INTO '+table+'('+fields.join(',')+') VALUES('+fields.map(()=>'?').join(',')+') ON CONFLICT(id) DO NOTHING').bind(...fields.map(k=>row[k])));
   statements.push(db.prepare('INSERT INTO star_content_meta(kind,id,pinned,admin_reply,previous_status,deleted_at) VALUES(?,?,?,?,?,?) ON CONFLICT(kind,id) DO NOTHING').bind(kind,row.id,row.meta.pinned,row.meta.admin_reply,row.meta.previous_status,row.meta.deleted_at));
  }
  if(statements.length)await db.batch([...statements,bumpRevision(db)]);return json({ok:true,added:fresh.length,skipped:seen.size});
 }
 return null;
}
