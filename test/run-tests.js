/* Tests automatisés StrainSage (Node, sans dépendance) : node test/run-tests.js
   - fonctions pures du catalogue (gst-core.js) : découpage des noms, packs, déclinaisons, acronymes, breeders, rapprochement, descripcionCorta ;
   - chat (varietes.js) avec un Firestore simulé : noms cités, abréviations, variétés absentes, critères, contexte envoyé à l'IA.
   Aucun appel réseau, aucune lecture ni écriture dans le vrai Firestore. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..');
let pass=0,fail=0;const fails=[];
function t(name,fn){try{fn();pass++;}catch(e){fail++;fails.push(name+'\n    '+e.message);}}
async function ta(name,fn){try{await fn();pass++;}catch(e){fail++;fails.push(name+'\n    '+e.message);}}
function eq(a,b,msg){const A=JSON.stringify(a),B=JSON.stringify(b);if(A!==B)throw new Error((msg?msg+' : ':'')+'obtenu '+A+', attendu '+B);}
function ok(v,msg){if(!v)throw new Error(msg||'condition fausse');}

/* ══ 1. NOYAU PARTAGÉ ══ */
const C=require(path.join(ROOT,'gst-core.js'));
C.setSettingsSource(()=>null);C.compileRules(null);
const pn=(n,m,g,f)=>C.parseNombre(n,m||'',g||'',f||'');

t('pack « 3+1 u. » : 4 graines dont 1 offerte',()=>{const r=pn('SAD 3+1 u.','Sweet Seeds');eq([r.variete,r.nbGraines,r.offertes,r.granel],['SAD',4,1,false]);});
t('pack « 5+2 u. » : 7 graines dont 2 offertes',()=>{const r=pn('SAD Fast Version 5+2 u.','Sweet Seeds');eq([r.variete,r.nbGraines,r.offertes],['SAD Fast Version',7,2]);});
t('pack « 25 u. » : vrac pro au seuil de 25',()=>{const r=pn('Critical 25 u.','Royal Queen Seeds');eq([r.variete,r.nbGraines,r.granel],['Critical',25,true]);});
t('pack « 10 u. » sous le seuil : pas de vrac',()=>{eq(pn('Critical 10 u.').granel,false);});
t('« Granel » dans le nom : vrac, retiré du nom',()=>{const r=pn('Granel Profesionales Critical 100 u.');eq([r.variete,r.granel],['Critical',true]);});
t('« Granel » dans la famille : vrac',()=>{eq(pn('Critical 5 u.','','','Granel Profesionales').granel,true);});
t('« x3 » retiré du nom de base',()=>{eq(C.cleanName('Amnesia x3',[]).strict,'amnesia');});
t('« #4 » n\'est jamais un pack',()=>{const r=pn('Gorilla Glue #4 5 u.');eq([r.variete,r.nbGraines],['Gorilla Glue #4',5]);});
t('« 00 Seeds » n\'est pas un pack de 0 graine',()=>{eq(pn('Bubble Gum 00 Seeds 3 u.','00 Seeds').nbGraines,3);});
t('« 10 reg. » : pack de 10, régulière',()=>{const r=pn('Skunk 10 reg.');eq([r.variete,r.nbGraines,r.typeGraine],['Skunk',10,'regular']);});
t('« fem. » retiré du nom affiché',()=>{eq(pn('Gorilla Glue fem. 3 u.').variete,'Gorilla Glue');});
t('nom numérique « 2090 » gardé',()=>{eq(pn('2090 3 u.').variete,'2090');});
t('nom « 11:11 » gardé',()=>{eq(pn('11:11 5 u.').variete,'11:11');});

t('déclinaison en préfixe : Auto SAD',()=>{const c=C.cleanName('Auto SAD',['Sweet Seeds']);eq([c.strict,c.variant],['sad','sad auto']);});
t('déclinaison en suffixe : SAD Fast Version',()=>{const c=C.cleanName('SAD Fast Version',['Sweet Seeds']);eq([c.strict,c.variant],['sad','sad fast']);});
t('déclinaisons XL et CBD en fin de nom',()=>{eq(C.cleanName('Big Bud XL',[]).variant,'big bud xl');eq(C.cleanName('Critical CBD',[]).variant,'critical cbd');});
t('nom strict et souple : Gorilla Glue #4',()=>{const c=C.cleanName('Gorilla Glue #4',[]);eq([c.strict,c.soft,c.nums],['gorilla glue 4','gorilla glue','4']);});
t('lettres isolées recollées : S.A.D.',()=>{eq(C.cleanName('S.A.D.',[]).strict,'sad');});
t('accents et majuscules',()=>{eq(C.cleanName('CRÈME Brûlée',[]).strict,'creme brulee');});
t('breeder en fin de nom retiré',()=>{eq(C.cleanName('Critical Royal Queen Seeds',['Royal Queen Seeds']).strict,'critical');});
t('forme courte d\'un breeder trop générique non retirée (Sweet)',()=>{eq(C.cleanName('Sweet Afghani Delicious',['Sweet Seeds']).strict,'sweet afghani delicious');});
t('jamais tout le nom retiré',()=>{eq(C.cleanName('Auto',[]).strict,'auto');});

t('initiales : mots vides ignorés',()=>{eq(C.initials2('sweet afghani delicious'),'sad');eq(C.initials2('la casa de papel'),'cp');eq(C.initials2('gelato'),'');});
t('clé de breeder : K.C. BRAINS = KC Brains',()=>{eq(C.breederKey('K.C. BRAINS'),C.breederKey('KC Brains'));});
t('clé de breeder : FAST BUDS = FastBuds Seeds',()=>{eq(C.breederKey('FAST BUDS'),C.breederKey('FastBuds Seeds'));});
t('clé de breeder : casse et « Seeds »',()=>{eq(C.breederKey('SWEET SEEDS'),'sweet');eq(C.breederKey('Sweet Seeds'),'sweet');});
t('clé de catalogue côté chat = nom de base de l\'admin',()=>{eq(C.key0('S.A.D.'),'sad');eq(C.key0('Crème  Brûlée'),'creme brulee');});

t('descripcionCorta : THC, floraison, production, hauteur',()=>{const d=C.parseDesc('THC: 20-22% Floración: 8-9 semanas Producción: 500 g/m2 Altura: 100-150 cm');
  eq([d.thcMin,d.thcMax,d.floMin,d.floMax,d.production,d.hauteur],[20,22,8,9,'500 g/m2','100-150 cm']);});
t('descripcionCorta : floraison en jours',()=>{const d=C.parseDesc('Floración: 60 días');eq([d.floMin,d.floMax],[8.5,8.5]);});
t('descripcionCorta : THC sans % ignoré',()=>{eq(C.parseDesc('THC: alto').thcMax,null);});
t('descripcionCorta : CBD',()=>{eq(C.parseDesc('THC: 0,5% CBD: 10-12%').cbdMax,12);});

/* rapprochement : base simulée (index de la base : id|nom|alias ; breeders : id|breeder1,breeder2) */
function matcher(entries,breeders,settings){return C.buildMatcher({entries:entries,breeders:breeders||[],hasBreeders:true,settings:settings||{}},{breederKey:true,acro2:true});}
const BASE=['sad-s1|S.A.D. Sweet Afgani Delicious S1','f1-fast|F1 Fast Version','gg4|Gorilla Glue #4|GG4','gg5|Gorilla Glue #5','amnesia-haze|Amnesia Haze','purple-haze|Purple Haze',
  'n2090|2090','n1111|11:11','critical|Critical','critical-auto|Critical Auto','wedding-cake|Wedding Cake','big-bud|Big Bud'];
const BR=['sad-s1|Sweet Seeds','f1-fast|Sweet Seeds','critical|Royal Queen Seeds','critical-auto|Royal Queen Seeds','gg4|GG Strains','wedding-cake|'];
const M=matcher(BASE,BR);
const mv=(v,b,type)=>{const r=C.matchVariety(M,{},v,b||'','',type||'f');return [r.statut,String(r.niveau),r.candidat];};
t('niveau 1 : nom strict identique',()=>{eq(mv('Gorilla Glue #4','GG Strains'),['r','1','gg4']);});
t('niveau 1 : déclinaison retirée (Purple Haze Auto)',()=>{eq(mv('Purple Haze Auto','','a'),['r','1','purple-haze']);});
t('niveau 1 : la déclinaison départage (Critical / Critical Auto)',()=>{eq(mv('Critical Auto','Royal Queen Seeds','a'),['r','1','critical-auto']);eq(mv('Critical','Royal Queen Seeds','f'),['r','1','critical']);});
t('niveau 2 : numéro absent → à vérifier (Gorilla Glue)',()=>{eq(mv('Gorilla Glue','')[0],'v');});
t('acronyme : SAD (Sweet Seeds) → S.A.D. Sweet Afgani Delicious',()=>{eq(mv('SAD','Sweet Seeds'),['r','a','sad-s1']);});
t('acronyme : Auto SAD → même fiche',()=>{eq(mv('Auto SAD','Sweet Seeds','a'),['r','a','sad-s1']);});
t('acronyme : nom complet → fiche (Sweet Afgani Delicious)',()=>{eq(mv('Sweet Afgani Delicious','Sweet Seeds')[2],'sad-s1');});
t('acronyme sans le bon breeder : jamais automatique',()=>{eq(mv('SAD','Autre Breeder')[0],'v');});
t('fiche sans breeder : jamais écartée au niveau 1',()=>{eq(mv('Wedding Cake','Barneys Farm'),['r','1','wedding-cake']);});
t('noms numériques : 2090 et 11:11',()=>{eq(mv('2090','')[2],'n2090');eq(mv('11:11','')[2],'n1111');});
t('niveau 3 : faute de frappe → à vérifier (Weding Cake)',()=>{eq(mv('Weding Cake','').slice(0,2),['v','3']);eq(mv('Amnezia Haze','')[0],'n','similarité 0,75 sous le seuil 0,85');});
t('absente : non trouvé',()=>{eq(mv('Purple Unicornio Zzz','')[0],'n');});
t('décision manuelle prioritaire',()=>{const D={};D[C.decisionKey('sad','Sweet Seeds')]={valide:'f1-fast'};const r=C.matchVariety(M,D,'SAD','Sweet Seeds','','f');eq([r.statut,r.niveau,r.candidat],['r','m','f1-fast']);});
t('alias manuel des réglages',()=>{const M2=matcher(BASE,BR,{alias:[{alias:'GG',nom:'Gorilla Glue #4'}]});const r=C.matchVariety(M2,{},'GG','GG Strains','','f');eq([r.statut,r.candidat,r.via],['r','gg4','alias']);});

/* ══ 2. CHAT (varietes.js) AVEC FIRESTORE SIMULÉ ══ */
function fakeDb(docs){
  return {collection(c){return {doc(id){return {get(){const d=docs[c+'/'+id];return Promise.resolve({exists:!!d,data(){return d;}});}};}};}};
}
// ligne d'index du catalogue (27 champs, cf. admin.html entryOf)
function art(o){const f=new Array(27).fill('');
  Object.assign(f,{0:o.code,1:o.v,2:o.b||'',3:o.t||'f',4:o.nb==null?'':o.nb,6:o.thc||'',8:o.flo||'',9:o.pvp==null?'':o.pvp,10:o.dispo==null?'1':o.dispo,12:o.vid||'',
    17:o.vid?'r':'n',21:o.g||(o.base+'~'+(o.b||'').toLowerCase()+'~'+(o.t||'f')),23:o.retire?'R':'',24:o.off||'',25:o.granel?'G':'',26:o.base});return f.join('|');}
const CAT=[
  art({code:'1',v:'SAD',b:'Sweet Seeds',nb:4,off:1,pvp:24.5,vid:'sad-s1',base:'sad',g:'sad~sweet seeds~f'}),
  art({code:'2',v:'SAD',b:'Sweet Seeds',nb:7,off:2,pvp:39,vid:'sad-s1',base:'sad',g:'sad~sweet seeds~f'}),
  art({code:'3',v:'SAD',b:'Sweet Seeds',nb:100,pvp:400,granel:true,vid:'sad-s1',base:'sad',g:'sad~sweet seeds~f'}),
  art({code:'4',v:'SAD Fast Version',b:'Sweet Seeds',nb:4,off:1,pvp:26,base:'sad',g:'sad fast~sweet seeds~f'}),
  art({code:'5',v:'Auto SAD',b:'Sweet Seeds',t:'a',nb:4,off:1,pvp:27,flo:'9',base:'sad',g:'sad auto~sweet seeds~a'}),
  art({code:'6',v:'Critical Auto',b:'Royal Queen Seeds',t:'a',nb:3,pvp:22,vid:'critical-auto',base:'critical',g:'critical auto~royal queen seeds~a'}),
  art({code:'7',v:'Gorilla Glue #4',b:'GG Strains',nb:3,pvp:35,dispo:'0',vid:'gg4',base:'gorilla glue 4'}),
  art({code:'8',v:'Granel Only',b:'X',nb:100,pvp:300,granel:true,base:'granel only'}),
  art({code:'9',v:'2090',b:'Y',nb:3,pvp:30,base:'2090'})
];
const VIDX=['sad-s1|S.A.D. Sweet Afgani Delicious S1','critical-auto|Critical Auto','gg4|Gorilla Glue #4|GG4','purple-haze|Purple Haze','zkittlez|Zkittlez'];
// facettes : id|type|dom|thcMin|thcMax|cbdMax|floMin|floMax|auto|diff|haut|rend|env|mold|nProd|eff|neg|gouts|terps
const FAC=['critical-auto|h||16|18||8|9|1|f|c|e|i||5|relaxant|||fruity,mango|myrcene','sad-s1|i|i|20|24||8|9|0|m|m|e|i||3|relaxant,euphorique||sweet,fruity|',
  'zkittlez|i||18|20||8|9|0|f|m|m|i||2|relaxant||fruity,grape|'];
function loadClient(){
  const docs={'varietes_index/meta':{parts:1,fparts:1},'varietes_index/part_0':{entries:VIDX},'varietes_index/f_0':{entries:FAC},
    'catalogue_gst_index/meta':{parts:1,alias:{}},'catalogue_gst_index/part_0':{entries:CAT},
    'varietes/sad-s1':{nom:'S.A.D. Sweet Afgani Delicious S1',type:'indica',thc_min:20,thc_max:24,effets:['relaxant'],gouts:['sucré'],floraison_sem_min:8,floraison_sem_max:9},
    'varietes/critical-auto':{nom:'Critical Auto',type:'hybride',autofloraison:true,effets:['relaxant'],gouts:['fruité']},
    'varietes/zkittlez':{nom:'Zkittlez',type:'indica',effets:['relaxant'],produits:[{breeder:'Banque Concurrente'}]}};
  const ctx={console:{info(){},warn(){},error(){},log(){}},setTimeout,Promise,URL};ctx.window=ctx;ctx.globalThis=ctx;ctx.db=fakeDb(docs);
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT,'gst-core.js'),'utf8'),ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT,'varietes.js'),'utf8'),ctx);
  return ctx.VarDB;
}

(async function(){
  const V=loadClient();
  await V.load();await V.loadCatalogue();
  await ta('index de la base chargé',async()=>{eq(V.size(),5);});
  await ta('recherche par abréviation : « parle-moi de la SAD »',async()=>{eq(V.findNamed('parle-moi de la SAD').named.map(n=>n.base),['sad']);});
  await ta('recherche par nom complet : « Sweet Afghani Delicious » → SAD',async()=>{const r=V.findNamed('tu as de la Sweet Afghani Delicious ?').named;eq(r.map(n=>[n.base,n.via]),[['sad','initiales']]);});
  await ta('recherche par nom avec « # » : Gorilla Glue #4',async()=>{eq(V.findNamed('vous avez la gorilla glue #4 ?').named.map(n=>n.base),['gorilla glue 4']);});
  await ta('variété absente détectée : Purple Unicornio Haze',async()=>{eq(V.askedName('vous avez de la Purple Unicornio Haze ?'),'purple unicornio haze');});
  await ta('pas de faux « absente » pour une demande par critères',async()=>{eq(V.askedName('tu as une auto fruitée ?'),'');});
  await ta('critères : auto + fruité + débutant',async()=>{eq(V.parseCriteria('une auto fruitée pour débutant, budget 30 €',[]).map(c=>c.k).sort(),['auto','facile','fruity']);});
  await ta('critère nié : « pas trop fort »',async()=>{const k=V.parseCriteria('quelque chose de pas trop fort',[]).map(c=>c.k);ok(k.indexOf('light')>-1&&k.indexOf('strong')<0,JSON.stringify(k));});
  await ta('détection de variété de la base (majuscule requise pour un nom générique)',async()=>{eq(V.detect('je cherche une Zkittlez',5).map(e=>e.id),['zkittlez']);eq(V.detect('un goût zkittlez',5).map(e=>e.id),[]);});
  await ta('packs : vrac masqué, « 3 + 1 offerte »',async()=>{const it=V.gstFor('1');eq(V.packsOf(it).map(V.seedsLabel),['4 graines (3 + 1 offerte)','7 graines (5 + 2 offertes)']);});
  await ta('rupture chez le fournisseur',async()=>{eq(V.statusOf(V.gstFor('7')),'en rupture chez le fournisseur');});
  await ta('contexte « parle-moi de la SAD » : 3 déclinaisons, packs et prix, sans vrac',async()=>{
    const r=await V.catalogueContext('parle-moi de la SAD',{raw:'parle-moi de la SAD'});
    ok(/3 déclinaisons/.test(r.ctx),'3 déclinaisons');ok(/SAD Fast Version/.test(r.ctx)&&/Auto SAD/.test(r.ctx),'déclinaisons');
    ok(/4 graines \(3 \+ 1 offerte\) 24,50 €/.test(r.ctx),'pack 4');ok(/7 graines \(5 \+ 2 offertes\) 39,00 €/.test(r.ctx),'pack 7');
    ok(!/100 graines|400,00/.test(r.ctx),'pas de vrac');ok(!/Granel Only/.test(r.ctx),'variété vendue seulement en vrac absente');});
  await ta('contexte : données de la base StrainSage injectées pour une variété citée',async()=>{
    const r=await V.catalogueContext('parle-moi de la SAD',{raw:'parle-moi de la SAD'});ok(/base StrainSage/.test(r.ctx),'fiche de la base absente du contexte');});
  await ta('contexte : variétés déjà présentées réinjectées (n°1)',async()=>{
    const r=await V.catalogueContext('et la première, elle fait combien de temps ?',{raw:'et la première, elle fait combien de temps ?',remember:[{name:'Critical Auto',gst:'6'}]});
    ok(/DÉJÀ PRÉSENTÉES[\s\S]*1\. Critical Auto/.test(r.ctx),'Critical Auto n°1');});
  await ta('contexte : variété absente signalée clairement',async()=>{
    const r=await V.catalogueContext('vous avez de la Purple Unicornio Haze ?',{raw:'vous avez de la Purple Unicornio Haze ?'});ok(/ABSENTES DU CATALOGUE[^\n]*purple unicornio haze/.test(r.ctx));});
  await ta('contexte : variété en rupture indiquée',async()=>{
    const r=await V.catalogueContext('vous avez la gorilla glue #4 ?',{raw:'vous avez la gorilla glue #4 ?'});ok(/Gorilla Glue #4[^\n]*en rupture chez le fournisseur/.test(r.ctx));});
  await ta('contexte : demande auto + budget 30 € → autos ≤ 30 €',async()=>{
    const r=await V.catalogueContext('une auto fruitée pour débutant, budget 30 €',{raw:'une auto fruitée pour débutant, budget 30 €'});
    ok(/Critical Auto/.test(r.ctx),'Critical Auto');ok(/budget ≤ 30 €/.test(r.ctx),'budget');ok(!/Gorilla Glue/.test(r.ctx),'pas de photopériode hors budget');});
  await ta('nom exact du catalogue : pas d\'acronyme parasite',async()=>{eq(V.findNamed('parle-moi de la SAD').named.length,1);});
  await ta('auto : pas de floraison prise sur une fiche photopériode',async()=>{const r=await V.catalogueContext('parle-moi de la SAD',{raw:'parle-moi de la SAD'});ok(/Auto SAD \[code 5\][^\n]*flo 9 sem\./.test(r.ctx));});
  await ta('variété déjà présentée : même nom chez un autre breeder aussi réinjecté',async()=>{const r=await V.catalogueContext('et sinon ?',{raw:'et sinon ?',remember:[{name:'SAD',gst:'1'}]});ok(/DÉJÀ PRÉSENTÉES[\s\S]*1\. SAD /.test(r.ctx)&&/n\'est PAS pour autant absente/.test(r.ctx));});
  await ta('nom purement numérique jamais détecté dans un message (budget, année)',async()=>{eq(V.detect('budget 2090 euros, en 1969',5).length,0);});
  await ta('contexte : fiche de la base sans « Dispo chez » (seul le catalogue dit ce qui est en vente)',async()=>{
    const r=await V.catalogueContext('parle-moi de la SAD',{raw:'parle-moi de la SAD'});ok(/FICHES BASE STRAINSAGE[\s\S]*S\.A\.D\. Sweet Afgani Delicious/.test(r.ctx),'fiche');ok(!/Dispo chez/.test(r.ctx),'pas de banques concurrentes');});
  await ta('fiches citées avec catalogue : consigne « seul le catalogue fait foi »',async()=>{
    const r=await V.buildContext('je cherche une Zkittlez',[],null,{catalogue:true});ok(/seul le catalogue du grossiste fait foi/.test(r.ctx)&&!/Dispo chez/.test(r.ctx));});
  await ta('contexte : aucune mention interne interdite dans les règles',async()=>{
    const r=await V.catalogueContext('parle-moi de la SAD',{raw:'parle-moi de la SAD'});ok(/Ne parle jamais de « liste »/.test(r.ctx));});

  console.log('\n'+pass+' tests réussis, '+fail+' en échec');
  fails.forEach(f=>console.log('✗ '+f));
  process.exit(fail?1:0);
})();
