/* Variantes de design à comparer : ?variante=1|2|3 ou le sélecteur affiché en local.
   Le choix est gardé dans ce navigateur (localStorage ss_variante). En ligne, sans paramètre, rien ne change. */
(function(){
  var NOMS={1:'Noir et or',2:'Herbier',3:'Cuivre'};
  function get(){try{return localStorage.getItem('ss_variante')||'1';}catch(e){return '1';}}
  function set(v){try{localStorage.setItem('ss_variante',v);}catch(e){}apply(v);}
  function apply(v){if(v==='1')document.documentElement.removeAttribute('data-variante');else document.documentElement.setAttribute('data-variante',v);
    var p=document.querySelector('.var-pick');if(p)p.querySelectorAll('button').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.v===v));});}
  var q=(location.search.match(/[?&]variante=([123])/)||[])[1];if(q)try{localStorage.setItem('ss_variante',q);}catch(e){}
  apply(q||get());
  var local=/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if(!local)return;
  document.addEventListener('DOMContentLoaded',function(){
    var p=document.createElement('div');p.className='var-pick';p.setAttribute('role','group');p.setAttribute('aria-label','Variante de design');
    p.innerHTML='<span>Variante</span>'+[1,2,3].map(function(v){return '<button type="button" data-v="'+v+'">'+v+' · '+NOMS[v]+'</button>';}).join('');
    p.addEventListener('click',function(e){var b=e.target.closest('button');if(b)set(b.dataset.v);});
    document.body.appendChild(p);apply(get());
  });
})();
