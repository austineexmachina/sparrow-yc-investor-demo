const $ = id => document.getElementById(id);
let current=null, me=null, project=null, recorder=null, mic=null, recordingTimer=null, chunks=[], recordingUrl=null;
let timelineDirty=false,timelineBaseVersion=null,timelineProjectId=null,timelinePage=0;
const TIMELINE_PAGE_SIZE=100;
const workspaceMode=document.body.dataset.workspace||'creator';
const fieldValue=id=>$(id)?.value||'';
let postingDestinations={};
let pollTimer=null, authMode='register', selectedContent='', suggestedBrief='';
function notice(text){$('notice').textContent=text;$('notice').hidden=!text;}
async function api(path,method='GET',data,extraHeaders={}){
  const config={method,credentials:'same-origin'};
  if(data instanceof FormData)config.body=data;
  else if(data!==undefined){config.headers={'Content-Type':'application/json'};config.body=JSON.stringify(data);}
  if(Object.keys(extraHeaders).length)config.headers={...(config.headers||{}),...extraHeaders};
  config.headers=await window.SparrowAuthSecurity.protectedHeaders('/api'+path,method,config.headers||{});
  let r;
  try{r=await fetch('/api'+path,config);}catch(error){if(error instanceof TypeError)throw Error(`Sparrow could not reach ${location.origin}. Check that Sparrow is running at this address, then try again.`);throw error;}
  const b=await r.json().catch(()=>({detail:'Unexpected response from Sparrow.'}));
  if(!r.ok){const error=Error(typeof b.detail==='string'?b.detail:JSON.stringify(b.detail));error.status=r.status;throw error;}
  return b;
}
function act(id,fn){if(!$(id))return;$(id).addEventListener('click',async e=>{e.preventDefault();const b=$(id);b.disabled=true;notice('');try{await fn();}catch(err){notice(err.message);}finally{b.disabled=false;}});}
function options(){return {workspace:workspaceMode,film_genre:fieldValue('film-genre'),production_context:fieldValue('production-context'),scene_reference:fieldValue('scene-reference'),director_intent:fieldValue('director-intent'),script_context:fieldValue('script-context'),continuity_notes:fieldValue('continuity-notes'),posting_destination:$('posting-destination').value,posting_details:$('posting-details').value,visual_intent:$('visual-intent').value,shooting_conditions:$('shooting-conditions').value,audience:$('audience').value,message:$('message').value,creator_style:$('creator-style').value,verified_facts:$('verified-facts').value,call_to_action:fieldValue('call-to-action'),content_type:selectedContent,brand_type:selectedContent==='Brand advertising'?fieldValue('brand-type'):'',duration:Number($('duration').value),aspect:$('aspect').value,resolution:fieldValue('resolution')||'1080p',feel:$('feel').value,clip_count:$('clip-count').value?Number($('clip-count').value):null,voice:$('voice').value,voice_offset_seconds:Number(fieldValue('voice-offset')||0),captions:$('captions').checked,allow_ai_analysis:$('ai-consent').checked,stabilize:$('stabilize').checked,protect_dialogue:$('protect-dialogue').checked};}
function loadOptions(o){updateWorkspaceUI();for(const [id,key] of [['film-genre','film_genre'],['production-context','production_context'],['scene-reference','scene_reference'],['director-intent','director_intent'],['script-context','script_context'],['continuity-notes','continuity_notes']])if($(id))$(id).value=o[key]||'';$('posting-destination').value=o.posting_destination||'';$('posting-details').value=o.posting_details||'';updatePostingGuidance();for(const [id,key] of [['visual-intent','visual_intent'],['shooting-conditions','shooting_conditions'],['audience','audience'],['message','message'],['creator-style','creator_style'],['verified-facts','verified_facts'],['call-to-action','call_to_action']])if($(id))$(id).value=o[key]||'';setContent(o.content_type||'',false);if($('brand-type'))$('brand-type').value=o.brand_type||'';if(typeof syncAppAdPanel==='function')syncAppAdPanel();$('duration').value=o.duration;$('length-preset').value=[30,60,180].includes(o.duration)?String(o.duration):'custom';$('aspect').value=o.aspect;if($('resolution'))$('resolution').value=o.resolution||'1080p';$('feel').value=o.feel;$('clip-count').value=o.clip_count||'';$('voice').value=o.voice;if($('voice-offset'))$('voice-offset').value=o.voice_offset_seconds||0;$('captions').checked=o.captions;$('ai-consent').checked=o.allow_ai_analysis;$('stabilize').checked=!!o.stabilize;$('protect-dialogue').checked=o.protect_dialogue!==false;}
function setContent(content,fill=true){
  $('capture-guidance').hidden=true;
  selectedContent=content;if(typeof syncAppAdPanel==='function')syncAppAdPanel();
  if(!$('content-choices'))return;
  for(const button of $('content-choices').querySelectorAll('[data-content]'))button.setAttribute('aria-pressed',String(button.dataset.content===content));
  $('brand-type-field').hidden=content!=='Brand advertising';
  $('content-selected').textContent=content?content+' · add your direction below.':'Pick an idea or describe your own below.';
  if(fill){const suggestion=content==='Custom'?'':content;
    if(!$('brief').value.trim()||$('brief').value===suggestedBrief){$('brief').value=suggestion;suggestedBrief=suggestion;}
  }
}
$('content-choices')?.addEventListener('click',event=>{const button=event.target.closest('[data-content]');if(button)setContent(button.dataset.content);});
$('brand-type')?.addEventListener('change',()=>{
  if(typeof syncAppAdPanel==='function')syncAppAdPanel();const suggestion=$('brand-type').value?$('brand-type').value+' brand advertising':'Brand advertising';
  if(!$('brief').value.trim()||$('brief').value===suggestedBrief){$('brief').value=suggestion;suggestedBrief=suggestion;}
});
function needProject(){if(!current)throw Error('Start your creation before adding footage.');}
async function session(){me=await api('/me');if(me.email_verification_required){$('studio').hidden=true;await window.SparrowAccount.pending({},session);return;}postingDestinations=await api('/posting-destinations');const destination=$('posting-destination');destination.replaceChildren(new Option('Choose where you will post',''));for(const [key,value] of Object.entries(postingDestinations))destination.add(new Option(value.label,key));$('auth').hidden=true;$('studio').hidden=false;$('logout').hidden=false;$('identity').textContent=me.sparrow_name ? me.sparrow_name+(me.nickname?' · @'+me.nickname:'') : me.email;$('connection').textContent=me.ai_connected?'Sparrow is ready to analyze your footage.':'';$('connection').hidden=!me.ai_connected;if(!current)reset();updateWorkspaceUI();await listProjects();}
function markProjectSelection(){
  for(const card of $('project-list').querySelectorAll('[data-project]'))card.setAttribute('aria-pressed',String(card.dataset.project===current));
}
function updateProjectArrows(){
  const track=$('project-list'),max=track.scrollWidth-track.clientWidth;
  $('project-prev').disabled=track.scrollLeft<=2;
  $('project-next').disabled=max<=2||track.scrollLeft>=max-2;
}
function slideProjects(direction){
  const track=$('project-list');
  track.scrollBy({left:direction*Math.max(260,track.clientWidth*.8),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
async function listProjects(){
  const items=await api('/projects?workspace='+workspaceMode),track=$('project-list');track.replaceChildren();
  $('project-empty').hidden=items.length>0;
  for(const [index,p] of items.entries()){
    const card=document.createElement('button');card.type='button';card.className='project-slide';card.dataset.project=p.id;
    const number=document.createElement('span');number.className='project-slide-number';number.textContent=String(index+1).padStart(2,'0');number.setAttribute('aria-hidden','true');
    const title=document.createElement('span');title.className='project-slide-title';title.textContent=p.brief;
    const meta=document.createElement('span');meta.className='project-slide-meta';meta.textContent=p.version?'Version '+p.version:'New story';
    card.append(number,title,meta);track.append(card);
  }
  markProjectSelection();requestAnimationFrame(updateProjectArrows);
}
function timelineInput(label,key,value,{min,max,step='0.01'}={}){
  const wrapper=document.createElement('label');wrapper.className='timeline-field';wrapper.append(document.createTextNode(label));
  const input=document.createElement('input');input.type='number';input.dataset.field=key;input.step=step;input.value=value;
  if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;wrapper.append(input);return wrapper;
}
function timelineSelect(label,key,value,choices){
  const wrapper=document.createElement('label');wrapper.className='timeline-field';wrapper.append(document.createTextNode(label));
  const select=document.createElement('select');select.dataset.field=key;
  for(const [choice,text] of choices){const option=document.createElement('option');option.value=choice;option.textContent=text;select.append(option);}
  select.value=value;wrapper.append(select);return wrapper;
}
function drawAudioTracks(plan){
  const select=$('audio-track-source');if(!select)return;
  const previous=select.value;select.replaceChildren(new Option('Choose uploaded voice or music',''));
  for(const media of project.media.filter(item=>['voice','music'].includes(item.kind)&&item.metadata.audio))select.add(new Option(`${media.kind}: ${media.name}`,media.id));
  if([...select.options].some(option=>option.value===previous))select.value=previous;
  const list=$('audio-tracks');list.replaceChildren();
  (plan.audio_tracks||[]).forEach((track,index)=>{
    const media=project.media.find(item=>item.id===track.media_id);const row=document.createElement('li');row.className='timeline-shot';row.dataset.trackIndex=String(index);
    const title=document.createElement('h4');title.textContent=`${media?.kind||'Audio'} track ${index+1} · ${media?.name||track.media_id}`;row.append(title);
    const fields=document.createElement('div');fields.className='timeline-fields';
    fields.append(timelineInput('Sequence start (s)','start',track.start,{min:0,max:project.options.duration}));
    fields.append(timelineInput('Source in (s)','source_start',track.source_start,{min:0,max:media?.metadata.duration||0}));
    fields.append(timelineInput('Source out (s)','source_end',track.source_end,{min:0.01,max:media?.metadata.duration||0}));
    fields.append(timelineInput('Gain','gain',track.gain,{min:0,max:4,step:'0.05'}));row.append(fields);
    const remove=document.createElement('button');remove.type='button';remove.className='quiet';remove.dataset.removeTrack='true';remove.textContent='Remove track';remove.setAttribute('aria-label',`Remove audio track ${index+1}`);row.append(remove);list.append(row);
  });
}
function captureAudioTrackEdits(){
  if(!project?.plan)return;
  for(const row of $('audio-tracks').querySelectorAll('[data-track-index]')){
    const track=project.plan.audio_tracks?.[Number(row.dataset.trackIndex)];if(!track)continue;
    for(const input of row.querySelectorAll('[data-field]'))track[input.dataset.field]=Number(input.value);
  }
}
function drawTimeline(plan){
  $('shots').replaceChildren();
  timelinePage=Math.min(timelinePage,Math.max(0,Math.ceil(plan.segments.length/TIMELINE_PAGE_SIZE)-1));
  const start=timelinePage*TIMELINE_PAGE_SIZE;
  const visible=plan.segments.slice(start,start+TIMELINE_PAGE_SIZE);
  for(const [offset,segment] of visible.entries()){
    const index=start+offset;
    const item=document.createElement('li');item.className='timeline-shot';item.dataset.mediaId=segment.media_id;item.dataset.segmentIndex=String(index);
    const media=project.media.find(m=>m.id===segment.media_id);const head=document.createElement('div');head.className='timeline-shot-head';
    const title=document.createElement('h4');title.textContent=`Shot ${index+1} · ${media?.name||segment.media_id}`;
    const move=document.createElement('div');move.className='timeline-reorder';
    for(const [direction,text] of [['up','Move shot earlier'],['down','Move shot later']]){const button=document.createElement('button');button.type='button';button.className='secondary';button.dataset.move=direction;button.textContent=direction==='up'?'↑':'↓';button.setAttribute('aria-label',text);button.disabled=direction==='up'?index===0:index===plan.segments.length-1;move.append(button);}
    head.append(title,move);item.append(head);
    const controls=document.createElement('div');controls.className='timeline-fields';
    controls.append(timelineInput('In (seconds)','start',segment.start,{min:0,max:media?.metadata.duration||3600}));
    controls.append(timelineInput('Out (seconds)','end',segment.end,{min:0.01,max:media?.metadata.duration||3600}));
    controls.append(timelineInput('Speed ×','speed',segment.speed,{min:0.5,max:2,step:'0.05'}));
    controls.append(timelineSelect('Transition','transition',segment.transition,[['cut','Cut'],['fade','Fade']]));
    controls.append(timelineInput('Brightness','brightness',segment.brightness,{min:-0.08,max:0.08,step:'0.01'}));
    controls.append(timelineInput('Contrast','contrast',segment.contrast,{min:0.9,max:1.1,step:'0.01'}));
    controls.append(timelineInput('Saturation','saturation',segment.saturation,{min:0.9,max:1.15,step:'0.01'}));
    controls.append(timelineInput('Source audio','natural_audio',segment.natural_audio,{min:0,max:1,step:'0.05'}));
    item.append(controls);const reason=document.createElement('p');reason.className='fine';reason.textContent=segment.reason;item.append(reason);$('shots').append(item);
  }
  if($('timeline-music-volume'))$('timeline-music-volume').value=plan.music_volume;
  drawAudioTracks(plan);
  updateTimelinePager(plan.segments.length);
  updateTimelineDuration();
}
function updateTimelinePager(total){
  const controls=$('timeline-page-controls');if(!controls)return;
  const pages=Math.max(1,Math.ceil(total/TIMELINE_PAGE_SIZE));timelinePage=Math.min(timelinePage,pages-1);
  controls.hidden=pages<=1;
  $('timeline-page-label').textContent=`Shots ${Math.min(total,timelinePage*TIMELINE_PAGE_SIZE+1)}–${Math.min(total,(timelinePage+1)*TIMELINE_PAGE_SIZE)} of ${total}`;
  $('timeline-page-prev').disabled=timelinePage===0;
  $('timeline-page-next').disabled=timelinePage>=pages-1;
}
function captureVisibleTimelineEdits(){
  if(!project?.plan)return;
  for(const item of $('shots').querySelectorAll('.timeline-shot')){
    const index=Number(item.dataset.segmentIndex),segment=project.plan.segments[index];if(!segment)continue;
    for(const control of item.querySelectorAll('[data-field]'))segment[control.dataset.field]=control.type==='number'?Number(control.value):control.value;
  }
}
function updateTimelineDuration(){
  if(!$('timeline-duration')||!project)return;
  captureVisibleTimelineEdits();
  const seconds=project.plan?.segments.reduce((sum,item)=>sum+(item.end-item.start)/item.speed,0)||0;
  $('timeline-duration').textContent=`Sequence length: ${Number.isFinite(seconds)?seconds.toFixed(2):'invalid'} seconds; target: ${project.options.duration} seconds.`;
}
function markTimelineDirty(){timelineDirty=true;$('timeline-status').textContent='Unsaved timeline changes. Save to create a new version before preview or export.';$('save-timeline').disabled=false;$('discard-timeline').disabled=false;$('approve').disabled=true;$('export').disabled=true;updateTimelineDuration();}
function makeTimelinePlan(){
  captureVisibleTimelineEdits();captureAudioTrackEdits();
  const plan=structuredClone(project.plan);plan.music_volume=Number($('timeline-music-volume').value);return plan;
}
async function persistTimeline(){
  if(!timelineDirty)return;
  await api('/projects/'+current+'/plan','PUT',makeTimelinePlan(),{'If-Match':String(timelineBaseVersion)});
  timelineDirty=false;
}
function reset(){$('capture-guidance').hidden=true;$('capture-guidance').replaceChildren();current=null;project=null;timelineDirty=false;timelineBaseVersion=null;timelineProjectId=null;timelinePage=0;if($('app-ad-results'))$('app-ad-results').replaceChildren();clearTimeout(pollTimer);$('project-form').reset();if(workspaceMode==='film'){$('aspect').value='landscape';$('voice').value='none';$('captions').checked=false;}updateWorkspaceUI();updatePostingGuidance();$('brief').value='';suggestedBrief='';setContent('',false);$('save-project').textContent=workspaceMode==='film'?'Create film project':'Start my creation';$('media-list').replaceChildren();$('version').textContent=workspaceMode==='film'?'No film project yet':'No project yet';$('plan-panel').hidden=true;$('revision-panel').hidden=true;$('video').hidden=true;$('video').removeAttribute('src');$('preview-empty').hidden=false;$('direct').disabled=true;$('analyze').disabled=true;$('delete-project').hidden=true;$('job-state').hidden=true;$('download').hidden=true;$('manifest').hidden=true;markProjectSelection();$('brief').focus();}
async function refresh(){
  if(!current)return;
  $('capture-guidance').hidden=true;$('capture-guidance').replaceChildren();
  const previousProject=project;project=await api('/projects/'+current);
  if((project.options.workspace||'creator')!==workspaceMode){location.assign((project.options.workspace==='film'?'/film':'/studio')+'?project='+encodeURIComponent(current));return;}
  const preserveTimeline=timelineDirty&&timelineProjectId===current;
  if(!preserveTimeline){timelineDirty=false;timelineBaseVersion=project.version;timelineProjectId=current;}
  $('brief').value=project.brief;loadOptions(project.options);if(typeof refreshAppAd==='function')await refreshAppAd();$('save-project').textContent='Save direction';$('version').textContent='Version '+project.version;
  $('delete-project').hidden=false;$('direct').disabled=!project.media.some(m=>m.kind==='video');$('analyze').disabled=$('direct').disabled;$('media-list').replaceChildren();
  for(const m of project.media){const li=document.createElement('li');const name=document.createElement('span');name.textContent=m.name;const info=document.createElement('span');info.textContent=m.kind+' · '+Math.round(m.metadata.duration)+'s'+(m.metadata.analysis?' · '+m.metadata.analysis.scenes.length+' scenes':'');li.append(name,info);$('media-list').append(li);}
  const take=project.media.filter(m=>m.kind==='voice').at(-1);$('voice-take-state').textContent=take?'Current take: '+take.name+' · '+Math.round(take.metadata.duration)+'s. The latest uploaded take is used in your preview.':'Record here or upload your own narration.';
  $('voice-hint').textContent='Aim for about '+Math.round(project.options.duration*2)+' words for '+project.options.duration+' seconds, with room to breathe. Writing a script keeps your shots; audio comes from your own take.';
  const p=project.plan;$('plan-panel').hidden=!p;$('revision-panel').hidden=!p;
  if(p){$('plan-title').textContent=p.title;$('story').textContent=p.story;$('script').value=p.voiceover;$('warnings').replaceChildren();for(const w of p.warnings){const li=document.createElement('li');li.textContent=w;$('warnings').append(li);}if(!preserveTimeline){if(workspaceMode==='film')drawTimeline(p);else{$('shots').replaceChildren();for(const s of p.segments){const li=document.createElement('li');const source=project.media.find(m=>m.id===s.media_id);li.textContent=`${source?.name||s.media_id} · ${s.start.toFixed(1)}–${s.end.toFixed(1)}s · ${s.speed}×. ${s.reason}`;$('shots').append(li);}}}}
  else if(!preserveTimeline)$('shots').replaceChildren();
  if($('timeline-status')){if(preserveTimeline&&previousProject?.version!==project.version)$('timeline-status').textContent='The saved project changed in another session. Your edits are still here, but saving will be rejected until you discard and reload.';
  else if(!timelineDirty)$('timeline-status').textContent='Edits are saved as a new project version.';}
  const out=project.outputs.find(o=>o.kind==='preview')||project.outputs.find(o=>o.kind==='export');
  $('video').hidden=!out;$('preview-empty').hidden=!!out;
  if(out){const src=out.url+'?v='+project.version+'&preview='+encodeURIComponent(project.review.preview_sha||'');if($('video').getAttribute('src')!==src)$('video').src=src;}
  const review=project.review;const reviewToken=current+':'+review.version+':'+review.preview_sha+':'+Object.keys(review.checks).join(',');
  if($('review-checks').dataset.token!==reviewToken){$('review-checks').dataset.token=reviewToken;$('review-checks').replaceChildren();for(const [key,text] of Object.entries(review.checks)){const label=document.createElement('label');label.className='check';const input=document.createElement('input');input.type='checkbox';input.dataset.review=key;input.checked=review.approved;label.append(input,document.createTextNode(text));$('review-checks').append(label);}}
  $('approval-state').textContent=review.approved?'You approved this version.':review.preview_ready?'Watch this preview and complete your review.':'Create a preview before approving this version.';
  const exported=project.outputs.some(o=>o.kind==='export');$('download').hidden=!exported;if(exported){$('download').href='/api/projects/'+current+'/output/export?download=true';$('download').download='sparrow-video.mp4';}
  $('manifest').hidden=!out;$('manifest').href='/api/projects/'+current+'/manifest';
  $('payment-note').textContent=me.payment_required&&!project.paid?`Full-quality export: ${me.currency} ${me.price||'price not configured'}. Payment is verified before export.`:'';
  const active=project.jobs.find(j=>['queued','running'].includes(j.status));const last=project.jobs[0];
  $('job-state').hidden=!last;
  if(last)$('job-state').textContent=last.status==='failed'?last.error:last.status==='done'?'Ready. Take a look and tell Sparrow how it feels.':`${last.kind==='analysis'?'Reviewing your footage':last.kind==='plan'?'Finding your story':last.kind==='voiceover'?'Writing your voice-over':last.kind==='preview'?'Creating your preview':'Rendering your full-quality video'} · ${last.status==='queued'?'waiting':'working'}`;
  for(const id of ['direct','analyze','preview','revise','export','restore','save-script','save-project','recommend-voice','save-timeline','discard-timeline'])if($(id))$(id).disabled=!!active;
  for(const input of document.querySelectorAll('#shots [data-field],#audio-tracks [data-field],#timeline-music-volume,#audio-track-source,#audio-track-add,#audio-tracks [data-remove-track]'))input.disabled=!!active;
  if($('save-timeline'))$('save-timeline').disabled=!!active||!timelineDirty;if($('discard-timeline'))$('discard-timeline').disabled=!!active||!timelineDirty;
  $('approve').disabled=!!active||timelineDirty||!project.review.preview_ready;$('export').disabled=!!active||timelineDirty||!project.review.approved;
  clearTimeout(pollTimer);if(active)pollTimer=setTimeout(()=>refresh().catch(e=>notice(e.message)),2000);
}
$('shots').addEventListener('input',event=>{if(event.target.matches('[data-field]'))markTimelineDirty();});
$('shots').addEventListener('change',event=>{if(event.target.matches('[data-field]'))markTimelineDirty();});
if($('audio-tracks'))$('audio-tracks').addEventListener('input',event=>{if(event.target.matches('[data-field]'))markTimelineDirty();});
if($('audio-tracks'))$('audio-tracks').addEventListener('change',event=>{if(event.target.matches('[data-field]'))markTimelineDirty();});
if($('audio-track-add'))$('audio-track-add').addEventListener('click',()=>{
  const media=project?.media.find(item=>item.id===$('audio-track-source').value);if(!media||!['voice','music'].includes(media.kind))return;
  captureAudioTrackEdits();
  const duration=project.plan.segments.reduce((sum,item)=>sum+(item.end-item.start)/item.speed,0);
  const end=Math.min(media.metadata.duration,duration);
  project.plan.audio_tracks||=[];project.plan.audio_tracks.push({media_id:media.id,start:0,source_start:0,source_end:end,gain:media.kind==='music'?Math.min(.3,project.plan.music_volume):1});
  drawAudioTracks(project.plan);markTimelineDirty();
});
if($('audio-tracks'))$('audio-tracks').addEventListener('click',event=>{
  if(!event.target.closest('[data-remove-track]'))return;
  captureAudioTrackEdits();project.plan.audio_tracks.splice(Number(event.target.closest('[data-track-index]').dataset.trackIndex),1);
  drawAudioTracks(project.plan);markTimelineDirty();
});
if($('timeline-music-volume'))$('timeline-music-volume').addEventListener('input',markTimelineDirty);
if($('timeline-page-prev'))$('timeline-page-prev').addEventListener('click',()=>{if(timelinePage<=0||!project?.plan)return;captureVisibleTimelineEdits();captureAudioTrackEdits();timelinePage--;drawTimeline(project.plan);});
if($('timeline-page-next'))$('timeline-page-next').addEventListener('click',()=>{if(!project?.plan||timelinePage>=Math.ceil(project.plan.segments.length/TIMELINE_PAGE_SIZE)-1)return;captureVisibleTimelineEdits();captureAudioTrackEdits();timelinePage++;drawTimeline(project.plan);});
$('shots').addEventListener('click',event=>{
  const button=event.target.closest('[data-move]');if(!button)return;
  const item=button.closest('.timeline-shot');captureVisibleTimelineEdits();
  const index=Number(item.dataset.segmentIndex),next=index+(button.dataset.move==='up'?-1:1);
  if(next<0||next>=project.plan.segments.length)return;
  const [segment]=project.plan.segments.splice(index,1);project.plan.segments.splice(next,0,segment);drawTimeline(project.plan);
  markTimelineDirty();
});
act('save-timeline',async()=>{needProject();await persistTimeline();await refresh();notice('Timeline edits are saved as a new project version. Create a fresh preview to review them.');});
act('discard-timeline',async()=>{if(!project?.plan)return;timelineDirty=false;timelineBaseVersion=project.version;drawTimeline(project.plan);$('timeline-status').textContent='Unsaved changes discarded. Showing the latest saved timeline.';$('save-timeline').disabled=true;$('discard-timeline').disabled=true;$('approve').disabled=!project.review.preview_ready;$('export').disabled=!project.review.approved;});
$('password-toggle').addEventListener('click',()=>{
  const input=$('password'),button=$('password-toggle');
  const visible=input.type==='password';
  input.type=visible?'text':'password';
  button.setAttribute('aria-label',visible?'Hide password':'Show password');
  button.setAttribute('aria-pressed',String(visible));
  button.title=visible?'Hide password':'Show password';
  button.dataset.visible=String(visible);
});
function setAuthMode(mode){
  authMode=mode;const signup=mode==='register';window.SparrowPhone?.setMode(signup);
  $('signup-fields').hidden=!signup;
  for(const id of ['sparrow-name','nickname']){$(id).required=signup;$(id).disabled=!signup;}
  $('auth-submit').textContent=signup?'Create my Sparrow account':'Sign in';
  $('password').autocomplete=signup?'new-password':'current-password';$('password').minLength=signup?12:6;$('password').maxLength=128;
  for(const [id,active] of [['mode-register',signup],['mode-login',!signup]]){$(id).setAttribute('aria-pressed',String(active));$(id).classList.toggle('secondary',!active);}
  notice('');
}
$('mode-register').addEventListener('click',()=>setAuthMode('register'));
$('mode-login').addEventListener('click',()=>setAuthMode('login'));
$('auth-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=$('auth-submit');button.disabled=true;
  try{const body={email:$('email').value,password:$('password').value};if(authMode==='register'){body.sparrow_name=$('sparrow-name').value;body.nickname=$('nickname').value;if(window.SparrowPhone)Object.assign(body,await window.SparrowPhone.fields());}
    const result=await api('/auth/'+authMode,'POST',body);$('password').value='';notice('');
    if(authMode==='register'){
      try{if(await window.SparrowAccount.needsVerification()){await window.SparrowAccount.pending(result,session);return;}}
      catch(error){if(error.status===401){try{await api('/logout','POST',{});}catch{}notice('Sparrow could not open a registration session. If you already have an account, choose Sign in or Forgot password. No existing account was changed.');return;}throw error;}
    }
    await session();await returnPayment();
  }catch(err){notice(authMode==='login'&&err.status===401?err.message+' If you do not remember your password, choose Forgot password to recover access.':err.message);}finally{button.disabled=false;}
});
act('profile-open',async()=>{me=await api('/me');$('profile-name').value=me.sparrow_name||'';$('profile-nickname').value=me.nickname||'';$('profile-error').hidden=true;$('profile-dialog').showModal();});
$('profile-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('/profile','PUT',{sparrow_name:$('profile-name').value,nickname:$('profile-nickname').value});$('profile-dialog').close();await session();notice('Your Sparrow name and nickname are saved.');}catch(err){$('profile-error').textContent=err.message;$('profile-error').hidden=false;}});
act('profile-close',async()=>$('profile-dialog').close());
act('logout',async()=>{await api('/logout','POST',{});clearTimeout(pollTimer);location.href='/';});
act('new-project',async()=>{if(timelineDirty&&!confirm('Discard unsaved timeline edits and start another project?'))return;reset();});
$('project-list').addEventListener('click',async event=>{
  const card=event.target.closest('[data-project]');if(!card)return;
  if(timelineDirty&&!confirm('Discard unsaved timeline edits and switch projects?'))return;
  timelineDirty=false;
  const previous=current;current=card.dataset.project;markProjectSelection();notice('');
  try{await refresh();}catch(e){current=previous;markProjectSelection();notice(e.message);}
});
$('project-prev').addEventListener('click',()=>slideProjects(-1));
$('project-next').addEventListener('click',()=>slideProjects(1));
$('project-list').addEventListener('scroll',updateProjectArrows,{passive:true});
$('project-list').addEventListener('keydown',event=>{
  if(event.target!==$('project-list'))return;
  if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();slideProjects(event.key==='ArrowRight'?1:-1);}
});
window.addEventListener('resize',updateProjectArrows);
$('length-preset').addEventListener('change',()=>{if($('length-preset').value!=='custom')$('duration').value=$('length-preset').value;else $('duration').focus();});
$('project-form').addEventListener('submit',async e=>{e.preventDefault();notice('');try{if(current){if(workspaceMode==='film')await persistTimeline();await api('/projects/'+current+'/direction','PUT',{brief:$('brief').value,options:options()});notice('Direction saved. Rework the story if your idea, duration or shot count changed.');}else{const p=await api('/projects','POST',{brief:$('brief').value,options:options()});current=p.id;}await listProjects();await refresh();}catch(err){notice(err.message);}});
async function upload(file,kind){needProject();if(!$('rights').checked)throw Error('Confirm your permission to use the media first.');const form=new FormData();form.append('kind',kind);form.append('rights_confirmed','true');form.append('file',file);await api('/projects/'+current+'/media','POST',form);}
for(const [id,kind] of [['videos','video'],['voice-file','voice'],['music-file','music']])$(id).addEventListener('change',async()=>{notice('');try{needProject();for(const f of $(id).files){notice('Uploading '+f.name+'…');await upload(f,kind);}notice('Your media is ready.');await refresh();}catch(e){notice(e.message);}finally{$(id).value='';}});
act('analyze',async()=>{needProject();await api('/projects/'+current+'/analyze','POST',{});await refresh();});
act('direct',async()=>{needProject();if(workspaceMode==='film')await persistTimeline();await api('/projects/'+current+'/plan','POST',{instruction:''});await refresh();});
act('recommend-voice',async()=>{needProject();if(workspaceMode==='film')await persistTimeline();await api('/projects/'+current+'/voiceover','POST',{instruction:$('voice-direction').value});await refresh();});
act('save-script',async()=>{const draft=workspaceMode==='film'?makeTimelinePlan():{...project.plan};draft.voiceover=$('script').value;await api('/projects/'+current+'/plan','PUT',draft,workspaceMode==='film'?{'If-Match':String(timelineBaseVersion)}:{});timelineDirty=false;await refresh();notice('Your wording is saved.');});
act('preview',async()=>{needProject();if(workspaceMode==='film')await persistTimeline();await api('/projects/'+current+'/render/preview','POST',{});await refresh();});
act('revise',async()=>{needProject();if(!$('revision').value.trim())throw Error('Tell Sparrow what you want to change.');if(workspaceMode==='film')await persistTimeline();await api('/projects/'+current+'/plan','POST',{instruction:$('revision').value});await refresh();});
act('restore',async()=>{if(timelineDirty&&!confirm('Discard unsaved timeline edits and restore this saved version?'))return;timelineDirty=false;await api('/projects/'+current+'/restore/'+Number($('restore-version').value),'POST',{});await refresh();});
async function feedback(accepted){if(accepted){const checks=Object.fromEntries(Array.from($('review-checks').querySelectorAll('[data-review]'),input=>[input.dataset.review,input.checked]));await api('/projects/'+current+'/approval','POST',{version:project.version,preview_sha:project.review.preview_sha,checks});}const result=await api('/projects/'+current+'/feedback','POST',{accepted,note:$('revision').value,remember:$('remember')?.checked||false});notice(accepted?(result.learning_saved?'Your approval and opted-in learning example are saved.':'Your approval is saved.'):'Your feedback is saved. Use Rework the story to apply your change.');await refresh();}
act('approve',()=>feedback(true));act('reject',()=>feedback(false));
act('export',async()=>{needProject();if(timelineDirty)throw Error('Save the timeline and create a new preview before exporting.');if(me.payment_required&&!project.paid){const p=await api('/projects/'+current+'/checkout','POST',{});location.assign(p.url);return;}await api('/projects/'+current+'/render/export','POST',{});await refresh();});
act('delete-project',async()=>{if(!confirm('Delete this project and all of its uploaded media and videos?'))return;await api('/projects/'+current,'DELETE');reset();await listProjects();});
act('record',async()=>{
  needProject();if(!$('rights').checked)throw Error('Confirm your media permission before recording.');
  if(!navigator.mediaDevices||!window.MediaRecorder)throw Error('Recording is unavailable here. Upload a voice take instead, or use HTTPS/localhost.');
  mic=await navigator.mediaDevices.getUserMedia({audio:true});chunks=[];
  recorder=new MediaRecorder(mic);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  const recordingProject=current;
  recorder.onstop=async()=>{clearTimeout(recordingTimer);mic.getTracks().forEach(t=>t.stop());const mime=recorder.mimeType;const blob=new Blob(chunks,{type:mime});if(recordingUrl)URL.revokeObjectURL(recordingUrl);recordingUrl=URL.createObjectURL(blob);$('voice-playback').src=recordingUrl;$('voice-playback').hidden=false;$('stop-record').hidden=true;$('record').hidden=false;
    try{if(current!==recordingProject)throw Error('Project changed during recording. Download your take from the audio control and upload it to the right project.');await upload(new File([blob],mime.includes('mp4')?'my-voice.m4a':'my-voice.webm',{type:mime}),'voice');notice('Your voice take is ready.');await refresh();}catch(e){notice(e.message);}};
  recorder.start();$('record').hidden=true;$('stop-record').hidden=false;notice('Recording your voice…');recordingTimer=setTimeout(()=>recorder.state==='recording'&&recorder.stop(),600000);
});
act('stop-record',async()=>{if(recorder?.state==='recording')recorder.stop();});
act('memory-open',async()=>{me=await api('/me');$('memory-enabled').checked=!!me.memory.enabled;$('memory-text').value=me.memory.preferences||'';$('memory-notes').replaceChildren();for(const item of me.memory.feedback||[]){const li=document.createElement('li');li.textContent=item.note;$('memory-notes').append(li);}$('memory-dialog').showModal();});
$('memory-form')?.addEventListener('submit',async e=>{e.preventDefault();try{await api('/memory','PUT',{enabled:$('memory-enabled').checked,preferences:$('memory-text').value});$('memory-dialog').close();notice('Your memory preferences are saved.');}catch(err){notice(err.message);}});
act('memory-reset',async()=>{await api('/memory','DELETE');$('memory-enabled').checked=false;$('memory-text').value='';$('memory-notes').replaceChildren();notice('All creator memory and feedback history have been reset.');});
act('memory-close',async()=>$('memory-dialog').close());
async function returnPayment(){const q=new URLSearchParams(location.search);const tid=q.get('transaction_id');const booking=q.get('booking');if(tid&&booking&&/^[a-f0-9]{32}$/.test(booking)){await api('/ecosystem/booking/requests/'+booking+'/payment/verify/'+encodeURIComponent(tid),'POST',{});location.replace('/ecosystem/book?payment=verified');return;}if(tid){const r=await api('/payments/verify/'+encodeURIComponent(tid),'POST',{});current=r.project_id;history.replaceState({},'',workspaceMode==='film'?'/film':'/studio');await listProjects();await refresh();notice('Payment verified. You can create your full-quality export.');}}
window.addEventListener('beforeunload',()=>mic?.getTracks().forEach(t=>t.stop()));
session().then(async()=>{const requested=new URLSearchParams(location.search).get('project');if(requested&&/^[a-f0-9]{32}$/.test(requested)){current=requested;await refresh();}await returnPayment();}).catch(async e=>{if(e.status===401){try{await api('/logout','POST',{});}catch{}return;}notice(e.message);});

act('learning-open',async()=>{const state=await api('/learning');$('learning-enabled').checked=state.enabled;$('learning-count').textContent=state.examples+' approved edit examples collected for review.';$('learning-dialog').showModal();});
$('learning-form').addEventListener('submit',async event=>{event.preventDefault();try{await api('/learning','PUT',{enabled:$('learning-enabled').checked});$('learning-dialog').close();notice($('learning-enabled').checked?'Your choice is saved. Future approvals can contribute edit examples.':'Collection is off and your collected examples were deleted.');}catch(error){notice(error.message);}});
act('learning-clear',async()=>{await api('/learning/examples','DELETE');$('learning-count').textContent='0 approved edit examples collected for review.';notice('Your collected examples were deleted.');});
act('learning-close',async()=>$('learning-dialog').close());

act('capture-guide',async()=>{const guide=await api('/capture-guide','POST',{brief:$('brief').value,options:options()});const panel=$('capture-guidance');panel.replaceChildren();const context=document.createElement('p');context.textContent='Your direction: '+guide.intent.brief+(guide.intent.visual_intent?' · '+guide.intent.visual_intent:'')+(guide.intent.shooting_conditions?' · '+guide.intent.shooting_conditions:'');panel.append(context);for(const section of guide.sections){const title=document.createElement('h3');title.textContent=section.title;const list=document.createElement('ul');for(const advice of section.advice){const item=document.createElement('li');item.textContent=advice;list.append(item);}panel.append(title,list);}const limits=document.createElement('p');limits.className='fine';limits.textContent=guide.limits;panel.append(limits);panel.hidden=false;});
for(const id of ['brief','visual-intent','shooting-conditions','audience','message','creator-style','brand-type','aspect'])$(id)?.addEventListener('input',()=>{$('capture-guidance').hidden=true;});

function updatePostingGuidance(){const selected=$('posting-destination').value;const profile=postingDestinations[selected];$('posting-details-field').hidden=!['other','website','facebook'].includes(selected);$('posting-details').required=selected==='other';$('posting-guidance').textContent=profile?profile.guidance+' Your chosen feeling, duration and format stay in your control.':'';$('use-posting-format').hidden=!profile?.recommended_aspect;$('capture-guidance').hidden=true;}
$('posting-destination').addEventListener('change',updatePostingGuidance);
$('posting-details').addEventListener('input',()=>{$('capture-guidance').hidden=true;});
$('feel').addEventListener('input',()=>{$('capture-guidance').hidden=true;});
act('use-posting-format',async()=>{const aspect=postingDestinations[$('posting-destination').value]?.recommended_aspect;if(aspect){$('aspect').value=aspect;$('capture-guidance').hidden=true;notice('Suggested format selected. Save your direction to apply it to your project.');}});

function updateWorkspaceUI(){const film=workspaceMode==='film';if($('memory-open'))$('memory-open').hidden=film;if($('remember-setting'))$('remember-setting').hidden=film;if(film&&$('remember'))$('remember').checked=false;if($('film-direction'))$('film-direction').hidden=!film;if($('film-scope'))$('film-scope').hidden=!film;if($('creator-content-picker'))$('creator-content-picker').hidden=film;$('workspace-eyebrow').textContent=film?'SPARROW HOLLYWOOD EDITING STUDIO':"LET'S MAKE SOMETHING YOU LOVE";$('workspace-title').textContent=film?'Create your film project.':'What are we creating today?';$('new-project').textContent=film?'New film project':'New creation';if($('film-genre'))$('film-genre').required=film;}
