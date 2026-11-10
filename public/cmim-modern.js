/* CMIM / Motion system: progressive enhancement, no hidden content without JS. */
(()=>{"use strict";
 if(!document.documentElement)return;
 const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 function init(){
   if(!document.body)return;
   const bar=document.createElement('div');bar.className='cmim-motion-progress';bar.setAttribute('aria-hidden','true');document.body.append(bar);
   let ticking=false;
   const progress=()=>{
     const max=Math.max(1,document.documentElement.scrollHeight-innerHeight);
     document.documentElement.style.setProperty('--cmim-scroll',String(Math.max(0,Math.min(1,scrollY/max))));
     ticking=false;
   };
   window.addEventListener('scroll',()=>{if(ticking)return;ticking=true;requestAnimationFrame(progress)},{passive:true});
   progress();
   if(reduced||!('IntersectionObserver'in window))return;
   const selector='.cmim-homepage .portal-section .section-head,.cmim-homepage .inhouse-how-step,.cmim-homepage .cmim-league-card,.cmim-homepage .cmim-division-card,.cmim-account-page .cmim-card,.cmim-league-hub .cmim-circuito-card';
   const io=new IntersectionObserver((entries)=>{
     for(const entry of entries){if(!entry.isIntersecting)continue;entry.target.classList.add('cmim-reveal-ready');io.unobserve(entry.target);}
   },{threshold:.08,rootMargin:'0px 0px -30px 0px'});
   document.querySelectorAll(selector).forEach((node,i)=>{
     node.style.animationDelay=(i%4*60)+'ms';io.observe(node);
   });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
