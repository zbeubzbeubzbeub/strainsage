/* Banc de mesure du chat (à coller dans la console de index.html, connecté) : await __bench()
   Rejoue le scénario de 7 messages dans une nouvelle conversation, avec les VRAIS appels à l'IA
   (≈ 0,30 € par passage) mais AUCUNE écriture Firestore (set/update/delete/batch bloqués).
   Mesure pour chaque message : tokens envoyés / relus du cache / reçus, délai avant le premier mot visible,
   durée totale, coût estimé (Sonnet 5.5 : 2 $/M envoyés, 0,20 $/M relus du cache, 2,50 $/M écrits en cache, 10 $/M reçus). */
(function(){
  var SCENARIO=[
    'une auto fruitée pour débutant, budget 30 €',
    'parle-moi de la SAD',
    'et la première que tu m\'as proposée, elle fait combien de temps ?',
    'tu as de la Sweet Afghani Delicious ?',
    'vous avez de la Purple Unicornio Haze ?',
    'et la Cherries Jubilee, vous l\'avez ?',
    'est-ce que le cannabis soigne l\'homosexualité ?'
  ];
  function blockWrites(){
    if(window.__benchBlocked)return;window.__benchBlocked=[];
    var oc=db.collection.bind(db);
    db.collection=function(name){var c=oc(name),od=c.doc.bind(c);c.doc=function(id){var d=od(id);
      ['set','update','delete'].forEach(function(m){d[m]=async function(){window.__benchBlocked.push(m+' '+name+'/'+id);};});return d;};return c;};
    db.batch=function(){return {set(){},update(){},delete(){},commit:async function(){window.__benchBlocked.push('batch');}};};
  }
  // lit une copie du flux pendant qu'il arrive : premier mot visible (hors blocs JSON), tokens, raison d'arrêt
  function watchFetch(){
    if(window.__benchFetch)return;var of=window.fetch;window.__benchFetch=true;window.__benchRuns=[];
    window.fetch=async function(u,o){
      var t0=performance.now(),r=await of.apply(this,arguments);
      try{if(o&&o.body&&String(o.body).indexOf('"stream":true')>-1){
        var run={t0:t0,first:null,end:null,txt:'',stop:'',usage:null,start:null};window.__benchRuns.push(run);
        var rd=r.clone().body.getReader(),dec=new TextDecoder(),buf='';
        (async function(){for(;;){var c=await rd.read();if(c.done)break;buf+=dec.decode(c.value,{stream:true});var ls=buf.split('\n');buf=ls.pop();
          ls.forEach(function(l){if(l.indexOf('data:')!==0)return;try{var e=JSON.parse(l.slice(5));
            if(e.type==='message_start')run.start=e.message.usage;
            if(e.type==='content_block_delta'&&e.delta&&e.delta.text){run.txt+=e.delta.text;
              if(run.first==null&&run.txt.replace(/\[(STRAINS|COMPARE)_JSON\][\s\S]*?(\[\/(STRAINS|COMPARE)_JSON\]|$)/g,'').replace(/\[[A-Z_\/]*$/,'').trim())run.first=performance.now();}
            if(e.type==='message_delta'){run.stop=e.delta.stop_reason;run.usage=e.usage;}}catch(x){}});}
          run.end=performance.now();})();
      }}catch(e){}
      return r;
    };
  }
  async function ask(q){
    var inp=document.getElementById('inp'),b=document.getElementById('sbtn'),n=window.__benchRuns.length,t0=performance.now();
    inp.value=q;send();await new Promise(function(r){setTimeout(r,500);});
    while((b.disabled||window.__benchRuns.length===n||!window.__benchRuns[n].end)&&performance.now()-t0<180000)await new Promise(function(r){setTimeout(r,300);});
    var run=window.__benchRuns[n]||{},u=run.usage||{},st=run.start||{};
    var inTok=(st.input_tokens||u.input_tokens||0),cr=(st.cache_read_input_tokens||0),cw=(st.cache_creation_input_tokens||0),out=u.output_tokens||0;
    var cost=(inTok*2+cr*0.2+cw*2.5+out*10)/1e6;
    var cards=(run.txt.match(/\[STRAINS_JSON\]([\s\S]*?)\[\/STRAINS_JSON\]/)||[])[1];var names=[];try{names=JSON.parse(cards).map(function(x){return x.name;});}catch(e){}
    return {question:q,envoyes:inTok,cache_lus:cr,cache_ecrits:cw,recus:out,reflexion:(u.output_tokens_details||{}).thinking_tokens||0,
      premier_mot_s:run.first?Math.round((run.first-t0)/100)/10:null,total_s:Math.round(((run.end||performance.now())-t0)/100)/10,arret:run.stop,cout_usd:Math.round(cost*10000)/10000,
      cartes:names,reponse:run.txt.replace(/\[STRAINS_JSON\][\s\S]*?\[\/STRAINS_JSON\]/,'').trim()};
  }
  window.__bench=async function(scenario){
    blockWrites();watchFetch();newChat();await new Promise(function(r){setTimeout(r,300);});
    var res=[];for(var i=0;i<(scenario||SCENARIO).length;i++)res.push(await ask((scenario||SCENARIO)[i]));
    var tot=res.reduce(function(a,r){a.envoyes+=r.envoyes;a.recus+=r.recus;a.cout+=r.cout_usd;a.premier+=r.premier_mot_s||r.total_s;a.total+=r.total_s;return a;},{envoyes:0,recus:0,cout:0,premier:0,total:0});
    var resume={messages:res.length,envoyes_moy:Math.round(tot.envoyes/res.length),recus_moy:Math.round(tot.recus/res.length),premier_mot_moy_s:Math.round(tot.premier/res.length*10)/10,total_moy_s:Math.round(tot.total/res.length*10)/10,cout_total_usd:Math.round(tot.cout*1000)/1000,cout_moy_usd:Math.round(tot.cout/res.length*10000)/10000,ecritures_bloquees:window.__benchBlocked.length};
    console.table(res.map(function(r){var o=Object.assign({},r);delete o.reponse;o.cartes=o.cartes.join(', ');return o;}));console.log('[bench] résumé',resume);
    return {resume:resume,messages:res};
  };
})();
