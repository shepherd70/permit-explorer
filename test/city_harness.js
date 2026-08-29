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
el('f-comm').add(new Option('All communities',''));   // mirror the HTML default <option value=""> so init's community options don't auto-select
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

  // --- development permits (6933-unw5): routed by resource id BEFORE the building-permit branches ---
  if(String(url).includes('6933-unw5')){
    const dpDetail = where.includes("communityname) = 'BELTLINE'");
    if(sel.includes('count(1) as n, avg(case(date_diff_d(decisiondate')&&!grp){
      // category-aware count incl. the IS NULL branch (same idiom as the bp CAT_N stub below).
      // appr+refn (174121) deliberately ≠ n, so approval computed as appr/n (88%) instead of
      // appr/(appr+refn) (97%) fails the KPI assertion; discn/reln likewise disagree with
      // decided-based ratios.
      const CAT_N={'Residential - Secondary Suite':100000,'Home Occupation Class 2':60000}; const NULL_N=32471;   // + null = 192471
      let n=192471;
      if(dpDetail) n=4002;
      else{
        const m=where.match(/category IN \(([^)]*)\)/);
        const wantNull=/category IS NULL/.test(where);
        const inSum=m?m[1].split(',').reduce((s,t)=>s+(CAT_N[t.replace(/'/g,'').trim()]||0),0):null;
        if(m&&wantNull) n=inSum+NULL_N; else if(m) n=inSum; else if(wantNull) n=NULL_N;
      }
      return json([{n:String(n),d:'50.9',appr:'168676',refn:'5445',discn:'117357',reln:'143824',sdab:'6575'}]);
    }
    if(grp==='k'&&sel.includes('date_extract_y')&&sel.includes('dcnt'))   // dp compare per-community yearly
      return json([{k:'2018',n:'400',dsum:'20000',dcnt:'390',appr:'350',refn:'10',discn:'240'},{k:'2019',n:'600',dsum:'26000',dcnt:'590',appr:'500',refn:'25',discn:'260'}]);
    if(grp==='k'&&sel.includes('date_extract_y')&&sel.includes('avg(case'))   // dp city yearly (avg days to decision + decision outcomes)
      return json([{k:'1979',n:'67',d:'30',appr:'60',refn:'2'},{k:'2026',n:'9463',d:'55',appr:'9000',refn:'300'}]);
    if(grp==='k'&&sel.includes('date_extract_y'))                             // dp init years — 1900 must be floored away by minYear (1979)
      return json([{k:'1900',n:'1'},{k:'1979',n:'67'},{k:'2026',n:'9463'}]);
    if(grp==='k'&&sel.includes('communityname')&&sel.includes('appr'))        // dp city communities (appr/refn → approval-rate shading)
      return json([{k:'BELTLINE',n:'4002',d:'62',appr:'3600',refn:'150'},{k:'HARVEST HILLS',n:'900',d:'40',appr:'800',refn:'40'}]);
    if(grp==='k'&&sel.includes('communityname'))                              // dp init communities (no cost/latlng aggregates on this dataset)
      return json([{k:'BELTLINE',n:'4002'},{k:'HARVEST HILLS',n:'900'}]);
    if(grp==='k'&&sel.includes('category'))                                   // categories: the null group arrives FIRST (largest) and key-less, as live
      return json([{n:'32471'},{k:'Residential - Secondary Suite',n:'100000'},{k:'Home Occupation Class 2',n:'60000'}]);
    if(grp==='k'&&sel.includes('permitteddiscretionary'))
      return json([{k:'Discretionary',n:'117357'},{k:'Permitted',n:'44801'},{k:'Permitted with a Relaxation',n:'30093'}]);
    if(grp==='k'&&sel.includes('statuscurrent'))
      return json([{k:'Released',n:'143824'},{k:'Refused',n:'4329'}]);
    if(grp==='b'&&sel.includes('case(')) return json([{b:'0',n:'32050'},{b:'3',n:'47146'}]);
    if(grp==='k'&&sel.includes('date_extract_m')) return json(Array.from({length:12},(_,i)=>({k:String(i+1),n:String(500+i)})));
    if(grp==='k'&&sel.includes('applicant')) return json([{k:'ARC SURVEYS',n:'2021'}]);
    if(sel.startsWith('permitnum')&&p['$limit']==='30000')
      return json(Array.from({length:4002},(_,i)=>({permitnum:'DP'+i,statuscurrent:i%9?'Released':'Refused',
        applieddate:`20${10+(i%15)}-0${1+(i%9)}-05T00:00:00.000`,
        ...(i%10?{decisiondate:`20${10+(i%15)}-0${1+(i%9)}-${i%41?'25':'01'}T00:00:00.000`}:{}),   // every 10th: undecided; every 41st decided row: decision BEFORE applied → dti must be null, never 0
        decision:i%9?'Approval':(i%2?'Refusal':'Deemed Refusal'),
        ...(i%4?{category:i%3?'Residential - Secondary Suite':'Home Occupation Class 2'}:{}),      // every 4th: null category → "(uncategorized)"
        permitteddiscretionary:i%3?'Discretionary':'Permitted',
        description:'proposed use '+i, applicant:i%5?'ARC SURVEYS':null,
        landusedistrict:i%2?'R-C1':'CC-X',
        ...(i%100?{}:{sdabhearingdate:'2020-01-01T00:00:00.000'}),
        address:(i%300)+' FAKE AV SW', communityname:'BELTLINE', latitude:'51.04', longitude:'-114.07'})));
    if(sel.startsWith('permitnum'))
      return json([{permitnum:'DP1',statuscurrent:'Released',applieddate:'2024-01-02T00:00:00.000',decision:'Approval',communityname:'BELTLINE',permitteddiscretionary:'Permitted',landusedistrict:'R-C1',applicant:'X',address:'1 A AV',description:'d'}]);
    return json([]);
  }
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
    // avgc/costn deliberately DISAGREE with c/n (c/n ≈ $63K city) so a regression back to
    // sum/count(1) for the "Avg project cost" KPI is caught, not masked by consistent stubs.
    // newn (260000) deliberately ≠ the work-class stub's New count (250000): the % new note must
    // come from this aggregate, not from searching the truncated top-8 work array.
    return json([{n:String(n),c:det?'220000000':'3.1e10',u:det?'949':'356804',d:'23.6',avgc:det?'150000':'70000',costn:det?'1400':'450000',newn:det?'500':'260000'}]);
  }
  if(grp==='k'&&sel.includes('date_extract_y')&&sel.includes('done')){   // compare-communities per-community yearly series (has done/openn; checked before the generic yearly branch)
    // name-keyed failure injection (same idiom as __failBoundaries): fail only the listed communities
    if(global.__failCmp && global.__failCmp.some(n=>where.includes(n))) return {ok:false,status:503,statusText:'Service Unavailable',text:async()=>'boom',json:async()=>({})};
    return json([{k:'2018',n:'500',c:'1.0e8',cn:'400',u:'200',dsum:'10000',dcnt:'480',sn:'490',done:'450',openn:'20'},{k:'2019',n:'600',c:'1.2e8',cn:'500',u:'250',dsum:'13000',dcnt:'580',sn:'590',done:'550',openn:'25'}]);
  }
  if(grp==='k'&&sel.includes('date_extract_y')&&sel.includes('sum'))
    return json([{k:'2018',n:'16689',c:'4.4e9',u:'8000',d:'20'},{k:'2019',n:'17373',c:'4.6e9',u:'9000',d:'22'}]);
  if(grp==='k'&&sel.includes('date_extract_y')) return json([{k:'1999',n:'6991'},{k:'2026',n:'8462'}]);
  if(grp==='k'&&sel.includes('communityname')) return json([{k:'DOWNTOWN COMMERCIAL CORE',n:'14614',lat:'51.045',lng:'-114.07',c:'9.0e9',avgc:'650000',costn:'14000',d:'23.9',sn:'14600',done:'13223',openn:'492'},{k:'HARVEST HILLS',n:'1480',lat:'51.14',lng:'-114.06',c:'2.2e8',avgc:'160000',costn:'1400',d:'20',sn:'1470',done:'1400',openn:'40'}]);
  if(grp==='k'&&sel.includes('permitclassgroup')) return json([{k:'Single Family',n:'200000'},{k:'Garage',n:'50000'}]);
  if(grp==='k'&&sel.includes('workclass')) return json([{k:'New',n:'250000'},{k:'Alteration',n:'180000'}]);
  if(grp==='k'&&sel.includes('statuscurrent')) return json([{k:'Completed',n:'400000'},{k:'Cancelled',n:'20000'},{k:'Issued Permit',n:'30000'}]);
  if(grp==='b'&&sel.includes('case(')) return json([{b:'0',n:'100'},{b:'2',n:'300'},{n:'50'}]);
  if(grp==='k'&&sel.includes('date_extract_m')) return json(Array.from({length:12},(_,i)=>({k:String(i+1),n:String(1000+i)})));
  if(grp==='k'&&sel.includes('contractorname')) return json([{k:'CEDARGLEN GROUP (THE)',n:'5000'}]);
  if(sel==='originaladdress,applieddate'){   // DP→BP pipeline: one community's full BP address history, crafted for exact join math.
    // The dp detail stub applies its '298…'/'299…' parcels in 2023/2024 (day 05, decided day 25):
    return json([
      {originaladdress:'#2 298 FAKE AV SW', applieddate:'2000-03-15T00:00:00.000'},   // unit-prefixed + predates every DP application → parcel matches, never a follow-up
      {originaladdress:'298 FAKE AV SW',    applieddate:'2032-01-01T00:00:00.000'},   // far-future follow-up → counts "ever", never "within 3 years"
      {originaladdress:'#5 299 FAKE AV SW', applieddate:'2024-03-10T00:00:00.000'},   // between the March-2024 cohort's application (03-05) and decision (03-25) → "filed before the decision"
      {originaladdress:'299 FAKE AV SW',    applieddate:'2024-10-01T00:00:00.000'},   // post-decision follow-up for the June/September 2024 cohorts
      {originaladdress:'999 NOWHERE PL NW', applieddate:'2015-01-01T00:00:00.000'}    // unmatched-parcel noise
    ]);
  }
  if(sel.startsWith('permitnum')&&p['$limit']==='30000')
    return json(Array.from({length:1480},(_,i)=>({permitnum:'BP'+i,statuscurrent:i%10?'Completed':'Cancelled',
      applieddate:`20${10+(i%15)}-0${1+(i%9)}-05T00:00:00.000`,issueddate:`20${10+(i%15)}-0${1+(i%9)}-0${i%37?8:2}T00:00:00.000`,   // every 37th row: issued BEFORE applied (40 bad rows) → must be excluded, not clamped
      permittype:'T',permitclass:'1106',permitclassgroup:i%5?'Single Family':'Garage',workclass:i%3?'Alteration':'New',
      description:'work item '+i,contractorname:i%4?'ACME':null,housingunits:String(i%2),estprojectcost:String(1000*(i+1)),
      originaladdress:(i%300)+' FAKE ST NW',communityname:'HARVEST HILLS',latitude:'51.14',longitude:'-114.06'})));
  if(sel.startsWith('permitnum')) return json([{permitnum:'BP1',statuscurrent:'Completed',applieddate:'2024-01-02T00:00:00.000',permitclassgroup:'Single Family',workclass:'New',description:'d',contractorname:'X',estprojectcost:'5000',originaladdress:'1 A ST',communityname:'ACADIA'}]);
  return json([]);
};

const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','src','city_explorer.html'),'utf8');
const scriptMatch=html.match(/<script>([\s\S]*?)<\/script>/);
if(!scriptMatch){ console.error('FAIL could not extract the inline <script> from src/city_explorer.html — test needs updating'); process.exit(1); }
const src=scriptMatch[1];
eval(src+'\nglobalThis.D=D;');

(async()=>{
  // --- static source contracts: string-level guards for load-bearing markup/CSS the DOM stubs can't exercise ---
  check('collapsed grids use minmax(0,1fr) so canvases cannot force mobile overflow', html.includes('.grid.two,.grid.three{grid-template-columns:minmax(0,1fr)}'), (html.match(/@media\(max-width:920px\)[^\n]*/)||[])[0]);
  check('grid cards defend min-width:0 against intrinsic canvas width', /\.grid \.card\{margin-bottom:0;min-width:0\}/.test(html), (html.match(/\.grid \.card\{[^}]*\}/)||[])[0]);
  check('all three CDN assets carry SRI + CORS attributes', (html.match(/integrity="sha384-/g)||[]).length===3 && (html.match(/crossorigin="anonymous"/g)||[]).length===3, {integrity:(html.match(/integrity="sha384-/g)||[]).length, crossorigin:(html.match(/crossorigin="anonymous"/g)||[]).length});
  check('chart.js pinned to its explicit dist file (stable SRI target)', html.includes('chart.js@4.5.1/dist/chart.umd.min.js'), (html.match(/cdn\.jsdelivr[^"]*/)||[])[0]);
  check('head declares the canonical URL', html.includes('<link rel="canonical" href="https://yyc-permits.krevian.com/">'), (html.match(/<link rel="canonical[^>]*>/)||[])[0]);

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
  // avg cost must come from avg(estprojectcost) — sum/count(1) would show $63K here (audit 2026-07 major)
  check('city KPI avg project cost = avg(estprojectcost), not sum/count(1)', el('k-med').textContent==='$70K', el('k-med').textContent);
  check('city KPI cost-coverage note disclosed', digits(el('k-cost-n').textContent)==='450000490787', el('k-cost-n').textContent);
  check('city % new construction uses the dedicated newn aggregate (53%, not 51% from top-8)', el('k-count-n').textContent==='53% new construction', el('k-count-n').textContent);
  check('speed-chart hint says avg in city view', /avg days/.test(el('speed-hint').textContent), el('speed-hint').textContent);
  check('city year chart points', D.charts.year.data.labels.length===2, D.charts.year.data.labels.length);
  check('city communities loaded', D.stats.comms.length===2, D.stats.comms.length);
  check('community stats carry server avg cost (avgc) for the choropleth', D.stats.comms.every(c=>typeof c.avgc==='number'&&c.avgc>0), D.stats.comms.map(c=>c.avgc));
  // resolved must count only non-null statuses (sn − open), not count(1) − open (audit 2026-07 minor, latent live)
  check('community completion rate uses non-null status count (sn)', Math.abs(D.stats.comms.find(c=>c.name==='HARVEST HILLS').comp-(1400/(1470-40)))<1e-9, D.stats.comms.find(c=>c.name==='HARVEST HILLS').comp);
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
  // negative durations (issued before applied) are data errors: excluded, never clamped to 0 (audit 2026-06/-07)
  check('reversed-date rows get dti=null, not 0', D.allRows.filter(d=>d.dti==null).length===40 && !D.allRows.some(d=>d.dti===0), [D.allRows.filter(d=>d.dti==null).length, D.allRows.some(d=>d.dti===0)]);
  check('detail days-to-issue histogram excludes invalid rows', D.charts.dtih.data.datasets[0].data.reduce((a,b)=>a+b,0)===1440, D.charts.dtih.data.datasets[0].data.reduce((a,b)=>a+b,0));
  check('speed-chart hint says median in detail view', /median days/.test(el('speed-hint').textContent), el('speed-hint').textContent);
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

  // --- client-side search: instant filter over loaded detail rows; city view shows a "narrow first" hint ---
  el('f-comm').value='HARVEST HILLS'; el('f-q').value=''; await D.apply();   // detail mode, 1480 scope rows in allRows
  const fBefore=fetchLog.length;
  el('f-q').value='ACME'; D.onSearch();                                      // client-side filter — must NOT hit the network
  check('detail search filters client-side', D.rows.length>0 && D.rows.length<1480, D.rows.length);
  check('detail search issues no server request', fetchLog.length===fBefore, [fBefore,fetchLog.length]);
  check('detail search badge = filtered count', D.total===D.rows.length, [D.total,D.rows.length]);
  check('full scope retained in allRows', !!D.allRows && D.allRows.length===1480, D.allRows&&D.allRows.length);
  el('f-q').value=''; D.onSearch();
  check('clearing search restores full scope', D.rows.length===1480, D.rows.length);
  // city view (no rows to filter) → search shows the narrow-first hint instead of running a slow query
  el('f-comm').value=''; el('f-q').value=''; await D.apply();
  el('f-q').value='garage'; D.onSearch();
  check('city search shows the narrow-first hint', el('search-hint').style.display==='', el('search-hint').style.display);
  el('f-q').value=''; D.onSearch();
  check('clearing city search hides the hint', el('search-hint').style.display==='none', el('search-hint').style.display);

  // --- compare communities (city-view panel, independent of the main community filter) ---
  D.cmpSel=['DOWNTOWN COMMERCIAL CORE','HARVEST HILLS']; D.renderCmpChips(); await D.cmpRun();
  console.log('COMPARE: keys:', Object.keys(D.cmpData), '| HH n:', D.cmpData['HARVEST HILLS']&&D.cmpData['HARVEST HILLS'].n, '| chart series:', D.charts.compare.data.datasets.length);
  check('compare fetched both communities', !!D.cmpData['DOWNTOWN COMMERCIAL CORE'] && !!D.cmpData['HARVEST HILLS'], Object.keys(D.cmpData));
  check('compare totals summed across years (500+600)', D.cmpData['HARVEST HILLS'].n===1100, D.cmpData['HARVEST HILLS'].n);
  check('compare avg cost / permit divides by cost-bearing permits (cn)', Math.abs(D.cmpData['HARVEST HILLS'].avgCost-(2.2e8/900))<1e-6, D.cmpData['HARVEST HILLS'].avgCost);
  check('compare completion = done / (non-null statuses − open)', Math.abs(D.cmpData['HARVEST HILLS'].comp-(1000/(1080-45)))<1e-6, D.cmpData['HARVEST HILLS'].comp);
  check('compare chart has one line per community', D.charts.compare.data.datasets.length===2, D.charts.compare.data.datasets.length);
  check('compare table rendered', /<table class="cmp"/.test(el('cmp-table').innerHTML), el('cmp-table').innerHTML.slice(0,40));
  check('compare card visible in city mode', el('card-compare').style.display==='', el('card-compare').style.display);
  D.cmpRemove('HARVEST HILLS');
  check('compare remove leaves the other community', D.cmpSel.length===1 && D.cmpSel[0]==='DOWNTOWN COMMERCIAL CORE', D.cmpSel);
  D.cmpClear();
  check('compare clear empties selection and chart', D.cmpSel.length===0 && D.charts.compare.data.datasets.length===0, [D.cmpSel.length,D.charts.compare.data.datasets.length]);

  // --- compare partial failure: a failed request must surface a named retry, never a zero-valued community (audit 2026-07 major) ---
  global.__failCmp=['DOWNTOWN COMMERCIAL CORE'];
  D.cmpSel=['DOWNTOWN COMMERCIAL CORE','HARVEST HILLS']; D.renderCmpChips(); await D.cmpRun();
  console.log('COMPARE FAILURE: notice:', el('cmp-notice').textContent);
  check('failed community carries an error sentinel, not zeros', !!(D.cmpData['DOWNTOWN COMMERCIAL CORE']&&D.cmpData['DOWNTOWN COMMERCIAL CORE'].error), D.cmpData['DOWNTOWN COMMERCIAL CORE']);
  check('surviving community still loads', !!D.cmpData['HARVEST HILLS'] && D.cmpData['HARVEST HILLS'].n===1100, D.cmpData['HARVEST HILLS']&&D.cmpData['HARVEST HILLS'].n);
  check('failed community excluded from the compare table', !el('cmp-table').innerHTML.includes('DOWNTOWN') && el('cmp-table').innerHTML.includes('HARVEST HILLS'), el('cmp-table').innerHTML.slice(0,120));
  check('failed community excluded from the chart', D.charts.compare.data.datasets.length===1, D.charts.compare.data.datasets.length);
  check('notice names the failed community (status text) and shows the Retry control', /DOWNTOWN COMMERCIAL CORE/.test(el('cmp-notice').textContent) && el('cmp-notice-wrap').style.display==='', [el('cmp-notice').textContent, el('cmp-notice-wrap').style.display]);
  check('partial compare failure does not raise the global error banner', !el('err').classList._s.has('show'), el('err-text').textContent);
  global.__failCmp=['DOWNTOWN COMMERCIAL CORE','HARVEST HILLS']; await D.cmpRun();   // every request fails
  check('all-failed: table/chart hidden, both names in the notice', el('cmp-body').style.display==='none' && el('cmp-empty').style.display==='none' && /DOWNTOWN COMMERCIAL CORE/.test(el('cmp-notice').textContent) && /HARVEST HILLS/.test(el('cmp-notice').textContent), [el('cmp-body').style.display, el('cmp-empty').style.display, el('cmp-notice').textContent]);
  global.__failCmp=null; await D.cmpRetry();                                          // recovery via the notice's Retry affordance
  check('retry reloads every selected community', D.charts.compare.data.datasets.length===2 && !D.cmpData['DOWNTOWN COMMERCIAL CORE'].error, [D.charts.compare.data.datasets.length, D.cmpData['DOWNTOWN COMMERCIAL CORE']&&D.cmpData['DOWNTOWN COMMERCIAL CORE'].error]);
  check('retry clears the failure notice and hides it', el('cmp-notice').textContent==='' && el('cmp-notice-wrap').style.display==='none', [el('cmp-notice').textContent, el('cmp-notice-wrap').style.display]);
  D.cmpClear();

  // --- CSV export: spreadsheet-formula neutralization in the detail-mode client CSV (audit 2026-07 minor, repeat) ---
  check('csvCell neutralizes leading =', D.csvCell('=SUM(A1)')==="'=SUM(A1)", D.csvCell('=SUM(A1)'));
  check('csvCell neutralizes leading +', D.csvCell('+CMD|calc')==="'+CMD|calc", D.csvCell('+CMD|calc'));
  check('csvCell neutralizes leading @', D.csvCell('@import')==="'@import", D.csvCell('@import'));
  check('csvCell neutralizes a formula-looking address', D.csvCell('-2+3+cmd')==="'-2+3+cmd", D.csvCell('-2+3+cmd'));
  check('csvCell leaves negative numbers numeric', D.csvCell(-6)==='-6', D.csvCell(-6));
  check('csvCell leaves decimal strings numeric', D.csvCell('1234.5')==='1234.5', D.csvCell('1234.5'));
  check('csvCell neutralizes then RFC-quotes combined hostile cells', D.csvCell('=1,2')==='"\'=1,2"', D.csvCell('=1,2'));
  check('csvCell still RFC-quotes plain commas', D.csvCell('a,b')==='"a,b"', D.csvCell('a,b'));

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

  // compare-communities URL round-trip (omitted when none selected)
  global.location.search=''; D.cmpSel=[]; D.writeURL();
  check('writeURL omits cmp when none selected', !/[?&]cmp=/.test(global.location._last), global.location._last);
  D.cmpSel=['MAHOGANY','SETON']; D.writeURL();
  check('writeURL encodes the compared communities', /[?&]cmp=MAHOGANY%2CSETON/.test(global.location._last), global.location._last);
  global.location.search='?cmp=HARVEST HILLS,DOWNTOWN COMMERCIAL CORE'; D.cmpSel=[]; D.readURL();
  check('readURL restores the compared communities', D.cmpSel.length===2 && D.cmpSel[0]==='HARVEST HILLS', D.cmpSel);
  // security: readURL must accept only KNOWN community names — an untrusted ?cmp= value cannot smuggle a payload into state (audit 2026-08 major, reflected XSS)
  global.location.search='?cmp=HARVEST HILLS,'+encodeURIComponent('x" onpointerover="alert(1)')+',NOT A REAL COMMUNITY'; D.cmpSel=[]; D.readURL();
  check('readURL rejects unknown/hostile cmp names', D.cmpSel.length===1 && D.cmpSel[0]==='HARVEST HILLS', D.cmpSel);
  // even if a hostile name reaches renderCmpChips directly, the chip handler is index-based — no name is interpolated into an attribute
  D.cmpSel=['x" onpointerover="alert(1)']; D.renderCmpChips();
  // the handler must be index-based (no name in the attribute) and no name-interpolating onclick may remain;
  // the name still appears as inert text content, which is safe (quotes need no escaping there).
  check('chip remove handler is index-based, no name interpolated into the onclick', /onclick="D\.cmpRemoveIdx\(0\)"/.test(el('cmp-chips').innerHTML) && !/cmpRemove\('/.test(el('cmp-chips').innerHTML), el('cmp-chips').innerHTML.slice(0,160));
  check('chip aria-label escapes the double quote (no attribute breakout)', el('cmp-chips').innerHTML.includes('aria-label="Remove x&quot; onpointerover=&quot;alert(1)"'), el('cmp-chips').innerHTML.slice(0,200));
  check('cmpRemoveIdx removes the chip at that index', (()=>{ D.cmpSel=['HARVEST HILLS','DOWNTOWN COMMERCIAL CORE']; D.cmpRemoveIdx(0); return D.cmpSel.length===1 && D.cmpSel[0]==='DOWNTOWN COMMERCIAL CORE'; })(), D.cmpSel);
  D.cmpSel=[];                                                   // don't leak into later state

  delete global.location; delete global.history;

  // === development-permits mode (Building·Development dataset toggle, task #34) ===
  global.location={search:'',pathname:'/',hash:'',_last:''};
  global.history={replaceState:(s,t,url)=>{global.location._last=url;}};
  // dp init-option fetch counter: the init category query is the one WITHOUT a $limit
  const dpInitCats=()=>fetchLog.filter(u=>u.includes('6933-unw5')&&u.includes('category%20as%20k')&&!u.includes('%24limit')).length;
  D.choroMetric='ppy';                                                          // earlier URL tests left 'dti' selected; start the toggle tests from the default
  el('f-work').value='New'; el('f-q').value='reno'; D.sort('estprojectcost');   // dataset-scoped state that must NOT survive the toggle
  await D.setDataset('dp'); await new Promise(r=>setTimeout(r,30));
  console.log('DP MODE:', D.dsKey, '| total:', D.total, '| cats:', D.cats&&D.cats.length, '| url:', global.location._last);
  check('toggle switches the active dataset', D.dsKey==='dp' && D.ds.label==='Development', D.dsKey);
  check('toggle button states flip', el('ds-dp').classList._s.has('on') && !el('ds-bp').classList._s.has('on'), [[...el('ds-dp').classList._s],[...el('ds-bp').classList._s]]);
  check('dp city total', D.total===192471, D.total);
  check('dp count badge', digits(el('count-badge').innerHTML)==='192471', el('count-badge').innerHTML);
  check('dataset-scoped filters reset on toggle (work/search/sort)', el('f-work').value==='all' && el('f-q').value==='' && D.sortCol==='applieddate', [el('f-work').value, el('f-q').value, D.sortCol]);
  check('dp URL carries ds=dp and nothing stale', global.location._last==='/?ds=dp', global.location._last);
  // KPI math — the stub's appr+refn (174,121) deliberately ≠ n (192,471): a regression to an
  // n denominator would show 88% approval / 67% discretionary / 83% released instead
  check('dp approval rate = appr ÷ (appr+refn) → 97%', el('k-comp').textContent==='97%', el('k-comp').textContent);
  check('dp approval note names approved + decided counts', digits(el('k-comp-n').textContent)==='168676174121', el('k-comp-n').textContent);
  check('dp avg days to decision', el('k-dti').textContent==='51', el('k-dti').textContent);
  check('dp discretionary share = discn ÷ n → 61%', el('k-cost').textContent==='61%', el('k-cost').textContent);
  check('dp released share = reln ÷ n → 75%', el('k-med').textContent==='75%', el('k-med').textContent);
  check('dp refusals count', digits(el('k-units').textContent)==='5445', el('k-units').textContent);
  check('dp KPI labels swapped (cost/units/comp cards repurposed)', el('k-cost-l').textContent==='Discretionary share' && el('k-units-l').textContent==='Refusals' && el('k-comp-l').textContent==='Approval rate', [el('k-cost-l').textContent,el('k-units-l').textContent,el('k-comp-l').textContent]);
  check('dp copy swapped (work label, dtih title)', el('lbl-work').textContent==='Permitted / discretionary' && el('t-dtih').textContent==='Days-to-decision distribution', [el('lbl-work').textContent, el('t-dtih').textContent]);
  check('dp cost/renov cards hidden', el('card-costh').style.display==='none' && el('card-renov').style.display==='none', [el('card-costh').style.display, el('card-renov').style.display]);
  check('dp year chart drops the cost line', D.charts.year.data.datasets.length===1, D.charts.year.data.datasets.length);
  check('dp cumulative chart drops the units axis', D.charts.cum.data.datasets.length===1, D.charts.cum.data.datasets.length);
  check('dp days-to-decision bins re-binned', D.charts.dtih.data.labels.join('|')==='0–7 d|8–14 d|15–30 d|31–60 d|61–90 d|91–180 d|180+ d', D.charts.dtih.data.labels);
  check('dp year floor keeps 1979, drops junk 1900', el('f-y1').options.length===2 && el('f-y1').options[0].value==='1979', el('f-y1').options.map(o=>o.value));
  check('dp secondary filter lists permitted/discretionary uses', el('f-work').options.length===4 && /Discretionary/.test(el('f-work').options[1].text), el('f-work').options.map(o=>o.text));
  // the synthetic "(uncategorized)" category (the null group arrives key-less and largest, as live)
  check('dp categories: real values + (uncategorized)', D.cats.length===3 && D.cats[0].isNull===true && D.cats[0].name==='(uncategorized)' && D.cats[0].n===32471, D.cats);
  check('dp where() has no category clause by default', !/category/.test(D.where()), D.where());
  D.activeCats=new Set(['Residential - Secondary Suite','Home Occupation Class 2']);
  check('unchecking (uncategorized) → plain IN, no IS NULL', /category IN \('Residential - Secondary Suite','Home Occupation Class 2'\)/.test(D.where()) && !/IS NULL/.test(D.where()), D.where());
  D.activeCats=new Set(['(uncategorized)']);
  check('only (uncategorized) checked → category IS NULL alone', /category IS NULL/.test(D.where()) && !/IN \(/.test(D.where()), D.where());
  D.activeCats=new Set(['Home Occupation Class 2','(uncategorized)']);
  check('subset + (uncategorized) → (IN … OR IS NULL) branch', /\(category IN \('Home Occupation Class 2'\) OR category IS NULL\)/.test(D.where()), D.where());
  await D.apply(); await new Promise(r=>setTimeout(r,30));
  check('IS NULL branch reaches the count query (60,000 + 32,471)', D.total===92471, D.total);
  D.initCats(); D.renderCats(); await D.apply(); await new Promise(r=>setTimeout(r,30));

  // dp-only cards in city mode: outcomes chart live, pipeline present but overlay-locked
  check('dp city: outcomes + pipeline cards shown', el('card-outcomes').style.display==='' && el('card-pipeline').style.display==='', [el('card-outcomes').style.display, el('card-pipeline').style.display]);
  check('dp city: pipeline card locked without a drilled community', el('card-pipeline').classList._s.has('locked')===true);
  check('dp city: outcomes chart stacks appr/refn from the yearly query', D.charts.outcomes.data.datasets[0].data.join(',')==='60,9000' && D.charts.outcomes.data.datasets[1].data.join(',')==='2,300', [D.charts.outcomes.data.datasets[0].data, D.charts.outcomes.data.datasets[1].data]);

  // dp choropleth metrics
  check('dp shade-by options are ppy/dti/apr', el('choro-metric').options.map(o=>o.value).join(',')==='ppy,dti,apr', el('choro-metric').options.map(o=>o.value));
  check('dp community approval rate = appr ÷ decided (not ÷ n)', Math.abs(D.stats.comms[0].apr-(3600/3750))<1e-9, D.stats.comms[0].apr);
  { const ysp=(+D.val('f-y2'))-(+D.val('f-y1'))+1;
    check('dp ppy uses the dp year span (1979–2026 → 48)', ysp===48 && Math.abs(D.stats.comms[0].ppy-4002/48)<1e-9, {ysp, ppy:D.stats.comms[0].ppy}); }
  D.setChoroMetric('dti');
  check('dp metric switch → days-to-decision legend', /days to decision/i.test(el('map-legend').innerHTML), el('map-legend').innerHTML.slice(0,110));
  D.setChoroMetric('apr');
  check('dp metric switch → approval-rate legend + URL metric=apr', /approval rate/i.test(el('map-legend').innerHTML) && /[?&]metric=apr/.test(global.location._last), [el('map-legend').innerHTML.slice(0,80), global.location._last]);
  D.setChoroMetric('cost');
  check('bp-only metric key rejected under dp', D.choroMetric==='apr', D.choroMetric);
  D.setChoroMetric('ppy');

  // dp detail mode via community drill
  el('f-comm').value='BELTLINE'; await D.apply(); await new Promise(r=>setTimeout(r,30));
  check('dp detail mode via community drill', D.mode==='detail' && D.total===4002, [D.mode, D.total]);
  check('dp undecided/reversed rows get dti=null, never 0', D.allRows.filter(d=>d.dti==null).length===489 && !D.allRows.some(d=>d.dti===0), D.allRows.filter(d=>d.dti==null).length);
  check('dp days-to-decision histogram excludes null-dti rows', D.charts.dtih.data.datasets[0].data.reduce((a,b)=>a+b,0)===3513, D.charts.dtih.data.datasets[0].data.reduce((a,b)=>a+b,0));
  check('dp null categories load as (uncategorized) rows', D.rows.filter(d=>d.cls==='(uncategorized)').length===1001, D.rows.filter(d=>d.cls==='(uncategorized)').length);
  check('dp detail approval rate from rows (3,557 ÷ 4,002 → 89%)', el('k-comp').textContent==='89%', el('k-comp').textContent);
  check('dp median-days label in detail', el('k-dti-l').textContent==='Median days to decision', el('k-dti-l').textContent);
  check('dp table shows Decision, Land use, Applicant columns', />Decision</.test(el('tbl').innerHTML) && />Land use</.test(el('tbl').innerHTML) && />Applicant</.test(el('tbl').innerHTML), el('tbl').innerHTML.slice(0,120));
  check('dp table drops cost/contractor columns', !/Est\. Cost/.test(el('tbl').innerHTML) && !/>Contractor</.test(el('tbl').innerHTML));
  check('dp SDAB-appeal insight appears (41 hearings in scope)', /<b>41<\/b>/.test(el('insights').innerHTML) && /Appeal Board/.test(el('insights').innerHTML), el('insights').innerHTML.slice(0,300));
  { const dpF=fetchLog.length;
    el('f-q').value='cc-x'; D.onSearch();
    check('dp search matches land-use district client-side, no request', D.rows.length===2001 && fetchLog.length===dpF, [D.rows.length, fetchLog.length-dpF]);
    el('f-q').value=''; D.onSearch(); }

  // --- application → construction pipeline (task #35): crafted BP history for parcels 298/299 ---
  const plFetches=()=>fetchLog.filter(u=>u.includes('originaladdress%2Capplieddate')).length;
  check('pipeline card unlocked in community-drilled detail', el('card-pipeline').classList._s.has('locked')===false);
  check('pipeline BP history fetched once, from the bp endpoint', plFetches()===1 && fetchLog.some(u=>u.includes('c2es-76ed')&&u.includes('originaladdress%2Capplieddate')), plFetches());
  check('pipeline floor year derived from the cached bp year list', D._bpFloor==='1999', D._bpFloor);
  check('plKeys: multi-parcel + unit-prefix + duplicates collapse to parcel keys', (()=>{ const k=D.plKeys({addr:'#110 620 10 AV SW', locs:'620 10 AV SW;620  10 AV SW;#110 620 10 AV SW;1008 17 AV SW'}); return k.size===2 && k.has('620 10 AV SW') && k.has('1008 17 AV SW'); })(), [...D.plKeys({addr:'#110 620 10 AV SW', locs:'620 10 AV SW;620  10 AV SW;#110 620 10 AV SW;1008 17 AV SW'})]);
  // full drill: 26 of the 3,557 eligible released rows sit on the two crafted parcels (13 ever-only + 13 within-3y)
  check('pipeline full-drill: 26 of 3,557 followed, 0% within 3y, 1% ever', el('pipeline-body').innerHTML.includes('>26</b> of <b>3,557</b>') && /<b>0%<\/b> followed/.test(el('pipeline-body').innerHTML) && /\(1% ever\)/.test(el('pipeline-body').innerHTML), el('pipeline-body').innerHTML.slice(0,220));
  check('pipeline full-drill: category bars rendered incl. (uncategorized)', /pl-bar/.test(el('pipeline-body').innerHTML) && /\(uncategorized\)/.test(el('pipeline-body').innerHTML), (el('pipeline-body').innerHTML.match(/pl-cat\b/g)||[]).length);
  // parcel 298: the only follow-up is 2032 (its 2000 BP predates every application → must never count)
  el('f-q').value='298 FAKE AV SW'; D.onSearch();
  { const expMed=Math.round((new Date('2032-01-01')-new Date('2023-05-05'))/864e5);   // 13 lags; median = the May-2023 cohort
    check('pipeline 298: BP predating the application never counts (0% in 3y, 100% ever)', D.rows.length===13 && /<b>0%<\/b> followed/.test(el('pipeline-body').innerHTML) && /\(100% ever\)/.test(el('pipeline-body').innerHTML), [D.rows.length, el('pipeline-body').innerHTML.slice(0,160)]);
    check('pipeline 298: median lag = first follow-up ≥ application (2032, not 2000)', el('pipeline-body').innerHTML.includes(`median lag <b>${expMed.toLocaleString()} days`), [expMed, el('pipeline-body').innerHTML.match(/median lag <b>[^<]*/)]);
    check('pipeline 298: none filed before the decision', el('pipeline-body').innerHTML.includes('(0% filed before the decision)'));
    check('pipeline: no category bars under the min-n gate (13 rows)', !/pl-cats/.test(el('pipeline-body').innerHTML)); }
  // parcel 299: unit-prefixed BP lands 5 days in (before the March decisions), a second one in October
  el('f-q').value='299 FAKE AV SW'; D.onSearch();
  check('pipeline 299: all followed within 3 years', D.rows.length===13 && /<b>100%<\/b> followed/.test(el('pipeline-body').innerHTML), [D.rows.length, el('pipeline-body').innerHTML.slice(0,140)]);
  check('pipeline 299: median lag 26 days (5×5d, 4×26d, 4×118d)', el('pipeline-body').innerHTML.includes('median lag <b>26 days'), el('pipeline-body').innerHTML.match(/median lag <b>[^<]*/));
  check('pipeline 299: 38% filed before the decision (5 of 13, via the unit-prefixed BP)', el('pipeline-body').innerHTML.includes('(38% filed before the decision)'), el('pipeline-body').innerHTML.match(/\([^)]*decision\)/));
  check('pipeline search recompute issued no new BP fetch', plFetches()===1, plFetches());
  el('f-q').value=''; D.onSearch();
  // population rules, exercised directly on synthetic rows against the cached index
  { const saved=D.rows;
    D.rows=[
      {status:'Released', applied:'1997-05-05', addr:'298 FAKE AV SW', cls:'Legacy', decided:'1997-06-01'},   // pre-BP-era → excluded
      {status:'Released', applied:'2023-02-05', addr:'298 FAKE AV SW', cls:'Modern', decided:'2023-02-25'},
      {status:'Cancelled', applied:'2023-02-05', addr:'298 FAKE AV SW', cls:'Modern', decided:'2023-02-25'}   // not released → excluded
    ];
    D.renderPipeline(D._bpCache['BELTLINE']);
    check('pipeline population: pre-1999 and non-released rows excluded', el('pipeline-body').innerHTML.includes('of <b>1</b> released applications since 1999'), el('pipeline-body').innerHTML.slice(0,240));
    D.rows=saved; D.renderPipeline(D._bpCache['BELTLINE']); }
  // detail-mode outcomes chart is derived from the loaded rows
  check('dp detail: outcomes chart sums to the row-level decisions (3,557 + 445)', D.charts.outcomes.data.datasets[0].data.reduce((a,b)=>a+b,0)===3557 && D.charts.outcomes.data.datasets[1].data.reduce((a,b)=>a+b,0)===445, [D.charts.outcomes.data.datasets[0].data.reduce((a,b)=>a+b,0), D.charts.outcomes.data.datasets[1].data.reduce((a,b)=>a+b,0)]);

  // dp compare metrics
  el('f-comm').value=''; await D.apply(); await new Promise(r=>setTimeout(r,30));
  D.cmpSel=['BELTLINE','HARVEST HILLS']; D.renderCmpChips(); await D.cmpRun();
  check('dp compare rows: approval + discretionary share, no cost', /Approval rate/.test(el('cmp-table').innerHTML) && /Discretionary share/.test(el('cmp-table').innerHTML) && !/Total est\. cost/.test(el('cmp-table').innerHTML), el('cmp-table').innerHTML.slice(0,140));
  check('dp compare days-to-decision = dsum ÷ dcnt', Math.abs(D.cmpData['BELTLINE'].dti-(46000/980))<1e-9, D.cmpData['BELTLINE'].dti);
  check('dp compare approval = appr ÷ (appr+refn)', Math.abs(D.cmpData['BELTLINE'].apr-(850/885))<1e-9, D.cmpData['BELTLINE'].apr);
  D.cmpClear();

  // toggle back: bp fully restored, dp option lists cached
  const catsFetches=dpInitCats();
  el('f-status').value='Released';                                   // one more piece of dataset-scoped state to shed
  await D.setDataset('bp'); await new Promise(r=>setTimeout(r,30));
  check('toggle back to bp restores totals', D.dsKey==='bp' && D.total===490787, [D.dsKey, D.total]);
  check('bp KPI labels restored', el('k-cost-l').textContent==='Total est. cost' && el('k-units-l').textContent==='Housing units' && el('k-comp-l').textContent==='Completion rate', [el('k-cost-l').textContent,el('k-units-l').textContent,el('k-comp-l').textContent]);
  check('bp URL drops ds and stale dp params', global.location._last==='/', global.location._last);
  check('bp status filter reset on the way back', el('f-status').value==='all', el('f-status').value);
  check('bp charts rebuilt with the cost line + units axis', D.charts.year.data.datasets.length===2 && D.charts.cum.data.datasets.length===2, [D.charts.year.data.datasets.length, D.charts.cum.data.datasets.length]);
  check('bp hides the dp-only cards and builds no outcomes chart', el('card-outcomes').style.display==='none' && el('card-pipeline').style.display==='none' && !D.charts.outcomes, [el('card-outcomes').style.display, el('card-pipeline').style.display, !!D.charts.outcomes]);
  check('bp categories restored (all checked)', D.cats.length===2 && D.activeCats.size===2, D.cats&&D.cats.length);
  check('bp shade-by options restored', el('choro-metric').options.map(o=>o.value).join(',')==='ppy,cost,dti,comp', el('choro-metric').options.map(o=>o.value));
  await D.setDataset('dp'); await new Promise(r=>setTimeout(r,30));
  check('toggling back to dp reuses cached option lists (no init refetch)', dpInitCats()===catsFetches && D.total===192471, [dpInitCats(), catsFetches]);
  await D.setDataset('bp'); await new Promise(r=>setTimeout(r,30));
  delete global.location; delete global.history;

  console.log(`\n${passes} passed, ${failures} failed`);
  if(failures) process.exit(1);
})().catch(e=>{console.error('HARNESS FAIL:',e);process.exit(1);});
