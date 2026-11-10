/* ══════════════════════════════════════════════════════════════
   Boutique OG's Farm : boutons « Commander sur OG's Farm » sous les variétés recommandées (chat) et bloc d'info (admin).
   Le catalogue (une entrée par fiche : variété × breeder × type) est lu directement depuis le navigateur ;
   les liens viennent UNIQUEMENT de ce catalogue, jamais de la réponse de l'IA.
   Si le catalogue ne répond pas, l'app fonctionne comme avant, sans bouton ni message d'erreur.
══════════════════════════════════════════════════════════════ */
(function(){
  // ogsfarm.fr directement : ogsfarm.com redirige, et une redirection sans en-tête CORS bloquerait l'appel
  var URL_CATALOGUE=/^(localhost|127\.0\.0\.1)$/.test(location.hostname)?'http://localhost:3000/api/catalogue':'https://ogsfarm.fr/api/catalogue';
  var CLE='ss_ogsfarm',DUREE=10*60*1000,UTM='utm_source=strainsage&utm_medium=app&utm_campaign=reco',MAX_CARTES=4;
  var etat=null,enCours=null;

  // « Gorilla Glue #4 Feminisée » → « gorilla glue 4 » : minuscules, sans accents ni ponctuation, sans mots de conditionnement
  var PARASITES=/\b(?:feminis[ée]e?s?|feminized|feminised|fem|autos?|autoflowering|autoflower|autofloraison|regular|reguli[eè]res?|graines?|seeds?|x\d+|packs?)\b/g;
  function normalizeStrain(s){
    return String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/#/g,' ').replace(/[^a-z0-9]+/g,' ').replace(PARASITES,' ').replace(/\s+/g,' ').trim();
  }
  function cleBreeder(b){return normalizeStrain(b).replace(/\b(?:seeds?|genetics?|farm|bank)\b/g,'').replace(/\s+/g,'');}

  function indexer(data){
    var produits=(data&&Array.isArray(data.products)?data.products:[]).filter(function(p){return p&&p.url&&p.name;});
    var parNom={};
    produits.forEach(function(p){
      // « Auto Crystal Candy — Sweet Seeds » : la variété est avant le tiret, le breeder vient de p.breeder
      p._nom=normalizeStrain(String(p.name).split(/\s+[—–-]\s+/)[0]);
      if(p._nom)(parNom[p._nom]=parNom[p._nom]||[]).push(p);
    });
    return {updated:data.updated||null,produits:produits,parNom:parNom};
  }
  function charger(){
    if(etat)return Promise.resolve(etat);
    if(enCours)return enCours;
    try{var c=JSON.parse(sessionStorage.getItem(CLE)||'null');if(c&&Date.now()-c.t<DUREE){etat=indexer(c.d);return Promise.resolve(etat);}}catch(e){}
    enCours=fetch(URL_CATALOGUE).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).then(function(d){
      etat=indexer(d);
      try{sessionStorage.setItem(CLE,JSON.stringify({t:Date.now(),d:d}));}catch(e){}
      setTimeout(function(){etat=null;},DUREE); // recharge au besoin après 10 min
      return etat;
    }).catch(function(e){console.info('[OG\'s Farm] catalogue indisponible : '+(e&&e.message));return null;}).finally(function(){enCours=null;});
    return enCours;
  }

  /* Produits d'une variété : nom normalisé identique d'abord, sinon nom de produit qui contient la variété.
     Même breeder et même type passent en tête ; tous les produits trouvés sont gardés. */
  function trouver(nom,breeder,type){
    if(!etat)return [];
    var n=normalizeStrain(nom);if(!n)return [];
    var res=(etat.parNom[n]||[]).slice();
    if(!res.length&&n.length>=4){
      var re=new RegExp('(^| )'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'( |$)');
      res=etat.produits.filter(function(p){return re.test(p._nom);});
    }
    var b=breeder?cleBreeder(breeder):'',t=type==='regular'?'reguliere':type;
    var score=function(p){return (b&&cleBreeder(p.breeder)===b?2:0)+(t&&p.type===t?1:0)+(p.inStock?.5:0);};
    return res.sort(function(x,y){return score(y)-score(x);});
  }
  function lien(p){return p.url+(p.url.indexOf('?')<0?'?':'&')+UTM;}
  function prix(v){return v==null||isNaN(v)?'':Number(v).toFixed(2).replace('.',',')+' €';}
  function esc(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  var TYPES={fem:'Féminisée',auto:'Autofloraison',reguliere:'Régulière'};

  /* Après la réponse : cartes produit compactes sous le message, 4 au plus, sans doublon.
     varietes : [{name, breeder, type}] tirées des cartes de la réponse. */
  function ajouterCartes(conteneur,varietes){
    if(!conteneur||!varietes||!varietes.length)return;
    charger().then(function(e){
      if(!e)return;
      var vus={},liste=[];
      varietes.forEach(function(v){trouver(v.name,v.breeder,v.type).forEach(function(p){if(!vus[p.url]&&liste.length<MAX_CARTES){vus[p.url]=1;liste.push(p);}});});
      if(!liste.length)return;
      var bloc=document.createElement('div');bloc.className='ogs-strip';bloc.setAttribute('role','group');bloc.setAttribute('aria-label',"Acheter sur OG's Farm");
      bloc.innerHTML='<p class="ogs-head">Sur la boutique OG\'s Farm</p><div class="ogs-row">'+liste.map(function(p){
        return '<a class="ogs-card'+(p.inStock?'':' out')+'" href="'+esc(lien(p))+'" target="_blank" rel="noopener">'+
          (p.image?'<img src="'+esc(p.image)+'" alt="" width="64" height="64" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">':'')+
          '<span class="ogs-txt"><b>'+esc(String(p.name).split(/\s+[—–-]\s+/)[0])+'</b>'+
          '<small>'+esc([p.breeder,TYPES[p.type]].filter(Boolean).join(' · '))+'</small>'+
          '<span class="ogs-meta"><span class="ogs-price">'+(p.price!=null?'dès '+prix(p.price):'')+'</span><span class="ogs-badge">'+(p.inStock?'En stock':'Rupture')+'</span></span>'+
          '<span class="ogs-cta">'+(p.inStock?"Commander sur OG's Farm":'Voir le produit')+' <span aria-hidden="true">↗</span></span></span></a>';
      }).join('')+'</div>';
      conteneur.appendChild(bloc);
    });
  }
  // photo de secours pour une carte variété (synchrone : seulement si le catalogue est déjà chargé)
  function imagePour(nom,breeder,type){var p=trouver(nom,breeder,type).filter(function(x){return x.image;})[0];return p?p.image:'';}

  window.OGSFarm={charger:charger,normalizeStrain:normalizeStrain,trouver:trouver,ajouterCartes:ajouterCartes,imagePour:imagePour,lien:lien,
    etat:function(){return etat;},URL:URL_CATALOGUE};
  charger();
})();
