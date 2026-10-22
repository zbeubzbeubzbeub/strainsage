/* ══════════════════════════════════════════════════════════════
   StrainSage Pro — agrandissement des photos de variétés (chat et admin)
   Toute image portant l'attribut data-zoom s'ouvre en grand au clic :
   - data-zoom="URL" : version HD connue (sinon la photo affichée elle-même) ;
   - data-gst="code" : article Garden Seeds ; la HD (« foto1 », 600 px) est lue une fois dans catalogue_gst/{code},
     la miniature (« thumbnail », 320 px) reste affichée agrandie pendant le chargement.
   Fermeture : clic sur le fond, croix ou touche Échap. Thèmes clair et sombre via les variables CSS de la page.
══════════════════════════════════════════════════════════════ */
(function(){
  var css=''+
    'img[data-zoom]{cursor:zoom-in}'+
    '.lbx{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));'+
      'background:rgba(10,14,12,.82);opacity:0;transition:opacity .18s ease;cursor:zoom-out}'+
    '[data-theme="dark"] .lbx{background:rgba(0,0,0,.88)}'+
    '.lbx.open{opacity:1}'+
    '.lbx-fig{position:relative;margin:0;display:flex;flex-direction:column;align-items:center;gap:10px;max-width:min(92vw,900px);cursor:default;'+
      'transform:scale(.97);transition:transform .18s ease}'+
    '.lbx.open .lbx-fig{transform:scale(1)}'+
    '.lbx-img{display:block;width:min(92vw,80vh,820px);height:min(92vw,80vh,820px);object-fit:contain;border-radius:16px;'+
      'background:var(--surface,var(--panel,#fff));border:3px solid var(--surface,var(--panel,#fff));box-shadow:0 18px 50px rgba(0,0,0,.45)}'+
    '.lbx-cap{max-width:100%;color:#fff;font-size:14px;font-weight:600;text-align:center;text-shadow:0 1px 3px rgba(0,0,0,.6);display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center}'+
    '.lbx-hd{font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;background:rgba(255,255,255,.16);color:#fff}'+
    '.lbx-x{position:fixed;top:max(12px,env(safe-area-inset-top));right:12px;width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;'+
      'background:var(--surface,var(--panel,#fff));color:var(--ink,var(--text1,#17201b));font-size:24px;line-height:44px;text-align:center;box-shadow:0 4px 14px rgba(0,0,0,.3)}'+
    '.lbx-x:focus-visible{outline:3px solid var(--accent,#2f9e6a);outline-offset:2px}'+
    '@media(prefers-reduced-motion:reduce){.lbx,.lbx-fig{transition:none}}';
  var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

  var hdCache={},box=null,lastFocus=null,token=0;
  // HD d'un article Garden Seeds : la photo de l'article qui n'est pas la miniature affichée (« foto1 »)
  function gstHD(code,thumb){
    if(hdCache[code]!==undefined)return Promise.resolve(hdCache[code]);
    if(typeof db==='undefined'||!db.collection)return Promise.resolve('');
    return db.collection('catalogue_gst').doc(String(code).replace(/\//g,'_')).get().then(function(s){
      var ph=s.exists?(s.data().photos||[]):[],hd=ph.filter(function(u){return u&&u!==thumb;})[0]||'';
      hdCache[code]=hd;return hd;
    }).catch(function(){return '';});
  }
  function close(){
    if(!box)return;var b=box;box=null;token++;
    b.classList.remove('open');document.documentElement.style.overflow='';
    setTimeout(function(){b.remove();},180);
    if(lastFocus&&lastFocus.focus)try{lastFocus.focus({preventScroll:true});}catch(e){}
  }
  function open(img){
    close();lastFocus=document.activeElement;var my=++token;
    var thumb=img.currentSrc||img.src,alt=img.getAttribute('alt')||img.getAttribute('data-name')||'Photo de la variété';
    box=document.createElement('div');box.className='lbx';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',alt);
    box.innerHTML='<button type="button" class="lbx-x" aria-label="Fermer la photo">×</button><figure class="lbx-fig"><img class="lbx-img" alt="" referrerpolicy="no-referrer"><figcaption class="lbx-cap"></figcaption></figure>';
    var big=box.querySelector('.lbx-img'),cap=box.querySelector('.lbx-cap');
    big.src=thumb;big.alt=alt;cap.textContent=alt;
    box.addEventListener('click',function(e){if(e.target===box||e.target.closest('.lbx-x'))close();});
    document.body.appendChild(box);document.documentElement.style.overflow='hidden';
    requestAnimationFrame(function(){if(box)box.classList.add('open');});
    box.querySelector('.lbx-x').focus({preventScroll:true});
    // version HD : affichée seulement une fois chargée (la miniature agrandie reste visible en attendant)
    var direct=img.getAttribute('data-zoom'),code=img.getAttribute('data-gst');
    var want=direct&&direct!==thumb?Promise.resolve(direct):(code?gstHD(code,thumb):Promise.resolve(''));
    want.then(function(hd){
      if(!hd||hd===thumb||my!==token)return;
      var hdTag=document.createElement('span');hdTag.className='lbx-hd';hdTag.textContent='Chargement HD…';cap.appendChild(hdTag);
      var pre=new Image();pre.referrerPolicy='no-referrer';
      pre.onload=function(){if(my!==token)return;big.src=hd;hdTag.textContent='HD';};
      pre.onerror=function(){if(hdTag.parentNode)hdTag.remove();};
      pre.src=hd;
    });
  }
  // capture : la photo d'une tuile ou d'un nœud cliquable s'agrandit sans déclencher l'action de la tuile
  document.addEventListener('click',function(e){
    var img=e.target&&e.target.closest&&e.target.closest('img[data-zoom]');
    if(!img||img.closest('.lbx'))return;
    e.preventDefault();e.stopPropagation();open(img);
  },true);
  document.addEventListener('keydown',function(e){
    if(!box)return;
    if(e.key==='Escape'){e.preventDefault();close();}
    else if(e.key==='Tab'){e.preventDefault();box.querySelector('.lbx-x').focus();} // seul élément focusable du dialogue
  });
  window.Lightbox={open:open,close:close};
})();
