"use strict";
function renderUserLocationMarker(){
 if(!map||!center||!window.maplibregl)return;
 if(window.__sparrowUserMarker)window.__sparrowUserMarker.remove();
 const markerEl=document.createElement('button');
 markerEl.type='button';
 markerEl.className='sparrow-user-location-marker';
 markerEl.setAttribute('aria-label','Current precise GPS location');
 markerEl.title='Current precise GPS location';
 markerEl.onclick=e=>{
  e.stopPropagation();
  if(map&&center){
   map.easeTo({
    center:[center.lng,center.lat],
    zoom:13.5,
    pitch:45,
    bearing:0,
    duration:220
   });
  }
 };
 window.__sparrowUserMarker=new maplibregl.Marker({
  element:markerEl,
  anchor:'center'
 }).setLngLat([center.lng,center.lat]).addTo(map);
}

function installRideMapControls(){
 const root=el('nearme-map-controls');
 if(!root||root.dataset.bound==='1')return;
 root.dataset.bound='1';
 root.addEventListener('click',e=>{
  const b=e.target.closest('[data-map-action]');
  if(!b)return;
  const actionName=b.dataset.mapAction;
  if(actionName==='locate'){
   el('locate')?.click();
   return;
  }
  if(!map||!center)return;
  if(actionName==='recenter'){
   map.easeTo({
    center:[center.lng,center.lat],
    zoom:13.5,
    pitch:34,
    bearing:0,
    duration:220
   });
  }else if(actionName==='zoom-in'){
   map.zoomIn({duration:160});
  }else if(actionName==='zoom-out'){
   map.zoomOut({duration:160});
  }
 });
}

function startMap(config){
 if(!window.maplibregl){
  el('map-state').textContent='Map engine unavailable. Sparrow will not guess your location.';
  return;
 }
 if(!center||!Number.isFinite(center.lat)||!Number.isFinite(center.lng)){
  el('map-state').textContent='Waiting for precise device GPS.';
  return;
 }
 try{
  map=new maplibregl.Map({
   container:'map',
   center:[center.lng,center.lat],
   zoom:13.5,
   pitch:34,
   bearing:0,
   maxPitch:55,
   minZoom:12,
   maxZoom:16,
   dragRotate:false,
   touchPitch:false,
   cooperativeGestures:true,
   prefetchZoomDelta:0,
   attributionControl:false,
   style:config.vector_style||{version:8,sources:{base:{type:'raster',tiles:[config.tile_url],tileSize:256,attribution:config.tile_credit}},layers:[{id:'base',type:'raster',source:'base'}]}
  });

  map.on('style.load',()=>{
   if(!window.SparrowMap3D)return;
   try{SparrowMap3D.attach(map,config,el('map-state'),map3d);}
   catch(_error){el('map-state').textContent='3D terrain is unavailable in this area. The local GPS map and listings remain available.';}
  });

  map.__sparrowReady=new Promise(resolve=>{
   if(map.loaded())resolve();
   else map.once('load',resolve);
  });

  map.addControl(
   new maplibregl.AttributionControl({compact:true}),
   'bottom-right'
  );

  installRideMapControls();

  map.on('error',()=>{
   el('map-state').textContent='Map tiles unavailable. GPS location remains locked.';
  });

  map.on('click',e=>{
   const p={lat:e.lngLat.lat,lng:e.lngLat.lng};

   if(nearbyRegion&&typeof pointInRegion==='function'&&!pointInRegion(nearbyRegion,p)){
    say('Near Me is limited to your detected administrative region.');
    return;
   }

   if(nearbyRegion){
    selected=p;
    el('pin-state').textContent=
     'Selected public pin: '+p.lat.toFixed(5)+', '+p.lng.toFixed(5);
    el('publish-pin').checked=false;
    if(chosen)chosen.remove();
    chosen=new maplibregl.Marker({color:'#d88020'})
     .setLngLat([p.lng,p.lat])
     .addTo(map);
    return;
   }

   setPin(p);
   el('scope').value='nearby';
   el('country').value='';
   page=0;
   search().catch(e=>say(e.message));
  });

  map.__sparrowReady.then(()=>{
   map.setMinZoom(12);
   map.setMaxZoom(16);

   if(nearbyRegion){
    drawNearbyRegion(nearbyRegion);
    installNearbyRegionGuard(nearbyRegion);
   }

   map.jumpTo({
    center:[center.lng,center.lat],
    zoom:13.5,
    pitch:34,
    bearing:0
   });

   renderUserLocationMarker();
   installRideMapControls();
  });
 }catch(e){
  el('map').replaceChildren(
   node('p','Interactive map unavailable. Sparrow will not guess your location.')
  );
  map=null;
 }
}



/* SPARROW REFERENCE MAP RENDERER */
function sparrowReferenceCategory(value){
 const s=String(value||'').toLowerCase();
 if(s.includes('dj')||s.includes('disc jockey'))return 'DJ';
 if(s.includes('singer')||s.includes('vocal'))return 'Singer';
 if(s.includes('mc')||s.includes('master of ceremonies'))return 'MC';
 if(s.includes('dancer')||s.includes('dance'))return 'Dancer';
 return 'Other';
}
function sparrowReferenceInitials(r){
 const name=String(r.provider_name||r.title||'Sparrow').trim();
 return name.split(/\s+/).slice(0,2).map(v=>v.charAt(0).toUpperCase()).join('')||'S';
}
function sparrowReferenceMatches(r,q){
 if(!q)return true;
 return [
  r.title,r.provider_name,r.category,r.location,r.country_name,
  r.description,r.service_mode
 ].map(v=>String(v||'').toLowerCase()).join(' ').includes(q);
}
function renderSparrowReferenceFilters(rows){
 const host=el('sparrow-reference-filters');
 if(!host)return;
 const definitions=[['all','All'],['DJ','DJ'],['Singer','Singer'],['MC','MC'],['Dancer','Dancer']];
 host.replaceChildren();
 for(const [key,label] of definitions){
  const count=key==='all'?rows.length:rows.filter(r=>sparrowReferenceCategory(r.category)===key).length;
  const b=document.createElement('button');
  b.type='button';
  b.className='sparrow-reference-chip'+((window.__sparrowReferenceCategory||'all')===key?' active':'');
  b.dataset.referenceCategory=key;
  b.textContent=label+' '+count;
  b.addEventListener('click',()=>{window.__sparrowReferenceCategory=key;renderSparrowReferenceResults(window.__sparrowBookingRows||[]);});
  host.append(b);
 }
}
function renderSparrowReferenceResults(rows){
 const host=el('results');
 if(!host)return;
 window.__sparrowReferenceCards=Object.create(null);
 const category=window.__sparrowReferenceCategory||'all';
 const q=String(el('sparrow-reference-q')?.value||'').trim().toLowerCase();
 const filtered=rows.filter(r=>(category==='all'||sparrowReferenceCategory(r.category)===category)&&sparrowReferenceMatches(r,q));
 host.replaceChildren();
 const count=el('sparrow-reference-count');
 if(count)count.textContent=rows.length+' verified entertainers';
 renderSparrowReferenceFilters(rows);
 if(!filtered.length){
  host.append(node('p',q?'No matching entertainers in the loaded results.':'No matching Sparrow listings.'));
  return;
 }
 for(const r of filtered){
  const card=document.createElement('article');
  card.className='sparrow-entertainer-card';
  card.dataset.listingId=String(r.id);
  const avatar=document.createElement('div');
  avatar.className='sparrow-card-avatar';
  const photo=r.profile_photo||r.profile_image||r.avatar_url||r.photo_url||r.image_url;
  if(photo){
   const img=document.createElement('img');
   img.src=String(photo);
   img.alt=String(r.provider_name||r.title||'Entertainer');
   img.loading='lazy';
   avatar.append(img);
  }else{
   avatar.textContent=sparrowReferenceInitials(r);
  }
  const main=document.createElement('div');
  main.className='sparrow-card-main';
  const name=document.createElement('div');
  name.className='sparrow-card-name';
  name.textContent=String(r.provider_name||r.title||'Entertainer');
  if(r.provider_verified){const verified=document.createElement('span');verified.className='sparrow-verified-badge';verified.textContent='Identity verified';name.append(' ',verified);}
  const role=document.createElement('div');
  role.className='sparrow-card-role';
  role.textContent=String(r.category||'Entertainer');
  const price=document.createElement('div');
  price.className='sparrow-card-price';
  if(Number.isSafeInteger(r.price_minor)){
   const currency=String(r.currency||'NGN');
   const formatter=new Intl.NumberFormat(undefined,{style:'currency',currency});
   const digits=formatter.resolvedOptions().maximumFractionDigits;
   price.textContent=formatter.format(r.price_minor/10**digits)+' / '+String(r.pricing_unit||'event');
  }else price.textContent='Price on request';
  const meta=document.createElement('div');
  meta.className='sparrow-card-meta';
  const distance=r.distance_km!==null&&r.distance_km!==undefined?String(r.distance_km)+' km away':String(r.location||'Location unavailable');
  meta.textContent=distance+(r.country_name?' - '+String(r.country_name):'');
  main.append(name,role,meta,price);
  if(r.active_now&&Number(r.active_until)>Date.now()/1000){const availability=document.createElement('div');availability.className='sparrow-provider-availability';availability.textContent='Available nearby until '+new Date(Number(r.active_until)*1000).toLocaleTimeString();main.append(availability);}
  const extraValue=r.rating??r.average_rating;
  const genre=r.genre||r.specialty;
  if(extraValue!==undefined||genre){
   const extra=document.createElement('div');
   extra.className='sparrow-card-extra';
   extra.textContent=(extraValue!==undefined?'Rating '+String(extraValue):'')+(genre?' - '+String(genre):'');
   main.append(extra);
  }
  const book=document.createElement('button');
  book.type='button';
  book.className='sparrow-card-book';
  if(r.owner===me.user_id){
   book.textContent='Your listing';
   book.disabled=true;
  }else{
   book.textContent='Book';
   book.addEventListener('click',()=>openRequest(r));
  }
  card.append(avatar,main,book);
  card.addEventListener('click',e=>{
   if(e.target.closest('button'))return;
   if(map&&r.latitude!==null&&r.longitude!==null)map.easeTo({center:[r.longitude,r.latitude],zoom:14,duration:260});
  });
  host.append(card);
  window.__sparrowReferenceCards[String(r.id)]=card;
 }
}
function createSparrowReferenceMarker(r){
 const markerEl=document.createElement('button');
 markerEl.type='button';
 markerEl.className='sparrow-reference-marker';
 const category=sparrowReferenceCategory(r.category);
 markerEl.dataset.sparrowKind=category;
 markerEl.setAttribute('aria-label',String(r.title||r.provider_name||'Entertainer'));
 const photo=r.profile_photo||r.profile_image||r.avatar_url||r.photo_url||r.image_url;
 if(photo){
  const img=document.createElement('img');
  img.src=String(photo);
  img.alt='';
  img.loading='lazy';
  markerEl.append(img);
 }else{
  const initials=document.createElement('span');
  initials.className='sparrow-reference-marker-initials';
  initials.textContent=sparrowReferenceInitials(r);
  markerEl.append(initials);
 }
 const role=document.createElement('span');
 role.className='sparrow-marker-role';
 role.textContent=category==='Other'?'ENT':category;
 markerEl.append(role);
 return markerEl;
}
function installSparrowReferenceUI(){
 const q=el('sparrow-reference-q');
 if(q&&!q.dataset.referenceBound){
  q.dataset.referenceBound='1';
  q.addEventListener('input',()=>renderSparrowReferenceResults(window.__sparrowBookingRows||[]));
  q.addEventListener('keydown',e=>{
   if(e.key!=='Enter')return;
   e.preventDefault();
   const legacy=document.querySelector('#search input[type="search"],#search input[name="q"],#search #q');
   const form=el('search');
   if(legacy&&form){
    legacy.value=q.value;
    if(typeof form.requestSubmit==='function')form.requestSubmit();
   }
  });
 }
 const all=el('sparrow-reference-see-all');
 if(all&&!all.dataset.referenceBound){
  all.dataset.referenceBound='1';
  all.addEventListener('click',()=>{
   window.__sparrowReferenceCategory='all';
   if(q)q.value='';
   renderSparrowReferenceResults(window.__sparrowBookingRows||[]);
  });
 }
 document.querySelectorAll('[data-reference-action]').forEach(b=>{
  if(b.dataset.referenceBound)return;
  b.dataset.referenceBound='1';
  b.addEventListener('click',()=>{
   if(b.dataset.referenceAction==='filters'){
    el('sparrow-reference-panel')?.classList.toggle('filters-collapsed');
   }else if(b.dataset.referenceAction==='notifications'){
    el('requests')?.scrollIntoView({behavior:'smooth',block:'center'});
   }
  });
 });
 document.querySelectorAll('[data-reference-nav]').forEach(b=>{
  if(b.dataset.referenceBound)return;
  b.dataset.referenceBound='1';
  b.addEventListener('click',()=>{
   const target=b.dataset.referenceNav;
   if(target==='home')window.scrollTo({top:0,behavior:'smooth'});
   if(target==='bookings')el('requests')?.scrollIntoView({behavior:'smooth',block:'center'});
   if(target==='messages')el('booking-messages')?.scrollIntoView({behavior:'smooth',block:'center'});
   if(target==='profile')el('mine')?.scrollIntoView({behavior:'smooth',block:'center'});
  });
 });
}
/* SPARROW REFERENCE MAP PRESENTATION V2 */
function installSparrowReferenceMapPresentation(){
 if(!map||map.__sparrowReferencePresentation)return;
 map.__sparrowReferencePresentation=true;
 const apply=()=>{
  try{
   map.easeTo({pitch:42,bearing:0,duration:0});
  }catch(e){}
  try{
   const style=map.getStyle?.();
   const layers=style?.layers||[];
   for(const layer of layers){
    if(layer.type==='fill-extrusion')continue;
    if(layer.type==='fill'&&/building/i.test(String(layer.id||''))){
     try{
      map.setPaintProperty(layer.id,'fill-extrusion-color','#172943');
      map.setPaintProperty(layer.id,'fill-extrusion-height',['coalesce',['get','height'],8]);
      map.setPaintProperty(layer.id,'fill-extrusion-base',['coalesce',['get','min_height'],0]);
     }catch(e){}
    }
   }
  }catch(e){}
 };
 if(map.loaded())apply();else map.once('load',apply);
}
const el=id=>document.getElementById(id);
window.setTimeout(installSparrowReferenceMapPresentation,0);
installSparrowReferenceUI();let map,markers=[],selected=null,chosen=null,me=null,countries=[],page=0,searchVersion=0,chatId=null,chatBefore=null,center=null,nearbyRegion=null,nearbyRegionListings=[],nearbyRegionListingsLoaded=false,regionSource=null,regionLastValidCenter=null,mapConfig=null,map3d=true;

const say=s=>el('status').textContent=s;
async function dashboard(){const state=el('dashboard-state'),entertainers=el('stat-entertainers'),bookings=el('stat-bookings'),response=el('stat-response-rate'),note=el('stat-response-note');if(!state||!entertainers||!bookings||!response||!note)return;state.textContent='Loading marketplace data…';entertainers.textContent='…';bookings.textContent='…';response.textContent='…';try{const d=await api('/dashboard');entertainers.textContent=Number(d.active_bookable_entertainers).toLocaleString();bookings.textContent=Number(d.total_bookings).toLocaleString();response.textContent=d.response_rate_percent===null?'Unavailable':Number(d.response_rate_percent).toLocaleString(undefined,{maximumFractionDigits:1})+'%';note.textContent=d.response_rate_percent===null?'No eligible booking responses recorded yet.':d.response_rate_definition;state.textContent='Updated '+new Date().toLocaleTimeString();}catch(e){entertainers.textContent='Unavailable';bookings.textContent='Unavailable';response.textContent='Unavailable';note.textContent=e.message;state.textContent='Marketplace data could not be loaded. Use Refresh overview to retry.';}}
async function api(path,method='GET',body,options={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000),headers={};if(body)headers['Content-Type']='application/json';if(options.idempotencyKey)headers['Idempotency-Key']=options.idempotencyKey;let r;try{r=await fetch('/api/ecosystem/booking'+path,{credentials:'same-origin',method,headers:Object.keys(headers).length?headers:undefined,body:body?JSON.stringify(body):undefined,signal:controller.signal});}catch(e){if(e.name==='AbortError')throw Error('Sparrow timed out while contacting the server. Check your bookings before submitting again.');throw Error('Sparrow could not reach the server. Check your connection and retry.');}finally{clearTimeout(timer);}let v={};try{v=await r.json();}catch{}if(!r.ok){let message=typeof v.detail==='string'?v.detail:r.status===401?'Your Sparrow session expired. Sign in and retry.':'Check the information you entered and try again.';if(r.status===429){const retry=r.headers.get('Retry-After');if(retry)message+=' Retry after '+retry+'.';}throw Error(message);}return v;}
function bookingIdempotencyKey(){return 'entertainment-'+(crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join(''));}
function node(tag,s){const n=document.createElement(tag);n.textContent=s;return n;}
function run(f){return async e=>{e?.preventDefault();const b=e?.submitter||e?.currentTarget;if(b?.tagName==='BUTTON')b.disabled=true;try{say('');await f();}catch(x){say(x.message);el('dialog-state').textContent=x.message;}finally{if(b?.tagName==='BUTTON')b.disabled=false;}};}
function action(parent,title,f){const b=node('button',title);b.type='button';b.onclick=run(f);parent.append(b);}
async function search(){
 const version=++searchVersion;
 const scope=el('scope').value;
 if(!center){
  el('results').replaceChildren(node('p','Allow Sparrow to access your exact device location for Near Me.'));
  return;
 }
 const params=new URLSearchParams({
  kind:el('kind').value,
  q:el('query').value,
  latitude:center.lat,
  longitude:center.lng,
  radius_km:100,
  scope,
  country:el('country').value,
  travel:el('travel-only').checked,
  offset:page
 });
 if(scope==='nearby'&&nearbyRegion?.id)params.set('region_id',nearbyRegion.id);
  const rows=await api('/listings?'+params);
  if(version!==searchVersion)return;
 el('results').replaceChildren();
 markers.forEach(m=>m.remove());
 markers=[];
 el('next-results').hidden=rows.length<100;
 if(!rows.length){const noFilters=!el('query').value.trim()&&!el('country').value&&!el('travel-only').checked&&scope==='worldwide';const empty=el('kind').value==='venue'?'No venues match these filters yet.':nearbyRegion&&scope==='nearby'?'No entertainers currently match in '+nearbyRegion.name+'.':noFilters?'No entertainers yet.':'No entertainers match these filters yet.';el('results').append(node('p',empty));}window.__sparrowBookingRows=rows;
  renderSparrowReferenceResults(rows);
  for(const r of rows){
   if(map&&r.latitude!==null&&r.longitude!==null){
    const markerEl=createSparrowReferenceMarker(r);
    const marker=new maplibregl.Marker({element:markerEl,anchor:'bottom'}).setLngLat([r.longitude,r.latitude]).addTo(map);
    markerEl.dataset.listingId=String(r.id);
    markerEl.onclick=e=>{
     e.stopPropagation();
     const card=window.__sparrowReferenceCards?.[String(r.id)];
     if(card)card.scrollIntoView({behavior:'smooth',block:'center'});
    };
    markers.push(marker);
   }
  }
  if(nearbyRegion&&scope==='nearby'&&map&&center){
  const box=regionBBox(nearbyRegion.geometry);
  if(box)map.setMaxBounds(box);
  map.easeTo({center:[center.lng,center.lat],zoom:13.5,pitch:34,bearing:0,duration:260});
  installNearbyRegionGuard(nearbyRegion);
  renderUserLocationMarker();
 }
}
function renderUserLocationMarker(){
 if(!map||!center||!window.maplibregl)return;
 if(window.__sparrowUserMarker)window.__sparrowUserMarker.remove();
 const markerEl=document.createElement('button');
 markerEl.type='button';
 markerEl.className='sparrow-user-location-marker';
 markerEl.setAttribute('aria-label','Your current device location');
 markerEl.title='Your current device location';
 markerEl.addEventListener('click',e=>{e.stopPropagation();if(map&&center)map.easeTo({center:[center.lng,center.lat],zoom:13.5,pitch:34,bearing:0,duration:350});});
 window.__sparrowUserMarker=new maplibregl.Marker({element:markerEl,anchor:'center'}).setLngLat([center.lng,center.lat]).addTo(map);
}
function installRideMapControls(){
 const root=el('nearme-map-controls');
 if(!root||root.dataset.bound==='1')return;
 root.dataset.bound='1';
 root.addEventListener('click',e=>{
  const b=e.target.closest('[data-map-action]');
  if(!b||!map)return;
  const action=b.dataset.mapAction;
  if(action==='locate'){el('locate')?.click();return;}
  if(action==='zoom-in'){map.zoomIn({duration:220});return;}
  if(action==='zoom-out'){map.zoomOut({duration:220});return;}
  if(action==='recenter'&&center){map.easeTo({center:[center.lng,center.lat],zoom:13.5,pitch:34,bearing:0,duration:350});if(nearbyRegion)installNearbyRegionGuard(nearbyRegion);}
 });
}function setPin(pos){center=pos;selected=pos;el('pin-state').textContent='Selected public pin: '+pos.lat.toFixed(5)+', '+pos.lng.toFixed(5);el('publish-pin').checked=false;if(chosen)chosen.remove();if(map){map.panTo([pos.lng,pos.lat]);chosen=new maplibregl.Marker({color:'#d88020'}).setLngLat([pos.lng,pos.lat]).addTo(map);}}
async function locatePlace(){page=0;await search();}
function openRequest(r){selectedListing=r;el('request-title').textContent='Book '+r.title;el('dialog-state').textContent='';el('event-location').value=r.service_mode==='remote'?'Remote work':r.location;el('request-mode').replaceChildren();for(const [value,title] of [['onsite','At the service location'],['remote','Remote service'],['travel','Travel to my event']]){if(value==='remote'&&!['remote','both'].includes(r.service_mode))continue;if(value==='onsite'&&r.service_mode==='remote')continue;if(value==='travel'&&!r.willing_to_travel)continue;const o=node('option',title);o.value=value;el('request-mode').append(o);}el('destination-country').value=r.country_code||'';el('travel-details').value='';el('request-dialog').showModal();}
let selectedListing,pendingEntertainmentBookingKey=null;
async function activity(){
 const rows=await api('/requests');el('requests').replaceChildren();
 if(!rows.length)el('requests').append(node('p','No booking requests yet.'));
 for(const r of rows){
  const a=node('article','');
  a.append(node('h3',r.title),node('p',(r.incoming?'Incoming':'Your request')+' · '+r.status),node('p',new Date(r.start).toLocaleString()+' – '+new Date(r.end).toLocaleString()),node('p',(r.mode||'onsite')+' · '+r.location+' · '+(r.destination_country||'')),node('p',r.brief),node('p',r.travel_details||''));
  if(r.agreed_price_minor!==null&&r.agreed_price_minor!==undefined){const digits=new Intl.NumberFormat(undefined,{style:'currency',currency:r.agreed_currency}).resolvedOptions().maximumFractionDigits;const amount=(r.agreed_price_minor/10**digits).toLocaleString(undefined,{style:'currency',currency:r.agreed_currency});a.append(node('p','Agreed total: '+amount+' · '+(r.price_confirmed?'customer confirmed':'awaiting customer confirmation')));}
  if(r.payment_status&&r.payment_status!=='unpaid')a.append(node('p','Payment: '+r.payment_status+(r.refund_status&&r.refund_status!=='none'?' · refund '+r.refund_status:'')));
  if(r.incoming&&r.status==='pending')for(const status of ['accepted','declined'])action(a,status==='accepted'?'Accept':'Decline',async()=>{await api('/requests/'+r.id,'PUT',{status});await activity();});
  if(r.incoming&&r.status==='accepted')action(a,'Set total price',async()=>{const raw=prompt('Enter the agreed total for this booking in '+(r.agreed_currency||'your listing currency')+'.');if(raw===null)return;const currency=r.agreed_currency||'NGN';const digits=new Intl.NumberFormat(undefined,{style:'currency',currency}).resolvedOptions().maximumFractionDigits;const value=Number(raw);if(!Number.isFinite(value)||value<=0)throw Error('Enter a valid total price.');await api('/requests/'+r.id+'/price','PUT',{amount_minor:Math.round(value*10**digits)});await activity();});
  if(!r.incoming&&r.status==='accepted'&&r.agreed_price_minor!==null&&!r.price_confirmed)action(a,'Confirm total price',async()=>{await api('/requests/'+r.id+'/price/accept','POST');await activity();});
  if(!r.incoming&&r.status==='accepted'&&r.price_confirmed&&r.payment_status!=='paid')action(a,'Pay securely',async()=>{const result=await api('/requests/'+r.id+'/payment','POST');if(result.status==='paid'){say('Payment is verified.');await activity();return;}if(!result.checkout_url)throw Error('The payment provider did not return a checkout link.');location.assign(result.checkout_url);});
  if(r.status==='accepted'&&Date.parse(r.end)<=Date.now())action(a,'Confirm completion',async()=>{const result=await api('/requests/'+r.id+'/completion','POST');await activity();say(result.confirmed_by_both?'Both parties confirmed completion.':'Your completion confirmation is recorded; waiting for the other party.');});
  if(r.status==='accepted'&&r.mode!=='remote'){const live=node('a','Open live journey map');live.href='/ecosystem/live?booking='+encodeURIComponent(r.id);a.append(live);}
  if(r.status==='completed'&&!r.incoming&&r.payment_status==='paid'&&r.refund_status==='none')action(a,'Request full refund',async()=>{const result=await api('/requests/'+r.id+'/refund','POST');await activity();say('Refund status: '+result.status+'. The payment provider reports '+(result.provider_status||'processing')+'.');});
  action(a,'Open conversation',()=>openChat(r));el('requests').append(a);
 }
}
async function providerPosition(){if(!navigator.geolocation)throw Error('This browser cannot provide GPS. Nearby availability was not enabled.');const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,error=>reject(Error(error?.code===1?'Location permission was denied. Nearby availability was not enabled.':'A fresh GPS fix is unavailable. Nearby availability was not enabled.')),{enableHighAccuracy:true,maximumAge:0,timeout:15000}));const {latitude,longitude,accuracy}=position.coords||{};const captured=Number(position.timestamp)/1000;if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||!Number.isFinite(accuracy)||accuracy<=0||!Number.isFinite(captured))throw Error('The browser returned an invalid GPS fix. Nearby availability was not enabled.');if(accuracy>100)throw Error('GPS accuracy must be 100 metres or better. Sparrow will not guess your availability.');return {latitude,longitude,accuracy,captured};}
async function setNearbyAvailability(listing,active){if(active){if(!confirm('Share an approximate location derived from your fresh GPS fix with signed-in Sparrow members for up to five minutes? Sparrow stores only a coarse location cell.'))return;const fix=await providerPosition();await api('/listings/'+encodeURIComponent(listing.id)+'/device-presence','PUT',{active:true,...fix});}else await api('/listings/'+encodeURIComponent(listing.id)+'/device-presence','PUT',{active:false});await mine();await search();}
async function mine(){const rows=await api('/mine');el('mine').replaceChildren();if(!rows.length){el('mine').append(node('p','You have no active published services.'));return;}for(const r of rows){const a=node('article','');a.append(node('h3',r.title),node('p',r.provider_verified?'Identity verified':'Verification required'));if(r.kind==='professional'&&r.service_mode!=='remote'){const expires=Number(r.active_until);const state=node('p',r.active_now&&expires>Date.now()/1000?'Available nearby until '+new Date(expires*1000).toLocaleTimeString():'Not available nearby');state.setAttribute('role','status');a.append(state);action(a,r.active_now?'Stop nearby availability':'Share approximate GPS for five minutes',()=>setNearbyAvailability(r,!r.active_now));}action(a,'Remove listing',async()=>{await api('/listings/'+encodeURIComponent(r.id),'DELETE');await mine();await search();});el('mine').append(a);}}
el('search').onsubmit=run(locatePlace);
el('listing').onsubmit=run(async()=>{const remote=el('service-mode').value==='remote';if(!remote&&!selected)throw Error('Select your public service location on the map first.');const amount=el('price-amount').value,currency=el('price-currency').value,digits=new Intl.NumberFormat(undefined,{style:'currency',currency}).resolvedOptions().maximumFractionDigits,price=amount===''?null:Math.round(Number(amount)*10**digits);await api('/listings','POST',{kind:el('listing-kind').value,title:el('title').value,category:el('category').value,description:el('description').value,location:el('address').value,country_code:el('listing-country').value,service_mode:el('service-mode').value,willing_to_travel:el('willing-travel').checked,price_minor:price,currency,pricing_unit:el('pricing-unit').value,latitude:remote?null:selected.lat,longitude:remote?null:selected.lng,publish_location:remote?false:el('publish-pin').checked});el('listing').reset();await mine();await search();say('Listing published.');});
el('request').onsubmit=run(async()=>{const start=new Date(el('start').value),end=new Date(el('end').value);if(!Number.isFinite(+start)||!Number.isFinite(+end))throw Error('Choose valid start and end times.');if(!pendingEntertainmentBookingKey)pendingEntertainmentBookingKey=bookingIdempotencyKey();const response=await api('/requests','POST',{listing:selectedListing.id,start:start.toISOString(),end:end.toISOString(),brief:el('brief').value,location:el('event-location').value,mode:el('request-mode').value,destination_country:el('destination-country').value,travel_details:el('travel-details').value},{idempotencyKey:pendingEntertainmentBookingKey});pendingEntertainmentBookingKey=null;el('request-dialog').close();await activity();say('Booking request sent. Your private Sparrow inbox is open.');await openChat({id:response.id,status:'pending'});});el('request').addEventListener('input',()=>{pendingEntertainmentBookingKey=null;});
el('close').onclick=()=>el('request-dialog').close();el('reload').onclick=run(activity);
el('nearme-allow').onclick=()=>{const locate=el('locate');if(!locate)throw Error('Location control is unavailable.');locate.click();};
el('toggle-3d').onclick=()=>{if(!map)return;map3d=!map3d;window.SparrowMap3D?.toggle(map,map3d);map.easeTo({pitch:map3d?45:0,bearing:0,duration:350});el('toggle-3d').setAttribute('aria-pressed',String(map3d));el('toggle-3d').textContent=map3d?'3D':'2D';};
el('locate').onclick=run(async()=>{
 if(!navigator.geolocation){
  throw Error('Precise device GPS is unavailable on this device.');
 }

 say('Getting precise device GPS...');

 const position=await new Promise((resolve,reject)=>{
  navigator.geolocation.getCurrentPosition(
   resolve,
   error=>{
    if(error?.code===1){
     reject(Error(
      'Sparrow does not have permission to use precise device location. Enable precise location and try again.'
     ));
    }else if(error?.code===2){
     reject(Error(
      'Precise device location is currently unavailable. Sparrow will not guess your position.'
     ));
    }else{
     reject(Error(
      'Sparrow could not obtain precise device location.'
     ));
    }
   },
   {
    enableHighAccuracy:true,
    maximumAge:0,
    timeout:20000
   }
  );
 });

 const latitude=Number(position.coords.latitude);
 const longitude=Number(position.coords.longitude);
 const accuracy=Number(position.coords.accuracy);

 if(
  !Number.isFinite(latitude)||
  !Number.isFinite(longitude)||
  !Number.isFinite(accuracy)||
  accuracy<=0
 ){
  throw Error('Sparrow received an invalid GPS position.');
 }

 if(accuracy>100){
  throw Error(
   'GPS accuracy is '+accuracy.toFixed(0)+' m. Sparrow requires 100 m or better and will not guess your location.'
  );
 }

 say('Confirming your detected administrative region...');

 const result=await api(
  '/nearby-region?'+
  new URLSearchParams({latitude,longitude})
 );

 const region=result?.region;

 if(!region?.id||!region?.geometry){
  throw Error(
   'Sparrow could not identify your administrative region from this GPS position.'
  );
 }

 nearbyRegion=region;
 center={lat:latitude,lng:longitude};
 selected={lat:latitude,lng:longitude};
 regionLastValidCenter={lat:latitude,lng:longitude};

 el('scope').value='nearby';
 el('country').value='';
 el('pin-state').textContent=
  'GPS locked | accuracy '+accuracy.toFixed(0)+' m';
 el('publish-pin').checked=false;

 if(chosen){
  chosen.remove();
  chosen=null;
 }

 if(!map){
  if(!mapConfig){
   mapConfig=await api('/config');
  }
  startMap(mapConfig);
 }

 if(map?.__sparrowReady){
  await map.__sparrowReady;
 }

 const box=regionBBox(region.geometry);

 if(map&&box){
  map.setMaxBounds(box);
 }

 if(map){
  map.setMinZoom(12);
  map.setMaxZoom(16);

  map.jumpTo({
   center:[longitude,latitude],
   zoom:13.5,
   pitch:34,
   bearing:0
  });

  drawNearbyRegion(region);
  installNearbyRegionGuard(region);
  renderUserLocationMarker();
 }

 say(
  'Near Me locked to '+region.name+
  '. Showing active entertainers inside this region only.'
 );

 await search();

 if(map&&center){
  if(box)map.setMaxBounds(box);

  map.jumpTo({
   center:[center.lng,center.lat],
   zoom:13.5,
   pitch:34,
   bearing:0
  });

  renderUserLocationMarker();
 }
});
async function loadChat(older=false){const rows=await api('/requests/'+chatId+'/messages'+(older&&chatBefore?'?before='+chatBefore:''));if(!older)el('booking-messages').replaceChildren();const fragment=document.createDocumentFragment();for(const r of rows){const wrap=document.createElement('div');wrap.className='wa-bubble '+(r.sender===me.user_id?'mine':'theirs');const text=document.createElement('div');text.textContent=r.text;const meta=document.createElement('div');meta.className='wa-meta';meta.textContent=(r.sender===me.user_id?'You':'Entertainer')+' · '+new Date(r.created*1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});wrap.append(text,meta);fragment.append(wrap);}if(older)el('booking-messages').prepend(fragment);else{el('booking-messages').append(fragment);el('booking-messages').scrollTop=el('booking-messages').scrollHeight;}if(rows.length)chatBefore=rows[0].created;el('older-chat').hidden=rows.length<100;}
async function openChat(r){chatId=r.id;chatBefore=null;el('chat-state').textContent=r.status==='accepted'?'Active booking · private conversation':'Booking request sent · waiting for acceptance';el('booking-chat').hidden=!['pending','accepted'].includes(r.status);await loadChat();el('chat-dialog').showModal();el('chat-text').focus();}
el('booking-chat').onsubmit=run(async()=>{await api('/requests/'+chatId+'/messages','POST',{text:el('chat-text').value});el('chat-text').value='';await loadChat();});
el('refresh-booking-chat').onclick=run(()=>loadChat());el('older-chat').onclick=run(()=>loadChat(true));el('close-chat').onclick=()=>el('chat-dialog').close();
el('next-results').onclick=run(async()=>{page+=100;await search();});
el('country').onchange=run(async()=>{
 if(nearbyRegion){
  el('country').value='';
  say('Near Me is locked to '+nearbyRegion.name+'. Exit Near Me before selecting a country.');
  return;
 }
 page=0;
 await search();
});
function regionCoordinates(geometry){
 if(!geometry)return[];
 if(geometry.type==='Polygon')return geometry.coordinates||[];
 if(geometry.type==='MultiPolygon')return (geometry.coordinates||[]).flat(1);
 return[];
}

function regionBBox(geometry){
 let minLng=Infinity,minLat=Infinity,maxLng=-Infinity,maxLat=-Infinity;
 const walk=value=>{
  if(Array.isArray(value)&&value.length===2&&Number.isFinite(value[0])&&Number.isFinite(value[1])){
   minLng=Math.min(minLng,value[0]);maxLng=Math.max(maxLng,value[0]);
   minLat=Math.min(minLat,value[1]);maxLat=Math.max(maxLat,value[1]);
   return;
  }
  if(Array.isArray(value))value.forEach(walk);
 };
 walk(geometry?.coordinates);
 if(!Number.isFinite(minLng))return null;
 return [[minLng,minLat],[maxLng,maxLat]];
}

function pointInRing(point,ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
  const hit=((yi>point[1])!==(yj>point[1]))&&
   point[0]<(xj-xi)*(point[1]-yi)/(yj-yi)+xi;
  if(hit)inside=!inside;
 }
 return inside;
}

function pointInGeometry(lng,lat,geometry){
 const point=[lng,lat];
 if(!geometry)return false;
 if(geometry.type==='Polygon'){
  const rings=geometry.coordinates||[];
  return !!rings.length&&pointInRing(point,rings[0])&&!rings.slice(1).some(r=>pointInRing(point,r));
 }
 if(geometry.type==='MultiPolygon'){
  return (geometry.coordinates||[]).some(poly=>{
   const rings=poly||[];
   return !!rings.length&&pointInRing(point,rings[0])&&!rings.slice(1).some(r=>pointInRing(point,r));
  });
 }
 return false;
}

function installNearbyRegionGuard(region){
 if(!map||!region?.geometry)return;
 if(map._sparrowRegionGuard)map.off('moveend',map._sparrowRegionGuard);
 map._sparrowRegionGuard=()=>{
  const point=map.getCenter();
  if(pointInGeometry(point.lng,point.lat,region.geometry)){
   regionLastValidCenter={lat:point.lat,lng:point.lng};
   return;
  }
  const last=regionLastValidCenter||center;
  if(last)map.jumpTo({center:[last.lng,last.lat],zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing()});
 };
 map.on('moveend',map._sparrowRegionGuard);
}

function drawNearbyRegion(region){
 if(!map||!region?.geometry)return;
 const feature={
  type:'Feature',
  properties:{id:region.id,name:region.name},
  geometry:region.geometry
 };
 const source=map.getSource('sparrow-nearby-region');
 if(source)source.setData(feature);
 else{
  map.addSource('sparrow-nearby-region',{type:'geojson',data:feature});
  map.addLayer({
   id:'sparrow-nearby-region-fill',
   type:'fill',
   source:'sparrow-nearby-region',
   paint:{'fill-color':'#ffffff','fill-opacity':0.035}
  });
  map.addLayer({
   id:'sparrow-nearby-region-outline',
   type:'line',
   source:'sparrow-nearby-region',
   paint:{'line-color':'#d88020','line-width':3,'line-opacity':0.95}
  });
 }
}





(async()=>{try{const r=await fetch('/api/me');if(!r.ok)throw Error('Sign in through Sparrow Ecosystem first.');me=await r.json();const config=await api('/config');me.user_id=config.user_id;countries=await api('/countries');for(const id of ['country','listing-country','destination-country'])for(const c of countries){const o=node('option',c.name);o.value=c.code;el(id).append(o);}el('listing-country').insertBefore(node('option','Choose service country'),el('listing-country').firstChild);el('listing-country').firstChild.value='';el('listing-country').value='';mapConfig=config;el("dashboard-refresh").onclick=run(()=>dashboard());await Promise.all([mine(),activity(),dashboard()]);if(new URLSearchParams(location.search).get('payment')==='verified')say('Flutterwave verified the booking payment.');const requested=new URLSearchParams(location.search).get('listing');if(requested&&/^[a-f0-9]{32}$/.test(requested)){const r=await api('/listings/'+requested);if(r.owner!==me.user_id)openRequest(r);}}catch(e){say(e.message);if(el('map-state'))el('map-state').textContent='Open Sparrow Ecosystem to sign in and complete your profile.';}})();




/* SPARROW REFERENCE BOOKING SHEET - DRAGGABLE JS */
(function installSparrowReferenceSlidingSheet(){
  function boot(){
    const sheet=document.querySelector('body>.sheet');
    if(!sheet)return;
    const panel=document.getElementById('sparrow-reference-panel');
    if(!panel)return;

    sheet.classList.add('sparrow-reference-sliding-sheet');
    if(sheet.dataset.sparrowSlidingInstalled==='1')return;
    sheet.dataset.sparrowSlidingInstalled='1';

    const handle=panel.querySelector('.sparrow-reference-handle');
    if(!handle)return;

    let startY=0;
    let startOffset=0;
    let currentOffset=0;
    let dragging=false;
    let pointerId=null;
    let lastY=0;
    let lastTime=0;
    let velocity=0;

    const collapsedOffset=()=>Math.max(0,sheet.offsetHeight-154);
    const midOffset=()=>Math.max(0,sheet.offsetHeight*0.40);
    const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));

    const readOffset=()=>{
      const t=getComputedStyle(sheet).transform;
      if(!t||t==='none')return collapsedOffset();
      const m=t.match(/matrix3d\(([^)]+)\)/);
      if(m){
        const parts=m[1].split(',');
        return Number(parts[13])||0;
      }
      const m2=t.match(/matrix\(([^)]+)\)/);
      if(m2){
        const parts=m2[1].split(',');
        return Number(parts[5])||0;
      }
      return collapsedOffset();
    };

    const apply=(offset,animate=true)=>{
      currentOffset=clamp(offset,0,collapsedOffset());
      sheet.classList.toggle('sparrow-sheet-dragging',!animate);
      sheet.style.transform=`translate3d(0,${currentOffset}px,0)`;
      sheet.setAttribute('data-sheet-position',
        currentOffset<=4?'expanded':
        currentOffset>=collapsedOffset()-4?'collapsed':'mid'
      );
    };

    const snap=(direction=0)=>{
      const points=[0,midOffset(),collapsedOffset()];
      let target=points.reduce((best,p)=>
        Math.abs(p-currentOffset)<Math.abs(best-currentOffset)?p:best,
        points[0]
      );
      if(Math.abs(velocity)>0.35){
        if(velocity<0)target=points.find(p=>p<currentOffset-4)??0;
        else target=[...points].reverse().find(p=>p>currentOffset+4)??collapsedOffset();
      }
      if(direction<0)target=points.find(p=>p<currentOffset-4)??0;
      if(direction>0)target=[...points].reverse().find(p=>p>currentOffset+4)??collapsedOffset();
      apply(target,true);
    };

    // Start collapsed so the map remains the primary surface, while the
    // handle/headline remain visibly available for interaction.
    requestAnimationFrame(()=>{
      currentOffset=collapsedOffset();
      sheet.style.transform=`translate3d(0,${currentOffset}px,0)`;
      sheet.setAttribute('data-sheet-position','collapsed');
    });

    const onDown=e=>{
      if(e.target?.closest?.('button,a,input,textarea,select'))return;
      if(e.button!==undefined&&e.button!==0)return;
      e.preventDefault();
      dragging=true;
      pointerId=e.pointerId;
      startY=e.clientY;
      currentOffset=readOffset();
      startOffset=currentOffset;
      lastY=e.clientY;
      lastTime=performance.now();
      velocity=0;
      sheet.classList.add('sparrow-sheet-dragging');
      handle.setPointerCapture?.(pointerId);
    };

    const onMove=e=>{
      if(!dragging||e.pointerId!==pointerId)return;
      e.preventDefault();
      const now=performance.now();
      const dt=Math.max(1,now-lastTime);
      const dy=e.clientY-startY;
      currentOffset=clamp(startOffset+dy,0,collapsedOffset());
      velocity=(e.clientY-lastY)/dt;
      lastY=e.clientY;
      lastTime=now;
      sheet.style.transform=`translate3d(0,${currentOffset}px,0)`;
    };

    const onUp=e=>{
      if(!dragging||e.pointerId!==pointerId)return;
      dragging=false;
      pointerId=null;
      sheet.classList.remove('sparrow-sheet-dragging');
      snap();
    };

    handle.addEventListener('pointerdown',onDown,{passive:false});
    handle.addEventListener('pointermove',onMove,{passive:false});
    handle.addEventListener('pointerup',onUp,{passive:false});
    handle.addEventListener('pointercancel',onUp,{passive:false});

    // Clicking the handle cycles through collapsed -> mid -> expanded.
    handle.addEventListener('click',()=>{
      if(Math.abs(velocity)>0.15)return;
      const c=collapsedOffset();
      const m=midOffset();
      if(currentOffset>=c-8)apply(m,true);
      else if(currentOffset>=m-8)apply(0,true);
      else apply(c,true);
    });

    // Allow dragging from the sheet header as well, without interfering with
    // the cards or the scrollable result list.
    const heading=panel.querySelector('.sparrow-reference-heading');
    if(heading){
      heading.style.touchAction='none';
      heading.addEventListener('pointerdown',e=>{onDown(e);if(dragging)heading.setPointerCapture?.(e.pointerId)},{passive:false});
      heading.addEventListener('pointermove',onMove,{passive:false});
      heading.addEventListener('pointerup',onUp,{passive:false});
      heading.addEventListener('pointercancel',onUp,{passive:false});
    }

    window.addEventListener('resize',()=>{
      const c=collapsedOffset();
      currentOffset=clamp(currentOffset,0,c);
      sheet.style.transform=`translate3d(0,${currentOffset}px,0)`;
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
/* END SPARROW REFERENCE BOOKING SHEET - DRAGGABLE JS */
/* SPARROW STRICT IMAGE MAP VISUAL JS */
function sparrowStrictRole(value){
 const s=String(value||'').toLowerCase();
 if(s.includes('dj')||s.includes('disc jockey'))return 'DJ';
 if(s.includes('singer')||s.includes('vocal'))return 'Singer';
 if(s.includes('mc')||s.includes('master of ceremonies'))return 'MC';
 if(s.includes('dancer')||s.includes('dance'))return 'Dancer';
 return 'Other';
}

function sparrowStrictIcon(role){
 const icons={
  DJ:'<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 31V17h7v14M29 31V17h7v14M19 20h10M19 28h10M15 17V12M33 17V12M10 35h28"/></svg>',
  Singer:'<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 8v20M17 16v12a7 7 0 0 0 14 0V16M12 27a12 12 0 0 0 24 0M24 39v-7M18 39h12"/></svg>',
  MC:'<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M15 34V14M33 34V14M15 15c7 5 11 5 18 0M15 24c7 5 11 5 18 0M15 33c7 5 11 5 18 0"/></svg>',
  Dancer:'<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="25" cy="9" r="4"/><path d="M23 14l-5 9 7 5 7-8M20 24l-8 7M26 28l-2 11M31 20l7-4M24 39l-8 1M29 39l7 1"/></svg>',
  Other:'<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="14"/><path d="M24 17v14M17 24h14"/></svg>'
 };
 return icons[role]||icons.Other;
}

function sparrowStrictInitials(r){
 const name=String(r?.provider_name||r?.title||'Sparrow').trim();
 return name.split(/\s+/).slice(0,2).map(v=>v.charAt(0).toUpperCase()).join('')||'S';
}

function createSparrowReferenceMarker(r){
 const role=sparrowStrictRole(r?.category);
 const marker=document.createElement('button');
 marker.type='button';
 marker.className='sparrow-strict-marker';
 marker.dataset.role=role;
 marker.setAttribute('aria-label',String(r?.title||r?.provider_name||'Entertainer'));

 const roleBubble=document.createElement('span');
 roleBubble.className='sparrow-strict-role';
 roleBubble.innerHTML=sparrowStrictIcon(role);

 const photo=document.createElement('span');
 photo.className='sparrow-strict-photo';

 const src=r?.profile_photo||r?.profile_image||r?.avatar_url||r?.photo_url||r?.image_url;
 if(src){
  const img=document.createElement('img');
  img.src=String(src);
  img.alt='';
  img.loading='lazy';
  photo.append(img);
 }else{
  photo.textContent=sparrowStrictInitials(r);
 }

 marker.append(roleBubble,photo);
 return marker;
}

function renderUserLocationMarker(){
 if(!map||!center)return;
 if(window.__sparrowUserMarker){
  try{window.__sparrowUserMarker.remove();}catch{}
  window.__sparrowUserMarker=null;
 }

 const el=document.createElement('div');
 el.className='sparrow-reference-current-location';
 el.setAttribute('aria-label','You - Your location');
 el.innerHTML='<span class="sparrow-location-ring"></span><span class="sparrow-location-core"></span><span class="sparrow-location-label">You '+String.fromCodePoint(0x2022)+' Your location</span>';

 window.__sparrowUserMarker=new maplibregl.Marker({
  element:el,
  anchor:'center'
 }).setLngLat([center.lng,center.lat]).addTo(map);
}

/* Keep the real GPS center, but make the camera match the supplied reference composition. */
function sparrowStrictCamera(){
 if(!map||!center)return;
 const lat=Number(center.lat);
 const lng=Number(center.lng);
 if(!Number.isFinite(lat)||!Number.isFinite(lng))return;

 /* Real device GPS is the only camera source. No geographic fallback. */
 map.easeTo({
  center:[lng,lat],
  zoom:14.2,
  pitch:48,
  bearing:0,
  duration:420,
  essential:true
 });

 const host=document.getElementById('map');
 if(host)host.classList.add('sparrow-local-gps-ready');

 /* Keep manual navigation local to the current GPS area. */
 try{
  const latDelta=0.055;
  const lngDelta=0.055/Math.max(0.15,Math.cos(lat*Math.PI/180));
  map.setMaxBounds([
   [lng-lngDelta,lat-latDelta],
   [lng+lngDelta,lat+latDelta]
  ]);
 }catch(_e){}
}

/* Re-apply the reference treatment whenever the real listing renderer refreshes. */
(function installSparrowStrictImageMapVisual(){
 function boot(){
  if(window.__sparrowStrictImageMapVisualInstalled==='1')return;
  window.__sparrowStrictImageMapVisualInstalled='1';

  const mapHost=document.getElementById('map');
  if(mapHost&&!mapHost.querySelector('.sparrow-reference-map-vignette')){
   const vignette=document.createElement('div');
   vignette.className='sparrow-reference-map-vignette';
   mapHost.append(vignette);
  }

  const observer=new MutationObserver(()=>{
   if(center&&map)renderUserLocationMarker();
  });
  if(mapHost)observer.observe(mapHost,{childList:true,subtree:true});

  window.addEventListener('resize',()=>{if(center&&map)renderUserLocationMarker();});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
})();

/* SPARROW STRICT LOCAL GPS 3D FLOW JS */
(function installSparrowStrictLocalGpsFlow(){
 function boot(){
  if(window.__sparrowStrictLocalGpsFlowInstalled==='1')return;
  window.__sparrowStrictLocalGpsFlowInstalled='1';

  const mapHost=document.getElementById('map');
  const locate=el('locate');
  if(!mapHost||!locate)return;

  let gate=mapHost.querySelector('.sparrow-location-gate');
  if(!gate){
   gate=document.createElement('div');
   gate.className='sparrow-location-gate';
   gate.innerHTML='<div class="sparrow-location-gate-card">'+
    '<h2 class="sparrow-location-gate-title">Allow Location</h2>'+
    '<p class="sparrow-location-gate-text">Sparrow uses your real device location to show this map around where you are. It never substitutes a geographic default.</p>'+
    '<button type="button" class="sparrow-location-gate-button">Use my current location</button>'+
    '<p class="sparrow-location-gate-status" aria-live="polite"></p>'+
    '</div>';
   mapHost.append(gate);
  }

  const button=gate.querySelector('.sparrow-location-gate-button');
  const status=gate.querySelector('.sparrow-location-gate-status');

  const hasRealGps=()=>{
   const lat=Number(center?.lat);
   const lng=Number(center?.lng);
   return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180;
  };

  const sync=()=>{
   if(!hasRealGps()){
    gate.hidden=false;
    return;
   }
   gate.hidden=true;
   if(!map)return;

   mapHost.classList.add('sparrow-local-gps-ready');

   const gpsKey=Number(center.lat).toFixed(6)+','+Number(center.lng).toFixed(6);
   if(window.__sparrowStrictLocalGpsCameraKey!==gpsKey){
    window.__sparrowStrictLocalGpsCameraKey=gpsKey;
    requestAnimationFrame(()=>sparrowStrictCamera());
   }
   renderUserLocationMarker();
  };

  button?.addEventListener('click',()=>{
   if(!navigator.geolocation){
    status.textContent='This browser does not provide device location.';
    return;
   }

   button.disabled=true;
   status.textContent='Requesting your real device location...';

   try{locate.click();}catch(_e){}

   window.setTimeout(()=>{
    if(hasRealGps()){
     sync();
    }else{
     button.disabled=false;
     status.textContent='Location permission is required. Allow precise location in your browser and try again.';
    }
   },900);
  });

  /*
   * The existing GPS flow remains authoritative.
   * This hook is passive and only synchronizes the visual gate when
   * another part of Sparrow explicitly invokes it.
   */
  const previousSync=window.__sparrowStrictLocalGpsSync;
  window.__sparrowStrictLocalGpsSync=()=>{
   try{previousSync?.()}catch(_e){}
   sync();
  };

  sync();
 }

 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
})();


/* SPARROW REAL BIRD INTERACTION */
(function installSparrowRealBirdInteraction(){
  function boot(){
    const bird=document.querySelector('[data-sparrow-bird]');
    if(!bird)return;
    if(bird.dataset.interactiveInstalled==="1")return;

    bird.dataset.interactiveInstalled="1";

    const activate=()=>{
      bird.classList.remove('sparrow-bird-active');
      void bird.offsetWidth;
      bird.classList.add('sparrow-bird-active');

      window.setTimeout(()=>{
        bird.classList.remove('sparrow-bird-active');
      },600);
    };

    bird.addEventListener('pointerdown',activate,{passive:true});
    bird.addEventListener('focus',activate);

    bird.addEventListener('animationend',()=>{
      bird.classList.remove('sparrow-bird-active');
    });
  }

  if(document.readyState==="loading"){
    document.addEventListener('DOMContentLoaded',boot,{once:true});
  }else{
    boot();
  }
})();
