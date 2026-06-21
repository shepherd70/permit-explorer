// Headless harness for the live city explorer (stubbed fetch). Run: node test/city_harness.js
// Asserts behaviour against canned Socrata responses; exits non-zero on any failure.
// --- tiny assertion framework ---
let failures=0, passes=0;
function check(name,cond,got){ if(cond){passes++;console.log('  PASS',name);} else {failures++;console.error('  FAIL',name,got!==undefined?('-> got: '+JSON.stringify(got)):'');} }
const digits=s=>String(s==null?'':s).replace(/[^0-9]/g,'');

// --- DOM stubs ---
const els={};
function el(id){ if(!els[id]) els[id]={id,value:'',textContent:'',innerHTML:'',className:'',style:{},options:[],disabled:false,
  add(o){this.options.push(o); if(this.options.length===1&&this.value==='')this.value=o.value;},
  appendChild(){}, classList:{_s:new Set(),toggle(c,on){on?this._s.add(c):this._s.delete(c)},add(c){this._s.add(c)},remove(c){this._s.delete(c)}}}; return els[id]; }
['f-work','f-status'].forEach(id=>el(id).value='all');
global.Option=function(t,v){return{text:t,value:String(v)}};
global.document={getElementById:el,createElement:()=>({}),body:{appendChild(){},removeChild(){}}};
global.Chart=class{constructor(c,cfg){this.data=(cfg&&cfg.data)||{labels:[],datasets:[]}}update(){}};
global.L={map:()=>({setView(){return this},fitBounds(){},closePopup(){},invalidateSize(){}}),tileLayer:()=>({addTo(){}}),
  layerGroup:()=>({addTo(){return this},clearLayers(){}}),
  circleMarker:()=>({bindPopup(){return this},addTo(){return this}}),
  geoJSON:(data,opts)=>{ (data&&data.features||[]).forEach(f=>{ if(opts&&opts.style)opts.style(f); if(opts&&opts.onEachFeature)opts.onEachFeature(f,{bindPopup(){return this}}); }); return {addTo(){return this},getBounds(){return {isValid(){return false}}}}; }};

// --- fetch stub: canned Socrata responses ---
let fetchLog=[];
global.fetch=async(url)=>{
  fetchLog.push(url);
  if((String(url).includes('surr-xmvs')||String(url).includes('.geojson')) && global.__failBoundaries) return {ok:false,status:503,statusText:'Service Unavailable',text:async()=>'',json:async()=>({})};
  if(String(url).includes('surr-xmvs')||String(url).includes('.geojson')) return {ok:true,status:200,text:async()=>'',json:async()=>({type:'FeatureCollection',features:[
    {type:'Feature',properties:{name:'HARVEST HILLS'},geometry:{type:'Polygon',coordinates:[[[-114.06,51.14],[-114.05,51.14],[-114.05,51.15],[-114.06,51.14]]]}},
    {type:'Feature',properties:{name:'DOWNTOWN COMMERCIAL CORE'},geometry:{type:'Polygon',coordinates:[[[-114.07,51.04],[-114.06,51.04],[-114.06,51.05],[-114.07,51.04]]]}},
    {type:'Feature',properties:{name:'NOWHERE LAND'},geometry:{type:'Polygon',coordinates:[[[-114.0,51.0],[-113.9,51.0],[-113.9,51.1],[-114.0,51.0]]]}}
  ]})};
  const u=new URL(url); const p=Object.fromEntries(u.searchParams);
  const sel=p['$select']||'', grp=p['$group']||'', where=p['$where']||'';
  const detailScope = where.includes("communityname) = 'HARVEST HILLS'");
  const json=(d)=>({ok:true,status:200,json:async()=>d,text:async()=>JSON.stringify(d)});
  if(sel.includes('count(1) as n, sum(estprojectcost)')&&!grp){
    // category-aware count: model Single Family as the dominant category so hiding it via
    // the `permitclassgroup IN (...)` clause drops the FILTERED count below DETAIL_THRESHOLD
    // and flips city->detail. If a future change drops the IN clause from THIS count query,
    // the flip assertion below breaks — which is the whole point of modelling it here.
    const CAT_N={'Single Family':489307,'Garage':1480};   // sum = 490787 (the full city count)
    const m=where.match(/permitclassgroup IN \(([^)]*)\)/);
    const n = detailScope ? 1480
      : m ? m[1].split(',').reduce((s,t)=>s+(CAT_N[t.replace(/'/g,'').trim()]||0),0)
      : 490787;
    const det = n<=30000;
    return json([{n:String(n),c:det?'220000000':'3.1e10',u:det?'949':'356804',d:'23.6'}]);
  }
  if(grp==='k'&&sel.includes('date_extract_y')&&sel.includes('sum'))
    return json([{k:'2018',n:'16689',c:'4.4e9',u:'8000',d:'20'},{k:'2019',n:'17373',c:'4.6e9',u:'9000',d:'22'}]);
  if(grp==='k'&&sel.includes('date_extract_y')) return json([{k:'1999',n:'6991'},{k:'2026',n:'8462'}]);
  if(grp==='k'&&sel.includes('communityname')) return json([{k:'DOWNTOWN COMMERCIAL CORE',n:'14614',lat:'51.045',lng:'-114.07',c:'9.0e9',d:'23.9',done:'13223',openn:'492'},{k:'HARVEST HILLS',n:'1480',lat:'51.14',lng:'-114.06',c:'2.2e8',d:'20',done:'1400',openn:'40'}]);
  if(grp==='k'&&sel.includes('permitclassgroup')) return json([{k:'Single Family',n:'200000'},{k:'Garage',n:'50000'}]);
  if(grp==='k'&&sel.includes('workclass')) return json([{k:'New',n:'250000'},{k:'Alteration',n:'180000'}]);
  if(grp==='k'&&sel.includes('statuscurrent')) return json([{k:'Completed',n:'400000'},{k:'Cancelled',n:'20000'},{k:'Issued Permit',n:'30000'}]);
  if(grp==='b'&&sel.includes('case(')) return json([{b:'0',n:'100'},{b:'2',n:'300'},{n:'50'}]);
  if(grp==='k'&&sel.includes('date_extract_m')) return json(Array.from({length:12},(_,i)=>({k:String(i+1),n:String(1000+i)})));
  if(grp==='k'&&sel.includes('contractorname')) return json([{k:'CEDARGLEN GROUP (THE)',n:'5000'}]);
  if(sel.startsWith('permitnum')&&p['$limit']==='30000')
    return json(Array.from({length:1480},(_,i)=>({permitnum:'BP'+i,statuscurrent:i%10?'Completed':'Cancelled',
      applieddate:`20${10+(i%15)}-0${1+(i%9)}-05T00:00:00.000`,issueddate:`20${10+(i%15)}-0${1+(i%9)}-08T00:00:00.000`,
      permittype:'T',permitclass:'1106',permitclassgroup:i%5?'Single Family':'Garage',workclass:i%3?'Alteration':'New',
      description:'work item '+i,contractorname:i%4?'ACME':null,housingunits:String(i%2),estprojectcost:String(1000*(i+1)),
      originaladdress:(i%300)+' FAKE ST NW',communityname:'HARVEST HILLS',latitude:'51.14',longitude:'-114.06'})));
  if(sel.startsWith('permitnum')) return json([{permitnum:'BP1',statuscurrent:'Completed',applieddate:'2024-01-02T00:00:00.000',permitclassgroup:'Single Family',workclass:'New',description:'d',contractorname:'X',estprojectcost:'5000',originaladdress:'1 A ST',communityname:'ACADIA'}]);
  return json([]);
};

const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','src','city_explorer.html'),'utf8');
const src=html.match(/<script>([\s\S]*?)<\/script>/)[1];
eval(src+'\nglobalThis.D=D;');

(async()=>{
  await new Promise(r=>setTimeout(r,50)); // let init's async finish
  console.log('after init: year options:', el('f-y1').options.length, '| communities:', D.communities.length);
  check('init populated year options', el('f-y1').options.length===2, el('f-y1').options.length);
  check('init populated communities', D.communities.length===2, D.communities.length);

  // --- permit-category multi-select: built from the permitclassgroup list, EVERY category checked by default ---
  check('init built category list', !!D.cats && D.cats.length===2, D.cats && D.cats.length);
  check('every category checked by default (incl. Single Family)', !!D.activeCats && D.activeCats.has('Single Family') && D.activeCats.has('Garage') && D.activeCats.size===2, D.activeCats && [...D.activeCats]);
  check('where() has no category clause by default', !/permitclassgroup IN/.test(D.where()), D.where());

  await D.apply();   // default is all-categories-shown → full-city baseline below
  console.log('CITY MODE:', D.mode, '| total:', D.total, '| badge:', el('count-badge').textContent);
  console.log('  KPI count:', el('k-count').textContent, '| cost:', el('k-cost').textContent, '| avg dti:', el('k-dti').textContent, '| completion:', el('k-comp').textContent);
  console.log('  year chart pts:', D.charts.year.data.labels.length, '| comm bubbles:', D.stats.comms.length);
  console.log('  table rendered:', /<tbody>/.test(el('tbl').innerHTML), '| renov locked:', el('card-renov').classList._s.has('locked'));
  console.log('  insights:', (el('insights').innerHTML.match(/class="insight"/g)||[]).length);
  check('city mode selected', D.mode==='city', D.mode);
  check('city total', D.total===490787, D.total);
  // the city explorer sets count-badge via innerHTML (a <span> wrapper), so read innerHTML
  check('city count badge', digits(el('count-badge').innerHTML)==='490787', el('count-badge').innerHTML);
  check('city KPI count', digits(el('k-count').textContent)==='490787', el('k-count').textContent);
  check('city KPI total cost', el('k-cost').textContent==='$31.00B', el('k-cost').textContent);
  check('city KPI avg days-to-issue', el('k-dti').textContent==='24', el('k-dti').textContent);
  check('city KPI completion rate', el('k-comp').textContent==='95%', el('k-comp').textContent);
  check('city year chart points', D.charts.year.data.labels.length===2, D.charts.year.data.labels.length);
  check('city communities loaded', D.stats.comms.length===2, D.stats.comms.length);
  check('city table rendered', /<tbody>/.test(el('tbl').innerHTML));
  check('renov card locked in city mode', el('card-renov').classList._s.has('locked')===true);
  check('city insights generated', (el('insights').innerHTML.match(/class="insight"/g)||[]).length>=5);

  // --- community choropleth (city mode is ALWAYS a choropleth now; no bubbles toggle) ---
  await new Promise(r=>setTimeout(r,30));        // let the preloaded boundaries resolve + the city render settle
  console.log('CHORO: boundaries:', !!D.boundaries, '| metric:', D.choroMetric, '| legend:', el('map-legend').innerHTML.slice(0,80));
  check('choropleth boundaries fetched', !!D.boundaries && (D.boundaries.features||[]).length===3, D.boundaries&&(D.boundaries.features||[]).length);
  check('default shading metric is avg permits/year', D.choroMetric==='ppy', D.choroMetric);
  // ppy must equal community permit count / selected year-span (1999..2026 -> 28); guards the n/yspan formula incl. the +1
  { const ysp=(+D.val('f-y2'))-(+D.val('f-y1'))+1;
    check('ppy = permits / selected year-span (yspan=28)', ysp===28 && D.stats.comms.length>0 && D.stats.comms.every(c=>Math.abs(c.ppy-c.n/ysp)<1e-9),
      {ysp, sample:D.stats.comms[0]&&{n:D.stats.comms[0].n,ppy:D.stats.comms[0].ppy}}); }
  check('map controls shown in city mode', el('map-controls').style.display==='', el('map-controls').style.display);
  check('choropleth legend shows permits/year gradient', /lg-grad/.test(el('map-legend').innerHTML) && /permits ?\/ ?year/i.test(el('map-legend').innerHTML), el('map-legend').innerHTML.slice(0,110));
  D.setChoroMetric('cost');
  check('metric switch -> avg project cost', /lg-grad/.test(el('map-legend').innerHTML) && /Avg project cost/.test(el('map-legend').innerHTML), el('map-legend').innerHTML.slice(0,90));
  D.setChoroMetric('comp');
  check('metric switch -> completion rate', /Completion rate/.test(el('map-legend').innerHTML), el('map-legend').innerHTML.slice(0,90));
  D.setChoroMetric('ppy');
  check('metric switch -> back to permits/year', /permits ?\/ ?year/i.test(el('map-legend').innerHTML), el('map-legend').innerHTML.slice(0,90));

  // no-vals fallback: when every community is below a metric's minN gate, draw bare boundaries (not a blank map)
  D.stats.comms.forEach(c=>c.n=2);               // below dti's minN (5); comms are rebuilt on the next apply() so this is local
  D.setChoroMetric('dti');
  check('no-vals fallback shows a not-enough-permits legend (not blank)', /not enough permits/i.test(el('map-legend').innerHTML), el('map-legend').innerHTML.slice(0,110));
  D.setChoroMetric('ppy');

  // boundary-load FAILURE must be recoverable and map-integrated (no blank, unrecoverable map)
  global.__failBoundaries=true; D.boundaries=null; D._bPromise=null;
  D.retryBoundaries(); await new Promise(r=>setTimeout(r,30));
  check('boundary failure shows a Retry affordance in the map', /Retry/.test(el('map-legend').innerHTML), el('map-legend').innerHTML.slice(0,120));
  check('boundary failure surfaces an error', el('err').classList._s.has('show'), el('err-text').textContent);
  global.__failBoundaries=false; D._bPromise=null;
  D.retryBoundaries(); await new Promise(r=>setTimeout(r,30));
  check('retry after recovery clears the error and reloads boundaries', !el('err').classList._s.has('show') && !!D.boundaries, [el('err').classList._s.has('show'), !!D.boundaries]);

  // drill into community -> detail mode
  el('f-comm').value='HARVEST HILLS';
  await D.apply();
  console.log('DETAIL MODE:', D.mode, '| total:', D.total, '| rows:', D.rows.length);
  console.log('  KPI median cost:', el('k-med').textContent, '| median dti:', el('k-dti').textContent);
  console.log('  renov lags:', D.renovLags.length, '| unlocked:', !el('card-renov').classList._s.has('locked'));
  console.log('  cost hist sum:', D.charts.costh.data.datasets[0].data.reduce((a,b)=>a+b,0));
  check('detail mode selected', D.mode==='detail', D.mode);
  check('detail total', D.total===1480, D.total);
  check('detail rows loaded', D.rows.length===1480, D.rows.length);
  check('detail median cost formatted', /^\$[\d.]+[KMB]?$/.test(el('k-med').textContent), el('k-med').textContent);
  check('detail median days-to-issue', el('k-dti').textContent==='3', el('k-dti').textContent);
  check('renov card unlocked in detail mode', el('card-renov').classList._s.has('locked')===false);
  check('detail cost histogram sums to rows', D.charts.costh.data.datasets[0].data.reduce((a,b)=>a+b,0)===1480, D.charts.costh.data.datasets[0].data.reduce((a,b)=>a+b,0));
  check('detail table rendered', /<tbody>/.test(el('tbl').innerHTML));

  // sort + page in detail mode
  D.sort('estprojectcost'); D.page(1);
  console.log('  pg-info after sort/page:', el('pg-info').textContent);
  check('detail pagination after sort+page', /^26\D?50 of 1\D?480$/.test(el('pg-info').textContent), el('pg-info').textContent);

  // empty-results pagination text
  D.total=0; D.pgUpdate(0,0);
  check('empty pagination shows No results', el('pg-info').textContent==='No results', el('pg-info').textContent);

  // race-condition guard: overlapping applies must settle on the LAST filter.
  // The first (city) call has a far longer fetch chain than the second (detail) call,
  // so WITHOUT the seq guard the superseded city call renders LAST and k-count shows
  // 490,787. WITH the guard it bails before rendering, leaving the detail value (1,480).
  el('f-comm').value=''; const p1=D.apply();          // -> city (490,787)
  el('f-comm').value='HARVEST HILLS'; const p2=D.apply(); // -> detail (1,480)
  await Promise.all([p1,p2]);
  console.log('OVERLAP: final mode:', D.mode, '| total:', D.total, '| k-count:', el('k-count').textContent, '| stats.head.n:', D.stats&&D.stats.head&&D.stats.head.n);
  check('overlapping applies settle on last filter (mode)', D.mode==='detail', D.mode);
  check('overlapping applies settle on last filter (total)', D.total===1480, D.total);
  check('overlapping applies — superseded city render suppressed (k-count)', digits(el('k-count').textContent)==='1480', el('k-count').textContent);
  check('overlapping applies — stats reflect last filter', D.stats&&D.stats.head&&D.stats.head.n===1480, D.stats&&D.stats.head&&D.stats.head.n);

  console.log('  err shown:', el('err').classList._s.has('show')?el('err-text').textContent:'none');
  check('no error surfaced', !el('err').classList._s.has('show'));
  console.log('fetches made:', fetchLog.length);

  // --- permit-category filter: select all / clear all / empty state / re-check ---
  el('f-comm').value='';                                  // back to a city-scope query
  D.catsAll(true); await new Promise(r=>setTimeout(r,30));
  check('select all activates every category', D.activeCats.size===2, D.activeCats.size);
  check('where() omits category clause when all shown', !/permitclassgroup IN/.test(D.where()), D.where());
  check('select all stays in city mode', D.mode==='city', D.mode);

  D.catsAll(false); await new Promise(r=>setTimeout(r,30));
  check('clear all hides every category', D.activeCats.size===0, D.activeCats.size);
  check('clear all -> no permits in scope', D.total===0, D.total);
  check('clear all -> results hidden', el('results').style.display==='none', el('results').style.display);
  check('clear all -> empty-state shown', el('empty-state').style.display==='', el('empty-state').style.display);
  check('clear all -> empty copy explains categories', /categor/i.test(el('empty-text').textContent), el('empty-text').textContent);

  D.toggleCatIdx(0,true); await new Promise(r=>setTimeout(r,30));  // re-check cats[0] = Single Family
  check('re-checking a category exits the empty state', D.activeCats.has('Single Family') && D.total>0, [D.total,[...D.activeCats]]);
  check('re-checking a category restores results', el('results').style.display==='', el('results').style.display);

  // the city/detail threshold evaluates the FILTERED count: in city scope (no community),
  // hiding the dominant category must drop the count below DETAIL_THRESHOLD and flip to detail
  el('f-comm').value='';
  D.activeCats=new Set(D.cats.map(c=>c.name)); D.renderCats(); await D.apply();
  check('all categories shown -> city mode (full count)', D.mode==='city' && D.total===490787, [D.mode,D.total]);
  D.toggleCatIdx(0,false); await new Promise(r=>setTimeout(r,30));   // hide Single Family (cats[0])
  check('hiding the dominant category flips city -> detail on the filtered count', D.mode==='detail' && D.total===1480, [D.mode,D.total]);

  D.initCats(); D.renderCats();                           // restore default (every category shown)
  check('initCats restores default (all categories shown)', D.activeCats.has('Single Family') && D.activeCats.has('Garage') && D.activeCats.size===2, [...D.activeCats]);

  // --- URL state round-trip for the map shading metric ---
  // readURL/writeURL no-op without a DOM location/history, so stub them here.
  global.location = {search:'', pathname:'/permit-explorer/', hash:'', _last:''};
  global.history = { replaceState:(s,t,url)=>{ global.location._last=url; } };
  D.choroMetric='comp'; D.writeURL();
  console.log('URL written:', global.location._last);
  check('writeURL encodes non-default metric=comp', /[?&]metric=comp/.test(global.location._last), global.location._last);
  D.choroMetric='ppy'; D.writeURL();
  check('writeURL omits default metric=ppy', !/metric=/.test(global.location._last), global.location._last);
  D.choroMetric='cost'; D.writeURL();
  check('writeURL encodes non-default metric=cost', /[?&]metric=cost/.test(global.location._last), global.location._last);
  global.location.search='?metric=dti'; D.choroMetric='ppy'; D.readURL();
  check('readURL restores metric from URL', D.choroMetric==='dti', D.choroMetric);
  global.location.search='?map=areas'; D.readURL();              // legacy link -> ignored, no throw, metric unchanged
  check('legacy ?map=areas param is harmless', D.choroMetric==='dti', D.choroMetric);

  // permit-category URL round-trip (encode the HIDDEN set; default = all shown → omitted)
  global.location.search=''; D.initCats(); D.writeURL();
  check('writeURL omits cats at default (all shown)', !/[?&]cats=/.test(global.location._last), global.location._last);
  D.activeCats=new Set(D.cats.map(c=>c.name)); D.activeCats.delete('Single Family'); D.writeURL();   // hide one category
  check('writeURL encodes the hidden category', /[?&]cats=Single(\+|%20)Family/.test(global.location._last), global.location._last);
  global.location.search='?cats=Garage'; D.readURL();            // shared link hiding Garage
  check('readURL hides the listed category', !D.activeCats.has('Garage') && D.activeCats.has('Single Family'), [...D.activeCats]);
  delete global.location; delete global.history;

  console.log(`\n${passes} passed, ${failures} failed`);
  if(failures) process.exit(1);
})().catch(e=>{console.error('HARNESS FAIL:',e);process.exit(1);});
