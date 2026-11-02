'use strict';
const el=id=>document.getElementById(id);let map,config,selected='',journey=null,watch=null,lastSent=0,tilted=true,picking=false,providerPin=null,destinationPin=null,talentPins=[],polling=false,following=false,lastFix=null,trail=[],tracking=false,trackerBearing=null,journeySocket=null,journeySocketBooking='',journeyReconnect=null,journeyPing=null,journeyRetry=0,roadRouteGeometry=null,roadRouteKey="",roadRouteRetryAt=0,roadRouteMessage="";let nearbyRegion=null,nearbyLastValidCenter=null;const NEAR_ZOOM=13.5,NEAR_PITCH=34,NEAR_MAX_ACCURACY=100;
const say=t=>el('state').textContent=t;
async function api(path,method='GET',body){const r=await fetch('/api/ecosystem/booking'+path,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const v=await r.json();if(!r.ok)throw Error(typeof v.detail==='string'?v.detail:'Check your information or device accuracy and try again.');return v;}
function closeJourneySocket(){clearTimeout(journeyReconnect);clearInterval(journeyPing);journeyReconnect=null;journeyPing=null;journeySocketBooking='';if(journeySocket){journeySocket.onclose=null;journeySocket.close();journeySocket=null;}}
function connectJourneySocket(){if(!selected||document.visibilityState==='hidden')return;if(journeySocket&&journeySocketBooking===selected&&journeySocket.readyState<2)return;closeJourneySocket();journeySocketBooking=selected;const protocol=location.protocol==='https:'?'wss:':'ws:';const socket=new WebSocket(protocol+'//'+location.host+'/api/ecosystem/booking/requests/'+encodeURIComponent(selected)+'/journey/live');journeySocket=socket;socket.onopen=()=>{journeyRetry=0;journeyPing=setInterval(()=>{if(socket.readyState===WebSocket.OPEN)socket.send('{"type":"ping"}');},20000);update();};socket.onmessage=event=>{try{const data=JSON.parse(event.data);if(data.type==='booking.journey.updated'||data.type==='heartbeat'||data.type==='reconnecting')update();}catch{}};socket.onclose=()=>{if(journeySocket===socket){journeySocket=null;journeySocketBooking='';clearInterval(journeyPing);journeyPing=null;if(document.visibilityState!=='hidden'){const delay=Math.min(30000,1000*2**Math.min(journeyRetry++,5))+Math.floor(Math.random()*500);journeyReconnect=setTimeout(connectJourneySocket,delay);}}};socket.onerror=()=>socket.close();}
function run(fn){return async()=>{try{await fn();}catch(e){say(e.message);if(!el('location-gate').hidden)el('location-message').textContent=e.message;}};}
function trackerMarker(p,label){const b=document.createElement('button');b.className='tracker-marker';b.type='button';b.setAttribute('aria-label',label+' live tracker');b.innerHTML='<span class="tracker-ring"></span><span class="tracker-pulse"></span><span class="tracker-core"></span><span class="tracker-stem"></span><span class="tracker-direction"></span>';if(trackerBearing!==null)b.style.transform='rotate('+trackerBearing+'deg)';return new maplibregl.Marker({element:b,anchor:'bottom'}).setLngLat([p.longitude,p.latitude]).addTo(map);}
function bearing(a,b){const r=x=>x*Math.PI/180,toDeg=x=>(x*180/Math.PI+360)%360;const y=Math.sin(r(b.longitude-a.longitude))*Math.cos(r(b.latitude));const x=Math.cos(r(a.latitude))*Math.sin(r(b.latitude))-Math.sin(r(a.latitude))*Math.cos(r(b.latitude))*Math.cos(r(b.longitude-a.longitude));return toDeg(Math.atan2(y,x));}
function pointMarker(p,label,cls=''){const b=document.createElement('button');b.className='pin '+cls;b.textContent=label;b.setAttribute('aria-label',label);return new maplibregl.Marker({element:b}).setLngLat([p.longitude,p.latitude]).addTo(map);}
function clearRoadRoute(drop=false){if(drop){roadRouteGeometry=null;roadRouteKey="";}if(map?.getSource?.("osrm-route"))map.getSource("osrm-route").setData({type:"FeatureCollection",features:[]});}
function drawRoadRoute(){if(!roadRouteGeometry||!map?.isStyleLoaded?.())return;const data={type:"FeatureCollection",features:[{type:"Feature",properties:{source:"OSRM"},geometry:roadRouteGeometry}]};if(!map.getSource("osrm-route")){map.addSource("osrm-route",{type:"geojson",data});map.addLayer({id:"osrm-route-line",type:"line",source:"osrm-route",paint:{"line-color":"#ff5a1f","line-width":6,"line-opacity":0.9},layout:{"line-cap":"round","line-join":"round"}});}else map.getSource("osrm-route").setData(data);}
function clearJourney(){el('identifier').hidden=true;el('follow-entertainer').hidden=true;el('fit-journey').hidden=true;providerPin?.remove();destinationPin?.remove();providerPin=destinationPin=null;el('directions').hidden=true;el('distance').textContent='';clearRoadRoute(false);if(!journey?.location){tracking=false;following=false;el('track-entertainer').textContent='Track My Entertainer · waiting for live location';el('track-entertainer').classList.remove('tracking');el('tracker-state').textContent='3D tracker idle · waiting for a fresh entertainer location.';}}
async function refreshRoadRoute(p,d){if(!d||!p){clearRoadRoute(true);el('distance').textContent='Road route unavailable until both a fresh provider GPS position and destination are available.';return;}const direct=kmBetween(p,d);if(!config?.road_routing_enabled){clearRoadRoute(true);el('distance').textContent=direct.toFixed(2)+' km straight-line separation. Road distance and ETA are unavailable because no OSRM service is configured.';return;}const key=[selected,p.captured,d.latitude,d.longitude].join(':');if(key===roadRouteKey){if(roadRouteGeometry){drawRoadRoute();el('distance').textContent=roadRouteMessage;return;}if(Date.now()<roadRouteRetryAt){el('distance').textContent=roadRouteMessage;return;}}roadRouteKey=key;const routeBooking=selected;try{const route=await api('/requests/'+encodeURIComponent(routeBooking)+'/journey/route');if(selected!==routeBooking)return;roadRouteGeometry=route.geometry;roadRouteRetryAt=0;drawRoadRoute();const eta=new Date(Date.now()+route.duration_s*1000);roadRouteMessage=(route.distance_m/1000).toFixed(1)+' km by road · estimated '+Math.max(1,Math.round(route.duration_s/60))+' min · ETA '+eta.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})+' · OSRM estimate recalculated from fresh GPS.';el('distance').textContent=roadRouteMessage;el('directions').hidden=true;}catch(e){roadRouteGeometry=null;roadRouteRetryAt=Date.now()+30000;roadRouteMessage='Road route and ETA unavailable: '+e.message;clearRoadRoute();el('distance').textContent=roadRouteMessage;}}
const journeyStageLabels={accepted:'Accepted',en_route:'En Route',arrived:'Arrived · provider GPS reported',service_started:'Service Started',completed:'Completed'};
async function update(){if(!selected||polling)return;polling=true;try{journey=await api('/requests/'+selected+'/journey');clearJourney();el('address').textContent='Booking address: '+journey.booking_address;const stage=journey.journey_stage||'accepted';el('journey-stage').textContent='Journey: '+(journeyStageLabels[stage]||'Accepted');const next={accepted:['en_route','Mark En Route'],en_route:['arrived','Mark Arrived'],arrived:['service_started','Mark Service Started']}[stage];const stageAction=el('journey-stage-action');stageAction.hidden=!(journey.provider&&journey.location&&journey.consented&&next);if(next)stageAction.textContent=next[1];const completion=el('completion-action');completion.hidden=stage!=='service_started'||journey.booking_status==='completed'||journey.completion_confirmed_by_me||!journey.booking_end||journey.booking_end*1000>Date.now();el('destination').hidden=journey.provider;el('start').hidden=!journey.provider;el('stop').hidden=!journey.provider;if(journey.destination)destinationPin=pointMarker(journey.destination,'Destination','customer');if(journey.location){const p=journey.location;movement(p,journey.destination);providerPin=trackerMarker(p,journey.entertainer?.name||'Booked entertainer');if(journey.entertainer?.photo){const marker=providerPin.getElement();const img=document.createElement('img');img.src=journey.entertainer.photo;img.alt='';img.className='tracker-photo';marker.querySelector('.tracker-core')?.append(img);}el('identifier').replaceChildren();const name=document.createElement('strong');name.textContent=journey.entertainer?.name||'Booked entertainer';const reference=document.createElement('p');reference.textContent='Booking '+(journey.entertainer?.booking_reference||'')+' · Device report · ±'+Math.round(p.accuracy)+' m';el('identifier').append(name,reference);el('identifier').hidden=false;el('follow-entertainer').hidden=false;el('fit-journey').hidden=!journey.destination;el('track-entertainer').disabled=journey.provider;el('track-entertainer').setAttribute('aria-disabled',String(journey.provider));el('track-entertainer').textContent=journey.provider?'Customer controls tracking':(tracking?'Stop Tracking My Entertainer':'Track My Entertainer');el('track-entertainer').classList.toggle('tracking',tracking);el('tracker-state').textContent=(tracking?'LIVE 3D TRACKING · ':'3D tracker ready · ')+'fresh device position · ±'+Math.round(p.accuracy)+' m · last update '+new Date(journey.updated*1000).toLocaleTimeString();if(following||tracking){map.easeTo({center:[p.longitude,p.latitude],zoom:17,pitch:55,bearing:trackerBearing??map.getBearing(),duration:400});tilted=true;SparrowMap3D.toggle(map,true);el('view').textContent='Switch to 2D';}say('Fresh entertainer location · updated '+new Date(journey.updated*1000).toLocaleTimeString()+' · accuracy ±'+Math.round(p.accuracy)+' m');if(trackerBearing!==null&&providerPin?.getElement())providerPin.getElement().querySelector('.tracker-direction')?.style.setProperty('transform','rotate('+trackerBearing+'deg)');if(journey.destination){await refreshRoadRoute(p,journey.destination);el('directions').href='https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(p.latitude+','+p.longitude)+'&destination='+encodeURIComponent(journey.destination.latitude+','+journey.destination.longitude)+'&travelmode=driving';el('directions').hidden=false;}}else{resetMovement();clearRoadRoute(true);el('track-entertainer').disabled=!selected||journey.provider;el('track-entertainer').setAttribute('aria-disabled',String(!selected||journey.provider));el('track-entertainer').textContent=journey.provider?'Customer controls tracking':(selected?'Track My Entertainer · waiting':'Track My Entertainer · choose booking');el('track-entertainer').classList.remove('tracking');el('tracker-state').textContent=journey.destination?(journey.consented?'3D tracker waiting · entertainer consented; waiting for the first fresh location.':'3D tracker waiting · entertainer has not consented to sharing.'):'3D tracker waiting · customer must choose the destination first.';say(journey.destination?(journey.consented?'Entertainer consented to private sharing; waiting for a fresh location.':'Entertainer has not consented to private sharing.'):'Customer: choose the destination on the map first.');}}catch(e){clearJourney();resetMovement();say(e.message);}finally{polling=false;}}
el('journey-stage-action').onclick=run(async()=>{if(!selected||!journey)throw Error('Choose an accepted booking first.');const stage={accepted:'en_route',en_route:'arrived',arrived:'service_started'}[journey.journey_stage||'accepted'];if(!stage)throw Error('There are no further provider journey stages.');const result=await api('/requests/'+encodeURIComponent(selected)+'/journey/stage','PUT',{stage});await update();say('Journey stage updated: '+(journeyStageLabels[result.stage]||result.stage)+'.');});
el('completion-action').onclick=run(async()=>{if(!selected||journey?.journey_stage!=='service_started')throw Error('Service must be started before completion can be confirmed.');const result=await api('/requests/'+encodeURIComponent(selected)+'/completion','POST');await update();say(result.confirmed_by_both?'Both parties confirmed service completion.':'Your completion is recorded; waiting for the other party.');});async function stop(){if(watch!==null)navigator.geolocation.clearWatch(watch);watch=null;if(selected&&journey?.provider)await api('/requests/'+selected+'/journey/consent','DELETE');await update();}
el('start').onclick=run(async()=>{if(!selected||!journey?.provider)throw Error('Choose your accepted booking.');if(!journey.destination)throw Error('Ask your customer to choose a destination first.');if(!navigator.geolocation)throw Error('This device cannot share location.');if(watch!==null)return;say('Requesting private journey-sharing consent…');await api('/requests/'+selected+'/journey/consent','PUT');journey=await api('/requests/'+selected+'/journey');say('Sharing your device location privately with this booking customer. Keep this page open.');watch=navigator.geolocation.watchPosition(async p=>{if(Date.now()-lastSent<10000)return;lastSent=Date.now();if(p.coords.accuracy>200){say('Device location too approximate; waiting for a better fix. Old updates expire automatically.');return;}try{await api('/requests/'+selected+'/journey/location','PUT',{latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,captured:p.timestamp/1000});await update();}catch(e){say(e.message);} },()=>say('Location unavailable. Previously shared updates expire within two minutes.'),{enableHighAccuracy:true,maximumAge:0,timeout:15000});});
el('stop').onclick=run(stop);el('destination').onclick=()=>{picking=true;say('Tap your booking destination on the map. This exact pin will be shared only with your booked entertainer.');};
async function discoverActiveEntertainers(){
 if(!map)throw Error('Wait for Sparrow to finish opening.');
 if(!navigator.geolocation)throw Error('Precise device location is unavailable. Enable location permission for Sparrow and try again.');

 say('Getting your current device location…');

 const position=await new Promise((resolve,reject)=>{
  navigator.geolocation.getCurrentPosition(
   resolve,
   error=>{
    if(error?.code===1)reject(Error('Sparrow does not have permission to use your device location. Enable location permission and try again.'));
    else if(error?.code===2)reject(Error('Your device location is currently unavailable. Move to an area with GPS/network location access and try again.'));
    else reject(Error('Sparrow could not obtain your current device location. Please try again.'));
   },
   {timeout:15000,maximumAge:0,enableHighAccuracy:true}
  );
 });

 const latitude=Number(position.coords.latitude);
 const longitude=Number(position.coords.longitude);
 const accuracy=Number(position.coords.accuracy);

 if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||!Number.isFinite(accuracy)){
  throw Error('Sparrow received an invalid device location. Please try again.');
 }

 if(accuracy>NEAR_MAX_ACCURACY){
  throw Error('Your current device location is too approximate. Sparrow will not guess your location. Move to an area with a better GPS/network fix and try again.');
 }

 nearbyLastValidCenter={latitude,longitude};

 const region=await api('/nearby-region?'+new URLSearchParams({
  latitude:String(latitude),
  longitude:String(longitude)
 }));

 if(!region||!region.id){
  throw Error('Sparrow could not resolve the detected local region for your device location.');
 }

 nearbyRegion=region;

 map.jumpTo({
  center:[longitude,latitude],
  zoom:NEAR_ZOOM,
  pitch:NEAR_PITCH
 });

 el('map').classList.remove('location-pending');
 el('location-gate').hidden=true;
 map.resize?.();

 say('Searching for active entertainers near your current location…');

 const rows=await api('/listings?'+new URLSearchParams({
  scope:'nearby',
  kind:'professional',
  active_only:'true',
  radius_km:'100',
  latitude:String(latitude),
  longitude:String(longitude),
  region_id:String(region.id)
 }));

 talentPins.forEach(m=>m.remove());
 talentPins=[];
 el('active-entertainers').replaceChildren();
 el('booking-discovery').hidden=false;
 el('discovery-count').textContent=rows.length+' active';

 if(!rows.length){
  el('active-entertainers').append(
   Object.assign(document.createElement('p'),{
    textContent:'No active entertainers are currently checked in within the detected local region.'
   })
  );
  say('No active entertainers found nearby.');
  return;
 }

 for(const r of rows){
  if(r.latitude==null||r.longitude==null)continue;

  const card=document.createElement('article');
  card.className='active-entertainer';

  const top=document.createElement('div');
  top.className='active-entertainer-top';

  if(r.photos?.avatar){
   const img=document.createElement('img');
   img.className='active-avatar';
   img.src=r.photos.avatar;
   img.alt='';
   top.append(img);
  }else{
   const avatar=document.createElement('div');
   avatar.className='active-avatar';
   avatar.textContent=(r.provider_name||'S').slice(0,1).toUpperCase();
   avatar.style.display='grid';
   avatar.style.placeItems='center';
   top.append(avatar);
  }

  const info=document.createElement('div');
  const h=document.createElement('h3');
  h.textContent=r.provider_name||r.title;
  info.append(h);

  const meta=document.createElement('p');
  meta.textContent=r.category+' · '+r.location;
  info.append(meta);
  top.append(info);
  card.append(top);

  const dist=document.createElement('p');
  dist.className='active-distance';
  dist.textContent=(r.distance_km??'—')+' km away';
  card.append(dist);

  const actions=document.createElement('div');
  actions.className='active-actions';

  const book=document.createElement('a');
  book.className='book-now';
  book.textContent='Book / Message';
  book.href='/ecosystem/book?listing='+encodeURIComponent(r.id);
  actions.append(book);

  const focus=document.createElement('button');
  focus.type='button';
  focus.textContent='View on map';
  focus.onclick=()=>map.easeTo({
   center:[r.longitude,r.latitude],
   zoom:16,
   pitch:NEAR_PITCH
  });
  actions.append(focus);

  card.append(actions);
  el('active-entertainers').append(card);

  const markerEl=document.createElement('button');
  markerEl.className='booking-discovery-marker';
  markerEl.type='button';
  markerEl.textContent=(r.provider_name||'S').slice(0,1).toUpperCase();
  markerEl.title=(r.provider_name||r.title)+' · '+r.distance_km+' km';

  const marker=new maplibregl.Marker({element:markerEl})
   .setLngLat([r.longitude,r.latitude])
   .addTo(map);

  markerEl.onclick=()=>{
   map.easeTo({
    center:[r.longitude,r.latitude],
    zoom:16,
    pitch:NEAR_PITCH
   });
   card.scrollIntoView({behavior:'smooth',block:'center'});
  };

  talentPins.push(marker);
 }

 say(rows.length+' active entertainers found nearby in the detected local region. Distances are straight-line distances from your device location.');
}el('booking-chooser').onclick=run(discoverActiveEntertainers);
el('close-discovery').onclick=()=>{el('booking-discovery').hidden=true;};
el('booking').onchange=run(async()=>{await stop();closeJourneySocket();selected=el('booking').value;journey=null;tracking=false;following=false;resetMovement();clearJourney();el('destination').hidden=el('start').hidden=el('stop').hidden=true;el('track-entertainer').disabled=!selected||journey.provider;el('track-entertainer').setAttribute('aria-disabled',String(!selected||journey.provider));el('track-entertainer').textContent=journey.provider?'Customer controls tracking':(selected?'Track My Entertainer · waiting':'Track My Entertainer · choose booking');connectJourneySocket();await update();});

el('near').onclick=run(async()=>{
 if(!map)throw Error('Wait for Sparrow to finish opening.');
 if(!navigator.geolocation)throw Error('Precise device location is unavailable. Enable location permission for Sparrow and try again.');

 el('location-message').textContent='Finding your device location…';

 const p=await new Promise((resolve,reject)=>{
  navigator.geolocation.getCurrentPosition(
   resolve,
   error=>{
    if(error?.code===1)reject(Error('Sparrow does not have permission to use your device location. Enable location permission and try again.'));
    else if(error?.code===2)reject(Error('Your device location is currently unavailable. Move to an area with GPS/network location access and try again.'));
    else reject(Error('Sparrow could not obtain your current device location. Please try again.'));
   },
   {timeout:15000,maximumAge:0,enableHighAccuracy:true}
  );
 });

 const latitude=Number(p.coords.latitude);
 const longitude=Number(p.coords.longitude);
 const accuracy=Number(p.coords.accuracy);

 if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||!Number.isFinite(accuracy)){
  throw Error('Sparrow received an invalid device location. Please try again.');
 }

 if(accuracy>NEAR_MAX_ACCURACY){
  throw Error('Your current device location is too approximate. Sparrow will not guess your location. Move to an area with a better GPS/network fix and try again.');
 }

 const region=await api('/nearby-region?'+new URLSearchParams({
  latitude:String(latitude),
  longitude:String(longitude)
 }));

 if(!region||!region.id){
  throw Error('Sparrow could not resolve the detected local region for your device location.');
 }

 nearbyRegion=region;
 nearbyLastValidCenter={latitude,longitude};

 map.jumpTo({
  center:[longitude,latitude],
  zoom:NEAR_ZOOM,
  pitch:NEAR_PITCH
 });

 el('map').classList.remove('location-pending');
 el('location-gate').hidden=true;
 map.resize?.();

 const rows=await api('/listings?'+new URLSearchParams({
  scope:'nearby',
  kind:'professional',
  radius_km:'25',
  latitude:String(latitude),
  longitude:String(longitude),
  region_id:String(region.id)
 }));

 talentPins.forEach(m=>m.remove());
 talentPins=[];
 el('talent').replaceChildren();

 for(const r of rows){
  const card=document.createElement('div');
  card.className='talent';

  const a=document.createElement('a');
  a.textContent=r.provider_name+' · '+r.category+' · '+r.distance_km+' km straight line';
  a.href='/ecosystem/book?listing='+encodeURIComponent(r.id);
  card.append(a);

  const note=document.createElement('p');
  note.textContent='Published service pin · not live travel';
  card.append(note);

  el('talent').append(card);

  const marker=pointMarker(r,r.provider_name?.slice(0,1)||'S');
  talentPins.push(marker);

  marker.getElement().onclick=()=>{
   map.easeTo({
    center:[r.longitude,r.latitude],
    zoom:16,
    pitch:NEAR_PITCH
   });
   card.scrollIntoView({block:'nearest'});
  };
 }

 say(rows.length+' published services found around your current device location in the detected local region.');
});
(async()=>{try{config=await api('/config');map=new maplibregl.Map({container:'map',style:config.vector_style,center:[0,0],zoom:0,minZoom:0,pitch:0,maxPitch:60,prefetchZoomDelta:0,antialias:true});map.addControl(new maplibregl.NavigationControl(),'bottom-left');map.on('style.load',()=>{try{SparrowMap3D.attach(map,config,el('geometry-state'),tilted);drawRoadRoute();}catch{el('geometry-state').textContent='3D data unavailable. Check the provider connection.';}});map.on('error',()=>{el('geometry-state').textContent='Some geographic tiles could not load. Check your network.';});map.on('click',async e=>{if(!picking||!selected||journey?.provider)return;try{await api('/requests/'+selected+'/journey/destination','PUT',{latitude:e.lngLat.lat,longitude:e.lngLat.lng});picking=false;await update();}catch(x){say(x.message);}});const bookings=await api('/requests');for(const r of bookings.filter(r=>r.status==='accepted'&&r.mode!=='remote')){const o=document.createElement('option');o.value=r.id;o.textContent=r.title+' · '+r.location;el('booking').append(o);}const id=new URLSearchParams(location.search).get('booking');if([...el('booking').options].some(o=>o.value===id)){selected=id;el('booking').value=id;connectJourneySocket();await update();if(journey?.destination){el('map').classList.remove('location-pending');el('location-gate').hidden=true;map.easeTo({center:[journey.destination.longitude,journey.destination.latitude],zoom:16});}else say('Choose a destination on the map. Tap Find nearby talent to request device location, or choose an area manually.');}else{say('Tap Find nearby talent to share your current device location. GPS is requested only after you choose nearby discovery.');}}catch(e){say(e.message+' Sign in to Sparrow first.');}})();
setInterval(()=>{if(document.visibilityState==='visible')update();},15000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')closeJourneySocket();else connectJourneySocket();});
window.addEventListener('pagehide',closeJourneySocket);

document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&watch!==null)stop().catch(()=>{say('Sharing stopped on this device. Last server update expires within two minutes.');});});

el('follow-entertainer').onclick=()=>{following=!following;el('follow-entertainer').textContent=following?'Stop following camera':'Follow entertainer on map';if(following){tracking=true;el('track-entertainer').textContent='Stop Tracking My Entertainer';el('track-entertainer').classList.add('tracking');el('tracker-state').textContent='LIVE 3D TRACKING · camera follows fresh entertainer positions.';}update();};
el('track-entertainer').onclick=run(async()=>{if(!selected)throw Error('Choose an accepted booking first.');if(!journey?.destination)throw Error('The customer must choose a destination first.');if(!journey?.location){tracking=true;el('tracker-state').textContent='3D tracker armed · waiting for the entertainer to share a fresh location.';await update();return;}tracking=!tracking;following=tracking;el('track-entertainer').textContent=tracking?'Stop Tracking My Entertainer':'Track My Entertainer';el('track-entertainer').classList.toggle('tracking',tracking);if(tracking){tilted=true;SparrowMap3D.toggle(map,true);map.easeTo({center:[journey.location.longitude,journey.location.latitude],zoom:17,pitch:55,duration:500});el('view').textContent='Switch to 2D';el('tracker-state').textContent='LIVE 3D TRACKING · camera locked to fresh entertainer positions.';}else{el('tracker-state').textContent='3D tracker paused · live position remains visible when available.';}await update();});
el('fit-journey').onclick=()=>{if(!journey?.location||!journey.destination)return;const a=journey.location,b=journey.destination;map.fitBounds([[Math.min(a.longitude,b.longitude),Math.min(a.latitude,b.latitude)],[Math.max(a.longitude,b.longitude),Math.max(a.latitude,b.latitude)]],{padding:{top:200,bottom:240,left:60,right:60},maxZoom:16,pitch:tilted?55:0});};

el('retry-location').onclick=()=>el('near').click();

el('browse-area').onclick=()=>{el('manual-area').hidden=false;el('location-message').textContent='Enter coordinates for your chosen area. This is a manual selection, not a verified device location.';};
el('manual-area').onsubmit=e=>{e.preventDefault();const lat=Number(el('manual-lat').value),lng=Number(el('manual-lng').value);if(!map||!Number.isFinite(lat)||!Number.isFinite(lng)||lat<-90||lat>90||lng<-180||lng>180)return;map.jumpTo({center:[lng,lat],zoom:15,pitch:55});el('map').classList.remove('location-pending');el('location-gate').hidden=true;map.resize?.();say('Manually selected area. Click Find nearby talent to retry device location.');};


el('street-detail').onclick=()=>{if(map)map.easeTo({zoom:17,pitch:tilted?55:0});};
el('place-details').onclick=()=>{
 if(!map)return;
 el('place-list').hidden=false;el('places').replaceChildren();
 const seen=new Set();let count=0;
 for(const feature of map.queryRenderedFeatures()){
  if(feature.layer?.type!=='symbol'||!['poi','place'].includes(feature.sourceLayer))continue;
  const props=feature.properties||{},name=props.name||props['name:en'];
  if(!name||seen.has(name)||feature.geometry?.type!=='Point')continue;
  seen.add(name);count++;const b=document.createElement('button');
  b.textContent=name+(props.class?' · '+props.class:'');
  const coordinates=feature.geometry.coordinates;
  b.onclick=()=>map.easeTo({center:coordinates,zoom:17,pitch:tilted?55:0});el('places').append(b);
  if(count>=40)break;
 }
 if(!count){const msg=document.createElement('p');msg.textContent='No place labels are currently loaded here. Zoom in, wait for tiles, then try again. Map data may not cover every place.';el('places').append(msg);}
};

function kmBetween(a,b){const rad=x=>x*Math.PI/180,h=Math.sin(rad(b.latitude-a.latitude)/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(rad(b.longitude-a.longitude)/2)**2;return 6371*2*Math.asin(Math.min(1,Math.sqrt(h)));}
function resetMovement(){lastFix=null;trail=[];el('movement').textContent='Movement: no fresh shared location';if(map?.getSource?.('journey-trail'))map.getSource('journey-trail').setData({type:'FeatureCollection',features:[]});}
function movement(p,destination){
 if(lastFix&&p.captured===lastFix.captured)return;
 let status='Movement: waiting for another fresh update';
 if(lastFix){trackerBearing=bearing(lastFix,p);const elapsed=p.captured-lastFix.captured,metres=kmBetween(lastFix,p)*1000,uncertainty=lastFix.accuracy+p.accuracy;
  if(elapsed>0&&elapsed<=120){
   if(metres<=uncertainty)status='Movement uncertain · change is within device accuracy';
   else{const change=destination?(kmBetween(lastFix,destination)-kmBetween(p,destination))*1000:0;status=destination&&Math.abs(change)>uncertainty?(change>0?'Moving closer to your destination':'Moving farther from your destination'):'Movement detected · direction uncertain';status+=' · based on device reports';}
  }else{trail=[];status='Movement: waiting for consecutive fresh updates';}
 }
 el('movement').textContent=status;lastFix=p;trail.push([p.longitude,p.latitude]);if(trail.length>30)trail.shift();
 if(map?.getSource&&map?.isStyleLoaded?.()){
  const data={type:'FeatureCollection',features:trail.length>1?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:trail}}]:[]};
  if(!map.getSource('journey-trail')){map.addSource('journey-trail',{type:'geojson',data});map.addLayer({id:'journey-trail-line',type:'line',source:'journey-trail',paint:{'line-color':'#16885b','line-width':5,'line-opacity':0.8},layout:{'line-cap':'round','line-join':'round'}});}else map.getSource('journey-trail').setData(data);
 }
}




/* NEARME_LIVE_PRESENCE_JS_V2 */

let nearMeLivePresenceActive=false;
let nearMeLivePresenceWatch=null;
let nearMeLivePresenceListing='';
let nearMeLivePresenceLastSent=0;

async function nearMeLoadLiveListings(){
  return await api('/mine');
}

function nearMeSetLiveUi(active){
  const button=el('live-location-toggle');
  const status=el('live-location-status');

  if(!button||!status)return;

  button.setAttribute('aria-pressed',String(active));
  button.classList.toggle('live-on',active);
  button.textContent=active?'Turn off':'Turn on';

  status.textContent=active
    ?'ON · your entertainer listing is discoverable nearby'
    :'Off · you are not discoverable';
}

async function nearMeGetGps(){
  if(!navigator.geolocation){
    throw Error('This device does not provide GPS location.');
  }

  return await new Promise((resolve,reject)=>{
    navigator.geolocation.getCurrentPosition(
      resolve,
      ()=>{
        reject(Error('Allow device location to turn on Live Location.'));
      },
      {
        enableHighAccuracy:true,
        maximumAge:0,
        timeout:15000
      }
    );
  });
}

async function nearMeSendPresence(position){
  if(!nearMeLivePresenceActive||!nearMeLivePresenceListing)return;

  if(Date.now()-nearMeLivePresenceLastSent<30000)return;

  const latitude=Number(position?.coords?.latitude);
  const longitude=Number(position?.coords?.longitude);
  const accuracy=Number(position?.coords?.accuracy);
  const captured=Number(position?.timestamp)/1000;
  const now=Date.now()/1000;
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||!Number.isFinite(accuracy)||accuracy<=0||accuracy>100||!Number.isFinite(captured)||captured<now-30||captured>now+5){
    nearMeSetLiveUi(true);
    el('live-location-status').textContent='ON · waiting for a fresh GPS fix at 100 m accuracy or better';
    return;
  }

  nearMeLivePresenceLastSent=Date.now();

  await api(
    '/listings/'+encodeURIComponent(nearMeLivePresenceListing)+'/device-presence',
    'PUT',
    {
      active:true,
      latitude,
      longitude,
      accuracy,
      captured
    }
  );

  nearMeSetLiveUi(true);
  el('live-location-status').textContent=
    'ON · GPS refreshed · ±'+Math.round(position.coords.accuracy)+' m';
}

async function nearMeStartLiveLocation(){
  const listings=await nearMeLoadLiveListings();

  if(!Array.isArray(listings)||!listings.length){
    throw Error('Publish an active professional entertainer listing before turning on Live Location.');
  }

  const current=listings.find(x=>x.active_now);
  nearMeLivePresenceListing=(current||listings[0]).id;

  const position=await nearMeGetGps();

  if(!Number.isFinite(position.coords.accuracy)||position.coords.accuracy>100){
    throw Error('Your GPS fix must be accurate to 100 metres or better. Move to an open area and try again.');
  }

  nearMeLivePresenceActive=true;
  try{
    await nearMeSendPresence(position);
  }catch(error){
    nearMeLivePresenceActive=false;
    nearMeLivePresenceListing='';
    nearMeLivePresenceLastSent=0;
    nearMeSetLiveUi(false);
    throw error;
  }

  if(nearMeLivePresenceWatch!==null){
    navigator.geolocation.clearWatch(nearMeLivePresenceWatch);
  }

  nearMeLivePresenceWatch=navigator.geolocation.watchPosition(
    p=>{
      nearMeSendPresence(p).catch(e=>say(e.message));
    },
    ()=>{
      say('Live Location could not refresh. Existing presence will expire automatically.');
    },
    {
      enableHighAccuracy:true,
      maximumAge:15000,
      timeout:20000
    }
  );

  nearMeSetLiveUi(true);
  say('Live Location is ON. Your active entertainer listing can now appear nearby.');
}

async function nearMeStopLiveLocation(){
  if(nearMeLivePresenceWatch!==null){
    navigator.geolocation.clearWatch(nearMeLivePresenceWatch);
    nearMeLivePresenceWatch=null;
  }

  if(nearMeLivePresenceListing){
    await api(
      '/listings/'+encodeURIComponent(nearMeLivePresenceListing)+'/device-presence',
      'PUT',
      {active:false}
    );
  }

  nearMeLivePresenceActive=false;
  nearMeLivePresenceListing='';
  nearMeLivePresenceLastSent=0;

  nearMeSetLiveUi(false);
}

async function nearMeToggleLiveLocation(){
  if(nearMeLivePresenceActive){
    await nearMeStopLiveLocation();
    say('Live Location is OFF.');
  }else{
    await nearMeStartLiveLocation();
  }
}

async function nearMeDiscoverLiveEntertainers(){
  if(!lastFix){
    throw Error('Allow device location first.');
  }

  const rows=await api(
    '/listings?'+
    new URLSearchParams({
      latitude:String(lastFix.latitude),
      longitude:String(lastFix.longitude),
      radius_km:'50'
    })
  );

  for(const pin of talentPins){
    try{pin.remove();}catch{}
  }

  talentPins=[];

  const container=el('active-entertainers');

  if(container){
    container.replaceChildren();
  }

  if(el('discovery-count')){
    el('discovery-count').textContent=rows.length+' live';
  }

  for(const r of rows){

    if(
      !Number.isFinite(Number(r.latitude))||
      !Number.isFinite(Number(r.longitude))
    ){
      continue;
    }

    const latitude=Number(r.latitude);
    const longitude=Number(r.longitude);

    const markerElement=document.createElement('div');
    markerElement.className='booking-discovery-marker';
    markerElement.textContent='●';
    markerElement.title=r.title+' · LIVE';

    const marker=new maplibregl.Marker({
      element:markerElement,
      anchor:'center'
    })
    .setLngLat([longitude,latitude])
    .addTo(map);

    talentPins.push(marker);

    markerElement.addEventListener('click',()=>{
      map.easeTo({
        center:[longitude,latitude],
        zoom:16,
        pitch:45,
        duration:500
      });
    });

    if(container){

      const card=document.createElement('article');
      card.className='active-entertainer';

      const top=document.createElement('div');
      top.className='active-entertainer-top';

      if(r.photo){
        const img=document.createElement('img');
        img.className='active-avatar';
        img.src=r.photo;
        img.alt='';
        top.append(img);
      }

      const info=document.createElement('div');

      const title=document.createElement('h3');
      title.textContent=r.title;

      const skill=document.createElement('p');
      skill.textContent=r.skill||'Professional entertainer';

      const distance=document.createElement('p');
      distance.className='active-distance';
      distance.textContent=
        Number(r.distance_km).toFixed(2)+' km away · LIVE';

      info.append(title,skill,distance);
      top.append(info);

      const actions=document.createElement('div');
      actions.className='active-actions';

      const book=document.createElement('a');
      book.className='book-now';
      book.textContent='Book / Message';
      book.href=
        '/ecosystem/book?listing='+encodeURIComponent(r.id);

      actions.append(book);
      card.append(top,actions);

      container.append(card);
    }
  }

  el('booking-discovery').hidden=false;

  if(!rows.length){
    say('No live entertainers are currently available within 50 km.');
  }else{
    say(
      rows.length+
      ' live entertainer'+
      (rows.length===1?'':'s')+
      ' found within 50 km.'
    );
  }
}

if(el('live-location-toggle')){
  el('live-location-toggle').onclick=run(
    nearMeToggleLiveLocation
  );
}

/*
 * Replace only the existing Near Me discovery action.
 * The original booking and private journey controls remain untouched.
 */
if(el('booking-chooser')){
  el('booking-chooser').onclick=run(
    nearMeDiscoverLiveEntertainers
  );
}

window.addEventListener('pagehide',()=>{
  if(nearMeLivePresenceWatch!==null){
    navigator.geolocation.clearWatch(
      nearMeLivePresenceWatch
    );
    nearMeLivePresenceWatch=null;
  }
});

/* END NEARME_LIVE_PRESENCE_JS_V2 */
