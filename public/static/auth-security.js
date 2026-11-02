/* Same-origin account request protection. The token is never stored beyond this page. */
(()=>{'use strict';let token=null;
async function protectedHeaders(path,method='GET',headers={}){
  const upper=method.toUpperCase(),protectedPath=path.startsWith('/api/auth/')||path==='/api/logout'||path.startsWith('/api/account/');
  const result=new Headers(headers);
  if(!protectedPath||['GET','HEAD','OPTIONS'].includes(upper))return Object.fromEntries(result.entries());
  if(!token){
    let response;
    try{response=await fetch('/api/auth/csrf',{credentials:'same-origin',cache:'no-store'});}
    catch(error){if(error instanceof TypeError)throw Error(`Sparrow could not reach ${location.origin}. Check that Sparrow is running at this address, then try again.`);throw error;}
    const body=await response.json().catch(()=>({}));
    if(!response.ok||typeof body.csrf_token!=='string'||!body.csrf_token)throw Error('Sparrow could not prepare a secure account request. Reload the page and try again.');
    token=body.csrf_token;
  }
  result.set('X-Sparrow-CSRF',token);
  return Object.fromEntries(result.entries());
}
window.SparrowAuthSecurity={protectedHeaders};
})();
