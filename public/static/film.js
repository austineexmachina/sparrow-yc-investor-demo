// Movie-only navigation hooks. Production actions use the shared authenticated controller.
for(const link of document.querySelectorAll('.movie-steps a')){
  link.addEventListener('click',event=>{
    const target=document.querySelector(link.getAttribute('href'));
    if(!target)return;
    event.preventDefault();
    target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
    const focusable=target.querySelector('input,select,textarea,button');
    if(focusable)focusable.focus({preventScroll:true});
  });
}
