"use strict";
window.SparrowMap3D={
 attach(map,config,status,is3D){
  const layers=map.getStyle().layers||[];
  if(map.setLight)map.setLight({anchor:'viewport',color:'#fff9ef',intensity:0.45,position:[1.2,210,45]});
  for(const layer of layers){
   if(layer.type==='symbol'&&layer.layout?.['text-field']&&map.setPaintProperty){
    map.setPaintProperty(layer.id,'text-halo-color','#ffffff');map.setPaintProperty(layer.id,'text-halo-width',1.6);map.setPaintProperty(layer.id,'text-halo-blur',0.25);
   }
   if(layer.type==='line'&&layer['source-layer']==='transportation'&&!/casing|outline|tunnel|rail|ferry/.test(layer.id)&&map.setPaintProperty){
    map.setPaintProperty(layer.id,'line-color',['match',['get','class'],'motorway','#f5ae45','trunk','#f7c15f','primary','#ffe2a3','#ffffff']);
   }
  }
  // Remove pre-existing extrusions to avoid drawing buildings twice.
  layers.filter(l=>l.type==='fill-extrusion').forEach(l=>map.removeLayer(l.id));
  const building=layers.find(l=>l['source-layer']==='building');
  if(building){
   const label=layers.find(l=>l.type==='symbol'&&l.layout?.['text-field']);
   map.addLayer({id:'sparrow-buildings-3d',source:building.source,'source-layer':'building',type:'fill-extrusion',minzoom:15,
    filter:['all',['!=',['get','hide_3d'],true],['has','render_height']],
    layout:{visibility:is3D?'visible':'none'},paint:{'fill-extrusion-color':['interpolate',['linear'],['to-number',['get','render_height'],0],0,'#c9d5d0',40,'#a6bdb2',150,'#729b89'],'fill-extrusion-height':['max',0,['to-number',['get','render_height'],0]],'fill-extrusion-base':['max',0,['to-number',['get','render_min_height'],0]],'fill-extrusion-opacity':1}},label?.id);
  }
  const attribution='<a href="https://mapterhorn.com/attribution/" target="_blank" rel="noopener">© Mapterhorn terrain data sources</a>';
  map.addSource('sparrow-elevation',{type:'raster-dem',url:config.terrain_url,encoding:'terrarium',tileSize:512,attribution});
  map.addSource('sparrow-hillshade',{type:'raster-dem',url:config.terrain_url,encoding:'terrarium',tileSize:512,attribution});
  const before=building?'sparrow-buildings-3d':layers.find(l=>l.type==='symbol')?.id;
  map.addLayer({id:'sparrow-hillshade',type:'hillshade',source:'sparrow-hillshade',paint:{'hillshade-exaggeration':0.25}},before);
  map.setTerrain(is3D?{source:'sparrow-elevation',exaggeration:1}:null);
  status.textContent=building?'3D layers enabled · zoom in to see mapped buildings. Terrain tiles load as you explore.':'Terrain enabled · this map style has no compatible building layer.';
 },
 toggle(map,on){
  if(map.getSource('sparrow-elevation'))map.setTerrain(on?{source:'sparrow-elevation',exaggeration:1}:null);
  if(map.getLayer('sparrow-buildings-3d'))map.setLayoutProperty('sparrow-buildings-3d','visibility',on?'visible':'none');
 }
};
