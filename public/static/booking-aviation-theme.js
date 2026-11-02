(function(){
  const button=document.getElementById('theme-toggle');
  if(!button)return;
  const storageKey='sparrow-booking-theme';
  let saved='';
  try{saved=localStorage.getItem(storageKey)||'';}catch{}
  const prefersDark=typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches;
  const initial=saved==='dark'||saved==='light'?saved:(prefersDark?'dark':'light');
  function apply(theme){
    document.body.dataset.theme=theme;
    button.textContent=theme==='dark'?'Light mode':'Dark mode';
    button.setAttribute('aria-label','Switch to '+(theme==='dark'?'light':'dark')+' mode');
    button.setAttribute('aria-pressed',String(theme==='dark'));
    try{localStorage.setItem(storageKey,theme);}catch{}
  }
  apply(initial);
  button.addEventListener('click',()=>apply(document.body.dataset.theme==='dark'?'light':'dark'));
})();
