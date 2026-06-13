// Headless harness for the embedded offline dashboard. Run: node test/harness.js
// Asserts KPIs/charts against the committed dist build; exits non-zero on any failure.
let failures=0, passes=0;
function check(name,cond,got){ if(cond){passes++;console.log('  PASS',name);} else {failures++;console.error('  FAIL',name,got!==undefined?('-> got: '+JSON.stringify(got)):'');} }
const digits=s=>String(s==null?'':s).replace(/[^0-9]/g,'');

const els = {};
function el(id){ if(!els[id]) els[id] = {value:'', textContent:'', innerHTML:'', options:[], disabled:false,
  add(o){this.options.push(o); if(this.options.length===1 && this.value==="") this.value=o.value;}}; return els[id]; }
// selects default to 'all', inputs to ''
['f-cls','f-work','f-status','f-y1','f-y2'].forEach(id=>{el(id).value='all';});
el('f-y1').value=''; el('f-y2').value='';
global.Option = function(t,v){return {text:t,value:String(v)}};
global.document = { getElementById: el };
global.Chart = class { constructor(c,cfg){this.data=cfg.data||{labels:[],datasets:[]}} update(){} };
global.L = { map:()=>({setView(){return this},fitBounds(){}}), tileLayer:()=>({addTo(){}}),
  layerGroup:()=>({addTo(){return this},clearLayers(){}}),
  circleMarker:()=>({bindPopup(){return this},addTo(){return this}}) };
const fs = require('fs');
const path = require('path');
const distPath = path.join(__dirname,'..','dist','permit_dashboard.html');
if(!fs.existsSync(distPath)){ console.error('FAIL: dist/permit_dashboard.html not found — run `python build.py` first.'); process.exit(1); }
const html = fs.readFileSync(distPath,'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
eval(src + '\nglobalThis.D = D; globalThis.RENOV_PAIRS = RENOV_PAIRS;');

console.log('y1 options:', el('f-y1').options.length, 'first:', el('f-y1').options[0].value, 'y2 value:', el('f-y2').value);
check('year options populated', el('f-y1').options.length>0, el('f-y1').options.length);
el('f-y2').value = el('f-y2').options[el('f-y2').options.length-1].value;
D.apply();
console.log('FULL RANGE — permits:', el('k-count').textContent, '| cost:', el('k-cost').textContent,
  '| median:', el('k-med').textContent, '| units:', el('k-units').textContent,
  '| dti:', el('k-dti').textContent, '| completion:', el('k-comp').textContent);
check('full-range permit count = 1,498', digits(el('k-count').textContent)==='1498', el('k-count').textContent);
check('full-range total cost formatted', /^\$[\d.]+[KMB]?$/.test(el('k-cost').textContent), el('k-cost').textContent);
check('full-range median cost formatted', /^\$[\d.]+[KMB]?$/.test(el('k-med').textContent), el('k-med').textContent);

const g = D.groupYear();
console.log('years:', g.ys.join(','));
console.log('2019:', g.counts[g.ys.indexOf(2019)], 'permits,', g.costs[g.ys.indexOf(2019)], 'cost');
check('groupYear returns years', g.ys.length>0, g.ys.length);

el('f-cls').value='Garage'; D.apply();
console.log('Garage:', el('count-badge').textContent);
const garageN = +digits(el('count-badge').textContent);
check('Garage filter narrows the set', garageN>0 && garageN<1498, garageN);

el('f-cls').value='all'; el('f-q').value='cedarglen'; D.apply();
console.log('cedarglen:', el('count-badge').textContent);
check('text search returns matches', +digits(el('count-badge').textContent)>0, el('count-badge').textContent);

el('f-q').value=''; D.apply();
D.sort('cost');
console.log('after sort pg-info:', el('pg-info').textContent);
check('pagination info present after sort', /\d/.test(el('pg-info').textContent), el('pg-info').textContent);
const insightCount = (el('insights').innerHTML.match(/class="insight"/g)||[]).length;
console.log('insights:', insightCount);
check('insights generated', insightCount>=1, insightCount);
console.log('table rendered:', /<tbody><tr>/.test(el('tbl').innerHTML));
check('table body rendered', /<tbody><tr>/.test(el('tbl').innerHTML));

console.log('--- analytics ---');
console.log('renov pairs (full data):', RENOV_PAIRS.length);
check('renovation pairs detected', RENOV_PAIRS.length>=100 && RENOV_PAIRS.length<=115, RENOV_PAIRS.length);
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
const renovMedian = D.renovLags.length?med(D.renovLags):null;
console.log('renov lags in filter:', D.renovLags.length, 'median yrs:', renovMedian!=null?renovMedian.toFixed(2):'—');
check('renovation lag median is plausible', renovMedian!=null && renovMedian>0 && renovMedian<20, renovMedian);
const cumP = D.charts.cum.data.datasets[0].data.slice(-1)[0];
const cumU = D.charts.cum.data.datasets[1].data.slice(-1)[0];
console.log('cum final:', cumP, 'permits /', cumU, 'units');
check('cumulative permits <= total', cumP>0 && cumP<=1498, cumP);
const costHist = D.charts.costh.data.datasets[0].data.reduce((a,b)=>a+b,0);
console.log('cost hist sum:', costHist, '(expect 1424 = permits with cost)');
check('cost histogram sum = 1424 (permits with cost)', costHist===1424, costHist);
const dtiHist = D.charts.dtih.data.datasets[0].data.reduce((a,b)=>a+b,0);
console.log('dti hist sum:', dtiHist);
check('dti histogram has entries', dtiHist>0, dtiHist);
const renovHist = D.charts.renov.data.datasets[0].data.reduce((a,b)=>a+b,0);
console.log('renov hist sum:', renovHist);
check('renov histogram matches lag count', renovHist===D.renovLags.length, [renovHist, D.renovLags.length]);
console.log('renov labels:', D.charts.renov.data.labels.slice(0,3).join('|'), '...', D.charts.renov.data.labels.slice(-1)[0]);

console.log(`\n${passes} passed, ${failures} failed`);
if(failures) process.exit(1);
