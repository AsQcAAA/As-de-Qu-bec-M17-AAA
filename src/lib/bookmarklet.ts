/**
 * Favori « Vidéo M17 » (bookmarklet) : lancé sur une page Facebook, il relit la
 * page (avec la session de la personne, dans son propre navigateur), en extrait
 * les fragments contenant des liens vidéo et ouvre l'outil avec ces fragments
 * dans l'adresse (#fb=…). Rien ne passe par un serveur. L'analyse finale est
 * faite par extractFacebookVideos, comme pour un code source collé.
 *
 * Code écrit sur une ligne, sans commentaire, car il est stocké dans un favori.
 */
export function buildBookmarklet(origin: string): string {
  const code = String.raw`(async()=>{const A=${JSON.stringify(origin + "/video-facebook")};const K=/"(browser_native_hd_url|browser_native_sd_url|playable_url_quality_hd|playable_url|hd_src|sd_src)"\s*:\s*"(?:[^"\\]|\\.)+"/g;const B=/"base_url"\s*:\s*"(?:[^"\\]|\\.)+"/g;const M=/https?:(?:\\?\/){2}[^"'\s<>]*?fbcdn\.net[^"'\s<>]*?\.mp4[^"'\s<>]*/g;let t=document.documentElement.outerHTML;try{const r=await fetch(location.href,{credentials:"include"});t+="\n"+await r.text()}catch(e){}t=t.replace(/&quot;/g,'"').replace(/&amp;/g,"&");const o=new Set();for(const m of t.matchAll(K))o.add(m[0]);for(const m of t.matchAll(B)){const i=m.index,s=t.lastIndexOf("{",i),e=t.indexOf("}",i);o.add(t.slice(Math.max(s,i-1500),e<0?i+m[0].length:e+1))}for(const m of t.matchAll(M))o.add(m[0]);document.querySelectorAll("video").forEach(v=>{if(/^https:/.test(v.src))o.add(v.src)});if(!o.size){alert("Aucune vidéo trouvée sur cette page. Ouvrez la vidéo elle-même (touchez la date de la publication), rechargez la page, puis réessayez.");return}location.href=A+"#fb="+encodeURIComponent(JSON.stringify({t:document.title,d:[...o].slice(0,80).join("\n")}))})()`;
  return "javascript:" + encodeURIComponent(code);
}
