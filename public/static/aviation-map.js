(()=>{"use strict";
const el=id=>document.getElementById(id);
const state={map:null,config:null,offers:[],airports:new Map(),routes:[],planes:new Map(),styleReady:false,airportData:[]};
const AIRPORTS_URL="/static/data/airports.csv";
function csv(text){const rows=[];let row=[],cell="",q=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'){if(q&&n==='"'){cell+='"';i++;}else q=!q;}else if(c===','&&!q){row.push(cell);cell="";}else if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&n==='\n')i++;row.push(cell);if(row.some(x=>x.trim()!==""))rows.push(row);row=[];cell="";}else cell+=c;}if(cell!==""||row.length){row.push(cell);rows.push(row)}return rows}
function airportDataset(text){const rows=csv(text);if(!rows.length)throw Error("Sparrow airport data is empty.");const h=rows.shift().map(x=>x.trim());const ix=Object.fromEntries(h.map((x,i)=>[x,i]));return rows.map(r=>({iata:(r[ix.iata_code]||"").trim().toUpperCase(),name:(r[ix.name]||"").trim(),lat:Number(r[ix.latitude_deg]),lng:Number(r[ix.longitude_deg]),country:(r[ix.iso_country]||"").trim().toUpperCase(),type:(r[ix.type]||"").trim()})).filter(a=>/^[A-Z]{3}$/.test(a.iata)&&Number.isFinite(a.lat)&&Number.isFinite(a.lng)&&a.type!=="closed");}
function gc(a,b,n=128){const R=Math.PI/180,L1=a[1]*R,L2=b[1]*R,O1=a[0]*R,O2=b[0]*R,v1=[Math.cos(L1)*Math.cos(O1),Math.cos(L1)*Math.sin(O1),Math.sin(L1)],v2=[Math.cos(L2)*Math.cos(O2),Math.cos(L2)*Math.sin(O2),Math.sin(L2)],w=Math.acos(Math.min(1,Math.max(-1,v1[0]*v2[0]+v1[1]*v2[1]+v1[2]*v2[2]))),s=Math.sin(w);if(w<1e-9)return [a,b];const out=[];for(let i=0;i<=n;i++){const t=i/n,A=Math.sin((1-t)*w)/s,B=Math.sin(t*w)/s,v=[A*v1[0]+B*v2[0],A*v1[1]+B*v2[1],A*v1[2]+B*v2[2]];out.push([Math.atan2(v[1],v[0])/R,Math.atan2(v[2],Math.hypot(v[0],v[1]))/R])}return out}
function progress(r){const a=Date.parse(r.departure),b=Date.parse(r.arrival),n=Date.now();return n<=a?0:n>=b?1:(n-a)/(b-a)}
function pos(r,t){const p=gc(r.origin.coordinates,r.destination.coordinates,256);return p[Math.max(0,Math.min(p.length-1,Math.round(t*(p.length-1))))]}
function bearingAt(r,t){const p=gc(r.origin.coordinates,r.destination.coordinates,256),i=Math.max(0,Math.min(p.length-2,Math.round(t*(p.length-1)))),a=p[i],b=p[i+1],rad=x=>x*Math.PI/180,deg=x=>(x*180/Math.PI+360)%360,y=Math.sin(rad(b[0]-a[0]))*Math.cos(rad(b[1])),x=Math.cos(rad(a[1]))*Math.sin(rad(b[1]))-Math.sin(rad(a[1]))*Math.cos(rad(b[1]))*Math.cos(rad(b[0]-a[0]));return deg(Math.atan2(y,x))}
function flightInfo(r){const d=document.createElement("div");const h=document.createElement("strong");h.textContent=(r.airline_name||r.company_name||"Sparrow flight")+" ?? "+r.origin.code+" ??? "+r.destination.code;const p=document.createElement("p");p.textContent=(r.title||"Published flight")+" ?? "+(r.aircraft||"Operator-supplied aircraft");const t=document.createElement("p");t.textContent=new Date(r.departure).toLocaleString()+" ??? "+new Date(r.arrival).toLocaleString();const s=document.createElement("p");const pr=progress(r);s.textContent=pr<=0?"Scheduled":pr>=1?"Completed":"Live telemetry unavailable · scheduled route preview";d.append(h,p,t,s);return d}
function popup(r,ll){new maplibregl.Popup({closeButton:true,closeOnClick:true,maxWidth:"320px"}).setLngLat(ll).setDOMContent(flightInfo(r)).addTo(state.map)}

function ensureAircraftLayer(){
 const m=state.map;
 if(!m.getSource("aviation-aircraft")){
  m.addSource("aviation-aircraft",{
   type:"geojson",
   data:{type:"FeatureCollection",features:[]}
  });
 }
 if(!m.getLayer("aviation-aircraft-glow")){
  m.addLayer({
   id:"aviation-aircraft-glow",
   type:"circle",
   source:"aviation-aircraft",
   paint:{
    "circle-radius":["interpolate",["linear"],["zoom"],1,5,4,8,8,11],
    "circle-color":"#63d8ff",
    "circle-opacity":0.28,
    "circle-blur":0.8
   }
  });
 }
 if(!m.getLayer("aviation-aircraft")){
  m.addLayer({
   id:"aviation-aircraft",
   type:"symbol",
   source:"aviation-aircraft",
   layout:{
    "text-field":"?",
    "text-size":["interpolate",["linear"],["zoom"],1,13,4,18,8,24],
    "text-allow-overlap":true,
    "text-ignore-placement":true,
    "text-rotate":["get","bearing"],
    "text-rotation-alignment":"map"
   },
   paint:{
    "text-color":"#ffffff",
    "text-halo-color":"#35bfff",
    "text-halo-width":2
   }
  });
 }
}

function ensureLayers(){const m=state.map;if(!m.getSource("aviation-routes"))m.addSource("aviation-routes",{type:"geojson",data:{type:"FeatureCollection",features:[]}});if(!m.getLayer("aviation-routes-glow"))m.addLayer({id:"aviation-routes-glow",type:"line",source:"aviation-routes",paint:{"line-color":"#65c9ff","line-width":6,"line-opacity":.18,"line-blur":3}});if(!m.getLayer("aviation-routes"))m.addLayer({id:"aviation-routes",type:"line",source:"aviation-routes",paint:{"line-color":"#8edcff","line-width":1.8,"line-opacity":.9,"line-dasharray":[1.2,1.5]}});if(!m.getSource("aviation-airports"))m.addSource("aviation-airports",{type:"geojson",data:{type:"FeatureCollection",features:[]},cluster:true,clusterMaxZoom:3,clusterRadius:45});if(!m.getLayer("aviation-airport-clusters"))m.addLayer({id:"aviation-airport-clusters",type:"circle",source:"aviation-airports",filter:["has","point_count"],paint:{"circle-color":"#76d5ff","circle-radius":["step",["get","point_count"],7,25,11,100,15],"circle-opacity":.55,"circle-stroke-color":"#fff","circle-stroke-width":1}});if(!m.getLayer("aviation-airports"))m.addLayer({id:"aviation-airports",type:"circle",source:"aviation-airports",filter:["!",["has","point_count"]],paint:{"circle-radius":["interpolate",["linear"],["zoom"],1.5,1.8,4,3.2,8,5],"circle-color":"#eaf9ff","circle-stroke-color":"#48bfff","circle-stroke-width":1.4,"circle-opacity":.95}});if(!m.getLayer("aviation-airport-labels"))m.addLayer({id:"aviation-airport-labels",type:"symbol",source:"aviation-airports",filter:["!",["has","point_count"]],minzoom:3,layout:{"text-field":["get","iata"],"text-size":["interpolate",["linear"],["zoom"],3,9,8,13],"text-offset":[0,1.4]},paint:{"text-color":"#fff","text-halo-color":"#071522","text-halo-width":2}});}
function renderAirports(){const features=state.airportData.map(a=>({type:"Feature",properties:{iata:a.iata,name:a.name,country:a.country},geometry:{type:"Point",coordinates:[a.lng,a.lat]}}));state.map.getSource("aviation-airports")?.setData({type:"FeatureCollection",features});}
function renderRoutes(){state.map.getSource("aviation-routes")?.setData({type:"FeatureCollection",features:state.routes.map(r=>({type:"Feature",properties:{id:r.id},geometry:{type:"LineString",coordinates:gc(r.origin.coordinates,r.destination.coordinates)}}))});}
function planeElement(r){const b=document.createElement("button");b.type="button";b.className="sparrow-flight-plane";b.setAttribute("aria-label",(r.airline_name||r.company_name||"Flight")+" "+r.origin.code+" to "+r.destination.code);b.innerHTML='<span class="plane-glow"></span><span class="plane-body">???</span>';b.onclick=e=>{e.stopPropagation();const p=pos(r,progress(r));popup(r,p)};return b}

function offerProgress(r,now=Date.now()){
 const dep=Date.parse(r.departure);
 const arr=Date.parse(r.arrival);
 if(!Number.isFinite(dep)||!Number.isFinite(arr)||arr<=dep)return null;
 return Math.max(0,Math.min(1,(now-dep)/(arr-dep)));
}

function interpolateGeo(a,b,t){
 const A=a.coordinates;
 const B=b.coordinates;
 const lon1=A[0]*Math.PI/180;
 const lat1=A[1]*Math.PI/180;
 const lon2=B[0]*Math.PI/180;
 const lat2=B[1]*Math.PI/180;

 const x1=Math.cos(lat1)*Math.cos(lon1);
 const y1=Math.cos(lat1)*Math.sin(lon1);
 const z1=Math.sin(lat1);

 const x2=Math.cos(lat2)*Math.cos(lon2);
 const y2=Math.cos(lat2)*Math.sin(lon2);
 const z2=Math.sin(lat2);

 const dot=Math.max(-1,Math.min(1,x1*x2+y1*y2+z1*z2));
 const omega=Math.acos(dot);

 if(omega<1e-9){
  return [
   A[0]+(B[0]-A[0])*t,
   A[1]+(B[1]-A[1])*t
  ];
 }

 const s=Math.sin(omega);
 const k0=Math.sin((1-t)*omega)/s;
 const k1=Math.sin(t*omega)/s;

 const x=k0*x1+k1*x2;
 const y=k0*y1+k1*y2;
 const z=k0*z1+k1*z2;

 return [
  Math.atan2(y,x)*180/Math.PI,
  Math.atan2(z,Math.sqrt(x*x+y*y))*180/Math.PI
 ];
}

function bearingGeo(a,b,t){
 const p1=interpolateGeo(a,b,Math.max(0,Math.min(1,t)));
 const p2=interpolateGeo(a,b,Math.min(1,t+0.002));

 const lon1=p1[0]*Math.PI/180;
 const lat1=p1[1]*Math.PI/180;
 const lon2=p2[0]*Math.PI/180;
 const lat2=p2[1]*Math.PI/180;

 const y=Math.sin(lon2-lon1)*Math.cos(lat2);
 const x=Math.cos(lat1)*Math.sin(lat2)-
         Math.sin(lat1)*Math.cos(lat2)*Math.cos(lon2-lon1);

 return Math.atan2(y,x)*180/Math.PI;
}

function renderPlanes(){
 // Scheduled offer times do not establish an aircraft's actual position.
 // Keep the aircraft layer empty until an authorized live telemetry source is connected.
 state.map?.getSource('aviation-aircraft')?.setData({type:'FeatureCollection',features:[]});
}

function render(){if(!state.map?.isStyleLoaded())return;ensureLayers();renderAirports();renderRoutes();renderPlanes();}
async function load(){const [ar,fr]=await Promise.all([fetch(AIRPORTS_URL,{cache:"no-store"}),fetch("/api/aviation/offers?offset=0&passengers=1",{credentials:"same-origin"})]);if(!ar.ok)throw Error("Sparrow airport data could not be loaded.");if(!fr.ok)throw Error("Unable to load published aviation offers.");state.airportData=airportDataset(await ar.text());const offers=await fr.json();state.offers=Array.isArray(offers)?offers:[];const byCode=new Map(state.airportData.map(a=>[a.iata,a]));state.routes=[];for(const f of state.offers){const o=byCode.get(String(f.origin||"").toUpperCase()),d=byCode.get(String(f.destination||"").toUpperCase());if(!o||!d)continue;state.routes.push({...f,origin:{code:o.iata,name:f.origin_name||o.name,coordinates:[o.lng,o.lat]},destination:{code:d.iata,name:f.destination_name||d.name,coordinates:[d.lng,d.lat]}});}render();}

function bindAircraft(){
 const m=state.map;

 m.on("click","aviation-aircraft",e=>{
  const p=e.features?.[0]?.properties;
  if(!p)return;

  const safe=v=>String(v??"").replace(/[<>]/g,"");

  new maplibregl.Popup({
   closeButton:true,
   closeOnClick:true
  })
   .setLngLat(e.lngLat)
   .setHTML(
    "<strong>"+safe(p.origin)+" ? "+safe(p.destination)+"</strong>"+
    "<p>"+safe(p.airline||"Aviation operator")+"</p>"+
    "<p>"+safe(p.aircraft||"Aircraft")+"</p>"+
    "<p>Flight progress: "+safe(p.progress)+"%</p>"
   )
   .addTo(m);
 });

 m.on("mouseenter","aviation-aircraft",()=>{
  m.getCanvas().style.cursor="pointer";
 });

 m.on("mouseleave","aviation-aircraft",()=>{
  m.getCanvas().style.cursor="";
 });
}

function bind(){const m=state.map;m.on("click","aviation-routes",e=>{const id=e.features?.[0]?.properties?.id,r=state.routes.find(x=>x.id===id);if(r)popup(r,e.lngLat)});m.on("click","aviation-airports",e=>{const f=e.features?.[0],d=f?.properties;if(d)new maplibregl.Popup().setLngLat(e.lngLat).setHTML("<strong>"+String(d.iata).replace(/[<>]/g,"")+" ?? Airport</strong><p>"+String(d.name||"").replace(/[<>]/g,"")+"</p>").addTo(m)});m.on("mouseenter","aviation-routes",()=>m.getCanvas().style.cursor="pointer");m.on("mouseleave","aviation-routes",()=>m.getCanvas().style.cursor="");m.on("mouseenter","aviation-airports",()=>m.getCanvas().style.cursor="pointer");m.on("mouseleave","aviation-airports",()=>m.getCanvas().style.cursor="");}
async function init(){const ctn=el("aviation-world-map");if(!ctn||!window.maplibregl)return;const response=await fetch("/api/ecosystem/booking/config",{credentials:"same-origin"});if(!response.ok)throw Error("Sparrow map configuration is unavailable.");const c=await response.json();state.config=c;state.map=new maplibregl.Map({container:ctn,style:c.vector_style,center:[15,18],zoom:1.45,pitch:55,maxPitch:60,bearing:0,antialias:true,attributionControl:false});state.map.addControl(new maplibregl.NavigationControl({showCompass:true,visualizePitch:true}),"top-right");state.map.on("style.load",async()=>{state.styleReady=true;ensureAircraftLayer();try{window.SparrowMap3D?.attach(state.map,c,el("aviation-map-state"),true)}catch(e){if(el("aviation-map-state"))el("aviation-map-state").textContent="Sparrow 3D terrain/buildings are temporarily unavailable; the interactive map remains active."}try{await load();bind();if(el("aviation-map-state"))el("aviation-map-state").textContent="Sparrow 3D Earth · airport locations and operator-submitted route previews · live aircraft telemetry unavailable"}catch(e){if(el("aviation-map-state"))el("aviation-map-state").textContent=e.message}});}
window.SparrowAviationMap={reload:load};if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();