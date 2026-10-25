(()=>{'use strict';
const $=id=>document.getElementById(id),notice=s=>$('notice').textContent=s||'';
let code='',page=1,loading=false,operating=false,backupData=null,backupBusy=false;const selected=new Set();
const storage={get(k){try{return sessionStorage.getItem(k)}catch{return null}},set(k,v){try{v?sessionStorage.setItem(k,v):sessionStorage.removeItem(k)}catch{}}};
const hex=bytes=>Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join('');
async function api(action,data){
 const r=await fetch('/api/star-admin?action='+encodeURIComponent(action),{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),credentials:'same-origin',cache:'no-store'});
 let j;try{j=await r.json()}catch{throw Error('接口未返回JSON（HTTP '+r.status+'）')}
 if(j.version)$('version').textContent=j.version;
 if(!r.ok){const e=Error((j.error||'操作失败')+(j.code?' ['+j.code+' / '+j.stage+' / '+j.requestId+']':''));e.status=r.status;throw e}return j;
}
async function setup(renew=false){
 if(!code)code=storage.get('star-setup-code')||'';
 if(renew||!/^[a-f0-9]{48}$/.test(code))code=hex(crypto.getRandomValues(new Uint8Array(24)));
 storage.set('star-setup-code',code);$('setup-code').value=code;
 const digest=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('star-setup-v1:'+code)));
 $('setup-sql').value="INSERT INTO star_settings(key,value) VALUES ('setup_key_hash','"+digest+"') ON CONFLICT(key) DO UPDATE SET value=excluded.value;";
}
const filterIds=['kind','filter-status','search','date-from','date-to'];
function saveFilters(){try{localStorage.setItem('star-admin-filters',JSON.stringify(Object.fromEntries(filterIds.map(id=>[id,$(id).value]))))}catch{}}
try{const saved=JSON.parse(localStorage.getItem('star-admin-filters')||'{}');for(const id of filterIds)if(typeof saved[id]==='string')$(id).value=saved[id]}catch{}
const selection=()=>{$('selection').textContent='已选'+selected.size+'条'};
const element=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e};
async function dashboard(){const r=await api('stats',{});$('stats').replaceChildren();for(const kind of ['wish','comment']){const rows=r.counts.filter(x=>x.kind===kind);$('stats').append(element('p',(kind==='wish'?'愿望':'留言')+' '+rows.reduce((a,x)=>a+x.total,0)+' 条 · 今日 '+rows.reduce((a,x)=>a+(x.today||0),0)+' · 隐藏 '+(rows.find(x=>x.status==='hidden')?.total||0)+' · 回收站 '+(rows.find(x=>x.status==='deleted')?.total||0)))}}
async function load(){
 if(loading||operating)return;loading=true;for(const id of ['refresh',...filterIds])$(id).disabled=true;
 try{
  const r=await api('list',{kind:$('kind').value||'wish',status:$('filter-status').value,page,q:$('search').value,from:$('date-from').value,to:$('date-to').value});
  $('page-label').textContent='第 '+page+' 页';$('prev').disabled=page<=1;$('next').disabled=!r.hasMore;saveFilters();selected.clear();selection();$('select-all').checked=false;const list=$('items');list.replaceChildren();
  if(!r.items.length)list.textContent='暂无符合条件的内容。';
  for(const item of r.items){
   const card=element('article'),check=element('input');check.type='checkbox';check.dataset.item=item.id;check.setAttribute('aria-label','选择此条内容');check.onchange=()=>{check.checked?selected.add(item.id):selected.delete(item.id);selection()};
   const state={visible:'公开',hidden:'隐藏',deleted:'回收站'}[item.status];card.append(check,element('strong',item.nickname),element('p',item.content),element('small',new Date(item.created_at).toLocaleString()+' · '+state+(r.kind==='wish'?' · '+item.likes+'次点亮':' · 所属愿望 '+item.wish_id)));
   const actions=element('div');actions.className='item-actions';
   function button(text,op){const b=element('button',text);b.onclick=()=>operate(op,[item.id],r.kind);actions.append(b)}
   if(item.status==='deleted'){button('恢复','restore');button('永久删除','purge')}else{button(item.status==='visible'?'隐藏':'公开',item.status==='visible'?'hidden':'visible');button('移入回收站','trash')}
   const details=element('details'),label=element('label'),pin=element('input'),reply=element('textarea'),save=element('button','保存回复与置顶');pin.type='checkbox';pin.checked=!!item.pinned;label.append(pin,document.createTextNode('置顶此内容'));reply.value=item.admin_reply||'';reply.maxLength=2000;reply.placeholder='管理员回复，留空清除';
   save.onclick=()=>busy(save,async()=>{await api('annotate',{kind:r.kind,id:item.id,pinned:pin.checked,reply:reply.value});notice('已保存')});details.append(element('summary','置顶与管理员回复'),label,reply,save);card.append(actions,details);list.append(card);
  }
 }catch(e){notice(e.message)}finally{loading=false;for(const id of ['refresh',...filterIds])$(id).disabled=false}
}
async function operate(operation,ids,kind=$('kind').value){
 if(operating||loading)return;if(!ids.length)return notice('请先选择内容');
 if(operation==='purge'&&!confirm('永久删除 '+ids.length+' 条内容？删除愿望会同时删除其留言，无法撤销。'))return;
 if(operation==='trash'&&!confirm('将 '+ids.length+' 条内容移入回收站？之后可以恢复。'))return;
 operating=true;let completed=0;
 try{for(let i=0;i<ids.length;i+=8){await api('batch',{kind,ids:ids.slice(i,i+8),operation,confirm:operation==='purge'?'永久删除':undefined});completed+=Math.min(8,ids.length-i)}notice('已处理 '+completed+' 条')}
 catch(e){notice('已处理 '+completed+' 条；'+e.message)}finally{operating=false;await load();await dashboard()}
}
const settingKeys=['wishEnabled','commentEnabled','likeEnabled','wishMax','commentMax','wishInterval','commentInterval','likeInterval','announcement'];
async function loadSettings(){const {settings}=await api('settings',{});for(const key of settingKeys)typeof settings[key]==='boolean'?$(key).checked=settings[key]:$(key).value=settings[key]}
async function state(){try{const s=await api('me');$('setup').hidden=s.initialized;$('login').hidden=!s.initialized||s.authenticated;$('panel').hidden=!s.authenticated;if(!s.initialized){await setup();$('setup-ready').textContent=s.setupReady?'检测到授权记录，可以继续创建管理员。':'复制授权SQL，在D1控制台执行一次。'}if(s.authenticated){await load();await dashboard();await loadSettings()}}catch(e){notice(e.message)}}
async function busy(button,fn){if(button.disabled)return;button.disabled=true;try{await fn()}catch(e){notice(e.message)}finally{button.disabled=false}}
$('copy-sql').onclick=async()=>{try{await navigator.clipboard.writeText($('setup-sql').value);notice('SQL已复制，请在D1控制台执行')}catch{$('setup-sql').select();notice('已选中SQL，请手动复制')}};
$('renew').onclick=()=>busy($('renew'),async()=>{await setup(true);notice('已重新生成，请执行新的SQL')});
$('init').onclick=()=>busy($('init'),async()=>{await api('setup',{setupCode:$('setup-code').value.trim(),password:$('initial').value});code='';storage.set('star-setup-code','');$('initial').value='';notice('创建成功，请登录');await state()});
$('enter').onclick=()=>busy($('enter'),async()=>{await api('login',{password:$('password').value});$('password').value='';notice('登录成功');await state()});
$('logout').onclick=()=>busy($('logout'),async()=>{await api('logout',{});notice('已退出登录');await state()});
$('change').onclick=()=>busy($('change'),async()=>{await api('password',{password:$('old').value,newPassword:$('new').value});$('old').value=$('new').value='';notice('密码已修改，请重新登录');await state()});
for(const id of ['password','initial'])$(id).onkeydown=e=>{if(e.key==='Enter')$(id==='password'?'enter':'init').click()};
$('refresh').onclick=()=>load();$('kind').onchange=$('filter-status').onchange=()=>{page=1;load()};$('prev').onclick=()=>{if(!loading&&page>1){page--;load()}};$('next').onclick=()=>{if(!loading){page++;load()}};
$('search-run').onclick=()=>{page=1;load()};$('search-clear').onclick=()=>{for(const id of ['search','date-from','date-to'])$(id).value='';page=1;load()};$('search').onkeydown=e=>{if(e.key==='Enter')$('search-run').click()};
$('select-all').onchange=()=>{document.querySelectorAll('[data-item]').forEach(e=>{e.checked=$('select-all').checked;e.checked?selected.add(e.dataset.item):selected.delete(e.dataset.item)});selection()};$('bulk').onclick=e=>{const b=e.target.closest('[data-operation]');if(b)operate(b.dataset.operation,[...selected])};
$('settings-form').onsubmit=e=>{e.preventDefault();busy(e.submitter,async()=>{const settings=Object.fromEntries(settingKeys.map(k=>[k,$(k).type==='checkbox'?$(k).checked:$(k).type==='number'?Number($(k).value):$(k).value]));await api('save-settings',{settings});notice('设置已保存，公开页面刷新后更新')})};
$('diagnose').onclick=()=>busy($('diagnose'),async()=>{$('diagnostic').hidden=false;try{$('diagnostic').textContent=JSON.stringify(await api('health'),null,2)}catch(e){$('diagnostic').textContent=e.message}});
async function backupTask(fn){if(backupBusy)return;backupBusy=true;for(const id of ['backup','preview-import','backup-file','import'])$(id).disabled=true;try{await fn()}catch(e){$('backup-info').textContent=e.message}finally{backupBusy=false;for(const id of ['backup','preview-import','backup-file'])$(id).disabled=false;$('import').disabled=!backupData}}
function download(data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=element('a');a.href=url;a.download='stars-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('backup').onclick=()=>backupTask(async()=>{const data={format:'yun-stars-backup',version:1,exportedAt:new Date().toISOString(),wishes:[],comments:[]};let revision=null;for(const kind of ['wish','comment']){let after='',more=true;while(more){const r=await api('export',{kind,after});if(revision!==null&&r.revision!==revision)throw Error('导出期间有内容更新，请重新导出');revision=r.revision;data[kind==='wish'?'wishes':'comments'].push(...r.items);if(r.settings)data.settings=r.settings;after=r.next;more=r.hasMore;$('backup-info').textContent='正在导出 '+data.wishes.length+' 条愿望、'+data.comments.length+' 条留言'}}download(data);$('backup-info').textContent='完整备份已导出'});
$('backup-file').onchange=()=>{backupData=null;$('import').disabled=true;$('backup-info').textContent='请先检查备份'};
$('preview-import').onclick=()=>backupTask(async()=>{backupData=null;const file=$('backup-file').files[0];if(!file||file.size>20*1024*1024)throw Error('请选择20MB以内的备份文件');const data=JSON.parse(await file.text());if(data.format!=='yun-stars-backup'||data.version!==1||!Array.isArray(data.wishes)||!Array.isArray(data.comments)||data.wishes.length+data.comments.length>50000)throw Error('备份格式无效');await api('validate-settings',{settings:data.settings});let total=0,duplicates=0;
 for(const [kind,items] of [['wish',data.wishes],['comment',data.comments]]){if(new Set(items.map(x=>x.id)).size!==items.length)throw Error('备份中有重复ID');for(let i=0;i<items.length;i+=10){const r=await api('restore-preview',{kind,items:items.slice(i,i+10)});total+=r.total;duplicates+=r.duplicates;$('backup-info').textContent='已检查 '+total+' 条'}}backupData=data;$('backup-info').textContent='共 '+total+' 条，新增 '+(total-duplicates)+' 条，重复 '+duplicates+' 条将跳过';});
$('import').onclick=()=>{if(!backupData||backupBusy)return;if(!confirm('确认恢复此备份？重复ID将跳过'+($('restore-settings').checked?'，并替换星空设置':'')+'。'))return;backupTask(async()=>{let added=0,skipped=0;try{for(const [kind,items] of [['wish',backupData.wishes],['comment',backupData.comments]])for(let i=0;i<items.length;i+=10){const r=await api('restore-import',{kind,items:items.slice(i,i+10)});added+=r.added;skipped+=r.skipped;$('backup-info').textContent='已恢复 '+added+' 条，跳过 '+skipped+' 条'}if($('restore-settings').checked){await api('save-settings',{settings:backupData.settings});await loadSettings()}await load();await dashboard();$('backup-info').textContent='恢复完成：新增 '+added+' 条，跳过 '+skipped+' 条';backupData=null}catch(e){throw Error('已新增 '+added+' 条；'+e.message+'。可重新导入继续。')}})};
state();
})();
