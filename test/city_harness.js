// Headless harness for the live city explorer (stubbed fetch). Run: node test/city_harness.js
// --- DOM stubs ---
const els={};
function el(id){ if(!els[id]) els[id]={id,value:'',textContent:'',innerHTML:'',className:'',style:{},options:[],disabled:false,
  add(o){this.options.push(o); if(this.options.length===1&&this.value==='')this.value=o.value;},
  appendChild(){}, classList:{_s:new Set(),toggle(c,on){on?this._s.add(c):this._s.delete(c)},add(c){this._s.add(c)},remove(c){this._s.delete(c)}}}; return els[id]; }
['f-cls','f-work','f-status'].forEach(id=>el(id).value='all');
global.Option=function(t,v){return{text:t,value:String(v)}};
global.document={getElementById:el,createElement:()=>({})};
global.Chart=class{constructor(c,cfg){this.data=(cfg&&cfg.data)||{labels:[],datasets:[]}}update(){}};
global.L={map:()=>({setView(){return this},fitBounds(){},closePopup(){}}),tileLayer:()=>({addTo(){}}),
  layerGroup:()=>({addTo(){return this},clearLayers(){}}),
  circleMarker:()=>({bindPopup(){return this},addTo(){return this}})};

// --- fetch stub: canned Socrata responses ---
let fetchLog=[];
global.fetch=async(url)=>{
  fetchLog.push(url);
  const u=new URL(url); const p=Object.fromEntries(u.searchParams);
  const sel=p['$select']||'', grp=p['$group']||'', where=p['$where']||'';
  const detailScope = where.includes("communityname) = 'HARVEST HILLS'");
  const json=(d)=>({ok:true,json:async()=>d,text:async()=>JSON.stringify(d)});
  if(sel.includes('count(1) as n, sum(estprojectcost)')&&!grp)
    return json([{n:detailScope?'1480':'490787',c:detailScope?'220000000':'3.1e10',u:detailScope?'949':'356804',d:'23.6'}]);
  if(grp==='k'&&sel.includes('date_extract_y')&&sel.includes('sum'))
    return json([{k:'2018',n:'16689',c:'4.4e9',u:'8000',d:'20'},{k:'2019',n:'17373',c:'4.6e9',u:'9000',d:'22'}]);
  if(grp==='k'&&sel.includes('date_extract_y')) return json([{k:'1999',n:'6991'},{k:'2026',n:'8462'}]);
  if(grp==='k'&&sel.includes('communityname')) return json([{k:'DOWNTOWN COMMERCIAL CORE',n:'14614',lat:'51.045',lng:'-114.07',c:'9.0e9'},{k:'HARVEST HILLS',n:'1480',lat:'51.14',lng:'-114.06',c:'2.2e8'}]);
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
  await D.apply();
  console.log('CITY MODE:', D.mode, '| total:', D.total, '| badge:', el('count-badge').textContent);
  console.log('  KPI count:', el('k-count').textContent, '| cost:', el('k-cost').textContent, '| avg dti:', el('k-dti').textContent, '| completion:', el('k-comp').textContent);
  console.log('  year chart pts:', D.charts.year.data.labels.length, '| comm bubbles:', D.stats.comms.length);
  console.log('  table rendered:', /<tbody>/.test(el('tbl').innerHTML), '| locked cards:', el('card-costh').classList._s.has('locked'));
  console.log('  insights:', (el('insights').innerHTML.match(/class="insight"/g)||[]).length);
  // drill into community -> detail mode
  el('f-comm').value='HARVEST HILLS';
  await D.apply();
  console.log('DETAIL MODE:', D.mode, '| total:', D.total, '| rows:', D.rows.length);
  console.log('  KPI median cost:', el('k-med').textContent, '| median dti:', el('k-dti').textContent);
  console.log('  renov lags:', D.renovLags.length, '| unlocked:', !el('card-costh').classList._s.has('locked'));
  console.log('  cost hist sum:', D.charts.costh.data.datasets[0].data.reduce((a,b)=>a+b,0));
  console.log('  table rendered:', /<tbody>/.test(el('tbl').innerHTML));
  // sort + page in detail mode
  D.sort('estprojectcost'); D.page(1);
  console.log('  pg-info after sort/page:', el('pg-info').textContent);
  console.log('  err shown:', el('err').style.display==='block'?el('err').textContent:'none');
  console.log('fetches made:', fetchLog.length);
})().catch(e=>{console.error('HARNESS FAIL:',e);process.exit(1);});
