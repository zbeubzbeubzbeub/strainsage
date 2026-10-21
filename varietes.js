/* ══════════════════════════════════════════════════════════════
   StrainSage Pro — Base de variétés (côté client)
   Lit la base importée depuis l'admin (onglet « Base de variétés ») :
   - index léger "varietes_index" (noms + alias) chargé une fois par session ;
   - fiches complètes "varietes/{id}" lues à la demande, mises en cache.

   Sert à :
   - détecter les variétés citées dans un message (noms et alias de la base) ;
   - fournir à l'IA une fiche compacte (faits utiles seulement) ;
   - relier une variété au stock par une correspondance de noms tolérante ;
   - afficher source et banques/breeders sur les cartes ;
   - chercher par critères (effets, goûts, floraison, THC…) ou par profil proche d'une variété.

   Utilise db défini dans index.html.
══════════════════════════════════════════════════════════════ */
(function(){
  var COL='varietes', IDX='varietes_index';
  var MAX_FICHES=4, MAX_STOCK=80;

  var entries=[], byKey={}, byCompact={}, keys=[], loaded=false, loading=null;
  var docs={}, pendingDocs={};

  /* ── normalisation (identique à l'admin) ── */
  function nrm(s){return String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[™®©]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
  function noAcc(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'');}
  function escRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

  // mots qui sont aussi des descripteurs courants : un nom de variété composé d'un seul de ces mots
  // n'est détecté que s'il est écrit avec une majuscule (« Gelato » oui, « un goût gelato » non)
  var GENERIC=['indica','sativa','hybride','hybrid','auto','autos','kush','haze','og','cbd','thc','skunk','cheese','diesel','cookies','cookie','gelato','lemon','citron','lime','purple','fruit','fruity','fruite','sweet','sour','blue','white','black','green','red','gold','orange','cherry','grape','mango','banana','strawberry','berry','berries','candy','cake','cream','ice','fire','super','big','mega','fast','early','critical','sugar','honey','mint','menthe','pine','pin','earth','gas','fuel','glue','punch','pie','dream','widow','amnesia','power','relax','sleep','happy','energy','gorilla','zkittlez','runtz','jack','bubble','gum','vanilla','coffee','chocolate','tropical','tropicale','melon','peach','apple','papaya','pineapple','grapefruit','tangerine','tangie','garlic','ail','skunky','musk','haze','afghan','hash','maroc','bio','xl','xxl','cbd'];

  /* ── index ── */
  function load(){
    if(loaded)return Promise.resolve(entries);
    if(loading)return loading;
    loading=(async function(){
      try{
        var meta=await db.collection(IDX).doc('meta').get();
        var parts=meta.exists?(meta.data().parts||0):0;
        var snaps=await Promise.all(Array.from({length:parts},function(_,i){return db.collection(IDX).doc('part_'+i).get();}));
        var list=[];
        snaps.forEach(function(s){if(!s.exists)return;(s.data().entries||[]).forEach(function(e){var p=String(e).split('|');list.push({id:p[0],nom:p[1]||p[0],alias:p.slice(2).filter(Boolean)});});});
        entries=list;byKey={};byCompact={};keys=[];
        list.forEach(function(e){
          [e.nom].concat(e.alias).forEach(function(n,i){
            var k=nrm(n);if(!k)return;
            if(!byKey[k])byKey[k]=e;
            var c=k.replace(/ /g,'');if(!byCompact[c])byCompact[c]=e;
            // un nom purement numérique (« 1969 », « 2090 ») n'est pas cherché dans les messages : années, budgets, quantités
            if(k.length>=3&&!/^[\d ]+$/.test(k))keys.push({k:k,e:e,raw:n,isAlias:i>0});
          });
        });
        keys.sort(function(a,b){return b.k.length-a.k.length;});
        loaded=list.length>0;
        if(!list.length){loading=null;console.warn('[VarDB] index vide : la base n\'a pas encore été importée ou l\'index doit être reconstruit (admin → Base de variétés)');}
        console.info('[VarDB] index chargé : '+entries.length+' noms (collection '+IDX+')');
      }catch(e){
        // on ne marque PAS la base comme chargée : le prochain message retentera la lecture
        console.error('[VarDB] lecture de l\'index impossible ('+(e&&e.code||'erreur')+') : '+(e&&e.message)+'. Nouvel essai au prochain message.');
        loading=null;
      }
      return entries;
    })();
    return loading;
  }

  /* ── résolution tolérante d'un nom (majuscules, accents, ponctuation, alias, suffixes de graine) ── */
  var SUFFIX=/\s+(auto|autoflower|autoflowering|autofloraison|fem|feminized|feminised|feminisee|feminisees|feminises|regular|reguliere|regulieres|reg|fast|fastversion|fast version|f1|cbd|xl|xxl|seeds?|graines?|\d+\s*(?:graines?|seeds?|x|pcs?))$/;
  function resolve(name){
    var k=nrm(name);if(!k)return null;
    var tries=[k];
    var noParen=nrm(String(name).replace(/\([^)]*\)/g,' '));if(noParen&&noParen!==k)tries.push(noParen);
    var cut=k,prev;do{prev=cut;cut=cut.replace(SUFFIX,'').trim();if(cut&&cut!==prev)tries.push(cut);}while(cut!==prev);
    for(var i=0;i<tries.length;i++){
      if(byKey[tries[i]])return byKey[tries[i]];
      var c=tries[i].replace(/ /g,'');if(byCompact[c])return byCompact[c];
    }
    return null;
  }
  function idOf(name){var e=resolve(name);return e?e.id:null;}

  /* ── détection des variétés citées dans un message ── */
  function detect(txt,max){
    if(!keys.length||!txt)return [];
    var msg=' '+nrm(txt)+' ',orig=noAcc(txt),found=[],taken=[];
    for(var i=0;i<keys.length;i++){
      var c=keys[i],pos=msg.indexOf(' '+c.k+' ');
      if(pos<0)continue;
      // déjà couvert par un nom plus long (ex. « Gelato 41 » couvre « Gelato »)
      if(taken.some(function(t){return pos>=t[0]&&pos+c.k.length<=t[1];}))continue;
      if(c.k.indexOf(' ')<0&&GENERIC.indexOf(c.k)>-1){
        var w=noAcc(c.raw).trim(),re=new RegExp('(^|[^A-Za-z0-9])'+escRe(w.charAt(0).toUpperCase()+w.slice(1))+'([^A-Za-z0-9]|$)');
        if(!re.test(orig))continue;
      }
      taken.push([pos,pos+c.k.length]);
      if(found.indexOf(c.e)<0)found.push(c.e);
      if(found.length>=(max||5))break;
    }
    return found;
  }

  /* ── fiches complètes ── */
  function fetchDoc(id){
    if(docs[id]!==undefined)return Promise.resolve(docs[id]);
    if(pendingDocs[id])return pendingDocs[id];
    pendingDocs[id]=db.collection(COL).doc(id).get().then(function(s){docs[id]=s.exists?s.data():null;delete pendingDocs[id];return docs[id];}).catch(function(){delete pendingDocs[id];return null;});
    return pendingDocs[id];
  }
  async function get(name){await load();var e=resolve(name);return e?fetchDoc(e.id):null;}
  function cached(name){var e=resolve(name);return e&&docs[e.id]?docs[e.id]:null;}
  async function prefetch(names,timeoutMs){
    await load();
    var ids=[];(names||[]).forEach(function(n){var e=resolve(n);if(e&&ids.indexOf(e.id)<0)ids.push(e.id);});
    if(!ids.length)return;
    var all=Promise.all(ids.slice(0,12).map(fetchDoc));
    if(!timeoutMs)return all;
    return Promise.race([all,new Promise(function(r){setTimeout(r,timeoutMs);})]);
  }

  /* ── fiche compacte pour l'IA ── */
  function range(a,b,unit){if(a==null&&b==null)return null;if(a===b||b==null)return a+(unit||'');if(a==null)return '≤'+b+(unit||'');return a+'–'+b+(unit||'');}
  function head(l,n){return (l||[]).slice(0,n).join(', ');}
  function banques(f){var seen={},out=[];(f.produits||[]).forEach(function(p){var b=p&&p.breeder;if(!b)return;var k=nrm(b);if(seen[k])return;seen[k]=1;out.push(b);});return out;}
  function domain(u){try{return new URL(u).hostname.replace(/^www\./,'');}catch(e){return u;}}
  function compact(f,stockInfo,noShops){
    var l='• '+f.nom;
    if(f.alias&&f.alias.length)l+=' (aka '+head(f.alias,4)+')';
    var t=f.type?f.type+(f.dominante&&f.type==='hybride'?' à dominante '+f.dominante:''):null;if(t)l+=' · '+t;
    if(f.autofloraison===true)l+=' · autofloraison';
    var thc=range(f.thc_min,f.thc_max,'%');if(thc)l+=' · THC '+thc;
    var cbd=range(f.cbd_min,f.cbd_max,'%');if(cbd)l+=' · CBD '+cbd;
    if(f.parents&&f.parents.length)l+=' · Lignée : '+f.parents.join(' × ');
    if(f.breeder_createur)l+=' · Créateur : '+f.breeder_createur;
    var fl=range(f.floraison_sem_min,f.floraison_sem_max,' sem.');if(fl)l+=' · Floraison '+fl;
    if(f.difficulte)l+=' · Difficulté '+f.difficulte;
    if(f.hauteur)l+=' · Hauteur '+f.hauteur;
    if(f.rendement)l+=' · Rendement '+f.rendement;
    var env=['indoor','outdoor','serre'].filter(function(k){return f[k]===true;});if(env.length)l+=' · '+env.join('/');
    if(f.effets&&f.effets.length)l+=' · Effets : '+head(f.effets,5);
    if(f.effets_indesirables&&f.effets_indesirables.length)l+=' · Indésirables : '+head(f.effets_indesirables,3);
    if(f.gouts&&f.gouts.length)l+=' · Goûts : '+head(f.gouts,5);
    if(f.terpenes&&f.terpenes.length)l+=' · Terpènes : '+head(f.terpenes,4);
    var b=noShops?[]:banques(f);if(b.length)l+=' · Dispo chez (banques/breeders) : '+b.slice(0,8).join(', ')+(b.length>8?' (+'+(b.length-8)+')':'');
    if(f.descendants&&f.descendants.length)l+=' · Descendants : '+f.descendants.slice(0,4).map(function(d){return d.nom;}).join(', ');
    if(f.sources&&f.sources.length)l+=' · Source : '+domain(f.sources[0].url);
    var st=stockInfo&&stockInfo(f.nom);if(st)l+=' · '+st;
    return l;
  }

  /* ── contexte pour buildCtx ── */
  // opts.catalogue : le catalogue du grossiste est chargé ; les fiches ne servent alors qu'à décrire la génétique
  async function buildContext(txt,extraNames,stockInfo,opts){
    var cat=!!(opts&&opts.catalogue);
    await load();
    var picked=detect(txt,MAX_FICHES);
    var missing=[];
    (extraNames||[]).forEach(function(n){
      var e=resolve(n);
      if(e){if(picked.indexOf(e)<0&&picked.length<MAX_FICHES)picked.push(e);}
      else missing.push(n);
    });
    var fiches=(await Promise.all(picked.map(function(e){return fetchDoc(e.id);}))).filter(Boolean);
    var ctx='';
    if(fiches.length){
      ctx='\n\n[BASE STRAINSAGE — base de variétés de la boutique, source PRIORITAIRE : ces faits priment sur tes connaissances et sur le web, ne les contredis pas]\n'+
        fiches.map(function(f){return compact(f,stockInfo,cat);}).join('\n')+
        (cat?'\nUtilise ces valeurs pour décrire la génétique (lignée, effets, goûts, THC, floraison). Ces fiches ne disent pas ce qui est en vente : seul le catalogue du grossiste fait foi pour les variétés, déclinaisons, packs et prix. Une info absente est inconnue : dis-le plutôt que d\'inventer.':
        '\nUtilise ces valeurs dans le JSON des cartes (THC, CBD, floraison, lignée). Pour « où acheter » ou le champ seedbank, choisis parmi les banques/breeders listés après « Dispo chez ». Une info absente de la fiche est inconnue : dis-le plutôt que d\'inventer.');
    }
    return {ctx:ctx,found:fiches.map(function(f){return f.nom;}),detected:picked.map(function(e){return e.nom;}),missing:missing,size:entries.length};
  }

  /* ── stock enrichi par la base ── */
  async function stockFacts(stock){
    await load();
    var out={};if(!stock||!stock.length||!entries.length)return out;
    var items=stock.slice(0,MAX_STOCK).map(function(s,i){var e=resolve(s.nom);return e?{i:i,e:e}:null;}).filter(Boolean);
    var got=await Promise.all(items.map(function(x){return fetchDoc(x.e.id);}));
    items.forEach(function(x,j){
      var f=got[j];if(!f)return;
      var p=[];
      if(f.type)p.push(f.type);
      var thc=range(f.thc_min,f.thc_max,'%');if(thc)p.push('THC '+thc);
      var fl=range(f.floraison_sem_min,f.floraison_sem_max,' sem.');if(fl)p.push('flo '+fl);
      if(f.effets&&f.effets.length)p.push(head(f.effets,3));
      if(f.gouts&&f.gouts.length)p.push(head(f.gouts,3));
      if(p.length)out[x.i]='[base : '+p.join(' · ')+']';
    });
    return out;
  }


  /* ══ RECHERCHE PAR CRITÈRES ══
     Les facettes (faits compacts de chaque fiche) sont chargées à la première demande par critères.
     Une phrase libre est traduite en critères : effets, goûts, type, THC, CBD, floraison, culture…
     Chaque fiche reçoit un score = part des critères remplis ; les critères « à éviter » retirent des points. */
  var facets=null, facetsLoading=null;
  function loadFacets(){
    if(facets)return Promise.resolve(facets);
    if(facetsLoading)return facetsLoading;
    facetsLoading=(async function(){
      var list=[];
      try{
        var meta=await db.collection(IDX).doc('meta').get();
        var n=meta.exists?(meta.data().fparts||0):0;
        var snaps=await Promise.all(Array.from({length:n},function(_,i){return db.collection(IDX).doc('f_'+i).get();}));
        var byId={};entries.forEach(function(e){byId[e.id]=e;});
        snaps.forEach(function(s){if(!s.exists)return;(s.data().entries||[]).forEach(function(str){
          var p=String(str).split('|');
          var num=function(v){return v===''||v===undefined?null:parseFloat(v);};
          var lst=function(v){return v?v.split(','):[];};
          var e=byId[p[0]];
          list.push({id:p[0],e:e,nom:e?e.nom:p[0],type:p[1],dom:p[2],thcMin:num(p[3]),thcMax:num(p[4]),cbdMax:num(p[5]),floMin:num(p[6]),floMax:num(p[7]),
            auto:p[8]==='1'?true:p[8]==='0'?false:(e&&/\bauto\b/.test(nrm(e.nom))?true:null),
            diff:p[9],haut:p[10],rend:p[11],env:p[12]||'',mold:p[13]==='1'?true:p[13]==='0'?false:null,nProd:parseInt(p[14]||'0',10)||0,
            eff:lst(p[15]),neg:lst(p[16]),gouts:lst(p[17]),terps:lst(p[18])});
        });});
      }catch(e){console.warn('[VarDB] facettes illisibles',e&&e.message);}
      facets=list;return list;
    })();
    return facetsLoading;
  }

  // q : repérage dans la demande (texte normalisé, sans accents) · d : repérage dans les valeurs de la fiche (FR et EN)
  var EFFECTS=[
    {k:'relax',l:'relaxant',q:/\b(relax\w*|detente|detendre|detendu\w*|calme\w*|apais\w*|chill\w*|zen|decompress\w*|tranquille\w*|stress\w*)\b/,d:/\b(relax\w*|calm\w*|chill\w*|detente|apais\w*|tranquil\w*|peace\w*|paisib\w*)\b/},
    {k:'sleep',l:'sommeil',q:/\b(dormir|sommeil\w*|endorm\w*|insomni\w*|sleep\w*|sedati\w*|soir\w*|nuit|couch\w*|canape)\b/,d:/\b(sleep\w*|sommeil\w*|sedat\w*|somnol\w*|couch\w*|drows\w*|tired|fatigu\w*|endorm\w*)\b/},
    {k:'energy',l:'énergisant',q:/\b(energ\w*|stimul\w*|dynami\w*|peche|motiv\w*|reveil\w*|matin\w*|journee|actif|active|boost\w*|uplift\w*|tonique\w*)\b/,d:/\b(energ\w*|stimul\w*|uplift\w*|dynami\w*|active|motiv\w*|alert\w*|awake)\b/},
    {k:'euphoria',l:'euphorique',q:/\b(euphori\w*|joie|joyeu\w*|heureu\w*|happy|humeur|rire|rigol\w*|giggl\w*|fun|festi\w*|fete|planer|planant\w*)\b/,d:/\b(euphor\w*|happy|heureu\w*|joy\w*|giggl\w*|rire|gai\w*|blissful)\b/},
    {k:'creative',l:'créatif',q:/\b(creati\w*|inspir\w*|artist\w*|musique|ecrire|dessin\w*|imagin\w*)\b/,d:/\b(creat\w*|inspir\w*|imagin\w*)\b/},
    {k:'focus',l:'concentration',q:/\b(concentr\w*|focus\w*|bosser|etudi\w*|productiv\w*|lucide\w*)\b/,d:/\b(focus\w*|concentr\w*|clear\w*|lucid\w*)\b/},
    {k:'social',l:'sociable',q:/\b(social\w*|sociable\w*|bavard\w*|potes|amis|soiree\w*|talkativ\w*|apero)\b/,d:/\b(talk\w*|social\w*|bavard\w*|sociab\w*)\b/},
    {k:'hungry',l:'appétit',q:/\b(appetit|faim|munch\w*|hungry)\b/,d:/\b(hungr\w*|appetit\w*|faim|munch\w*)\b/},
    {k:'pain',l:'douleurs',q:/\b(douleur\w*|migrain\w*|arthr\w*|inflamm\w*|courbatur\w*|musculaire\w*|mal de dos)\b/,d:/\b(pain\w*|douleur\w*|inflam\w*|muscl\w*|analges\w*)\b/}
  ];
  var TASTES=[
    {k:'fruity',l:'fruité',q:/\b(frui\w*)\b/,d:/\b(fruit\w*|berr\w*|baie\w*|citr\w*|agrum\w*|tropic\w*|mango\w*|mangue\w*|grape\w*|raisin\w*|apple\w*|pomme\w*|peach\w*|peche\w*|cherr\w*|ceris\w*|strawberr\w*|fraise\w*|melon\w*|banan\w*|pineapple\w*|ananas|lemon\w*|citron\w*|orange\w*|lime\w*|grapefruit\w*|pamplemousse\w*|blueberr\w*|myrtille\w*|passion\w*|papay\w*|plum\w*|prune\w*|kiwi\w*|guava|goyave|apricot\w*|abricot\w*)\b/},
    {k:'citrus',l:'agrumes',q:/\b(citron\w*|lemon\w*|agrum\w*|citrus|lime|orange\w*|pamplemousse\w*|grapefruit\w*|mandarine\w*|tangerine\w*|zest\w*|acidul\w*)\b/,d:/\b(citr\w*|lemon\w*|lime\w*|orange\w*|agrum\w*|grapefruit\w*|pamplemousse\w*|tangerin\w*|mandarin\w*)\b/},
    {k:'tropical',l:'tropical',q:/\b(tropica\w*|mangue\w*|mango\w*|ananas|pineapple\w*|passion|papaye\w*|papaya\w*|exotique\w*|coco)\b/,d:/\b(tropic\w*|mango\w*|mangue\w*|pineapple\w*|ananas|passion\w*|papay\w*|coconut\w*|coco|guava|goyave|exoti\w*|banan\w*|kiwi\w*)\b/},
    {k:'berry',l:'fruits rouges',q:/\b(baies?|berr\w*|fraise\w*|framboise\w*|myrtille\w*|cassis|mures?|fruits rouges)\b/,d:/\b(berr\w*|baie\w*|fraise\w*|strawberr\w*|framboi\w*|raspberr\w*|myrtil\w*|blueberr\w*|cassis|mure\w*|blackberr\w*)\b/},
    {k:'grape',l:'raisin',q:/\b(raisin\w*|grape\w*)\b/,d:/\b(grape\w*|raisin\w*|wine|vin)\b/},
    {k:'sweet',l:'sucré',q:/\b(sucr\w*|sweet\w*|bonbon\w*|candy|miel|honey|vanill\w*|dessert\w*|gourmand\w*|caramel\w*|cream\w*|cremeu\w*)\b/,d:/\b(sweet\w*|sucr\w*|candy|bonbon\w*|honey|miel|vanill\w*|caramel\w*|cream\w*|crem\w*|dessert\w*|sugar\w*|gourmand\w*)\b/},
    {k:'earthy',l:'terreux',q:/\b(terreu\w*|earth\w*|boise\w*|woody|musqu\w*|hash\w*)\b/,d:/\b(earth\w*|terreu\w*|terre|wood\w*|bois\w*|musk\w*|musqu\w*|hash\w*|soil)\b/},
    {k:'pine',l:'pin',q:/\b(pin|pins|sapin\w*|resin\w*|conifere\w*)\b/,d:/\b(pine|pin|sapin\w*|resin\w*|conif\w*|fir)\b/},
    {k:'fuel',l:'diesel / gaz',q:/\b(diesel|fuel|gas|gaz|essence|carburant\w*|chem\w*|chimique\w*)\b/,d:/\b(diesel|fuel\w*|gas\w*|gaz|petrol\w*|chemic\w*|chimiq\w*|ammon\w*)\b/},
    {k:'skunk',l:'skunk',q:/\b(skunk\w*|putois)\b/,d:/\b(skunk\w*|putois|pungent\w*)\b/},
    {k:'spicy',l:'épicé',q:/\b(epic\w*|poivr\w*|spic\w*|pepper\w*|piquant\w*)\b/,d:/\b(spic\w*|epic\w*|pepper\w*|poivr\w*|clove\w*|girofle|cinnamon|cannelle)\b/},
    {k:'cheese',l:'fromage',q:/\b(fromage\w*|cheese\w*)\b/,d:/\b(chees\w*|fromag\w*)\b/},
    {k:'garlic',l:'ail',q:/\b(ail|garlic|oignon\w*|onion\w*)\b/,d:/\b(garlic|ail|onion\w*|oignon\w*)\b/},
    {k:'mint',l:'menthe',q:/\b(menthe\w*|mint\w*|menthol\w*)\b/,d:/\b(mint\w*|menth\w*)\b/},
    {k:'floral',l:'floral',q:/\b(floral\w*|lavand\w*|fleuri\w*)\b/,d:/\b(floral\w*|flower\w*|fleur\w*|lavend\w*|lavand\w*|rose|violet\w*)\b/},
    {k:'coffee',l:'café / chocolat',q:/\b(cafe|coffee|chocolat\w*|cacao|cocoa)\b/,d:/\b(coffee|cafe|chocolat\w*|cacao|cocoa)\b/},
    {k:'herbal',l:'herbacé',q:/\b(herbac\w*|herbal)\b/,d:/\b(herb\w*|tea|the)\b/}
  ];
  var AVOID=[
    {k:'noparano',l:'sans parano ni anxiété',q:/\b(parano\w*|anxi\w*|angoiss\w*|panique\w*|bad trip|crise)\b/,d:/\b(parano\w*|anxi\w*|angoiss\w*|panic\w*|paniqu\w*)\b/},
    {k:'nodizzy',l:'sans vertiges',q:/\b(vertige\w*|tourni\w*|dizz\w*)\b/,d:/\b(dizz\w*|vertig\w*)\b/},
    {k:'nohead',l:'sans maux de tête',q:/\b(mal de tete|maux de tete|migraine\w*|headache\w*)\b/,d:/\b(headache\w*|mal de tete|migrain\w*)\b/}
  ];
  var NEG=/\b(pas|sans|evite\w*|eviter|non|aucun\w*|deteste\w*|horreur|plus jamais|n aime pas|naime pas|j aime pas|jaime pas|hors de question)\s+(\w+\s+){0,3}$/;
  function negated(msg,idx){return NEG.test(msg.slice(Math.max(0,idx-40),idx));}

  function parseCriteria(txt,drop){
    var msg=' '+nrm(txt)+' ',out=[];
    function add(c){if(!out.some(function(x){return x.k===c.k;}))out.push(c);}
    EFFECTS.concat(TASTES).forEach(function(c){
      var m=c.q.exec(msg);if(!m)return;
      var fam=EFFECTS.indexOf(c)>-1?'eff':'gout';
      if(negated(msg,m.index))add({k:'no-'+c.k,l:'pas '+c.l,fam:'avoid',w:1,test:function(f){return f[fam==='eff'?'eff':'gouts'].some(function(t){return c.d.test(t);})?-1:0;}});
      else add({k:c.k,l:c.l,fam:fam,w:1,test:function(f){return f[fam==='eff'?'eff':'gouts'].some(function(t){return c.d.test(t);})?1:0;}});
    });
    AVOID.forEach(function(c){if(c.q.test(msg))add({k:c.k,l:c.l,fam:'avoid',w:1,test:function(f){return f.neg.some(function(t){return c.d.test(t);})?-1:0;}});});
    // type
    var wantI=/\bindica\b/.test(msg),wantS=/\bsativa\b/.test(msg);
    if(wantI&&!wantS)add({k:'indica',l:'indica',fam:'type',w:1.2,test:function(f){return f.type==='i'?1:(f.type==='h'&&f.dom==='i')?0.7:0;}});
    else if(wantS&&!wantI)add({k:'sativa',l:'sativa',fam:'type',w:1.2,test:function(f){return f.type==='s'?1:(f.type==='h'&&f.dom==='s')?0.7:0;}});
    else if(/\bhybride?s?\b/.test(msg))add({k:'hybride',l:'hybride',fam:'type',w:1,test:function(f){return f.type==='h'?1:0;}});
    // autofloraison
    if(/\b(auto|autos|autofloraison\w*|autoflo\w*|automatique\w*)\b/.test(msg)&&!/\bphotoperiod\w*/.test(msg))add({k:'auto',l:'autofloraison',fam:'culture',w:1.5,test:function(f){return f.auto===true?1:0;}});
    else if(/\b(photoperiod\w*|photo period\w*|non auto)\b/.test(msg))add({k:'photo',l:'photopériode',fam:'culture',w:1.2,test:function(f){return f.auto===false||(f.auto===null&&f.e&&!/\bauto\b/.test(nrm(f.nom)))?1:0;}});
    // floraison
    var mw=msg.match(/\b(?:moins de|max\w*|en|sous|pas plus de)\s*(\d{1,2})\s*(?:sem\w*|weeks?)\b/),md=msg.match(/\b(?:moins de|max\w*|en|sous)\s*(\d{2,3})\s*(?:jours|j)\b/);
    var floMax=mw?parseInt(mw[1],10):md?Math.round(parseInt(md[1],10)/7):(/\b(floraison|flo|fleurit|fleurir|recolte)\s+(\w+\s+)?(courte|rapide|vite|express)\b|\b(courte|rapide)\s+floraison\b|\b(fast|express)\b|\brapide a (fleurir|recolter)\b/.test(msg)?8:null);
    if(floMax)add({k:'flo',l:'floraison ≤ '+floMax+' sem.',fam:'culture',w:1.3,test:function(f){var v=f.floMax!=null?f.floMax:f.floMin;return v==null?0:v<=floMax?1:v<=floMax+1?0.4:0;}});
    else if(/\bfloraison\s+(\w+\s+)?longue\b/.test(msg))add({k:'flolong',l:'floraison longue',fam:'culture',w:1,test:function(f){var v=f.floMin!=null?f.floMin:f.floMax;return v!=null&&v>=10?1:0;}});
    // THC
    var lt=msg.match(/\b(?:moins de|max\w*|pas plus de|sous)\s*(\d{1,2})\s*(?:%|pourcent|pc)?\s*(?:de\s+)?thc\b/)||msg.match(/\bthc\s*(?:<|inferieur a|sous|max\w*)\s*(\d{1,2})/);
    var gt=msg.match(/\b(?:plus de|au moins|minimum|min|>)\s*(\d{1,2})\s*(?:%|pourcent|pc)?\s*(?:de\s+)?thc\b/)||msg.match(/\bthc\s*(?:>|superieur a|au moins|min\w*|plus de)\s*(\d{1,2})/);
    var light=/\b(pas trop fort\w*|pas forte?s?|trop forte?s?|leger\w*|legere\w*|doux|douce|faible\w* thc|thc faible|soft|modere\w*)\b/.test(msg);
    var strong=!light&&/\b(fort|forte|forts|fortes|puissant\w*|costaud\w*|defonc\w*|tres fort\w*|percutant\w*|thc eleve|beaucoup de thc|haut thc|high thc)\b/.test(msg);
    if(gt)add({k:'thcgt',l:'THC ≥ '+gt[1]+' %',fam:'chimie',w:1.2,test:function(f){return f.thcMax==null?0:f.thcMax>=+gt[1]?1:0;}});
    else if(strong)add({k:'strong',l:'puissante (THC ≥ 22 %)',fam:'chimie',w:1.1,test:function(f){return f.thcMax==null?0:f.thcMax>=22?1:f.thcMax>=20?0.5:0;}});
    if(lt)add({k:'thclt',l:'THC ≤ '+lt[1]+' %',fam:'chimie',w:1.2,test:function(f){var v=f.thcMax!=null?f.thcMax:f.thcMin;return v==null?0:v<=+lt[1]?1:0;}});
    else if(light)add({k:'light',l:'douce (THC ≤ 17 %)',fam:'chimie',w:1.1,test:function(f){var v=f.thcMax!=null?f.thcMax:f.thcMin;return v==null?0:v<=17?1:v<=19?0.5:0;}});
    // CBD
    if(/\bcbd\b/.test(msg))add({k:'cbd',l:'riche en CBD',fam:'chimie',w:1.3,test:function(f){return f.cbdMax==null?0:f.cbdMax>=4?1:f.cbdMax>=1?0.3:0;}});
    // culture
    if(/\b(debutant\w*|facile\w*|simple a cultiver|novice\w*|premiere fois|premier grow|easy)\b/.test(msg))add({k:'facile',l:'facile à cultiver',fam:'culture',w:1.2,test:function(f){return f.diff==='f'?1:f.diff==='m'?0.4:0;}});
    else if(/\b(expert\w*|difficile\w*|exigeant\w*|challenge)\b/.test(msg))add({k:'difficile',l:'pour expert',fam:'culture',w:1,test:function(f){return f.diff==='d'?1:0;}});
    if(/\b(compact\w*|petite plante|petit\w* taille|discret\w*|discrete\w*|placard\w*|stealth|pas trop grande?)\b/.test(msg))add({k:'compacte',l:'compacte',fam:'culture',w:1,test:function(f){return f.haut==='c'?1:f.haut==='m'?0.3:0;}});
    else if(/\b(grande plante|tres grande?|geante?|haute taille)\b/.test(msg))add({k:'grande',l:'grande taille',fam:'culture',w:1,test:function(f){return f.haut==='g'?1:0;}});
    if(/\b(gros rendement|rendement (eleve|important|max\w*|enorme|xxl)|tres productive?|productive?s?|grosse recolte|max de recolte)\b/.test(msg))add({k:'rend',l:'rendement élevé',fam:'culture',w:1,test:function(f){return f.rend==='e'?1:f.rend==='m'?0.3:0;}});
    if(/\b(outdoor|exterieur\w*|dehors|jardin\w*|balcon\w*|terrasse\w*|plein air|plein champ)\b/.test(msg))add({k:'outdoor',l:'outdoor',fam:'culture',w:1,test:function(f){return f.env.indexOf('o')>-1?1:0;}});
    if(/\b(indoor|interieur\w*|placard\w*|tente\w*|chambre de culture|growbox|grow box|sous lampe\w*)\b/.test(msg))add({k:'indoor',l:'indoor',fam:'culture',w:1,test:function(f){return f.env.indexOf('i')>-1?1:0;}});
    if(/\b(serre\w*|greenhouse)\b/.test(msg))add({k:'serre',l:'serre',fam:'culture',w:1,test:function(f){return f.env.indexOf('s')>-1?1:0;}});
    if(/\b(moisissure\w*|mildiou|botrytis|humid\w*|pluie\w*|pluvieu\w*|pays basque|bord de mer)\b/.test(msg))add({k:'mold',l:'résiste à l\'humidité',fam:'culture',w:1.1,test:function(f){return f.mold===true?1:0;}});
    // critères retirés par le client (bouton × du bandeau)
    if(drop&&drop.length)out=out.filter(function(c){return drop.indexOf(c.k)<0;});
    return out;
  }

  var SIMILAR=/\b(similaire\w*|comme|proche\w*|ressembl\w*|alternative\w*|equivalent\w*|meme genre|meme style|meme profil|genre de|dans le style|qui rappelle\w*)\b/;
  function jacc(a,b){if(!a.length||!b.length)return 0;var n=0;a.forEach(function(x){if(b.indexOf(x)>-1)n++;});return n/(a.length+b.length-n);}

  // opts : {exclude:[noms], stockInfo:fn(nom)→'EN STOCK'|'', limit, similarTo:entrée}
  async function search(txt,opts){
    opts=opts||{};
    await load();
    var crit=parseCriteria(txt,opts.drop),ref=null;
    var detected=opts.detected||detect(txt,3);
    var wantSimilar=SIMILAR.test(' '+nrm(txt)+' ')&&detected.length>0;
    if(!crit.length&&!wantSimilar)return {criteria:[],items:[],total:0,similarTo:null};
    var all=await loadFacets();
    if(!all.length)return {criteria:crit,items:[],total:0,similarTo:null,noFacets:true};
    if(wantSimilar){ref=all.find(function(f){return f.id===detected[0].id;})||null;}
    // un critère que la base ne renseigne pour aucune fiche (ex. outdoor) est écarté du calcul et signalé
    var unsupported=crit.filter(function(c){return !all.some(function(f){return c.test(f)!==0;});});
    crit=crit.filter(function(c){return unsupported.indexOf(c)<0;});
    if(!crit.length&&!ref)return {criteria:[],unsupported:unsupported,items:[],total:0,similarTo:null};
    var excl=(opts.exclude||[]).map(nrm).filter(Boolean);
    var skip={};detected.forEach(function(e){skip[e.id]=1;});
    var pos=crit.filter(function(c){return c.fam!=='avoid';}),wsum=pos.reduce(function(s,c){return s+c.w;},0);
    var scored=[];
    all.forEach(function(f){
      if(skip[f.id]&&ref)return;
      var nn=nrm(f.nom);
      if(excl.some(function(x){return x.length>2&&(nn===x||nn.indexOf(x)>-1);}))return;
      var hits=0,sc=0,hitLabels=[],strong=0;
      crit.forEach(function(c){var v=c.test(f);if(c.fam==='avoid'){sc+=v*0.6;}else if(v>0){sc+=v*c.w;hits++;if(v>=0.7){hitLabels.push(c.l);strong++;}}});
      var score=wsum?sc/wsum:0;
      if(ref){
        var sim=jacc(f.eff,ref.eff)*0.4+jacc(f.gouts,ref.gouts)*0.35+jacc(f.terps,ref.terps)*0.15+(f.type&&f.type===ref.type?0.1:0);
        score=wsum?score*0.5+sim*0.5:sim;
        if(sim<0.12)return;
      }else if(!hits)return;
      var st=opts.stockInfo&&opts.stockInfo(f.nom);
      scored.push({f:f,score:score+(st==='EN STOCK'?0.15:0)+Math.min(f.nProd,30)/600,hits:hits,hitLabels:hitLabels,stock:st||'',all:strong===pos.length});
    });
    scored.sort(function(a,b){return b.score-a.score;});
    // total = variétés qui remplissent tous les critères (ou, en mode « profil proche », toutes les proches retenues)
    var full=ref&&!pos.length?scored.length:scored.filter(function(x){return x.all;}).length;
    return {criteria:crit,unsupported:unsupported,items:scored.slice(0,opts.limit||12),total:full,partial:scored.length,similarTo:ref?ref.nom:null};
  }

  function facetLine(it){
    var f=it.f,p=[];
    var t={i:'indica',s:'sativa',h:'hybride'}[f.type];if(t)p.push(t+(f.type==='h'&&f.dom&&f.dom!=='e'?' ('+({i:'indica',s:'sativa'})[f.dom]+')':''));
    if(f.auto===true)p.push('auto');
    if(f.thcMax!=null)p.push('THC '+(f.thcMin!=null&&f.thcMin!==f.thcMax?f.thcMin+'–':'')+f.thcMax+'%');
    if(f.cbdMax!=null&&f.cbdMax>=1)p.push('CBD '+f.cbdMax+'%');
    if(f.floMin!=null||f.floMax!=null)p.push('flo '+(f.floMin!=null&&f.floMax!=null&&f.floMin!==f.floMax?f.floMin+'–'+f.floMax:(f.floMax!=null?f.floMax:f.floMin))+' sem.');
    if(f.eff.length)p.push('effets : '+f.eff.slice(0,4).join(', '));
    if(f.gouts.length)p.push('goûts : '+f.gouts.slice(0,4).join(', '));
    if(f.nProd)p.push(f.nProd+' banque'+(f.nProd>1?'s':''));
    if(it.stock)p.push(it.stock);
    return '- '+f.nom+' · '+p.join(' · ')+(it.hitLabels.length?' · ✓ '+it.hitLabels.join(', '):'');
  }
  async function criteriaContext(txt,opts){
    var r=await search(txt,opts);
    if(!r.items.length)return {ctx:'',info:r};
    var head=r.similarTo?'variétés au profil proche de '+r.similarTo+(r.criteria.length?' et correspondant à : '+r.criteria.map(function(c){return c.l;}).join(', '):''):'critères : '+r.criteria.map(function(c){return c.l;}).join(', ');
    // fiches complètes des 3 premières : banques/breeders et sources
    var top=await Promise.all(r.items.slice(0,3).map(function(it){return fetchDoc(it.f.id);}));
    var ctx='\n\n[CANDIDATS BASE STRAINSAGE — '+head+'] '+(r.total?r.total+' variété(s) de la base remplissent tous les critères':'aucune variété ne remplit tous les critères, voici les plus proches')+' ; voici les mieux classées (critères remplis, puis stock, puis disponibilité) :\n'+
      r.items.map(facetLine).join('\n')+
      (top.filter(Boolean).length?'\nDétail des 3 premières :\n'+top.filter(Boolean).map(function(f){return compact(f,opts&&opts.stockInfo);}).join('\n'):'')+
      (r.unsupported&&r.unsupported.length?'\nLa base ne renseigne pas : '+r.unsupported.map(function(c){return c.l;}).join(', ')+' — vérifie ces points avec tes connaissances et signale-le au client.':'')+
      '\nRecommande en priorité parmi ces candidats (d\'abord ceux EN STOCK), avec leurs vraies valeurs. N\'invente pas de variété hors de cette liste sans le signaler.';
    return {ctx:ctx,info:r};
  }


  /* ══ ARBRE GÉNÉALOGIQUE ══
     Remonte les parents de fiche en fiche (jusqu à 4 générations, 3 parents max par nœud).
     Un parent absent de la base reste affiché avec son seul nom. */
  async function lineage(name,depth){
    depth=depth||3;await load();
    var seen={};
    async function node(n,level){
      var e=resolve(n),f=e?await fetchDoc(e.id):null;
      var key=e?e.id:'n:'+nrm(n);
      var out={nom:f?f.nom:cleanParent(n),type:f&&f.type||'',photo:f&&f.photos&&f.photos.length?f.photos[0]:'',known:!!f,parents:[]};
      if(seen[key]||level>=depth||!f||!f.parents||!f.parents.length){seen[key]=1;return out;}
      seen[key]=1;
      var ps=f.parents.slice(0,3);
      out.parents=await Promise.all(ps.map(function(p){return node(p,level+1);}));
      return out;
    }
    return node(name,1);
  }
  function cleanParent(n){return String(n||'').replace(/[™®©]/g,'').replace(/\s+/g,' ').trim();}


  /* ══ CATALOGUE GARDEN SEEDS (variétés réellement commandables) ══
     Index compact catalogue_gst_index, lu une fois par session (synchronisé depuis l'admin).
     Le chat ne recommande QUE des articles de ce catalogue ; la base StrainSage sert à les enrichir.
     - recherche par nom dans TOUT le catalogue (y compris rupture et retirés), acronymes et alias compris ;
     - les variétés déjà présentées dans la conversation sont réinjectées à chaque message ;
     - une « déclinaison » (SAD, SAD Fast Version, Auto SAD) regroupe ses packs ; la « variété de base » (sad) les réunit. */
  var GIDX='catalogue_gst_index';
  var gst=null,gstLoading=null,gstByCode={},gstByName={},gstByVar={},gstByBase={},gstShort={},gstIni={},gstAlias={},gstMeta={};
  function numOrNull(v){return v===''||v==null?null:parseFloat(v);}
  // même normalisation que le rapprochement de l'admin (gst-core.js : lettres isolées recollées, « S.A.D. » → « sad »)
  var GC=window.GSTCore;
  function key0(s){return GC.key0(s);}
  function keyMsg(s){return key0(String(s||'').replace(/[’'`´]/g,' '));}
  var alphaToks=GC.alphaToks;
  function loadCatalogue(){
    if(gst)return Promise.resolve(gst);
    if(gstLoading)return gstLoading;
    gstLoading=(async function(){
      try{
        var meta=await db.collection(GIDX).doc('meta').get();
        gstMeta=meta.exists?meta.data():{};gstAlias=gstMeta.alias||{};
        var parts=gstMeta.parts||0;
        var snaps=await Promise.all(Array.from({length:parts},function(_,i){return db.collection(GIDX).doc('part_'+i).get();}));
        var list=[];
        snaps.forEach(function(s){if(!s.exists)return;(s.data().entries||[]).forEach(function(e){
          var p=String(e).split('|');
          list.push({codigo:p[0],variete:p[1],breeder:p[2],type:({f:'fem',a:'auto',r:'regular'})[p[3]]||null,nb:numOrNull(p[4]),
            thcMin:numOrNull(p[5]),thcMax:numOrNull(p[6]),floMin:numOrNull(p[7]),floMax:numOrNull(p[8]),pvp:numOrNull(p[9]),
            dispo:p[10]==='0'?0:(p[10]==='2'?2:1),photo:p[11]||'',varieteId:p[12]||'',extrait:p[13]||'',
            retire:p[23]==='R',offertes:numOrNull(p[24])||0,granel:p[25]==='G',base:p[26]||key0(p[1]),
            gk:p[21]||(nrm(p[1])+'~'+nrm(p[2])+'~'+(p[3]||''))});
        });});
        gstByCode={};gstByName={};gstByVar={};gstByBase={};gstShort={};gstIni={};
        list.forEach(function(it){
          gstByCode[it.codigo]=it;var k=nrm(it.variete);(gstByName[k]=gstByName[k]||[]).push(it);
          if(it.varieteId)(gstByVar[it.varieteId]=gstByVar[it.varieteId]||[]).push(it);
          (gstByBase[it.base]=gstByBase[it.base]||[]).push(it);
        });
        // acronymes : noms courts du catalogue (sad, gg) et initiales des noms longs (sweet afghani delicious → sad)
        Object.keys(gstByBase).forEach(function(b){
          if(/^[a-z]{2,4}$/.test(b))gstShort[b]=1;
          var ini=GC.initials2(b);if(ini&&ini.length<=5)(gstIni[ini]=gstIni[ini]||[]).push(b);
        });
        // tous les packs d'une même déclinaison (même nom, breeder et type), du plus petit au plus grand
        var byG={};list.forEach(function(it){(byG[it.gk]=byG[it.gk]||[]).push(it);});
        Object.keys(byG).forEach(function(k){var g=byG[k].sort(function(a,b){return (a.nb||0)-(b.nb||0)||(a.pvp||0)-(b.pvp||0);});g.forEach(function(it){it.packs=g;});});
        gst=list;
        console.info('[GST] catalogue chargé : '+list.length+' articles, '+list.filter(function(i){return i.dispo!==0;}).length+' disponibles'+(gstMeta.syncAt?' (synchro du '+new Date(gstMeta.syncAt).toLocaleDateString('fr-FR')+')':''));
        if(!list.length){gst=null;console.warn('[GST] catalogue vide : lance « Synchroniser le catalogue Garden Seeds » dans l\'admin');}
      }catch(e){console.error('[GST] lecture du catalogue impossible ('+(e&&e.code||'erreur')+') : '+(e&&e.message)+'. Nouvel essai au prochain message.');gst=null;}
      gstLoading=null;
      return gst||[];
    })();
    return gstLoading;
  }
  // article du catalogue pour un nom (ou un code) : code exact, puis nom normalisé, puis fiche StrainSage commune
  function gstFor(nameOrCode){
    if(!gst||!nameOrCode)return null;
    if(gstByCode[nameOrCode])return gstByCode[nameOrCode];
    var k=nrm(nameOrCode),pool=gstByName[k];
    if(!pool){var e=resolve(nameOrCode);if(e)pool=gstByVar[e.id];}
    if(!pool){var b=key0(nameOrCode);pool=gstByBase[b];}
    if(!pool)return null;
    return pool.filter(function(i){return i.dispo!==0&&(!i.granel||gstMeta.showGranel);}).sort(function(a,b){return (a.pvp||999)-(b.pvp||999);})[0]||pool[0];
  }
  function euro(v){return v==null||isNaN(v)?'':Number(v).toFixed(2).replace('.',',')+' €';}
  // packs proposés aux clients : commandables, sans le vrac pro (Granel) sauf option de l'admin
  function packsOf(it){return it?(it.packs||[it]).filter(function(p){return p.dispo!==0&&(!p.granel||gstMeta.showGranel);}):[];}
  function seedsLabel(p){if(!p.nb)return 'paquet';if(p.offertes&&p.offertes<p.nb)return p.nb+' graines ('+(p.nb-p.offertes)+' + '+p.offertes+' offerte'+(p.offertes>1?'s':'')+')';return p.nb+' graine'+(p.nb>1?'s':'');}
  function packLabel(p){return seedsLabel(p)+(p.pvp!=null?' '+euro(p.pvp):'')+(p.dispo===2?' (stock bas)':'');}
  function packsText(it){return packsOf(it).map(packLabel).join(' · ');}
  function statusOf(it){
    var pk=packsOf(it);if(pk.length)return pk.some(function(p){return p.dispo===1;})?'disponible':'stock limité';
    var all=(it.packs||[it]).filter(function(p){return !p.granel||gstMeta.showGranel;});
    return all.length&&all.every(function(p){return p.retire;})?'retirée du catalogue du grossiste':'en rupture chez le fournisseur';
  }
  var BUDGET={'moins de 30€':30,'30-60€':60,'60-100€':100};
  var TYPE_FR={fem:'féminisée',auto:'autofloraison',regular:'régulière'};
  function gstLine(it,f){
    var p=[];
    if(it.breeder)p.push(it.breeder);
    if(it.type)p.push(TYPE_FR[it.type]);
    var thc=it.thcMax!=null?(it.thcMin!=null&&it.thcMin!==it.thcMax?it.thcMin+'–'+it.thcMax:it.thcMax)+'% THC':(f&&f.thcMax!=null?f.thcMax+'% THC (base)':null);if(thc)p.push(thc);
    var fOk=f&&!(it.type==='auto'&&f.auto!==true); // une fiche photopériode ne donne pas la durée d'une auto
    var flo=it.floMax!=null?(it.floMin!=null&&it.floMin!==it.floMax?it.floMin+'–'+it.floMax:it.floMax)+' sem.':(fOk&&f.floMax!=null?f.floMax+' sem. (base)':null);if(flo)p.push('flo '+flo);
    var pk=packsText(it);p.push(pk?'packs disponibles : '+pk:statusOf(it)+' (aucun pack commandable : ne propose ni vrac ni autre format)');
    var l='- '+it.variete+' [code '+it.codigo+'] · '+p.join(' · ');
    if(f){var x=[];if(f.eff.length)x.push('effets : '+f.eff.slice(0,4).join(', '));if(f.gouts.length)x.push('goûts : '+f.gouts.slice(0,4).join(', '));if(x.length)l+=' · [base StrainSage : '+x.join(' ; ')+']';}
    else if(it.extrait)l+=' · '+it.extrait.slice(0,110);
    return l;
  }
  // toutes les déclinaisons d'une variété (même nom de base, même breeder), hors déclinaisons vendues seulement en vrac
  function declinaisonsOf(it){
    var b=key0(it.breeder);
    return oneByVariety((gstByBase[it.base]||[]).filter(function(x){return key0(x.breeder)===b;}))
      .filter(function(x){return gstMeta.showGranel||(x.packs||[x]).some(function(p){return !p.granel;});}).map(repOf)
      .sort(function(a,b){return (packsOf(b).length?1:0)-(packsOf(a).length?1:0);});
  }
  function oneByVariety(arr){var seen={};return arr.filter(function(i){if(seen[i.gk])return false;seen[i.gk]=1;return true;});}
  // représentant d'une déclinaison : pack commandable le moins cher, sinon le premier
  function repOf(it){var pk=packsOf(it);return pk.length?pk.slice().sort(function(a,b){return (a.pvp||999)-(b.pvp||999);})[0]:it;}

  /* ── variétés citées par le client : recherchées dans TOUT le catalogue ── */
  var STOP=' le la les de des du un une et ou en au aux pour par sur pas que qui quoi est sont ai as avec sans mon ma mes ton ta tes son sa ses ce cet cette ces il elle on nous vous ils me te se lui leur plus moins tres bien bon bonne quel quelle quels dans fait faire peu tout tous dit moi toi oui non si car mais donc ni ne the and for you can auto autos fem cbd thc xl xxl fast kush haze skunk diesel cheese lemon sativa indica hybride hybrid graine graines seed seeds pack packs prix stock dispo bio indoor outdoor premiere premier deuxieme seconde troisieme derniere dernier celle celui ca cela elle elles variete varietes strain autre autres meme toutes combien temps fruitee fruite debutant budget euros ';
  function isStop(t){return STOP.indexOf(' '+t+' ')>-1;}
  // mots génériques de variété : ignorés seuls, mais gardés dans un nom (« Purple Unicornio Haze »)
  var GENERIC_W=' auto autos fem cbd thc xl xxl fast kush haze skunk diesel cheese lemon ';
  function isFrStop(t){return isStop(t)&&GENERIC_W.indexOf(' '+t+' ')<0;}
  function findNamed(txt){
    if(!gst)return {named:[],ficheAbsent:[]};
    var toks=keyMsg(txt).split(' ').filter(Boolean),found={},order=[],ficheAbsent=[];
    function hit(base,via,q){if(!gstByBase[base]||found[base])return;found[base]={base:base,via:via,query:q};order.push(base);}
    for(var n=Math.min(6,toks.length);n>=1;n--){
      for(var i=0;i+n<=toks.length;i++){
        var g=toks.slice(i,i+n),q=g.join(' ');
        if(n===1&&(isStop(q)||/^\d+$/.test(q)||q.length<2))continue;
        if(n===1&&q.length<4&&!gstShort[q]&&!gstIni[q]&&!gstAlias[q])continue; // mots courts : seulement les acronymes
        if(isStop(g[0])&&n>1)continue;
        if(gstByBase[q])hit(q,'nom',q);
        if(gstAlias[q])hit(gstAlias[q],'alias',q);
        if(n>=2&&alphaToks(q).length===n&&!g.some(isStop)){var ini=g.map(function(t){return t[0];}).join('');if(gstShort[ini])hit(ini,'initiales',q);}
        if(n===1&&q.length<=4&&gstIni[q]&&!gstByBase[q])gstIni[q].forEach(function(b){hit(b,'acronyme',q);});
      }
    }
    // fiches de la base StrainSage citées : leurs articles rapprochés, sinon « absente du catalogue »
    try{detect(txt,5).forEach(function(e){
      var arts=gstByVar[e.id];
      if(arts&&arts.length)hit(arts[0].base,'fiche',e.nom);
      else if(!gstByBase[key0(e.nom)]&&!order.length&&String(e.nom||'').length>=4)ficheAbsent.push(e.nom);
    });}catch(err){}
    return {named:order.map(function(b){return found[b];}),ficheAbsent:ficheAbsent};
  }
  // nom de variété visé par une question (« parle-moi de… », « tu as… ») : sert à dire « absente » avec certitude
  var ASK=/(?:parle[sz]? ?moi|parlez ?moi|infos? sur|que penses tu|tu (?:as|aurais|connais|vends)|vous (?:avez|auriez|vendez)|avez vous|as tu|dispo(?:nible)?s?)\s+(?:(?:de|du|des|d|la|le|les|l|une|un|en|sur)\s+)*([a-z0-9][a-z0-9 ]{1,40})/;
  function askedName(txt){
    var m=keyMsg(txt).match(ASK);if(!m)return '';
    var q=m[1].split(' ').filter(Boolean).slice(0,5);while(q.length&&isFrStop(q[q.length-1]))q.pop();while(q.length&&isFrStop(q[0]))q.shift();
    if(!q.some(function(t){return !isStop(t);}))return '';
    q=q.join(' ');if(q.length<3)return '';
    try{var pc=parseCriteria(q,[]);if(pc&&pc.length)return '';}catch(e){}
    return q;
  }
  /* sélection pour l'IA :
     1. variétés déjà présentées dans la conversation (toujours valables) ;
     2. variétés citées par le client, toutes déclinaisons et tous statuts ;
     3. ~20 autres variétés disponibles classées selon la demande (rupture, type, budget, critères). */
  async function catalogueContext(txt,opts){
    opts=opts||{};
    var cat=await loadCatalogue();if(!cat.length)return {ctx:'',info:{available:0,count:0}};
    var raw=opts.raw||txt,msg=' '+nrm(txt)+' ',prof=opts.profile||{};
    var avail=cat.filter(function(i){return i.dispo!==0&&(!i.granel||gstMeta.showGranel);});
    var wantType=/\b(auto|autos|autofloraison\w*|autoflo\w*)\b/.test(msg)?'auto':(/\b(feminis\w*|feminiz\w*|fem)\b/.test(msg)?'fem':(/\b(reguliere\w*|regular\w*)\b/.test(msg)?'regular':null));
    if(!wantType&&/\bphotoperiod\w*/.test(msg))wantType='notauto';
    var pool=avail.filter(function(i){if(wantType==='notauto')return i.type!=='auto';return !wantType||!i.type||i.type===wantType;});
    var maxBudget=BUDGET[prof.budget]||null;
    var mb=msg.match(/\b(?:moins de|max\w*|budget|sous)\s*(\d{2,3})\s*(?:e|eur|euros?)?\b/);if(mb)maxBudget=parseInt(mb[1],10);
    if(maxBudget){var inB=pool.filter(function(i){return i.pvp==null||i.pvp<=maxBudget;});if(inB.length)pool=inB;}
    var scores={},facetsById={},r={criteria:[],items:[]};
    try{r=await search(txt,{drop:opts.drop,limit:6000,stockInfo:null});(r.items||[]).forEach(function(x){scores[x.f.id]=x.score;facetsById[x.f.id]=x.f;});}catch(e){}
    var detected=detect(txt,5).map(function(e){return e.id;});
    var floCrit=(r.criteria||[]).filter(function(c){return c.k==='flo';})[0];
    var floMaxWanted=floCrit?parseFloat((floCrit.l.match(/\d+/)||[])[0]):null;
    var hasCrit=(r.criteria||[]).length>0;
    pool.forEach(function(it){
      var s=0;
      if(it.varieteId&&detected.indexOf(it.varieteId)>-1)s+=10;
      if(it.varieteId&&scores[it.varieteId]!=null)s+=scores[it.varieteId]*5;
      if(floMaxWanted&&it.floMax!=null)s+=it.floMax<=floMaxWanted?1.5:-1;
      if(it.dispo===2)s-=0.2;
      it._s=s;
    });
    var picked=oneByVariety(pool.slice().sort(function(a,b){return b._s-a._s||(a.pvp||999)-(b.pvp||999);}));
    var matching=picked.filter(function(i){return i._s>0;}),availV=oneByVariety(avail).length;
    if(!hasCrit&&!detected.length){
      var seenB={};picked=picked.filter(function(i){return i.varieteId;}).concat(picked.filter(function(i){return !i.varieteId;})).filter(function(i){var k=(i.breeder||'')+'|'+(i.type||'');if((seenB[k]=(seenB[k]||0)+1)>2)return false;return true;});
    }
    // faits de la base StrainSage (effets, goûts…) pour chaque article rapproché, même sans critère dans la demande
    var allFacets={};try{(await loadFacets()).forEach(function(f){allFacets[f.id]=f;});}catch(e){}
    var fct=function(it){return it.varieteId?(facetsById[it.varieteId]||allFacets[it.varieteId]||null):null;},seenG={},blocks=[];
    // 1. déjà présentées
    var remembered=[];
    // le même nom chez d'autres breeders (« Auto Purple » d'Original Sensible et de Pyramid) reste aussi valable
    (opts.remember||[]).forEach(function(x){var it=(x.gst&&gstByCode[x.gst])||gstFor(x.name);if(!it)return;
      [it].concat(oneByVariety(gstByBase[it.base]||[]).filter(function(g){return nrm(g.variete)===nrm(it.variete);})).forEach(function(g){
        if(seenG[g.gk]||remembered.length>=14)return;seenG[g.gk]=1;remembered.push(repOf(g));});});
    if(remembered.length)blocks.push('[VARIÉTÉS DÉJÀ PRÉSENTÉES AU CLIENT DANS CETTE CONVERSATION — toujours valables ; « la première » = n°1, « la deuxième » = n°2…]\n'+
      remembered.map(function(it,i){return (i+1)+'. '+gstLine(it,fct(it)).slice(2)+' · statut : '+statusOf(it);}).join('\n'));
    // 2. citées par le client
    var fn=findNamed(raw),namedCount=0;
    // une variété citée dont aucune déclinaison n'est proposable (vrac seul) n'apparaît pas
    var named=fn.named.filter(function(nm){return (gstByBase[nm.base]||[]).some(function(it){return gstMeta.showGranel||(it.packs||[it]).some(function(p){return !p.granel;});});});
    if(named.length)blocks.push('[VARIÉTÉS CITÉES PAR LE CLIENT — trouvées au catalogue du grossiste ; présente toutes les déclinaisons commandables]\n'+named.map(function(nm){
      // une ligne par déclinaison ; une déclinaison vendue seulement en vrac pro (Granel) n'est pas proposée, sauf option
      var groups=oneByVariety(gstByBase[nm.base]||[]).filter(function(it){return gstMeta.showGranel||(it.packs||[it]).some(function(p){return !p.granel;});}).map(repOf)
        .sort(function(a,b){return (packsOf(b).length?1:0)-(packsOf(a).length?1:0);});
      groups.forEach(function(it){seenG[it.gk]=1;});namedCount+=groups.length;
      var label=groups.length?groups[0].variete:nm.base;
      return '« '+nm.query+' »'+(nm.via==='initiales'||nm.via==='acronyme'||nm.via==='alias'||nm.via==='fiche'?' = '+label+' ('+(nm.via==='fiche'?'même variété':nm.via==='alias'?'autre nom':'acronyme / nom complet')+')':'')+' : '+groups.length+' déclinaison'+(groups.length>1?'s':'')+'\n'+
        groups.map(function(it){return gstLine(it,fct(it))+' · statut : '+statusOf(it);}).join('\n');
    }).join('\n'));
    // fiches complètes de la base pour les variétés citées et déjà présentées (génétique uniquement, 4 au plus)
    var ficheIds=[];[].concat.apply([],named.map(function(nm){return gstByBase[nm.base]||[];})).concat(remembered).forEach(function(it){if(it.varieteId&&ficheIds.indexOf(it.varieteId)<0)ficheIds.push(it.varieteId);});
    var fiches=ficheIds.length?(await Promise.all(ficheIds.slice(0,4).map(fetchDoc))).filter(Boolean):[];
    if(fiches.length)blocks.push('[FICHES BASE STRAINSAGE DE CES VARIÉTÉS — génétique et profil ; elles ne disent pas ce qui est en vente]\n'+fiches.map(function(f){return compact(f,null,true);}).join('\n'));
    // absentes : nom visé par la question sans aucun article, ou fiche StrainSage sans article
    var asked=named.length?'':askedName(raw),absent=(asked?[asked]:[]).concat(fn.ficheAbsent.filter(function(n){return !asked||nrm(n)!==nrm(asked);}));
    if(absent.length)blocks.push('[ABSENTES DU CATALOGUE DU GROSSISTE] '+absent.map(function(a){return '« '+a+' »';}).join(', ')+' : aucun article correspondant chez le grossiste (ni en stock, ni en rupture). Dis-le clairement et sans hésiter, puis propose la variété disponible la plus proche parmi celles ci-dessous.');
    // 3. autres variétés disponibles : jusqu'à 15 variétés, chacune avec toutes ses déclinaisons (type, packs, prix, stock)
    var top=[],varieties=[],seenV={};
    (matching.length?matching:picked).forEach(function(it){
      if(varieties.length>=15||seenG[it.gk])return;
      var vk=it.base+'|'+key0(it.breeder);if(seenV[vk])return;seenV[vk]=1;
      var decl=declinaisonsOf(it);if(!decl.length)decl=[it];
      decl.forEach(function(d){seenG[d.gk]=1;top.push(d);});varieties.push(decl);
    });
    var head=matching.length?'les mieux adaptées à la demande':((hasCrit||detected.length)?'les plus proches de la demande':'sélection variée');
    if(varieties.length)blocks.push('[AUTRES VARIÉTÉS DISPONIBLES CHEZ LE GROSSISTE — '+head+' ; '+availV+' variétés commandables au total'+(maxBudget?', budget ≤ '+maxBudget+' € par pack':'')+(wantType&&wantType!=='notauto'?', type '+TYPE_FR[wantType]:'')+'] Une variété peut exister en plusieurs déclinaisons (auto, fast, XL, CBD…) : ce sont des options distinctes.\n'+
      varieties.map(function(decl){
        if(decl.length===1)return gstLine(decl[0],fct(decl[0]))+' · statut : '+statusOf(decl[0]);
        return '• '+decl[0].variete+(decl[0].breeder?' ('+decl[0].breeder+')':'')+' — '+decl.length+' déclinaisons :\n'+decl.map(function(d){return '  '+gstLine(d,fct(d))+' · statut : '+statusOf(d);}).join('\n');
      }).join('\n'));
    if(!blocks.length)return {ctx:'',info:{available:availV,articles:avail.length,count:0}};
    var example=(remembered[0]||top[0]||(named.length&&gstByBase[named[0].base][0])||{}).codigo||'12345';
    var ctx='\n\n[CATALOGUE DU GROSSISTE GARDEN SEEDS TRADING — variétés commandables par la boutique]\n'+blocks.join('\n\n')+
      '\nRÈGLES (à appliquer sans jamais les évoquer devant le client) :'+
      '\n- Recommande UNIQUEMENT des variétés présentes ci-dessus, avec leur nom exact. Dans le JSON des cartes, ajoute pour chacune "gst" avec son code (ex. "gst":"'+example+'").'+
      '\n- Une variété déjà présentée dans la conversation reste valable : ne la désavoue jamais et ne te corrige pas sur sa disponibilité, sauf si son statut ci-dessus le contredit explicitement.'+
      '\n- Le catalogue ci-dessus n\'est qu\'une sélection pour ce message : une variété que tu as citée plus tôt et qui n\'y figure plus n\'est PAS pour autant absente du catalogue. Ne dis jamais le contraire.'+
      '\n- Quand le client cite une variété trouvée (même par un acronyme ou son nom complet), présente toutes ses déclinaisons commandables avec leurs packs et prix.'+
      '\n- Prix, conditionnements et déclinaisons : cite uniquement ceux indiqués ci-dessus, à l\'identique. N\'invente jamais de format « habituel » ni de taille de pack ; si une déclinaison n\'a aucun pack commandable, dis qu\'elle est en rupture chez le fournisseur, sans proposer de vrac à la place. Les cartes font foi.'+
      '\n- Ne parle jamais de « liste », « candidates », « classement », « contexte », « données », « base » ni du fonctionnement de l\'application : parle comme un vendeur qui connaît son catalogue.'+
      '\n- Si rien ne correspond vraiment, dis-le franchement et propose la variété disponible la plus proche.';
    console.info('[GST] '+remembered.length+' déjà présentées, '+named.length+' citée(s) ('+namedCount+' déclinaisons), '+absent.length+' absente(s), '+varieties.length+' autres variétés ('+top.length+' déclinaisons) ; '+availV+' variétés disponibles');
    return {ctx:ctx,info:{available:availV,articles:avail.length,count:top.length+namedCount+remembered.length,matching:matching.length,named:named.map(function(n){return n.query;}),absent:absent,remembered:remembered.length}};
  }

  window.VarDB={euro:euro,packsOf:packsOf,packsText:packsText,seedsLabel:seedsLabel,statusOf:statusOf,findNamed:findNamed,askedName:askedName,loadCatalogue:loadCatalogue,gstFor:gstFor,catalogueContext:catalogueContext,gstSize:function(){return gst?gst.length:0;},lineage:lineage,load:load,detect:detect,resolve:resolve,idOf:idOf,get:get,cached:cached,prefetch:prefetch,
    compact:compact,buildContext:buildContext,stockFacts:stockFacts,banques:banques,domain:domain,norm:nrm,
    search:search,criteriaContext:criteriaContext,parseCriteria:parseCriteria,loadFacets:loadFacets,
    size:function(){return entries.length;}};
})();
