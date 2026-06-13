// Headless harness for the embedded dashboard. Run: node test/harness.js
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
const html = fs.readFileSync(path.join(__dirname,'..','dist','permit_dashboard.html'),'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
eval(src + '\nglobalThis.D = D; globalThis.RENOV_PAIRS = RENOV_PAIRS;');
console.log('y1 options:', el('f-y1').options.length, 'first:', el('f-y1').options[0].value, 'y2 value:', el('f-y2').value);
el('f-y2').value = el('f-y2').options[el('f-y2').options.length-1].value;
D.apply();
console.log('FULL RANGE — permits:', el('k-count').textContent, '| cost:', el('k-cost').textContent,
  '| median:', el('k-med').textContent, '| units:', el('k-units').textContent,
  '| dti:', el('k-dti').textContent, '| completion:', el('k-comp').textContent);
const g = D.groupYear();
console.log('years:', g.ys.join(','));
console.log('2019:', g.counts[g.ys.indexOf(2019)], 'permits,', g.costs[g.ys.indexOf(2019)], 'cost');
el('f-cls').value='Garage'; D.apply();
console.log('Garage:', el('count-badge').textContent);
el('f-cls').value='all'; el('f-q').value='cedarglen'; D.apply();
console.log('cedarglen:', el('count-badge').textContent);
el('f-q').value=''; D.apply();
D.sort('cost');
console.log('after sort pg-info:', el('pg-info').textContent);
console.log('insights:', (el('insights').innerHTML.match(/class="insight"/g)||[]).length);
console.log('table rendered:', /<tbody><tr>/.test(el('tbl').innerHTML));

console.log('--- new features ---');
console.log('renov pairs (full data):', RENOV_PAIRS.length);
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
console.log('renov lags in filter:', D.renovLags.length, 'median yrs:', med(D.renovLags).toFixed(2));
console.log('cum final:', D.charts.cum.data.datasets[0].data.slice(-1)[0], 'permits /', D.charts.cum.data.datasets[1].data.slice(-1)[0], 'units');
console.log('cost hist sum:', D.charts.costh.data.datasets[0].data.reduce((a,b)=>a+b,0), '(expect 1424 = permits with cost)');
console.log('dti hist sum:', D.charts.dtih.data.datasets[0].data.reduce((a,b)=>a+b,0));
console.log('renov hist sum:', D.charts.renov.data.datasets[0].data.reduce((a,b)=>a+b,0));
console.log('renov labels:', D.charts.renov.data.labels.slice(0,3).join('|'), '...', D.charts.renov.data.labels.slice(-1)[0]);
