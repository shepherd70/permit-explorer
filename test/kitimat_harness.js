// Headless harness for the Kitimat explorer. Run: node test/kitimat_harness.js
// Evals the app script from src/kitimat_explorer.html against the COMMITTED
// snapshot (data/kitimat/snapshot.json) injected into the page's JSON block, so
// it is deterministic and offline. Exits non-zero on any failure.
//
// Contract (mirrors test/city_harness.js): the app script is the first
// attribute-less <script> in the page; the stub document has only
// getElementById / createElement / body; DOM APIs beyond that must be
// feature-guarded in the page.
const fs=require('fs'), path=require('path');

let failures=0, passes=0;
function check(name,cond,got){ if(cond){passes++;console.log('  PASS',name);} else {failures++;console.error('  FAIL',name,got!==undefined?('-> got: '+JSON.stringify(got)):'');} }
const digits=s=>String(s==null?'':s).replace(/[^0-9]/g,'');

// --- DOM stubs ---
const els={};
function el(id){ if(!els[id]) els[id]={id,value:'',textContent:'',innerHTML:'',className:'',style:{},options:[],disabled:false,
  add(o){this.options.push(o);},
  appendChild(){}, setAttribute(k,v){this['@'+k]=v;},
  classList:{_s:new Set(),toggle(c,on){on?this._s.add(c):this._s.delete(c)},add(c){this._s.add(c)},remove(c){this._s.delete(c)},has(c){return this._s.has(c)}}}; return els[id]; }
global.Option=function(t,v){return{text:t,value:String(v)}};
global.document={getElementById:el,createElement:()=>({}),body:{appendChild(){},removeChild(){}},documentElement:{_t:'light',getAttribute(){return this._t},setAttribute(k,v){if(k==='data-theme')this._t=v;}}};
global.localStorage={getItem(){return null},setItem(){}};

// Chart stub: records every config so assertions can read datasets.
const charts={};
global.Chart=class{constructor(c,cfg){this.cfg=cfg;this.data=(cfg&&cfg.data)||{labels:[],datasets:[]};charts[c.id]=this;}destroy(){this.destroyed=true;}update(){}};
global.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}}};

// Leaflet stub: records markers, polygons and tile URL swaps.
const mapLog={markers:[],polys:[],tileUrls:[],removed:0};
global.L={
  map:()=>({setView(){return this},removeLayer(){mapLog.removed++;},closePopup(){},invalidateSize(){}}),
  tileLayer:(url)=>({_u:url,addTo(){mapLog.tileUrls.push(url);return this},setUrl(u){this._u=u;mapLog.tileUrls.push(u);}}),
  layerGroup:()=>({addTo(){return this},clearLayers(){mapLog.markers.length=0;}}),
  circleMarker:(ll,opts)=>({ll,opts,bindPopup(h){this.popup=h;return this},addTo(){mapLog.markers.push(this);return this}}),
  geoJSON:(data,opts)=>{ mapLog.polys.length=0; (data&&data.features||[]).forEach(f=>{ const st=opts&&opts.style?opts.style(f):null; const layer={bindPopup(h){this.popup=h;return this},on(ev,fn){this['on'+ev]=fn;}}; if(opts&&opts.onEachFeature)opts.onEachFeature(f,layer); mapLog.polys.push({name:f.properties.name,style:st,layer}); }); return {addTo(){return this}}; }
};

// --- load the committed snapshot into the page's JSON blocks ---
const root=path.join(__dirname,'..');
const snapshot=JSON.parse(fs.readFileSync(path.join(root,'data','kitimat','snapshot.json'),'utf8'));
const meta=JSON.parse(fs.readFileSync(path.join(root,'data','kitimat','meta.json'),'utf8'));
el('snapshot').textContent=JSON.stringify(snapshot);
el('snapshot-meta').textContent=JSON.stringify(meta);

// --- extract & eval the app script (first attribute-less <script>) ---
const html=fs.readFileSync(path.join(root,'src','kitimat_explorer.html'),'utf8');
const m=html.match(/<script>([\s\S]*?)<\/script>/);
if(!m){ console.error('FAIL: could not find the app <script> block'); process.exit(1); }
check('page has exactly one attribute-less <script> (harness extraction contract)', (html.match(/<script>/g)||[]).length===1, (html.match(/<script>/g)||[]).length);
check('src page carries null JSON placeholders for build.py', html.includes('<script type="application/json" id="snapshot">null</script>') && html.includes('<script type="application/json" id="snapshot-meta">null</script>'));
// Sloppy-mode direct eval, like test/city_harness.js: the appended line exports the script's const bindings.
eval(m[1]+'\nglobalThis.K=K;globalThis.toggleTheme=toggleTheme;globalThis.fmt$=fmt$;globalThis.median=median;globalThis.binCounts=binCounts;globalThis.monthLabel=monthLabel;globalThis.rollupYears=rollupYears;globalThis.CAT_COLORS=CAT_COLORS;globalThis.C=C;globalThis.DTI_BINS=DTI_BINS;');   // defines K and runs K.init() synchronously (the JSON block is present, so no fetch)

// ---------------------------------------------------------------- independent expectations from the snapshot
const P=snapshot.permits, N=P.length;
const byCat={}; P.forEach(p=>byCat[p.category]=(byCat[p.category]||0)+1);
const topCat=Object.entries(byCat).sort((a,b)=>b[1]-a[1])[0];
const outside=P.filter(p=>p.neighbourhood==='Outside neighbourhoods').length;
const res=P.filter(p=>p.category==='Residential building').length;
const dtis=P.map(p=>p.days).filter(d=>d!=null&&d>=0);
const med=a=>{const s=[...a].sort((x,y)=>x-y);const k=Math.floor(s.length/2);return s.length%2?s[k]:(s[k-1]+s[k])/2;};
const bperTotal=snapshot.bper.series.total.reduce((s,p)=>s+(p.v||0),0);
const bperMonthsReported=snapshot.bper.series.total.filter(p=>p.v!=null).length;
const bperYears={}; snapshot.bper.series.total.forEach(p=>{ if(p.v!=null){const y=p.m.slice(0,4); bperYears[y]=(bperYears[y]||0)+p.v;} });
const peakYear=Object.entries(bperYears).sort((a,b)=>b[1]-a[1])[0][0];

console.log('\n--- boot & Pane A (BC Stats) ---');
check('K.init loaded every permit', K.rows.length===N, K.rows.length);
check('error banner not shown', !el('err').classList.has('show'));
check('footer shows the snapshot date', el('last-updated').textContent===meta.fetched_at.slice(0,10), el('last-updated').textContent);
check('BPER range label spans first→last month', el('bper-range').textContent.includes('2018') && el('bper-range').textContent.includes(snapshot.bper.last.slice(0,4)), el('bper-range').textContent);
check('BPER total KPI = sum of reported months', el('b-total').textContent===fmt$(bperTotal), [el('b-total').textContent, fmt$(bperTotal)]);
check('BPER total note counts reported months', el('b-total-n').textContent.startsWith(bperMonthsReported+' of '+snapshot.bper.series.total.length), el('b-total-n').textContent);
check('BPER peak year KPI', el('b-peak').textContent===peakYear, [el('b-peak').textContent, peakYear]);
check('BPER latest-month KPI names the last reported month', /[A-Z][a-z]{2} \d{4}/.test(el('b-latest').textContent), el('b-latest').textContent);
check('by-year chart has 4 sector datasets over every year', charts['c-byear'] && charts['c-byear'].data.datasets.length===4 && charts['c-byear'].data.labels.length===Object.keys(bperYears).length, charts['c-byear']&&charts['c-byear'].data.labels);
const byYearStackSum=charts['c-byear'].data.datasets.reduce((s,d)=>s+d.data.reduce((a,b)=>a+b,0),0);
check('by-year sector stacks are computed (non-zero)', byYearStackSum>0, byYearStackSum);
check('monthly chart keeps suppressed months as null gaps', charts['c-bmonth'].data.datasets[0].data.some(v=>v===null) && charts['c-bmonth'].data.datasets[0].data.length===snapshot.bper.series.total.length);
check('units chart has 3 unit-type datasets', charts['c-bunits'].data.datasets.length===3);
check('rollupYears: 2019 sums its reported months', rollupYears(snapshot.bper.series.total).find(y=>y.year==='2019').sum===bperYears['2019']);
const r18=rollupYears(snapshot.bper.series.total).find(y=>y.year==='2018');
check('rollupYears counts suppressed months separately', r18.n+r18.x+r18.blank===12 && r18.x>=1, r18);

console.log('\n--- Pane B: unfiltered KPIs ---');
check('count KPI = all permits', digits(el('k-count').textContent)===String(N), el('k-count').textContent);
check('toolbar count matches', digits(el('cnt').textContent)===String(N), el('cnt').textContent);
check('median days KPI', el('k-dti').textContent===Math.round(med(dtis))+' d', [el('k-dti').textContent, med(dtis)]);
check('residential share KPI', el('k-res').textContent===Math.round(res/N*100)+'%', el('k-res').textContent);
check('in-neighbourhood share KPI', el('k-nbh').textContent===Math.round((N-outside)/N*100)+'%', el('k-nbh').textContent);
check('in-neighbourhood note counts the outside permits', digits(el('k-nbh-n').textContent)===String(outside), el('k-nbh-n').textContent);
check('range label under the section heading', el('cp-range').textContent.includes(String(N)) && /issued \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}/.test(el('cp-range').textContent), el('cp-range').textContent);

console.log('\n--- charts, map, insights, table ---');
check('category chart sorted by count with the top category first', charts['c-cat'].data.labels[0]===topCat[0] && charts['c-cat'].data.datasets[0].data[0]===topCat[1], charts['c-cat'].data.labels);
check('category colours follow the fixed CAT_COLORS map', charts['c-cat'].data.datasets[0].backgroundColor[charts['c-cat'].data.labels.indexOf('Residential building')]===CAT_COLORS['Residential building']);
const monthSum=charts['c-month'].data.datasets[0].data.reduce((a,b)=>a+b,0);
check('month chart sums to the dated permits', monthSum===P.filter(p=>p.issued).length, monthSum);
check('month axis is contiguous over the issued range (quiet months present as zeros)', charts['c-month'].data.labels.length>=new Set(P.map(p=>p.issued&&p.issued.slice(0,7))).size);
check('DTI histogram sums to the valid-days count', charts['c-dtih'].data.datasets[0].data.reduce((a,b)=>a+b,0)===dtis.length);
check('neighbourhood chart lists all 9 buckets incl. Outside', charts['c-nbh'].data.labels.length===9 && charts['c-nbh'].data.labels[8]==='Outside neighbourhoods', charts['c-nbh'].data.labels);
check('neighbourhood chart Outside count', charts['c-nbh'].data.datasets[0].data[8]===outside);
check('zone chart shows ≤10 zones, matched count in hint', charts['c-zone'].data.labels.length<=10 && digits(el('zone-hint').textContent).startsWith(String(P.filter(p=>p.zone).length)), el('zone-hint').textContent);
check('map plotted one marker per located permit', mapLog.markers.length===P.filter(p=>p.lat!=null).length, mapLog.markers.length);
check('map drew all 8 neighbourhood polygons', mapLog.polys.length===8, mapLog.polys.length);
const shadedNames=mapLog.polys.filter(p=>p.style.fillOpacity>0).map(p=>p.name).sort();
const expectShaded=[...new Set(P.map(p=>p.neighbourhood).filter(n=>n!=='Outside neighbourhoods'))].sort();
check('only neighbourhoods with permits are shaded', JSON.stringify(shadedNames)===JSON.stringify(expectShaded), [shadedNames,expectShaded]);
check('polygon popups carry the count', mapLog.polys.find(p=>p.name==='Whitesail').layer.popup.includes(String(P.filter(p=>p.neighbourhood==='Whitesail').length)));
check('marker popup carries permit number, category and zone', /BLDG-\d{4}-\d+/.test(mapLog.markers[0].popup) && mapLog.markers[0].popup.includes(mapLog.markers[0].opts.fillColor===C.blue?'Residential':''));
check('legend names every category and the outside count', el('map-legend').innerHTML.includes('Residential building') && el('map-legend').innerHTML.includes(String(outside)+' permits outside'), el('map-legend').innerHTML.slice(0,120));
check('insights mention the top category and outside share', el('insights').innerHTML.includes(topCat[0]) && el('insights').innerHTML.includes('industrial lands'), el('insights').innerHTML.slice(0,200));
check('insights mention the BC Stats peak year', el('insights').innerHTML.includes(peakYear));
check('table default sort: issued desc, first row is the latest issue', (()=>{ const first=el('tbl').innerHTML.match(/<tbody><tr><td>([^<]+)<\/td>/); const latest=[...P].sort((a,b)=>a.issued<b.issued?1:-1)[0]; return first&&first[1]===latest.permit; })(), el('tbl').innerHTML.slice(0,300));
check('table paginates at 25', el('pg-info').textContent.startsWith('1–25 of '+N), el('pg-info').textContent);
check('prev disabled / next enabled on page 1', el('pg-prev').disabled===true && el('pg-next').disabled===false);
K.page(1);
check('page 2 shows rows 26–50', el('pg-info').textContent.startsWith('26–'), el('pg-info').textContent);
K.page(-1);
K.sort('dti');
check('sorting by days: first row has the max valid days', (()=>{ const first=el('tbl').innerHTML.match(/<tbody><tr>(?:<td[^>]*>[^<]*<\/td>|<td><span[^>]*>.*?<\/span><\/td>){7}<td class="num">([^<]+)<\/td>/); return first&&digits(first[1])===String(Math.max(...dtis)); })(), el('tbl').innerHTML.slice(0,400));
K.sort('dti');
check('sorting the same column again flips direction', K.sortDir==='asc');
K.sort('issued'); K.sort('issued');   // back to issued desc

console.log('\n--- filters ---');
const whitesail=P.filter(p=>p.neighbourhood==='Whitesail');
el('f-nbh').value='Whitesail'; K.setFilter('nbh','Whitesail');
check('neighbourhood filter narrows the count', digits(el('k-count').textContent)===String(whitesail.length), el('k-count').textContent);
check('neighbourhood filter: map markers follow', mapLog.markers.length===whitesail.filter(p=>p.lat!=null).length, mapLog.markers.length);
check('neighbourhood filter: KPI note references the full total', el('k-count-n').textContent.includes(String(N)), el('k-count-n').textContent);
K.toggleCat('Residential building');
const ws2=whitesail.filter(p=>p.category!=='Residential building');
check('hiding a category removes it from the count', digits(el('k-count').textContent)===String(ws2.length), el('k-count').textContent);
check('category chip renders as off', el('cat-list').innerHTML.includes('catbox off'), el('cat-list').innerHTML.slice(0,200));
K.allCats(false);
check('no categories → zero permits, empty states on', digits(el('k-count').textContent)==='0' && el('card-cat').classList.has('empty') && el('insights').innerHTML.includes('No permits match'), [el('k-count').textContent, [...el('card-cat').classList._s]]);
check('empty table row', el('tbl').innerHTML.includes('No permits match') && el('export-btn').disabled===true);
check('median KPI blank when nothing is in view', el('k-dti').textContent==='—', el('k-dti').textContent);
K.allCats(true);
check('all categories → back to the neighbourhood count', digits(el('k-count').textContent)===String(whitesail.length));
K.reset();
check('reset restores everything', digits(el('k-count').textContent)===String(N) && K.f.nbh==='' && K.f.cats.size===K.allCatNames.length);
const yr=[...new Set(P.map(p=>p.issued&&p.issued.slice(0,4)).filter(Boolean))].sort()[0];
K.setFilter('year',yr);
check('year filter counts only permits issued that year', digits(el('k-count').textContent)===String(P.filter(p=>p.issued&&p.issued.startsWith(yr)).length), el('k-count').textContent);
K.setFilter('year','');
K.setFilter('q','ocelot');
check('search matches addresses case-insensitively', digits(el('k-count').textContent)===String(P.filter(p=>(p.address||'').toLowerCase().includes('ocelot')).length), el('k-count').textContent);
K.setFilter('q','M1');
check('search matches OCP zone', digits(el('k-count').textContent)===String(P.filter(p=>[p.address,p.permit,p.zone,p.category,p.neighbourhood].some(v=>v&&String(v).toLowerCase().includes('m1'))).length), el('k-count').textContent);
K.setFilter('q','');
const smallCat=Object.entries(byCat).filter(([,n])=>n<5)[0];
if(smallCat){ K.allCats(false); K.toggleCat(smallCat[0]);
  check('small-count caveat appears below MIN_N', el('insights').innerHTML.includes('Only') || el('k-dti-n').textContent.includes('small count'), [el('insights').innerHTML.slice(0,120), el('k-dti-n').textContent]);
  K.allCats(true); }
// map click handler toggles the neighbourhood filter
const kild=mapLog.polys.find(p=>p.name==='Kildala');
kild.layer.onclick();
check('clicking a polygon filters to that neighbourhood', K.f.nbh==='Kildala' && digits(el('k-count').textContent)===String(P.filter(p=>p.neighbourhood==='Kildala').length), [K.f.nbh, el('k-count').textContent]);
mapLog.polys.find(p=>p.name==='Kildala').layer.onclick();
check('clicking it again clears the filter', K.f.nbh==='' && digits(el('k-count').textContent)===String(N));

console.log('\n--- CSV, theme, examples ---');
const csv=K.csvText(K.rows);
const lines=csv.split('\r\n');
check('CSV has a header and one line per permit', lines.length===N+1 && lines[0].startsWith('Permit,Address,Neighbourhood,Category,OCP zone'), lines[0]);
check('CSV neutralises formula-like text but keeps negatives numeric', K.csvCell('=1+1')==="'=1+1" && K.csvCell('-5')==='-5' && K.csvCell('a,b')==='"a,b"');
const tilesBefore=mapLog.tileUrls.length;
toggleTheme();
check('dark mode swaps tiles and re-renders charts', document.documentElement.getAttribute('data-theme')==='dark' && mapLog.tileUrls[mapLog.tileUrls.length-1].includes('dark_all') && mapLog.tileUrls.length>tilesBefore, mapLog.tileUrls.slice(-2));
check('theme toggle updates aria-pressed', el('theme-toggle')['@aria-pressed']==='true');
toggleTheme();
check('light mode restores light tiles', mapLog.tileUrls[mapLog.tileUrls.length-1].includes('light_all'));
K.setFilter('nbh','Nechako');
K.example('speed');
check('example chip resets filters', K.f.nbh==='' && digits(el('k-count').textContent)===String(N));

console.log('\n--- helpers ---');
check('fmt$ formats millions/thousands', fmt$(326300000)==='$326.3M' && fmt$(12139000)==='$12.1M' && fmt$(81000)==='$81K' && fmt$(null)==='—');
check('median of even-length array', median([1,2,3,4])===2.5 && median([])===null);
check('binCounts respects bin edges', JSON.stringify(binCounts([0,7,8,90,91],DTI_BINS))==='[2,1,0,0,1,1]');
check('monthLabel', monthLabel('2019-04')==='Apr 2019');

console.log(`\n${failures?'FAILED':'OK'}: ${passes} passed, ${failures} failed`);
process.exit(failures?1:0);
