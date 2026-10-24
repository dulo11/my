/* Butterfly multilingual welcome + optional navigation translation. No external API. */
(() => {
  'use strict';
  const KEY='butterfly-language-v1', ROTATE='butterfly-language-rotate-v1';
  const data=[
    ['zh','中文','云起时相逢，风过处相念。',['首页','归档','分类','标签','关于','项目','联系']],
    ['en','English','We meet when clouds rise, and miss each other when the wind passes.',['Home','Archives','Categories','Tags','About','Projects','Contact']],
    ['ja','日本語','雲が立つ時に出会い、風が過ぎる所で想い合う。',['ホーム','アーカイブ','カテゴリー','タグ','紹介','プロジェクト','連絡']],
    ['vi','Tiếng Việt','Ta gặp nhau khi mây nổi, và nhớ nhau khi gió qua.',['Trang chủ','Lưu trữ','Danh mục','Thẻ','Giới thiệu','Dự án','Liên hệ']],
    ['th','ไทย','เราพบกันยามเมฆลอยขึ้น และคิดถึงกันยามสายลมพัดผ่าน',['หน้าแรก','คลังบทความ','หมวดหมู่','แท็ก','เกี่ยวกับ','โครงการ','ติดต่อ']],
    ['ms','Bahasa Melayu','Kita bertemu saat awan berarak, dan saling merindu ketika angin berlalu.',['Utama','Arkib','Kategori','Tag','Tentang','Projek','Hubungi']],
    ['fil','Filipino','Nagtagpo tayo nang umangat ang mga ulap, at nangulila sa isa’t isa nang dumaan ang hangin.',['Home','Arkibo','Kategorya','Tag','Tungkol','Proyekto','Kontak']],
    ['ko','한국어','구름이 피어날 때 만나고, 바람이 스칠 때 서로를 그리워한다.',['홈','보관함','카테고리','태그','소개','프로젝트','연락']],
    ['fr','Français','Nous nous rencontrons quand les nuages se lèvent, et nous pensons l’un à l’autre quand le vent passe.',['Accueil','Archives','Catégories','Tags','À propos','Projets','Contact']],
    ['de','Deutsch','Wir begegnen uns, wenn die Wolken aufsteigen, und denken aneinander, wenn der Wind vorüberzieht.',['Startseite','Archiv','Kategorien','Tags','Über','Projekte','Kontakt']],
    ['es','Español','Nos encontramos cuando las nubes se alzan, y nos recordamos cuando pasa el viento.',['Inicio','Archivo','Categorías','Etiquetas','Acerca de','Proyectos','Contacto']],
    ['pt','Português','Encontramo-nos quando as nuvens se erguem, e sentimos saudade quando o vento passa.',['Início','Arquivo','Categorias','Etiquetas','Sobre','Projetos','Contato']],
    ['ru','Русский','Мы встречаемся, когда поднимаются облака, и вспоминаем друг друга, когда проходит ветер.',['Главная','Архив','Категории','Теги','О сайте','Проекты','Контакты']],
    ['ar','العربية','نلتقي حين تنهض الغيوم، ونشتاق حين يمرّ النسيم.',['الرئيسية','الأرشيف','التصنيفات','الوسوم','حول','المشاريع','اتصل']]
  ];
  const codes=new Map(data.map(x=>[x[0],x]));
  const navKeys=['首页','归档','分类','标签','关于','项目','联系'];
  const browser=()=>((navigator.languages&&navigator.languages[0])||navigator.language||'zh').toLowerCase();
  const detect=()=>{const l=browser();return l.startsWith('zh')?'zh':l.startsWith('tl')?'fil':l.startsWith('fil')?'fil':(data.find(x=>l===x[0]||l.startsWith(x[0]+'-'))||data[0])[0]};
  const stored=()=>{try{return localStorage.getItem(KEY)}catch{return null}};
  const save=(k,v)=>{try{localStorage.setItem(k,v)}catch{}};
  let lang=codes.has(stored())?stored():detect();
  let rotating=(()=>{try{return localStorage.getItem(ROTATE)==='1'}catch{return false}})();
  let index=Math.max(0,data.findIndex(x=>x[0]===lang)), timer=null, subtitle=null;
  const welcome=()=>data[index][2];
  function updateSubtitle(){
    subtitle=document.querySelector('#site-subtitle');
    if(!subtitle)return;
    subtitle.textContent=welcome();
    subtitle.lang=data[index][0];
    subtitle.classList.remove('lang-fade');void subtitle.offsetWidth;subtitle.classList.add('lang-fade');
  }
  function updateNav(){
    const row=codes.get(lang)||data[0];
    document.querySelectorAll('#nav a, #sidebar a, #menus a').forEach(a=>{
      const label=a.querySelector('.site-page-name')||a;
      if(label.children.length)return;
      const current=label.textContent.trim();
      if(!label.dataset.langOriginal&&navKeys.includes(current))label.dataset.langOriginal=current;
      const orig=label.dataset.langOriginal;
      const i=navKeys.indexOf(orig);
      if(i>=0)label.textContent=row[3][i];
    });
  }
  function update(){
    document.documentElement.setAttribute('data-welcome-lang',lang);
    updateSubtitle();updateNav();
    const sel=document.querySelector('#bf-language-select');
    if(sel)sel.value=lang;
    const box=document.querySelector('#bf-language-rotate');
    if(box)box.checked=rotating;
  }
  function stop(){if(timer){clearInterval(timer);timer=null}}
  function start(){
    stop();if(!rotating||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    timer=setInterval(()=>{index=(index+1)%data.length;updateSubtitle()},6500);
  }
  function setLang(value){
    if(!codes.has(value))return;
    lang=value;index=data.findIndex(x=>x[0]===lang);
    save(KEY,lang);update();start();
  }
  function init(){
    if(!document.body)return;
    if(!document.querySelector('#bf-language-widget')){
      const box=document.createElement('div');box.id='bf-language-widget';
      const title=document.createElement('label');title.htmlFor='bf-language-select';title.textContent='🌐';
      title.title='Language / 语言';
      const sel=document.createElement('select');sel.id='bf-language-select';sel.setAttribute('aria-label','Welcome language');
      data.forEach(([code,name])=>{const opt=document.createElement('option');opt.value=code;opt.textContent=name;sel.appendChild(opt)});
      sel.addEventListener('change',()=>setLang(sel.value));
      const toggle=document.createElement('label');toggle.className='bf-language-rotate-label';
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.id='bf-language-rotate';
      const txt=document.createElement('span');txt.textContent='轮播 / Auto';
      toggle.append(checkbox,txt);checkbox.addEventListener('change',()=>{rotating=checkbox.checked;save(ROTATE,rotating?'1':'0');index=data.findIndex(x=>x[0]===lang);update();start()});
      box.append(title,sel,toggle);document.body.appendChild(box);
    }
    update();start();
  }
  document.addEventListener('visibilitychange',start);
  document.addEventListener('DOMContentLoaded',init);
  document.addEventListener('pjax:complete',init);
  if(document.readyState!=='loading')init();
})();