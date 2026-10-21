/* ══════════════════════════════════════════════════════════════
   StrainSage Pro — Base de référence GrowDiaries
   Consultation à la demande + cache Firestore qui s'enrichit à chaque recherche.

   - Variété citée → fiche lue dans Firestore (collection "reference").
     Absente ou périmée (> 60 j) → lecture de la page GrowDiaries de la variété,
     extraction des faits par l'IA, enregistrement dans ta base.
   - Critères (tropical, relaxant, floraison courte…) → listes GrowDiaries par
     catégorie (collection "referenceCategories", rafraîchies tous les 7 j).
   - Seule la partie "fiche variété" est lue : journaux, avis, photos et shorts
     sont coupés avant l'extraction et ne sont jamais stockés.

   Utilise PROXY, SHOP_TOKEN et db définis dans index.html.
══════════════════════════════════════════════════════════════ */
(function(){
  var FRESH_MS     = 60*24*3600*1000;  // fiche variété valable 60 jours
  var CAT_FRESH_MS =  7*24*3600*1000;  // listes par critère valables 7 jours
  var MISS_MS      = 14*24*3600*1000;  // variété introuvable : on ne réessaie pas avant 14 jours
  // GrowDiaries bloque les lecteurs automatiques (403) : aucun appel réseau tant qu'un accès officiel n'existe pas.
  // Les fiches déjà en cache Firestore (« reference ») restent utilisées. Passer à true pour réactiver.
  var NETWORK      = false;
  var MODEL        = 'claude-haiku-5-5';  // modèle rapide et économique pour l'extraction
  var GD           = 'https://growdiaries.com';
  var cache = {}, pending = {};

  /* ── utilitaires ── */
  function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[™®#]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
  function keyOf(name){return norm(name).replace(/ /g,'_').slice(0,120);}
  function slugOf(name){return norm(name).replace(/ /g,'-');}
  function prettify(slug){return slug.split('-').map(function(w){return w.charAt(0).toUpperCase()+w.slice(1);}).join(' ');}
  var SCHEMA       = 2;  // incrémenter force la relecture de toutes les fiches
  function isFresh(d){return !!(d&&d.fetchedAt&&(d.v||0)>=SCHEMA&&(Date.now()-d.fetchedAt)<(d.notFound?MISS_MS:FRESH_MS));}

  async function proxyPost(path,body){
    var res=await fetch(PROXY+path,{method:'POST',headers:{'Content-Type':'application/json','X-Shop-Token':SHOP_TOKEN},body:JSON.stringify(body)});
    var data=await res.json();
    return data.result||'';
  }
  // Le Worker demande du texte brut tronqué à 8000 caractères (sans liens) : on lit d'abord
  // la page en markdown complet via Jina directement depuis le navigateur, le Worker sert de secours.
  function unwrap(t){
    t=String(t||'');
    if(t.charAt(0)==='{'){
      try{var j=JSON.parse(t),d=j.data||j;return (d.title?'Title: '+d.title+'\n\n':'')+(d.content||'');}
      catch(e){return t.replace(/\\n/g,'\n').replace(/\\"/g,'"');}
    }
    return t;
  }
  async function fetchPage(url){
    try{
      var r=await fetch('https://r.jina.ai/'+url,{headers:{'X-Return-Format':'markdown'}});
      if(r.ok){var t=await r.text();if(t&&t.length>300)return t;}
    }catch(e){}
    return unwrap(await proxyPost('/fetch-page',{url:url}).catch(function(){return '';}));
  }
  function search(q){return proxyPost('/search',{query:q}).catch(function(){return '';});}

  async function readDoc(col,k){try{var s=await db.collection(col).doc(k).get();return s.exists?s.data():null;}catch(e){return null;}}
  async function writeDoc(col,k,data){try{await db.collection(col).doc(k).set(data,{merge:true});}catch(e){console.warn('[GDRef] écriture Firestore refusée',col,e&&e.message);}}

  /* ── page variété ── */
  function isStrainPage(txt){return /Cannabis Strain \| Reviews/i.test(txt)&&txt.indexOf('Back to Strains')>-1;}
  function trimStrainPage(txt){
    var a=txt.indexOf('Back to Strains');if(a<0)a=0;
    var b=txt.length;
    ['## Popular Diaries','## Compare with','## Harvested diaries','## Shorts','## Latest Harvests','## Latest Reviews'].forEach(function(e){var i=txt.indexOf(e,a);if(i>-1&&i<b)b=i;});
    return txt.slice(a,b).replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\n{3,}/g,'\n\n').slice(0,7000);
  }
  function nameMatches(name,txt){
    var t=trimStrainPage(txt);
    var h1=(t.match(/^#\s+(.+)$/m)||[])[1]||'';
    var aka=(t.match(/^aka\s+(.+)$/mi)||[])[1]||'';
    var h=norm(h1+' '+aka),n=norm(name);
    if(!h||!n)return false;
    return h.indexOf(n)>-1||h.replace(/ /g,'').indexOf(n.replace(/ /g,''))>-1||(norm(h1).length>2&&n.indexOf(norm(h1))>-1);
  }
  async function resolvePage(name){
    var url=GD+'/strains/'+slugOf(name);
    var txt=await fetchPage(url);
    if(isStrainPage(txt)&&nameMatches(name,txt))return {url:url,txt:txt};
    // URL devinée incorrecte (ex : Girl Scout Cookies → /strains/gsc) : on cherche la bonne
    var res=await search('growdiaries '+name+' cannabis strain');
    var re=/growdiaries\.com\/strains\/([a-z0-9-]+)/g,m,tried=0,seen={};
    while((m=re.exec(res))!==null&&tried<2){
      var slug=m[1];
      if(seen[slug]||slug==='category'||slug===slugOf(name))continue;
      seen[slug]=1;tried++;
      var u=GD+'/strains/'+slug,t=await fetchPage(u);
      if(isStrainPage(t)&&nameMatches(name,t))return {url:u,txt:t};
    }
    return null;
  }

  /* ── extraction structurée ── */
  var EXTRACT_SYS='Tu extrais des données factuelles d\'une fiche variété GrowDiaries fournie en texte brut. Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte autour.\n'+
    'Schéma : {"name":"","aka":[],"type":"Indica|Sativa|Hybride|…","thc":"21%","cbd":"0.75%","rating":"9.2/10","harvests":44,'+
    '"parents":["Parent A","Parent B"],"descendants":[{"name":"","other_parent":""}],"breeders":[{"name":"","product":"","url":""}],'+
    '"effects":[],"negative_effects":[],"tastes":[],"conditions":[],"flowering":"9-10 semaines","difficulty":"","climate":"","summary_fr":""}\n'+
    'Règles : n\'invente rien, mets null ou [] quand l\'info est absente. "parents" = lignée citée dans la description. '+
    'La section Family Tree liste des triplets (descendant, variété courante, autre parent) : remplis "descendants" avec le descendant et l\'autre parent. '+
    '"breeders" = section Breeder products (nom du breeder, nom du produit, URL complète). Traduis effets, goûts et conditions en français. '+
    '"summary_fr" : 2 phrases maximum, entièrement reformulées avec tes propres mots, jamais copiées du texte.';

  async function extract(txt){
    var res=await fetch(PROXY,{method:'POST',headers:{'Content-Type':'application/json','X-Shop-Token':SHOP_TOKEN},
      body:JSON.stringify({model:MODEL,max_tokens:1500,system:EXTRACT_SYS,messages:[{role:'user',content:txt}]})});
    if(!res.ok)return null;
    var data=await res.json();
    var t=(data.content||[]).map(function(c){return c.text||'';}).join('');
    var a=t.indexOf('{'),b=t.lastIndexOf('}');
    if(a<0||b<a)return null;
    try{return JSON.parse(t.slice(a,b+1));}catch(e){return null;}
  }

  /* ── fiche variété : cache mémoire → Firestore → GrowDiaries ── */
  async function getStrain(name){
    var k=keyOf(name);if(!k||k.length<2)return null;
    if(isFresh(cache[k]))return cache[k].notFound?null:cache[k];
    if(pending[k])return pending[k];
    pending[k]=(async function(){
      var stored=await readDoc('reference',k);
      if(isFresh(stored)){cache[k]=stored;return stored.notFound?null:stored;}
      if(!NETWORK){if(stored&&!stored.notFound){cache[k]=stored;return stored;}return null;}
      var page=await resolvePage(name);
      if(!page){
        var miss={notFound:true,query:name,fetchedAt:Date.now(),v:SCHEMA};
        cache[k]=miss;writeDoc('reference',k,miss);
        return (stored&&!stored.notFound)?stored:null;
      }
      var data=await extract(trimStrainPage(page.txt));
      if(!data||!data.name)return (stored&&!stored.notFound)?stored:null; // on garde l'ancienne fiche si l'extraction échoue
      var rec=Object.assign({},data,{url:page.url,source:'growdiaries',notFound:false,v:SCHEMA,fetchedAt:Date.now(),firstSeen:(stored&&stored.firstSeen)||Date.now()});
      cache[k]=rec;writeDoc('reference',k,rec);
      var k2=keyOf(data.name);
      if(k2&&k2!==k){cache[k2]=rec;writeDoc('reference',k2,rec);} // alias : "Rainbow Sherbert 11" et "RS11" pointent vers la même fiche
      return rec;
    })();
    try{return await pending[k];}finally{delete pending[k];}
  }

  /* ── critères → catégories GrowDiaries ── */
  var CRITERIA=[
    // effets
    [/relax|d[ée]tente|d[ée]tendre|calme/,'positive-effects/relaxed','relaxant'],
    [/sommeil|dormir|insomni/,'positive-effects/sleepy','sommeil'],
    [/euphor/,'positive-effects/euphoric','euphorisant'],
    [/stimul|[ée]nergi|dynamis/,'positive-effects/energetic','stimulant'],
    [/cr[ée]ativ/,'positive-effects/creative','créatif'],
    [/stress|anxi/,'medical/stress','anti-stress'],
    [/douleur|inflamm/,'medical/pain','douleurs'],
    // goûts
    [/tropical/,'tastes/tropical','tropical'],
    [/diesel|fuel|essence|gaz/,'tastes/diesel','diesel/fuel'],
    [/citron|lemon/,'tastes/lemon','citron'],
    [/agrume|citrus/,'tastes/citrus','agrumes'],
    [/fruit/,'tastes/fruity','fruité'],
    [/sucr|bonbon|candy/,'tastes/sweet','sucré'],
    [/fromage|cheese/,'tastes/cheese','fromage'],
    [/menthe|mint/,'tastes/mint','menthe'],
    [/raisin|grape/,'tastes/grape','raisin'],
    [/myrtille|blueberry/,'tastes/blueberry','myrtille'],
    [/fraise|strawberry/,'tastes/strawberry','fraise'],
    [/mangue|mango/,'tastes/mango','mangue'],
    [/ananas|pineapple/,'tastes/pineapple','ananas'],
    [/p[eê]che|peach/,'tastes/peach','pêche'],
    [/baie|berry|fruits rouges/,'tastes/berry','baies'],
    [/terreux|earthy/,'tastes/earthy','terreux'],
    [/[ée]pic|poivr/,'tastes/spicy-herbal','épicé'],
    [/caf[ée]|coffee/,'tastes/coffee','café'],
    [/vanill/,'tastes/vanilla','vanille'],
    [/skunk/,'tastes/skunk','skunk'],
    [/pungent|funky|piquant/,'tastes/pungent','piquant'],
    // puissance
    [/peu de thc|thc (faible|bas)|faible (taux de )?thc/,'thc/low','THC faible'],
    [/thc ([ée]lev|fort|haut)|tr[eè]s fort|puissant|potent/,'thc/high','THC élevé'],
    [/\bcbd\b/,'cbd/high','CBD élevé'],
    [/\bindica\b/,'genes/indica','indica'],
    [/\bsativa\b/,'genes/sativa','sativa'],
    // culture
    [/d[ée]butant|facile|premi[eè]re culture/,'difficulty/easy','facile'],
    [/floraison (courte|rapide)|fleurit vite/,'flowering/fast','floraison rapide'],
    [/gros rendement|rendement ([ée]lev|important|max)|productive?/,'yield/high','gros rendement'],
    [/compact|petit espace|petite tente|discr[eè]t/,'height/short','compacte'],
    [/moisissure|humid|botrytis/,'features/mold-resistant','résistante moisissure'],
    [/outdoor|ext[ée]rieur|balcon|jardin/,'features/outdoor','outdoor'],
    [/froid|climat frais/,'features/cold-climate','climat frais'],
    [/\bserre\b/,'features/greenhouse','serre'],
    [/violet|purple/,'features/purple','violette'],
    [/hash|rosin|extraction|washer/,'features/hash-making','extraction']
  ];

  function parseList(txt){
    var re=/\[([^\]]+)\]\(https:\/\/growdiaries\.com\/strains\/([a-z0-9-]+)\)/g,m,out=[],seen={};
    while((m=re.exec(txt))!==null){
      var label=m[1],slug=m[2];
      if(seen[slug]||slug==='category'||!/THC/.test(label))continue; // seules les vignettes variété affichent le THC
      seen[slug]=1;
      var rating=(label.match(/(\d+(?:\.\d+)?)\/10/)||[])[1];
      var thc=(label.match(/THC\s*([\d.]+)%/)||[])[1]||null;
      var harvests=parseInt((label.match(/(\d+)\s*harvests/)||[])[1]||'0',10);
      var raw=label.split(/\d+(?:\.\d+)?\/10|THC/)[0].trim();
      var w=raw.split(/\s+/),h=w.length/2;
      var name=(w.length%2===0&&w.slice(0,h).join(' ')===w.slice(h).join(' '))?w.slice(0,h).join(' '):(raw||prettify(slug));
      out.push({name:name,slug:slug,rating:rating?parseFloat(rating):null,thc:thc,harvests:harvests});
    }
    return out.slice(0,40);
  }

  async function getCategory(path){
    var k=path.replace(/\//g,'__'),ck='cat:'+k;
    if(cache[ck])return cache[ck];
    var stored=await readDoc('referenceCategories',k);
    if(stored&&stored.fetchedAt&&Date.now()-stored.fetchedAt<CAT_FRESH_MS&&stored.items){cache[ck]=stored.items;return stored.items;}
    if(!NETWORK)return (stored&&stored.items)||[];
    var items=parseList(await fetchPage(GD+'/strains/category/'+path));
    if(items.length){cache[ck]=items;writeDoc('referenceCategories',k,{path:path,items:items,fetchedAt:Date.now()});return items;}
    return (stored&&stored.items)||[];
  }

  async function criteriaCandidates(txt){
    var t=String(txt||'').toLowerCase(),matched=[];
    CRITERIA.forEach(function(c){
      if(matched.length<3&&c[0].test(t)&&!matched.some(function(x){return x.path===c[1];}))matched.push({path:c[1],label:c[2]});
    });
    if(!matched.length)return {criteria:[],items:[]};
    var lists=await Promise.all(matched.map(function(c){return getCategory(c.path).catch(function(){return [];});}));
    var score={};
    lists.forEach(function(list){list.forEach(function(it){
      if(!score[it.slug])score[it.slug]=Object.assign({hits:0},it);
      score[it.slug].hits++;
    });});
    var items=Object.keys(score).map(function(s){return score[s];})
      .sort(function(a,b){return b.hits-a.hits||(b.harvests||0)-(a.harvests||0)||(b.rating||0)-(a.rating||0);})
      .slice(0,12);
    return {criteria:matched,items:items};
  }

  /* ── contexte pour le prompt ── */
  function formatRef(r,stockInfo){
    var l='• '+r.name;
    if(r.aka&&r.aka.length)l+=' (aka '+r.aka.join(', ')+')';
    if(r.type)l+=' · '+r.type;
    if(r.thc)l+=' · THC '+r.thc;
    if(r.cbd)l+=' · CBD '+r.cbd;
    if(r.parents&&r.parents.length)l+=' · Lignée : '+r.parents.join(' × ');
    if(r.flowering)l+=' · Floraison : '+r.flowering;
    if(r.difficulty)l+=' · Difficulté : '+r.difficulty;
    if(r.climate)l+=' · Climat : '+r.climate;
    if(r.rating)l+=' · Note '+r.rating+(r.harvests?' ('+r.harvests+' récoltes)':'');
    if(r.tastes&&r.tastes.length)l+=' · Goûts : '+r.tastes.join(', ');
    if(r.effects&&r.effects.length)l+=' · Effets : '+r.effects.join(', ');
    if(r.negative_effects&&r.negative_effects.length)l+=' · Effets indésirables : '+r.negative_effects.join(', ');
    if(r.breeders&&r.breeders.length)l+=' · Breeders : '+r.breeders.slice(0,8).map(function(b){return b.name;}).filter(Boolean).join(', ');
    if(r.descendants&&r.descendants.length)l+=' · Descendants : '+r.descendants.slice(0,6).map(function(d){return d.name+(d.other_parent?' (× '+d.other_parent+')':'');}).join(', ');
    if(r.summary_fr)l+=' · '+r.summary_fr;
    var st=stockInfo&&stockInfo(r.name);if(st)l+=' · '+st;
    return l;
  }

  // opts.catalogue : le catalogue du grossiste fait foi ; pas de liste de « candidats » GrowDiaries à privilégier
  async function buildContext(txt,names,stockInfo,opts){
    var list=(names||[]).filter(function(n){return n&&n.length>2;}).slice(0,3);
    var results=await Promise.all(list.map(function(n){return getStrain(n).catch(function(){return null;});}));
    var found=results.filter(Boolean),out='';
    if(found.length){
      out+='\n\n[RÉFÉRENCE GROWDIARIES — source prioritaire pour lignée, breeders et caractéristiques]\n'+found.map(function(r){return formatRef(r,stockInfo);}).join('\n');
    }
    var cand={criteria:[],items:[]};
    if(!(opts&&opts.catalogue)){try{cand=await criteriaCandidates(txt);}catch(e){}}
    if(cand.items.length){
      out+='\n\n[CANDIDATS GROWDIARIES pour les critères : '+cand.criteria.map(function(c){return c.label;}).join(', ')+'] (classés par nombre de critères remplis puis popularité)\n'+
        cand.items.map(function(i){
          var s='- '+i.name+(i.thc?' · THC '+i.thc+'%':'')+(i.rating?' · '+i.rating+'/10':'')+(i.harvests?' · '+i.harvests+' récoltes':'')+' · critères '+i.hits+'/'+cand.criteria.length;
          var st=stockInfo&&stockInfo(i.name);if(st)s+=' · '+st;
          return s;
        }).join('\n')+
        '\nPrivilégie ces variétés (en priorité celles EN STOCK) quand elles correspondent à la demande.';
    }
    return {ctx:out,coveredStrains:found.length,requestedStrains:list.length,candidates:cand.items.length};
  }

  /* ── enrichissement après réponse : les variétés recommandées entrent dans la base ── */
  async function enrichFromReply(names){
    var todo=(names||[]).filter(function(n){return n&&!get(n)&&!isFresh(cache[keyOf(n)]);}).slice(0,3);
    for(var i=0;i<todo.length;i++){try{await getStrain(todo[i]);}catch(e){}}
  }

  function get(name){
    var k=keyOf(name),r=cache[k];
    if(r&&!r.notFound)return r;
    var n=norm(name);if(!n)return null;
    for(var key in cache){
      var c=cache[key];
      if(key.indexOf('cat:')===0||!c||c.notFound||!c.name)continue;
      var names=[c.name].concat(c.aka||[]).map(norm).filter(function(x){return x.length>2;});
      if(names.some(function(x){return x===n||n.indexOf(x)>-1||x.indexOf(n)>-1;})){cache[k]=c;return c;}
    }
    return null;
  }

  window.GDRef={buildContext:buildContext,getStrain:getStrain,criteriaCandidates:criteriaCandidates,enrichFromReply:enrichFromReply,get:get};
})();
