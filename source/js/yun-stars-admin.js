(()=>{
  const $=id=>document.getElementById(id);
  const notice=message=>{$('notice').textContent=message||''};
  let setupCode='',page=1,loading=false;
  try{setupCode=sessionStorage.getItem('star-setup-code')||''}catch{}
  const keepSetup=()=>{try{if(setupCode)sessionStorage.setItem('star-setup-code',setupCode);else sessionStorage.removeItem('star-setup-code')}catch{}};
  const hex=bytes=>Array.from(bytes).map(x=>x.toString(16).padStart(2,'0')).join('');
  async function hashSetup(code){
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('star-setup-v1:'+code));
    return hex(new Uint8Array(digest));
  }
  async function generateSetup(renew=false){
    if(renew||!/^[a-f0-9]{48}$/.test(setupCode))setupCode=hex(crypto.getRandomValues(new Uint8Array(24)));
    keepSetup();
    const digest=await hashSetup(setupCode);
    $('setup-code').value=setupCode;
    $('setup-sql').value="INSERT INTO star_settings(key,value) VALUES ('setup_key_hash','"+digest+"') ON CONFLICT(key) DO UPDATE SET value=excluded.value;";
  }
  async function api(action,data){
    const hasBody=data!==undefined;
    const r=await fetch('/api/star-admin?action='+encodeURIComponent(action),{
      method:hasBody?'POST':'GET',
      headers:hasBody?{'content-type':'application/json'}:{},
      body:hasBody?JSON.stringify(data):undefined,
      credentials:'same-origin',
      cache:'no-store'
    });
    let response;
    try{response=await r.json()}catch{throw Error('接口没有返回有效 JSON，请检查部署')}
    if(!r.ok)throw Error(response.error||'操作失败');
    return response;
  }
  async function state(){
    try{
      const s=await api('me');
      $('setup').hidden=s.initialized;
      $('login').hidden=!s.initialized||s.authenticated;
      $('panel').hidden=!s.authenticated;
      if(!s.initialized){
        await generateSetup();
        $('setup-ready').textContent=s.setupReady?'检测到 D1 已写入授权记录，可继续创建管理员。':'请先复制下面的 SQL，在 Cloudflare D1 控制台执行一次。';
      }
      if(s.authenticated){page=1;await load();}
    }catch(e){notice(e.message)}
  }
  async function load(){
    if(loading)return;loading=true;
    $('refresh').disabled=$('kind').disabled=$('filter-status').disabled=true;
    try{
      const response=await api('list',{kind:$('kind').value,status:$('filter-status').value,page});
      notice('');
      $('page-label').textContent='第 '+page+' 页';
      $('prev').disabled=page<=1;
      $('next').disabled=!response.hasMore;
      const list=$('items');
      list.replaceChildren();
      if(!response.items.length){
        list.textContent=$('kind').value==='comment'?'暂无符合条件的留言。':'暂无符合条件的愿望。';
        return;
      }
      for(const wish of response.items){
        const card=document.createElement('article');
        const heading=document.createElement('strong');
        const content=document.createElement('p');
        const meta=document.createElement('small');
        const button=document.createElement('button');
        heading.textContent=wish.nickname;
        content.textContent=wish.content;
        meta.textContent=new Date(wish.created_at).toLocaleString()+' · '+(wish.status==='visible'?'公开':'隐藏')+(response.kind==='comment'?' · 所属愿望 '+wish.wish_id:' · '+wish.likes+' 次点亮');
        button.textContent=wish.status==='visible'?'隐藏':'恢复';
        button.onclick=async()=>{
          if(button.disabled)return;button.disabled=true;
          try{
            await api('moderate',{id:wish.id,kind:response.kind,status:wish.status==='visible'?'hidden':'visible'});
            await load();
          }catch(e){notice(e.message)}finally{button.disabled=false}
        };
        card.append(heading,content,meta,document.createElement('br'),button);
        list.append(card);
      }
    }catch(e){notice(e.message)}finally{loading=false;$('refresh').disabled=$('kind').disabled=$('filter-status').disabled=false;}
  }
  $('copy-sql').onclick=async()=>{
    const field=$('setup-sql');
    try{
      await navigator.clipboard.writeText(field.value);
      notice('SQL 已复制。现在进入 Cloudflare → D1 → mywangzhan → 控制台，粘贴并执行一次。');
    }catch{
      field.focus();
      field.select();
      notice('浏览器不允许自动复制，已选中 SQL，请手动复制。');
    }
  };
  $('renew').onclick=async()=>{
    await generateSetup(true);
    notice('已生成新授权码。请重新执行新 SQL，旧授权码将不能使用。');
  };
  $('init').onclick=async()=>{
    try{
      const password=$('initial').value;
      const code=$('setup-code').value.trim();
      if(password.length<1)throw Error('管理员密码不能为空');
      await api('setup',{setupCode:code,password});
      $('initial').value='';
      $('setup-code').value='';
      setupCode='';keepSetup();
      notice('管理员创建成功！现在使用刚设置的密码登录。');
      await state();
    }catch(e){notice(e.message)}
  };
  $('enter').onclick=async()=>{
    try{
      await api('login',{password:$('password').value});
      $('password').value='';
      notice('管理员登录成功');
      await state();
    }catch(e){notice(e.message)}
  };
  $('refresh').onclick=()=>load();
  $('kind').onchange=$('filter-status').onchange=()=>{if(loading)return;page=1;load()};
  $('prev').onclick=()=>{if(!loading&&page>1){page--;load()}};
  $('next').onclick=()=>{if(!loading){page++;load()}};
  $('logout').onclick=async()=>{
    try{
      await api('logout',{});
      notice('已退出登录');
      await state();
    }catch(e){notice(e.message)}
  };
  $('change').onclick=async()=>{
    try{
      await api('password',{password:$('old').value,newPassword:$('new').value});
      $('old').value='';
      $('new').value='';
      notice('密码已修改，其他已登录设备同时失效，请重新登录。');
      await state();
    }catch(e){notice(e.message)}
  };
  for(const id of ['init','enter','change','logout','renew']){
    const button=$(id),handler=button.onclick;
    button.onclick=async()=>{if(button.disabled)return;button.disabled=true;try{await handler()}finally{button.disabled=false}};
  }
  state();
})();
