/* ══════════════════════════════════════════════════════════════
   StrainSage Pro — noyau partagé du catalogue Garden Seeds (fonctions pures)
   Une seule implémentation, utilisée par l'admin (synchro, découpage, rapprochement),
   par le chat (varietes.js) et par les tests Node (test/run-tests.js).
   Aucune lecture ni écriture Firestore ici.
══════════════════════════════════════════════════════════════ */
(function(root){
'use strict';
function nrm(s){return String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[™®©]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
function clean(s){return String(s==null?'':s).replace(/\|/g,'/').replace(/\s+/g,' ').trim();}

/* ── analyse de « nombre » : variété, graines, type, breeder ── */
/* ── RÈGLES DE DÉCOUPAGE DES NOMS (modifiables dans « Réglages du catalogue ») ──
   Aucune règle propre à une variété ou à un breeder : uniquement des listes de mots et un seuil. */
var DEF_RULES={
  unites:'u, ud, uds, un, unid, unids, unidad, unidades, unit, units, seed, seeds, semilla, semillas, graine, graines, pc, pcs, sem',
  types:'fem, feminizada, feminizadas, feminizado, feminizados, feminized, feminised, feminisee, feminisees, feminizzata, reg, regular, regulares',
  vrac:'granel profesionales, granel, profesionales, bulk, vrac',
  seuilVrac:25,
  assortiments:'collection, coleccion, coleccionista, mix, assortiment, surtido',
  declinaisons:'auto = auto\nautos = auto\nautoflowering = auto\nautoflower = auto\nautofloreciente = auto\nautoflorecientes = auto\nautofloraison = auto\nautomatic = auto\nautomatica = auto\nfast version = fast (fin)\nfast = fast (fin)\nxxl = xxl (fin)\nxl = xl (fin)\ncbd = cbd (fin)\nf1 = f1 (fin)'
};
var RULES=null;
function escRe(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function words(txt){return String(txt||'').split(/[,\n]/).map(x=>base0(x)).filter(Boolean).sort((a,b)=>b.length-a.length);}
function compileRules(r){
  r=Object.assign({},DEF_RULES,r||{});
  var units=words(r.unites),types=words(r.types),vrac=words(r.vrac),assort=words(r.assortiments);
  var decl=String(r.declinaisons||'').split('\n').map(l=>{var m=l.match(/^\s*(.+?)\s*=\s*([^()]+?)\s*(?:\((debut|début|fin|partout)\))?\s*$/i);if(!m)return null;var p=base0(m[1]);return p?{p:p,label:base0(m[2]),where:(m[3]||'partout').toLowerCase().replace('é','e')}:null;}).filter(Boolean);
  var alt=a=>a.map(x=>escRe(x).replace(/ /g,'\\s+')).join('|')||'(?!)';
  // un nombre de pack n'est jamais un numéro de variété (#4) ni collé à un mot (RS11, 2.0)
  var N='(?<![\\w#.])(\\d{1,3})';
  RULES={raw:r,units:units,types:types,vrac:vrac,assort:assort,decl:decl,seuil:Number(r.seuilVrac)||0,
    unitRe:new RegExp(N+'(?:\\s*\\+\\s*(\\d{1,3}))?\\s*(?:'+alt(units)+')\\.?(?![\\w])','gi'),
    promoRe:new RegExp(N+'\\s*\\+\\s*(\\d{1,3})(?![\\w.])','g'),
    typeNumRe:new RegExp(N+'()\\s*(?:'+alt(types)+')\\.?(?![\\w])','gi'),
    vracRe:new RegExp('\\b(?:'+alt(vrac)+')\\b','i'),
    vracAllRe:new RegExp('\\s*\\b(?:'+alt(vrac)+')\\b','gi'),
    assortRe:new RegExp('\\b(?:'+alt(assort)+')\\b','i'),
    typeTailRe:new RegExp('[\\s.,\\-]+(?:'+alt(types)+')\\.?$','i'),
    unitTailRe:new RegExp('(\\d)\\s*(?:'+alt(units)+')\\.?$','i'),
    unitAfterNumRe:new RegExp('\\b(\\d+) (?:'+alt(units)+')\\b','g'),
    // mots retirés en début ou fin du nom de base : déclinaisons (avec leur libellé), types, vrac
    edge:decl.concat(types.map(t=>({p:t,label:'',where:'partout'}))).concat(vrac.map(t=>({p:t,label:'',where:'partout'}))).sort((a,b)=>b.p.length-a.p.length)};
  return RULES;
}
var settingsRules=function(){return null;};
function setSettingsSource(fn){settingsRules=fn||function(){return null;};RULES=null;}
function rules(){return RULES||compileRules(settingsRules());}
// pack d'un nom brut : « 5 u. », « 3+1 u. », « 3+1 » seul, « 10 reg. » ; le dernier valable l'emporte, par ordre de fiabilité
function findPack(s){
  var R=rules();
  for(var k=0,res=[R.unitRe,R.promoRe,R.typeNumRe];k<res.length;k++){
    var re=res[k],m,last=null;re.lastIndex=0;
    // jamais un pack : précédé de « # », ou nombre nul / commençant par 0 (« 00 Seeds » est un breeder)
    while((m=re.exec(s))){var before=s.slice(0,m.index).replace(/\s+$/,'');if(before&&!/#$/.test(before)&&!/^0/.test(m[1]))last={i:m.index,len:m[0].length,a:parseInt(m[1],10),b:m[2]?parseInt(m[2],10):0};}
    if(last)return last;
  }
  return null;
}
// nom affiché : sans ponctuation finale ni mention de type (« Gorilla Glue fem. » → « Gorilla Glue »)
function displayName(v,marca){
  var R=rules(),prev,bw=marca?breederWords([marca]):[];v=String(v||'').replace(/\s+/g,' ').trim();
  do{prev=v;
    v=v.replace(/[\s\-–+,/(]+$/,'').replace(R.typeTailRe,'').replace(R.unitTailRe,'$1').trim();
    // breeder recopié en fin de nom (article sans pack lisible)
    var w=v.split(' ');for(var i=0;i<bw.length;i++){var n=bw[i].split(' ').length;if(w.length>n&&base0(w.slice(-n).join(' '))===bw[i]){v=w.slice(0,-n).join(' ');break;}}
  }while(v!==prev);
  return clean(v);
}
function parseNombre(nombre,marca,grupo,familia){
  var R=rules(),s0=String(nombre||'').replace(/\s+/g,' ').trim();
  // vrac pro (Granel…) : dans le nom, la famille, le breeder ou le groupe ; gardé au catalogue, retiré du nom
  var granel=R.vracRe.test(s0)||R.vracRe.test(String(familia||''))||R.vracRe.test(String(marca||''))||R.vracRe.test(String(grupo||''));
  var s=s0.replace(R.vracAllRe,' ').replace(/\s+/g,' ').trim();
  var pk=findPack(s),offertes=pk?pk.b:0,nb=pk?pk.a+pk.b:null;
  var variete=pk?s.slice(0,pk.i):s,rest=pk?s.slice(pk.i+pk.len):'';
  // au-delà du seuil (25 graines par défaut), un pack est un format vrac professionnel
  if(nb!=null&&R.seuil>0&&nb>=R.seuil)granel=true;
  var g=nrm(grupo),n=nrm(s0),type=null;
  if(/autoflor/.test(g)||/\bauto/.test(n))type='auto';
  else if(/feminiz/.test(g)||/\bfem/.test(n))type='fem';
  else if(/regular/.test(g)||/\breg(ular|ulares)?\b/.test(n))type='regular';
  var breeder=marca?clean(marca):null;
  if(!breeder&&rest)breeder=clean(rest.replace(/^[\s.,-]*((auto(floreciente)?s?|fem(inizad[ao]s?)?|reg(ular(es)?)?|cbd)[\s.,-]*)+/ig,''))||null;
  return {variete:displayName(variete,marca)||clean(s),nbGraines:nb,offertes:offertes,granel:granel,assortiment:R.assortRe.test(s0),typeGraine:type,cbd:/\bcbd\b/.test(n)||/cbd/.test(g),breeder:breeder};
}
/* ── analyse de « descripcionCorta » : THC, floraison, production, hauteur, récolte ext. ── */
var LABELS=/\b(thc|cbd|producci[oó]n|production|rendement|yield|floraci[oó]n|floraison|flowering|altura|hauteur|height|cosecha|r[ée]colte|harvest|gen[ée]tica|genetics|sabor|efecto)\b/i;
function after(s,re,len){var m=re.exec(s);if(!m)return null;var seg=s.slice(m.index+m[0].length,m.index+m[0].length+(len||60));var cut=seg.search(LABELS);if(cut>0)seg=seg.slice(0,cut);return seg.replace(/^[\s:.\-–=·•]+/,'').replace(/[\s,;|/.\-–·•]+$/,'').trim()||null;}
function nums(seg){return (String(seg||'').replace(/(\d),(\d)/g,'$1.$2').match(/\d+(?:\.\d+)?/g)||[]).map(Number);}
function parseDesc(t){
  var s=' '+t+' ',o={thcMin:null,thcMax:null,cbdMax:null,floMin:null,floMax:null,production:null,hauteur:null,recolteExt:null};
  var th=after(s,/\bTHC\b/i,30);if(th&&/%/.test(th)){var a=nums(th.split('%').slice(0,2).join('%')).filter(x=>x<=40);if(a.length){o.thcMin=Math.min.apply(null,a.slice(0,2));o.thcMax=Math.max.apply(null,a.slice(0,2));}}
  var cb=after(s,/\bCBD\b/i,25);if(cb&&/%/.test(cb)){var c=nums(cb.split('%')[0]).filter(x=>x<=30);if(c.length)o.cbdMax=Math.max.apply(null,c);}
  var fl=after(s,/\b(floraci[oó]n|floraison|flowering)(\s+(interior|indoor|int\.?))?\b/i,40);
  if(fl){var f=nums(fl).slice(0,2),days=/d[ií]as?|days?|jours?/i.test(fl);if(f.length&&(/sem|week|d[ií]a|day|jour/i.test(fl))){f=f.map(x=>days?Math.round(x/7*2)/2:x).filter(x=>x>=3&&x<=30);if(f.length){o.floMin=Math.min.apply(null,f);o.floMax=Math.max.apply(null,f);}}}
  o.production=after(s,/\b(producci[oó]n|production|rendement|yield)(\s+(interior|indoor|int\.?))?\b/i,60);
  o.hauteur=after(s,/\b(altura|hauteur|height)\b/i,45);
  o.recolteExt=after(s,/\b(cosecha|r[ée]colte|harvest)\s*(exterior|ext\.?|outdoor)?\b/i,40);
  ['production','hauteur','recolteExt'].forEach(k=>{if(o[k])o[k]=o[k].slice(0,60);});
  return o;
}

/* ── rapprochement avec la base StrainSage ──
   Même nettoyage des deux côtés : nom « strict » (numéros gardés) et nom « souple » (sans numéros isolés).
   Niveau 1 : nom strict identique · niveau 2 : nom souple identique · niveau 3 : similarité de trigrammes (jamais automatique).
   Les décisions manuelles passent avant tout et ne sont jamais écrasées. */
var SIM_REVIEW=0.85;
function base0(s){return String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[’'`´]/g,'').replace(/[™®©]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
// autres tailles de pack à retirer d'un nom : « x3 », « pack 3 »
var PACK_RE=[/\bx ?\d{1,3}\b/g,/\b(?:pack|caja|box|lot|blister)(?: de| of)? ?\d{1,3}\b/g];
function breederWords(list){
  var out=[];
  (list||[]).forEach(function(b){b=base0(b);if(!b||b.length<2)return;out.push(b);var c=b.replace(/ (?:seeds?|seed ?bank|seedbank|genetics?|semillas|bank|company|co)$/,'').trim();
    // forme courte (« Royal Queen » pour « Royal Queen Seeds ») : seulement si elle est assez distinctive,
    // sinon « Sweet » (Sweet Seeds) amputerait « Sweet Afghani Delicious »
    if(c&&c!==b&&(c.indexOf(' ')>0||c.length>=7))out.push(c);});
  return out.sort(function(a,b){return b.length-a.length;});
}
// retire en début / fin de nom : déclinaisons (libellé gardé dans labels), types, vrac, puis breeder ; jamais tout le nom
function stripEdges(s,bwords,labels){
  var E=rules().edge;
  for(var guard=0;guard<15;guard++){
    var cut=false;
    for(var i=0;i<E.length&&!cut;i++){var e=E[i],p=e.p;if(p===s)continue;
      if(e.where!=='fin'&&s.indexOf(p+' ')===0){s=s.slice(p.length+1).trim();cut=true;}
      else if(e.where!=='debut'&&s.length>p.length+1&&s.slice(-(p.length+1))===' '+p){s=s.slice(0,-(p.length+1)).trim();cut=true;}
      if(cut&&e.label&&labels&&labels.indexOf(e.label)<0)labels.push(e.label);}
    for(var j=0;j<bwords.length&&!cut;j++){var w=bwords[j];if(w===s)continue;
      if(s.indexOf(w+' ')===0){s=s.slice(w.length+1).trim();cut=true;}
      else if(s.length>w.length+1&&s.slice(-(w.length+1))===' '+w){s=s.slice(0,-(w.length+1)).trim();cut=true;}}
    if(!cut)break;
  }
  return s;
}
function joinLetters(s){return s.replace(/\b(?:[a-z] )+[a-z]\b/g,function(m){return m.replace(/ /g,'');});}
// nom de base (sans pack, déclinaison, breeder, vrac) et clé de déclinaison (nom de base + libellés triés)
function cleanName(name,breeders){
  var R=rules(),raw=String(name==null?'':name);
  var pk;while((pk=findPack(raw)))raw=raw.slice(0,pk.i)+' '+raw.slice(pk.i+pk.len);
  var s=joinLetters(base0(raw.replace(R.vracAllRe,' ')));PACK_RE.forEach(function(re){s=s.replace(re,' ');});
  // unité restée après un numéro de variété (« Bruce Banner #3 u. ») : le numéro est gardé, l'unité retirée
  s=s.replace(R.unitAfterNumRe,'$1').replace(/\s+/g,' ').trim();
  var labels=[],strict=stripEdges(s,breederWords(breeders),labels)||s;
  var toks=strict.split(' '),nums=toks.filter(function(t){return /^\d+$/.test(t);});
  var soft=toks.filter(function(t){return !/^\d+$/.test(t);}).join(' ')||strict;
  return {strict:strict,soft:soft,nums:nums.join(' '),variant:strict+(labels.length?' '+labels.sort().join(' '):'')};
}
function alphaToks(k){return String(k||'').split(' ').filter(function(t){return /^[a-z]+$/.test(t);});}
function trig(s){var t=' '+s+' ',o={};for(var i=0;i<t.length-2;i++)o[t.substr(i,3)]=1;return Object.keys(o);}

/* base StrainSage : noms + alias nettoyés, breeders (parties b_N de l'index), trigrammes des noms souples */
/* options du rapprochement : la simulation compare le résultat avec et sans chaque correction */
var MATCH_OPTS={breederKey:true,acro2:true};
var STOP_INI=/^(?:de|del|des|la|le|les|the|of|n|and|y|et|x|el|los|las|da|di|a|an)$/;
// initiales d'un nom de base : mots vides ignorés, codes génétiques (S1, F1, BX1) déjà exclus car non alphabétiques
function initials2(k){var a=alphaToks(k).filter(t=>!STOP_INI.test(t));return a.length>=2?a.map(t=>t[0]).join(''):'';}
// clé de breeder commune aux deux côtés : « K.C. BRAINS » = « KC Brains », « FAST BUDS » = « FastBuds Seeds »
var BR_GENERIC=/\b(?:seeds?|seed ?bank|seedbank|semillas|genetics?|geneticas?|company|co|organization|organisation|farms?|family|bank|the|inc|ltd|sl)\b/g;
function breederKey(b){var j=joinLetters(base0(b)),k=j.replace(BR_GENERIC,' ').replace(/\s+/g,'');return k||j.replace(/\s+/g,'');}
// clé de catalogue côté chat : même normalisation que le nom de base de l'admin (« S.A.D. » → « sad »)
function key0(s){return joinLetters(base0(s));}
function buildMatcher(R0,opts){
  opts=opts||MATCH_OPTS;
  var br={};R0.breeders.forEach(e=>{var p=String(e).split('|');br[p[0]]=(p[1]||'').split(',').filter(Boolean);});
  var M={opts:opts,strict:{},soft:{},nums:{},nom:{},br:{},brk:{},lab:{},names:{},brRaw:{},auto:{},ini:{},short:{},alias:{},keys:[],tri:{},ktri:[],size:0,hasBreeders:R0.hasBreeders};
  M.settings=R0.settings||{};compileRules(M.settings.regles);
  (M.settings.alias||[]).forEach(x=>{var a=cleanName(x.alias,[]).strict,n=cleanName(x.nom,[]).strict;if(a&&n&&a!==n){M.alias[a]=n;if(!M.alias[n])M.alias[n]=a;}});
  function add(map,k,id){var a=map[k]||(map[k]=[]);if(a.indexOf(id)<0)a.push(id);}
  R0.entries.forEach(e=>{
    var p=String(e).split('|'),id=p[0],bl=br[id]||[];
    M.nom[id]=p[1]||id;M.br[id]=bl.map(base0).filter(Boolean);M.brk[id]=bl.map(breederKey).filter(Boolean);M.names[id]=p.slice(1).filter(Boolean);M.brRaw[id]=bl;M.size++;
    p.slice(1).forEach((n,ni)=>{if(!n)return;var c=cleanName(n,bl);if(!c.strict)return;
      add(M.strict,c.strict,id);add(M.soft,c.soft,id);
      (M.nums[id]=M.nums[id]||{})[c.soft]=c.nums;
      // déclinaison de la fiche (fast, auto, xl…) d'après son nom principal
      if(ni===0)M.lab[id]=c.variant.slice(c.strict.length).trim();
      var al=alphaToks(c.strict);
      if(opts.acro2){
        var ini=initials2(c.strict);if(ini&&ini.length<=5)add(M.ini,ini,id);
        // acronyme écrit dans le nom (« S.A.D. Sweet Afgani Delicious ») : clé « sad » + nom complet sans l'acronyme
        var af=al.filter(t=>!STOP_INI.test(t));
        if(af.length>=3)[0,af.length-1].forEach(pos=>{var t=af[pos],rest=af.filter((x,i)=>i!==pos);
          if(t.length>=2&&t.length<=5&&t===rest.map(x=>x[0]).join('')){add(M.short,t,id);add(M.ini,t,id);
            var w=c.strict.split(' ').filter(x=>x!==t).join(' ');if(w){add(M.strict,w,id);add(M.soft,w.split(' ').filter(x=>!/^\d+$/.test(x)).join(' ')||w,id);}}});
        if(/^[a-z]{2,5}$/.test(c.strict))add(M.short,c.strict,id);
      }else{
        if(al.length>=2){var ini0=al.map(t=>t[0]).join('');if(ini0.length<=5)add(M.ini,ini0,id);}
        if(/^[a-z]{2,4}$/.test(c.strict))add(M.short,c.strict,id);
      }
      if(/\bauto/.test(base0(n)))M.auto[id]=1;});
  });
  M.keys=Object.keys(M.soft);
  M.keys.forEach((k,i)=>{var t=trig(k);M.ktri[i]=t.length;t.forEach(x=>{(M.tri[x]=M.tri[x]||[]).push(i);});});
  return M;
}
// fiches les plus proches d'un nom souple (coefficient de Dice sur les trigrammes, 0 à 1)
function similar(M,soft,n,skip){
  var tg=trig(soft),cnt=new Map();
  tg.forEach(t=>{var l=M.tri[t];if(l)for(var i=0;i<l.length;i++)cnt.set(l[i],(cnt.get(l[i])||0)+1);});
  var res=[];cnt.forEach((c,k)=>{var sc=2*c/(tg.length+M.ktri[k]);if(sc>=0.3)res.push({key:M.keys[k],score:sc});});
  res.sort((a,b)=>b.score-a.score);
  var out=[],seen={};
  for(var j=0;j<res.length&&out.length<n;j++){M.soft[res[j].key].forEach(id=>{if(!seen[id]&&out.length<n&&!(skip&&skip(id))){seen[id]=1;out.push({id:id,nom:M.nom[id],key:res[j].key,score:Math.round(res[j].score*100)/100});}});}
  return out;
}
function decisionKey(strict,breeder){return strict+'|'+base0(breeder);}
function sameBreeder(M,id,b){
  if(!b)return false;
  if(M.opts&&M.opts.breederKey){var k=breederKey(b);if(!k)return false;return (M.brk[id]||[]).some(x=>x===k||(x.length>=4&&k.length>=4&&(x.indexOf(k)>-1||k.indexOf(x)>-1)));}
  return (M.br[id]||[]).some(x=>x===b||(x.length>=4&&b.length>=4&&(x.indexOf(b)>-1||b.indexOf(x)>-1)));
}
/* une variété Garden Seeds → {statut r/v/n/x, niveau 1/2/3/a/m, candidat, score} */
function matchVariety(M,D,variete,breeder,familia,type,noAlias){
  var c=cleanName(variete,[breeder,familia]),key=decisionKey(c.strict,breeder),d=D[key]||null,rej=(d&&d.rejetes)||[];
  var r={strict:c.strict,soft:c.soft,nums:c.nums,variant:c.variant,key:key,statut:'n',niveau:'',candidat:'',score:0,nb:0};
  if(d&&d.valide){r.statut='r';r.niveau='m';r.candidat=d.valide;r.score=1;return r;}
  if(!c.strict)return r;
  var ok=id=>rej.indexOf(id)<0,b=base0(breeder),A=!!(M.opts&&M.opts.acro2),cl=c.variant.slice(c.strict.length).trim();
  // homonymes : le breeder départage (une fiche sans breeder n'est jamais écartée pour ça), puis la déclinaison, puis auto / non auto
  function pick(ids){
    if(ids.length<2)return ids;
    var pool=ids,byB=pool.filter(id=>sameBreeder(M,id,b));if(byB.length)pool=byB;
    if(pool.length>1&&A){
      var ex=pool.filter(id=>(M.lab[id]||'')===cl);
      if(!ex.length&&cl)ex=pool.filter(id=>cl.split(' ').every(l=>(' '+(M.lab[id]||'')+' ').indexOf(' '+l+' ')>-1));
      if(!ex.length)ex=pool.filter(id=>!M.lab[id]);
      if(ex.length)pool=ex;
    }
    if(pool.length>1){var byT=pool.filter(id=>!!M.auto[id]===(type==='a'));if(byT.length===1)pool=byT;}
    return pool;
  }
  var ids=(M.strict[c.strict]||[]).filter(ok);
  if(ids.length){var p1=pick(ids);r.niveau=1;r.candidat=p1[0];r.score=1;r.nb=ids.length;r.statut=p1.length===1?'r':'v';return r;}
  ids=(M.soft[c.soft]||[]).filter(ok);
  if(ids.length){
    // numéros contradictoires (ex. « gorilla glue 4 » / « gorilla glue 5 ») : jamais automatique
    var clash=id=>{var n=(M.nums[id]||{})[c.soft];return !!(n&&c.nums&&n!==c.nums);};
    var good=ids.filter(id=>!clash(id)),p2=pick(good.length?good:ids);
    r.niveau=2;r.candidat=p2[0];r.score=good.length?0.95:0.9;r.nb=ids.length;r.statut=(ids.length===1&&good.length===1)?'r':'v';return r;
  }
  // alias manuel (réglages du catalogue) : même recherche avec l'autre nom
  if(!noAlias&&M.alias&&M.alias[c.strict]){
    var ra=matchVariety(M,{},M.alias[c.strict],breeder,familia,type,true);
    if((ra.statut==='r'||ra.statut==='v')&&ok(ra.candidat)){r.niveau=ra.niveau;r.candidat=ra.candidat;r.score=ra.score;r.statut=ra.statut;r.via='alias';return r;}
  }
  // acronyme, dans les deux sens : nom court (2 à 5 lettres) ↔ initiales d'un nom de la base (mots vides ignorés),
  // ou acronyme écrit dans le nom de la fiche. Automatique seulement si une seule fiche reste après breeder et déclinaison
  // ET qu'elle est vendue par ce breeder ; sinon « à vérifier ».
  var al=alphaToks(c.strict),alF=A?al.filter(t=>!STOP_INI.test(t)):al,pool=null;
  if(alF.length===1&&c.strict.split(' ').length<=2&&(A?/^[a-z]{2,5}$/:/^[a-z]{2,4}$/).test(alF[0])){
    pool=(M.ini[alF[0]]||[]).slice();if(A)(M.short[alF[0]]||[]).forEach(id=>{if(pool.indexOf(id)<0)pool.push(id);});
  }else if(alF.length>=2&&(A||al.length===c.strict.split(' ').length))pool=M.short[A?initials2(c.strict):al.map(t=>t[0]).join('')]||null;
  if(pool&&pool.length){
    var cand=pool.filter(ok);
    if(cand.length){
      var picked=A?pick(cand):cand,byB=picked.filter(id=>sameBreeder(M,id,b));
      r.niveau='a';r.candidat=byB[0]||picked[0];r.score=0.9;r.nb=pool.length;
      r.statut=(A?(picked.length===1&&byB.length===1):(pool.length===1&&byB.length===1))?'r':'v';return r;
    }
  }
  var top=similar(M,c.soft,1,id=>!ok(id));
  if(top.length){r.candidat=top[0].id;r.score=top[0].score;if(top[0].score>=SIM_REVIEW){r.niveau=3;r.statut='v';}}
  if(r.statut==='n'&&rej.length)r.statut='x';
  return r;
}
function groupOf(strict,breeder,type){return [strict,base0(breeder),type||''].join('~');}

var API={nrm:nrm,clean:clean,DEF_RULES:DEF_RULES,compileRules:compileRules,rules:rules,setSettingsSource:setSettingsSource,escRe:escRe,words:words,
  findPack:findPack,displayName:displayName,parseNombre:parseNombre,LABELS:LABELS,nums:nums,parseDesc:parseDesc,
  SIM_REVIEW:SIM_REVIEW,base0:base0,key0:key0,PACK_RE:PACK_RE,breederWords:breederWords,stripEdges:stripEdges,joinLetters:joinLetters,cleanName:cleanName,
  alphaToks:alphaToks,trig:trig,MATCH_OPTS:MATCH_OPTS,STOP_INI:STOP_INI,initials2:initials2,BR_GENERIC:BR_GENERIC,breederKey:breederKey,
  buildMatcher:buildMatcher,similar:similar,decisionKey:decisionKey,sameBreeder:sameBreeder,matchVariety:matchVariety,groupOf:groupOf};
if(typeof module==='object'&&module.exports)module.exports=API;
root.GSTCore=API;
})(typeof window!=='undefined'?window:globalThis);
