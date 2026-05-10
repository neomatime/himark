/* HIMARK · main.js
   Shared interactive layer for all pages.
   In multi-page mode, [data-page] links resolve to the right URL
   based on the current document's location depth (data-location on <body>). */

(function(){
'use strict';

/* PAGE URL MAP & RESOLVER */
const PAGE_URLS={
  home:'index.html',
  doctrine:'about.html',
  mandates:'services.html',
  method:'process.html',
  airass:'product.html',
  principals:'team.html',
  intake:'apply.html',
  privacy:'privacy.html',
  terms:'terms.html',
  cookies:'cookies.html',
  security:'security.html',
  signin:'auth/signin.html',
  mfa:'auth/mfa.html',
  register:'auth/register.html',
  reset:'auth/reset-password.html',
  dashboard:'dashboard/dashboard.html'
};
function pageUrl(id){
  const t=PAGE_URLS[id];if(!t)return null;
  const loc=(document.body.dataset.location||'root');
  return loc==='root'?t:'../'+t;
}
function goP(id){
  const url=pageUrl(id);
  if(!url)return;
  // close panel first so it doesn't flash open during reload
  const panel=document.getElementById('menu-panel');
  const overlay=document.getElementById('menuOverlay');
  panel&&panel.classList.remove('open');
  overlay&&overlay.classList.remove('on');
  window.location.href=url;
}
window.goP=goP;

/* CURRENT PAGE ID — read from body data attribute */
const cur=(document.body.dataset.page||'home');
const authPages=['signin','mfa','register','reset','dashboard'];
if(authPages.includes(cur))document.body.classList.add('auth-mode');

/* MPA: ensure the page on this document is visible (.active) */
(function(){
  const p=document.querySelector('.page');
  if(p&&!p.classList.contains('active'))p.classList.add('active');
})();

/* CURSOR */
const cd=document.getElementById('cd'),cr=document.getElementById('cr');
let mx=-100,my=-100,rx=-100,ry=-100;
if(cd&&cr){
  document.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;});
  (function aC(){cd.style.cssText=`left:${mx}px;top:${my}px`;rx+=(mx-rx)*.11;ry+=(my-ry)*.11;cr.style.cssText=`left:${rx}px;top:${ry}px`;requestAnimationFrame(aC);})();
  document.querySelectorAll('a,button,input,select,textarea,.principal-card,.imgm-card').forEach(el=>{el.addEventListener('mouseenter',()=>document.body.classList.add('ch'));el.addEventListener('mouseleave',()=>document.body.classList.remove('ch'));});
}

/* PARTICLES */
const cv=document.getElementById('cvs');
if(cv){
  const cx2=cv.getContext('2d');
  let pts=[];
  function rsz(){cv.width=window.innerWidth;cv.height=window.innerHeight;}
  rsz(); window.addEventListener('resize',rsz);
  for(let i=0;i<35;i++)pts.push({x:Math.random()*window.innerWidth,y:Math.random()*window.innerHeight,r:Math.random()*1.2+.3,vx:(Math.random()-.5)*.12,vy:(Math.random()-.5)*.12,o:Math.random()*.22+.05});
  (function dp(){cx2.clearRect(0,0,cv.width,cv.height);pts.forEach(p=>{p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x=cv.width;if(p.x>cv.width)p.x=0;if(p.y<0)p.y=cv.height;if(p.y>cv.height)p.y=0;cx2.beginPath();cx2.arc(p.x,p.y,p.r,0,Math.PI*2);cx2.fillStyle=`rgba(95,129,144,${p.o})`;cx2.fill();});requestAnimationFrame(dp);})();
}

/* MENU PANEL */
const menuTrigger=document.getElementById('menu-trigger');
const menuPanel=document.getElementById('menu-panel');
const menuOverlay=document.getElementById('menuOverlay');
const menuClose=document.getElementById('menuClose');
let menuOpen=false;
function openMenu(){if(!menuPanel)return;menuOpen=true;menuPanel.classList.add('open');menuOverlay&&menuOverlay.classList.add('on');}
function closeMenu(){if(!menuPanel)return;menuOpen=false;menuPanel.classList.remove('open');menuOverlay&&menuOverlay.classList.remove('on');}
menuTrigger&&menuTrigger.addEventListener('click',openMenu);
menuOverlay&&menuOverlay.addEventListener('click',closeMenu);
menuClose&&menuClose.addEventListener('click',closeMenu);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menuOpen)closeMenu();});

/* PAGE THEME — light-nav body class for inverted contrast on light pages */
const pagesWithDarkHero=['home'];
function getActivePage(){return document.querySelector('.page.active')||document.querySelector('.page');}
function updBodyTheme(){
  const ap=getActivePage();
  if(!ap)return;
  const s=ap.scrollTop;
  let needsLight=false;
  if(pagesWithDarkHero.includes(cur)){
    needsLight=s>window.innerHeight*0.6;
  } else {
    needsLight=s>window.innerHeight*0.5;
  }
  document.body.classList.toggle('light-nav',needsLight);
}
document.querySelectorAll('.page').forEach(p=>p.addEventListener('scroll',updBodyTheme,{passive:true}));
updBodyTheme();

/* [data-page] LINK NAVIGATION — resolve to URLs in MPA mode.
   Skip <body>; the body uses data-page only as a marker for the current page. */
document.querySelectorAll('[data-page]').forEach(el=>{
  if(el===document.body)return;
  el.addEventListener('click',e=>{
    e.preventDefault();
    const pg=el.dataset.page;
    if(pg)goP(pg);
  });
});

/* REVEALS */
function tRev(cont){
  if(!cont)return;
  const els=cont.querySelectorAll('.r3d,.r3d-l,.r3d-r');
  setTimeout(()=>{els.forEach(el=>{const r=el.getBoundingClientRect();if(r.top<window.innerHeight+20)el.classList.add('in');});},60);
  cont.addEventListener('scroll',()=>{els.forEach(el=>{if(!el.classList.contains('in')){const r=el.getBoundingClientRect();if(r.top<window.innerHeight-50)el.classList.add('in');}});},{passive:true});
}
tRev(getActivePage());

/* MAGNETIC BUTTONS — gentle, scoped, with reset on leave */
(function(){
  const candidates=document.querySelectorAll('.btn-dk, .btn-lt, .btn-ghost');
  candidates.forEach(b=>{
    if(b.closest('form, .itk-aside, .chat-win, #mute-btn, .chat-toggle-btn, .hero-meta-r'))return;
    let raf=null;
    b.addEventListener('mousemove',e=>{
      if(raf)cancelAnimationFrame(raf);
      raf=requestAnimationFrame(()=>{
        const r=b.getBoundingClientRect();
        const dx=(e.clientX-r.left-r.width/2)*.10;
        const dy=(e.clientY-r.top-r.height/2)*.10;
        b.style.transform=`translate(${dx}px,${dy}px)`;
        b.style.transition='transform .15s var(--ease)';
      });
    });
    b.addEventListener('mouseleave',()=>{
      if(raf)cancelAnimationFrame(raf);
      b.style.transform='';
      b.style.transition='transform .45s var(--ease)';
    });
  });
})();

/* COUNTERS */
function aC2(el){const t=parseInt(el.dataset.count),sfx=el.dataset.suffix??'+',dur=1800,s=performance.now();(function tick(n){const p=Math.min((n-s)/dur,1),e=1-Math.pow(1-p,3);el.textContent=Math.round(e*t)+(p===1?sfx:'');if(p<1)requestAnimationFrame(tick);})(performance.now());}
const cobs=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting&&!e.target.dataset.done){e.target.dataset.done='1';aC2(e.target);}}),{threshold:.5});
document.querySelectorAll('[data-count]').forEach(el=>cobs.observe(el));

/* AUDIO (home only) */
let aCtx=null,mGain=null,muted=true;
const mBtn=document.getElementById('mute-btn');
function iAudio(){
  if(aCtx)return;
  aCtx=new(window.AudioContext||window.webkitAudioContext)();
  mGain=aCtx.createGain();mGain.gain.value=0;mGain.connect(aCtx.destination);
  [[55,.055],[110,.025],[220,.012]].forEach(([f,g])=>{const o=aCtx.createOscillator(),gn=aCtx.createGain();o.type='sine';o.frequency.value=f;gn.gain.value=g;o.connect(gn);gn.connect(mGain);o.start();});
  const bl=aCtx.sampleRate*3,buf=aCtx.createBuffer(1,bl,aCtx.sampleRate);const d=buf.getChannelData(0);for(let i=0;i<bl;i++)d[i]=(Math.random()*2-1);
  const ns=aCtx.createBufferSource();ns.buffer=buf;ns.loop=true;const f=aCtx.createBiquadFilter();f.type='bandpass';f.frequency.value=320;f.Q.value=10;const gn=aCtx.createGain();gn.gain.value=.008;ns.connect(f);f.connect(gn);gn.connect(mGain);ns.start();
  const lfo=aCtx.createOscillator();const lg=aCtx.createGain();lfo.frequency.value=0.04;lg.gain.value=100;lfo.connect(lg);lg.connect(f.frequency);lfo.start();
}
mBtn&&mBtn.addEventListener('click',()=>{iAudio();muted=!muted;mGain&&mGain.gain.setTargetAtTime(muted?0:.7,aCtx.currentTime,.35);mBtn.classList.toggle('muted',muted);});

/* CHAT + VOICE (Atlas assistant) — DISABLED for now, will be wired back later.
   The chat widget DOM still exists in the page shell; it just won't open or
   send messages until this block is re-enabled. Stub the global handlers
   that inline `onclick="..."` attributes call so they don't throw. */
window.sM=function(){};
window.sQ=function(){};
window.swT=function(){};
window.tV=function(){};

/*
// CHAT (home only)
const SYS=`You are Atlas, the HIMARK assistant. HIMARK is a premium strategic growth consultancy in South Africa under Good Global Holdings. Engagement tiers: Signature Partner, Growth Partner, Private Client (no prices unless asked). AIRaaS product. LeadSense AI qualification. Founder: Neo Matime. Randburg, Gauteng. Introduce yourself as Atlas when asked. Be sophisticated, confident, brief — max 3 sentences unless detail needed.`;
let hist=[],busy=false;
function ts2(){return new Date().toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'});}
function aM(r,t){const m=document.getElementById('chMsgs');if(!m)return;const d=document.createElement('div');d.className='msg '+r;d.innerHTML=`<div class="msg-b">${t}</div><div class="msg-t">${ts2()}</div>`;m.appendChild(d);m.scrollTop=m.scrollHeight;}
function shT(){const m=document.getElementById('chMsgs');if(!m)return;const d=document.createElement('div');d.className='msg bot typing-i';d.id='ti';d.innerHTML='<div class="typ-d"><span></span><span></span><span></span></div>';m.appendChild(d);m.scrollTop=m.scrollHeight;}
function rmT(){const e=document.getElementById('ti');if(e)e.remove();}
async function cC(msg){hist.push({role:'user',content:msg});shT();busy=true;try{const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1000,system:SYS,messages:hist})});const d=await res.json();const rep=d.content?.[0]?.text||'Please email us at info@himark.co.za';hist.push({role:'assistant',content:rep});rmT();aM('bot',rep);}catch{rmT();aM('bot','Reach us at <strong>info@himark.co.za</strong>');}busy=false;}
async function sM(){if(busy)return;const inp=document.getElementById('chIn');if(!inp)return;const t=inp.value.trim();if(!t)return;inp.value='';const qr=document.getElementById('qr');if(qr)qr.style.display='none';aM('user',t);await cC(t);}
function sQ(b){if(busy)return;const t=b.textContent;const qr=document.getElementById('qr');if(qr)qr.style.display='none';aM('user',t);cC(t);}
window.sQ=sQ;window.sM=sM;
const chIn=document.getElementById('chIn');
chIn&&chIn.addEventListener('keydown',e=>{if(e.key==='Enter')sM();});

const cTgl=document.getElementById('chatTgl'),cWin=document.getElementById('chatWin');
let cOpen=false,greeted=false;
cTgl&&cTgl.addEventListener('click',()=>{cOpen=!cOpen;cTgl.classList.toggle('open',cOpen);cWin&&cWin.classList.toggle('open',cOpen);if(cOpen&&!greeted){greeted=true;setTimeout(()=>aM('bot','I’m Atlas — HIMARK’s assistant. How can I help?'),400);}});

function swT(t){const cp=document.getElementById('cpanel'),vp=document.getElementById('vpanel'),tc=document.getElementById('tChat'),tv=document.getElementById('tVoice');if(cp)cp.style.display=t==='chat'?'':'none';vp&&vp.classList.toggle('on',t==='voice');tc&&tc.classList.toggle('active',t==='chat');tv&&tv.classList.toggle('active',t==='voice');}
window.swT=swT;

// VOICE (home only)
let recog=null,lstn=false;
function tV(){
  const vStat=document.getElementById('vStat'),vOrb=document.getElementById('vOrb'),vWave=document.getElementById('vWave'),vMic=document.getElementById('vMic'),qr=document.getElementById('qr');
  if(!('webkitSpeechRecognition'in window)&&!('SpeechRecognition'in window)){if(vStat)vStat.textContent='NOT SUPPORTED';return;}
  if(lstn){recog.stop();return;}
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  recog=new SR();recog.lang='en-ZA';
  recog.onstart=()=>{lstn=true;vOrb&&vOrb.classList.add('on');vWave&&vWave.classList.add('on');if(vStat)vStat.textContent='LISTENING…';if(vMic){vMic.textContent='STOP';vMic.classList.add('rec');}};
  recog.onresult=async e=>{const t=e.results[0][0].transcript;if(vStat)vStat.textContent=`"${t}"`;swT('chat');if(qr)qr.style.display='none';aM('user',t);await cC(t);};
  recog.onend=()=>{lstn=false;vOrb&&vOrb.classList.remove('on');vWave&&vWave.classList.remove('on');if(vStat)vStat.textContent='TAP TO SPEAK';if(vMic){vMic.textContent='START SPEAKING';vMic.classList.remove('rec');}};
  recog.onerror=()=>recog.onend();
  recog.start();
}
window.tV=tV;
*/

/* INTAKE FORM */
function submitIntake(e){
  e.preventDefault();
  const form=e.target;
  const submit=form.querySelector('.itk-submit');
  submit.textContent='SUBMITTING…';submit.disabled=true;
  setTimeout(()=>{
    submit.textContent='RECEIVED · UNDER REVIEW';
    submit.style.background='#4ade80';
    submit.style.color='#0E1822';
    setTimeout(()=>{form.reset();submit.disabled=false;submit.textContent='Submit for Review';submit.style.background='';submit.style.color='';},3500);
  },1200);
  return false;
}
window.submitIntake=submitIntake;

/* LEGAL PAGES — TOC smooth-scroll + active-state spy */
(function(){
  function bind(pageId){
    const page=document.getElementById(pageId);
    if(!page)return;
    const tocLinks=page.querySelectorAll('.lgl-toc-item');
    const sections=page.querySelectorAll('.lgl-section');
    tocLinks.forEach(link=>{
      link.addEventListener('click',e=>{
        e.preventDefault();
        const id=link.dataset.target;
        const target=page.querySelector('#'+id);
        if(!target)return;
        const offset=target.offsetTop-100;
        page.scrollTo({top:offset,behavior:'smooth'});
      });
    });
    page.addEventListener('scroll',()=>{
      const top=page.scrollTop;
      let active=null;
      sections.forEach(sec=>{
        if(sec.offsetTop-140<=top)active=sec.id;
      });
      tocLinks.forEach(l=>l.classList.toggle('active',l.dataset.target===active));
    },{passive:true});
  }
  bind('page-privacy');
  bind('page-terms');
  bind('page-cookies');
  bind('page-security');
})();

/* HOME HERO — scroll-driven canvas frame-sequence playback.
   150 sequential JPEGs are preloaded; the user's scroll position through a
   300vh "spacer" below the sticky hero scrubs the canvas from frame 0 to
   frame 149. Result: a cinematic film sequence the visitor scrubs by hand.
   - Frame index is lerped toward target each RAF tick → buttery smooth
     even when the scroll jumps (mouse-wheel ticks, touch flings, anchor jumps).
   - Frames are preloaded in batches of 12 in priority order so the first
     frames are usable almost immediately and the canvas can fade in.
   - Drawing is GPU-accelerated via the canvas, with a soft blur applied
     during fast scrubs for the premium "in motion" feel.
   - Falls back to the looping .hero-video if frames fail to load or when
     prefers-reduced-motion is set. */
(function(){
  const page=document.getElementById('page-home');
  if(!page)return;
  const hero=page.querySelector('.hero');
  const canvas=hero&&hero.querySelector('.hero-canvas');
  const spacer=page.querySelector('.hero-spacer');
  if(!hero||!canvas||!spacer)return;

  const reduceMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  if(reduceMotion)return;  // CSS already collapses spacer + hides canvas

  const FRAME_COUNT=150;
  const FRAME_PATH=i=>'images/hero-scroll/ezgif-frame-'+String(i).padStart(3,'0')+'.jpg';

  const ctx=canvas.getContext('2d',{alpha:false});
  let dpr=Math.min(window.devicePixelRatio||1,2);

  function sizeCanvas(){
    dpr=Math.min(window.devicePixelRatio||1,2);
    const w=hero.offsetWidth;
    const h=hero.offsetHeight;
    canvas.width=Math.round(w*dpr);
    canvas.height=Math.round(h*dpr);
    canvas.style.width=w+'px';
    canvas.style.height=h+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  sizeCanvas();
  window.addEventListener('resize',()=>{sizeCanvas();kick();},{passive:true});

  // Preload — prioritise key anchor frames first (0, 75, 149) so the
  // canvas can paint something quickly while the rest stream in.
  const frames=new Array(FRAME_COUNT);
  let firstReady=false;
  let totalLoaded=0;

  function loadOne(i){
    return new Promise(resolve=>{
      const img=new Image();
      img.decoding='async';
      img.onload=()=>{
        frames[i]=img;
        totalLoaded++;
        if(!firstReady&&i===0){
          firstReady=true;
          canvas.classList.add('is-ready');
          drawAt(0);
        }
        resolve();
      };
      img.onerror=()=>resolve();  // skip broken; nearest-frame fallback covers it
      img.src=FRAME_PATH(i+1);
    });
  }
  async function preloadAll(){
    // anchor: 0, mid, last → fast first paint
    await Promise.all([loadOne(0),loadOne(Math.floor(FRAME_COUNT/2)),loadOne(FRAME_COUNT-1)]);
    kick();
    // then stream the rest in chunks
    const remaining=[];
    for(let i=0;i<FRAME_COUNT;i++)if(!frames[i])remaining.push(i);
    const BATCH=12;
    for(let s=0;s<remaining.length;s+=BATCH){
      await Promise.all(remaining.slice(s,s+BATCH).map(loadOne));
      kick();
    }
  }

  function nearestLoaded(i){
    // walk outward from i to find the closest decoded frame
    for(let d=0;d<FRAME_COUNT;d++){
      const a=i-d, b=i+d;
      if(a>=0&&frames[a])return frames[a];
      if(b<FRAME_COUNT&&frames[b])return frames[b];
    }
    return null;
  }

  function drawAt(idx){
    const i=Math.max(0,Math.min(FRAME_COUNT-1,Math.round(idx)));
    const img=frames[i]||nearestLoaded(i);
    if(!img||!img.naturalWidth)return;
    const cw=hero.offsetWidth;
    const ch=hero.offsetHeight;
    const iw=img.naturalWidth;
    const ih=img.naturalHeight;
    // cover-fit: scale up to fill the hero, preserving aspect, centred.
    const scale=Math.max(cw/iw,ch/ih);
    const dw=iw*scale;
    const dh=ih*scale;
    const dx=(cw-dw)/2;
    const dy=(ch-dh)/2;
    ctx.fillStyle='#0E1822';
    ctx.fillRect(0,0,cw,ch);
    ctx.drawImage(img,dx,dy,dw,dh);
  }

  let currentFrame=0;
  let targetFrame=0;
  let raf=null;
  let scrubTimer=null;

  function getTarget(){
    const sr=spacer.getBoundingClientRect();
    const total=spacer.offsetHeight||1;
    // scrolled = how far past the spacer's top we've travelled in viewport coords
    const scrolled=Math.max(0,-sr.top);
    const t=Math.max(0,Math.min(1,scrolled/total));
    return t*(FRAME_COUNT-1);
  }

  function loop(){
    targetFrame=getTarget();
    const diff=targetFrame-currentFrame;
    // close enough? snap and pause RAF — saves battery
    if(Math.abs(diff)<0.04){
      currentFrame=targetFrame;
      drawAt(currentFrame);
      raf=null;
      // remove "scrubbing" state shortly after motion stops
      if(scrubTimer)clearTimeout(scrubTimer);
      scrubTimer=setTimeout(()=>canvas.classList.remove('is-scrubbing'),140);
      return;
    }
    // smoothing factor — controls feel. .22 = premium-tactile.
    currentFrame+=diff*0.22;
    // mark "in motion" for the soft blur class
    if(Math.abs(diff)>1.2)canvas.classList.add('is-scrubbing');
    drawAt(currentFrame);
    raf=requestAnimationFrame(loop);
  }
  function kick(){if(raf)return;raf=requestAnimationFrame(loop);}

  page.addEventListener('scroll',kick,{passive:true});
  window.addEventListener('scroll',kick,{passive:true});

  preloadAll();
})();

/* PRINCIPALS — scroll choreography (explosion → assembly → explosion) + hover modal */
(function(){
  const cards=Array.from(document.querySelectorAll('.principal-card'));
  if(!cards.length)return;

  const scatter=[
    {x:-340,y:-220,r:-26},
    {x:-140,y:280, r:-10},
    {x:140, y:280, r:10},
    {x:340, y:-220,r:26},
  ];

  cards.forEach(card=>{
    const q=card.querySelector('.pc-doctrine-q');
    if(!q)return;
    const full=q.dataset.quote||'';
    let timer=null,i=0,typed='';
    function step(){
      if(i>=full.length){timer=null;return;}
      typed+=full.charAt(i);i++;
      q.textContent=typed;
      timer=setTimeout(step,18+Math.random()*22);
    }
    card.addEventListener('mouseenter',()=>{
      if(timer)clearTimeout(timer);
      if(!typed||typed.length<full.length)step();
    });
    card.addEventListener('mouseleave',()=>{
      if(timer){clearTimeout(timer);timer=null;}
    });
  });

  const section=document.querySelector('.prn-section');
  if(!section)return;

  function getScrollContainer(){
    return section.closest('.page')||document.scrollingElement;
  }

  function applyScatter(progress){
    cards.forEach((card,idx)=>{
      const s=scatter[idx]||scatter[scatter.length-1];
      let px,py,pr,po,ps;
      if(progress<=0.5){
        const t=progress*2;
        const eased=1-Math.pow(1-t,3);
        px=s.x*(1-eased);
        py=s.y*(1-eased);
        pr=s.r*(1-eased);
        po=eased;
        ps=0.92+0.08*eased;
      } else {
        const t=(progress-0.5)*2;
        const eased=Math.pow(t,2);
        const dx=s.x*1.15;
        const dy=s.y*1.15;
        const dr=s.r*1.2;
        px=dx*eased;
        py=dy*eased;
        pr=dr*eased;
        po=1-eased;
        ps=1-0.06*eased;
      }
      card.style.setProperty('--px',px.toFixed(1)+'px');
      card.style.setProperty('--py',py.toFixed(1)+'px');
      card.style.setProperty('--pr',pr.toFixed(2)+'deg');
      card.style.setProperty('--po',po.toFixed(3));
      card.style.setProperty('--ps',ps.toFixed(3));
    });
  }

  let raf=null;
  function update(){
    raf=null;
    const sc=getScrollContainer();
    if(!sc)return;
    const rect=section.getBoundingClientRect();
    const vh=window.innerHeight;
    const sectionH=rect.height;
    const travel=vh+sectionH;
    const traveled=vh-rect.top;
    let progress=traveled/travel;
    progress=Math.max(0,Math.min(1,progress));
    if(progress>0.18){
      cards.forEach(c=>c.classList.add('in-view'));
    }
    applyScatter(progress);
  }

  function onScroll(){
    if(raf)return;
    raf=requestAnimationFrame(update);
  }

  function bindScroll(){
    const sc=getScrollContainer();
    if(!sc)return;
    sc.addEventListener('scroll',onScroll,{passive:true});
    window.addEventListener('resize',onScroll,{passive:true});
    update();
  }

  bindScroll();

  const modal=document.getElementById('prnModal');
  const backdrop=document.getElementById('prnModalBackdrop');
  const closeBtn=document.getElementById('prnModalClose');
  const elName=document.getElementById('prnModalName');
  const elRole=document.getElementById('prnModalRole');
  const elGlyph=document.getElementById('prnModalGlyph');
  const elBio=document.getElementById('prnModalBio');
  const elDoctrine=document.getElementById('prnModalDoctrine');
  const elTags=document.getElementById('prnModalTags');
  const elCoord=document.getElementById('prnModalCoord');
  const elImageTag=document.getElementById('prnModalImageTag');
  const elEyebrow=document.getElementById('prnModalEyebrow');
  if(!modal)return;

  let isOpen=false;
  let activeCard=null;

  function populateFromCard(card){
    const idx=cards.indexOf(card)+1;
    const padded='0'+idx;
    const name=card.querySelector('.pc-name')?.textContent||'';
    const role=card.querySelector('.pc-role')?.textContent||'';
    const glyph=card.querySelector('.pc-photo-glyph')?.textContent||'';
    const bio=card.dataset.bioFull||'';
    const extended=card.dataset.bioExtended||'';
    const tagEls=card.querySelectorAll('.pc-tag');
    elName.textContent=name;
    elRole.textContent=role;
    elGlyph.textContent=glyph;
    elBio.textContent=bio;
    elDoctrine.textContent=extended;
    elCoord.textContent='[ 05.A.'+padded.slice(-2)+' ]';
    elImageTag.textContent='Principal '+padded.slice(-2)+' · Dossier';
    elEyebrow.textContent='Principal · Dossier '+padded.slice(-2);
    elTags.innerHTML='';
    tagEls.forEach(t=>{
      const span=document.createElement('span');
      span.className='prn-modal-tag';
      span.textContent=t.textContent;
      elTags.appendChild(span);
    });
  }

  function openModal(card){
    if(isOpen&&activeCard===card)return;
    populateFromCard(card);
    activeCard=card;
    isOpen=true;
    backdrop.classList.add('on');
    modal.classList.add('on');
    modal.setAttribute('aria-hidden','false');
    elGlyph.style.animation='none';
    elGlyph.offsetHeight;
    elGlyph.style.animation='';
  }
  function closeModal(){
    if(!isOpen)return;
    isOpen=false;
    activeCard=null;
    backdrop.classList.remove('on');
    modal.classList.remove('on');
    modal.setAttribute('aria-hidden','true');
  }

  // CLICK-ONLY interaction (desktop + mobile). Hover-trigger removed entirely
  // — the modal must feel intentional, not accidental from a passing cursor.
  // Cards are made keyboard-accessible too (Enter / Space).
  cards.forEach(card=>{
    if(!card.hasAttribute('role'))card.setAttribute('role','button');
    if(!card.hasAttribute('tabindex'))card.setAttribute('tabindex','0');

    card.addEventListener('click',e=>{
      if(e.target.closest('a,button'))return;  // let inner CTAs do their thing
      openModal(card);
    });
    card.addEventListener('keydown',e=>{
      if(e.target.closest('a,button'))return;
      if(e.key==='Enter'||e.key===' '){
        e.preventDefault();
        openModal(card);
      }
    });
  });

  closeBtn&&closeBtn.addEventListener('click',closeModal);
  backdrop&&backdrop.addEventListener('click',closeModal);
  // also accept clicks anywhere outside the modal (modal sits on top of backdrop;
  // backdrop covers viewport so that handler is sufficient — kept explicit).
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&isOpen)closeModal();
  });
})();

/* TIER FLIP CARDS — tap-to-flip for touch devices (hover handled by CSS) */
(function(){
  const isTouch=('ontouchstart' in window)||navigator.maxTouchPoints>0;
  if(!isTouch)return;
  document.querySelectorAll('.svc-card').forEach(card=>{
    card.addEventListener('click',e=>{
      if(e.target.closest('a,button'))return;
      e.preventDefault();
      card.classList.toggle('flipped');
    });
  });
})();

/* AIRaaS — random image popup on channel hover */
(function(){
  const popup=document.getElementById('airPopup');
  if(!popup)return;
  const harvested={};
  document.querySelectorAll('.imgm-card-inner').forEach(el=>{
    const m=(el.style.backgroundImage||'').match(/url\(["']?(data:image[^"')]+)["']?\)/);
    const lbl=el.parentElement?.dataset?.label||'';
    if(m&&!harvested[lbl])harvested[lbl]=m[1];
  });
  const allImgs=Object.entries(harvested);
  if(!allImgs.length)return;
  const channelBias={
    web:['01 · Monolith','03 · Ascent','06 · Gateway'],
    whatsapp:['04 · Form','06 · Gateway','01 · Monolith'],
    voice:['05 · Surface','02 · Vertical','03 · Ascent'],
  };
  function pickRandomFor(ch){
    const pool=(channelBias[ch]||[]).map(l=>harvested[l]).filter(Boolean);
    const src=pool.length?pool[Math.floor(Math.random()*pool.length)]:allImgs[Math.floor(Math.random()*allImgs.length)][1];
    const lbl=Object.entries(harvested).find(([,v])=>v===src)?.[0]||'';
    return {src,lbl};
  }
  document.querySelectorAll('.air-ch').forEach(row=>{
    row.addEventListener('mouseenter',()=>{
      const ch=row.dataset.ch;
      const {src,lbl}=pickRandomFor(ch);
      popup.style.backgroundImage=`url(${src})`;
      popup.dataset.popupLabel=lbl;
      const rot=(Math.random()*4-2).toFixed(2);
      const dy=(Math.random()*30-15).toFixed(0);
      const dx=(Math.random()*40-20).toFixed(0);
      popup.style.setProperty('--prX',dx+'px');
      popup.style.setProperty('--prY',dy+'px');
      popup.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(1) rotate(${rot}deg)`;
      popup.classList.add('on');
    });
    row.addEventListener('mouseleave',()=>{
      popup.classList.remove('on');
      popup.style.transform='translate(-50%,-50%) scale(.88)';
    });
  });
})();

/* AUTH PAGES — submit handler, OTP auto-advance, MFA timer, doctrine carousel */
function authSubmit(e,nextPage){
  e.preventDefault();
  const btn=e.target.querySelector('.auth-submit');
  if(btn){
    btn.disabled=true;
    const orig=btn.textContent;
    btn.textContent='PROCESSING...';
    setTimeout(()=>{
      goP(nextPage);
      btn.disabled=false;
      btn.textContent=orig;
    },800);
  } else {
    goP(nextPage);
  }
  return false;
}
window.authSubmit=authSubmit;

(function(){
  const otpGroups=document.querySelectorAll('[data-otp]');
  otpGroups.forEach(group=>{
    const inputs=group.querySelectorAll('input');
    inputs.forEach((inp,idx)=>{
      inp.addEventListener('input',e=>{
        const v=e.target.value.replace(/[^0-9]/g,'');
        e.target.value=v.slice(0,1);
        if(v&&idx<inputs.length-1)inputs[idx+1].focus();
        e.target.classList.toggle('filled',!!e.target.value);
      });
      inp.addEventListener('keydown',e=>{
        if(e.key==='Backspace'&&!e.target.value&&idx>0){
          inputs[idx-1].focus();
        }
        if(e.key==='ArrowLeft'&&idx>0)inputs[idx-1].focus();
        if(e.key==='ArrowRight'&&idx<inputs.length-1)inputs[idx+1].focus();
      });
      inp.addEventListener('paste',e=>{
        const txt=(e.clipboardData||window.clipboardData).getData('text').replace(/[^0-9]/g,'');
        if(txt.length>1){
          e.preventDefault();
          inputs.forEach((it,i)=>{
            it.value=txt[i]||'';
            it.classList.toggle('filled',!!it.value);
          });
          if(inputs[Math.min(txt.length,inputs.length-1)])inputs[Math.min(txt.length,inputs.length-1)].focus();
        }
      });
    });
  });

  /* MFA countdown timer — start on load if present */
  const timerEl=document.querySelector('[data-otp-timer]');
  if(timerEl){
    let timerHandle=null;
    function startTimer(){
      if(timerHandle)clearInterval(timerHandle);
      let remaining=60;
      function update(){
        const m=String(Math.floor(remaining/60)).padStart(2,'0');
        const s=String(remaining%60).padStart(2,'0');
        timerEl.textContent=`${m}:${s}`;
        if(remaining<=10)timerEl.style.color='#e57373';
        else timerEl.style.color='';
        remaining--;
        if(remaining<0){
          clearInterval(timerHandle);
          timerEl.textContent='EXPIRED';
          timerEl.style.color='#e57373';
        }
      }
      update();
      timerHandle=setInterval(update,1000);
    }
    startTimer();
  }

  /* Doctrine carousel — rotates quotes every 5s on auth pages */
  const doctrines=[
    'The architecture of growth.',
    'Precision. Not volume.',
    'Selected engagements only.',
    'Clarity precedes scale.',
    'Engaged by invitation.',
  ];
  const rotators=document.querySelectorAll('[data-doctrine-rotator]');
  if(rotators.length){
    let idx=0;
    setInterval(()=>{
      idx=(idx+1)%doctrines.length;
      rotators.forEach(el=>{
        el.classList.add('fading');
        setTimeout(()=>{
          el.textContent=doctrines[idx];
          el.classList.remove('fading');
        },500);
      });
    },5000);
  }

  /* Dashboard sidebar nav active-state */
  document.querySelectorAll('.dash-side-nav a').forEach(a=>{
    a.addEventListener('click',e=>{
      if(a.dataset.page)return;
      e.preventDefault();
      a.parentElement.parentElement.querySelectorAll('a').forEach(x=>x.classList.remove('active'));
      a.classList.add('active');
    });
  });
})();

/* COOKIES BANNER — first-visit consent */
(function(){
  const banner=document.getElementById('cookies-banner');
  if(!banner)return;
  const KEY='himark_consent';
  let stored=null;
  try{stored=localStorage.getItem(KEY);}catch(e){}

  function show(){setTimeout(()=>banner.classList.add('on'),1200);}
  function hide(){banner.classList.remove('on');}
  function setConsent(value){
    try{localStorage.setItem(KEY,value);}catch(e){}
    hide();
  }
  if(!stored)show();

  document.getElementById('cb-accept')?.addEventListener('click',()=>setConsent('all'));
  document.getElementById('cb-necessary')?.addEventListener('click',()=>setConsent('necessary'));
  document.getElementById('cb-deny')?.addEventListener('click',()=>setConsent('denied'));
})();

/* (home hero zoom is now handled by the unified sticky-hero registry below
   — keeps the home page consistent with doctrine/mandates/method/etc. The
   old translate+scale parallax was incompatible with sticky positioning.) */

/* CINEMATIC STICKY HERO — scroll-zoom for doctrine + mandates (and any future
   page that pairs `[sticky-hero]` + `[sticky-hero-bg]`). As the user scrolls
   past the hero, the background image scales up subtly (max ~12%) on a
   quadratic ease-out so most of the zoom happens early, settling toward the
   end. The hero is held in place by CSS `position:sticky`; we only animate
   the inner image layer via a CSS variable, so layout never re-flows. */
(function(){
  // Each entry: { pageId, heroSelector, bgSelector }.
  // Add new pages here when you wire up another sticky hero.
  const TARGETS=[
    /* page-home is driven by the canvas frame-sequence scrubber instead —
       the cinematic film *is* the motion, no extra zoom on the video layer. */
    {pageId:'page-doctrine',   heroSelector:'.doc-split',  bgSelector:'.doc-right-bg'},
    {pageId:'page-mandates',   heroSelector:'.mnd-hero',   bgSelector:'.mnd-hero-bg'},
    {pageId:'page-method',     heroSelector:'.mth-hero',   bgSelector:'.mth-hero-bg'},
    {pageId:'page-airass',     heroSelector:'.air-hero',   bgSelector:'.air-hero-bg'},
    {pageId:'page-principals', heroSelector:'.prn-hero',   bgSelector:'.prn-hero-bg'},
    {pageId:'page-intake',     heroSelector:'.itk-hero',   bgSelector:'.itk-hero-bg'}
  ];
  const reduceMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  const MAX_ZOOM=0.12;

  TARGETS.forEach(cfg=>{
    const page=document.getElementById(cfg.pageId);
    if(!page)return;
    const hero=page.querySelector(cfg.heroSelector);
    if(!hero)return;
    const bg=hero.querySelector(cfg.bgSelector);
    if(!bg)return;
    if(reduceMotion){bg.style.setProperty('--hero-zoom','1');return;}

    let raf=null;
    function update(){
      raf=null;
      const heroH=hero.offsetHeight||window.innerHeight;
      const s=page.scrollTop;
      const t=Math.max(0,Math.min(1,s/heroH));
      const eased=1-(1-t)*(1-t);
      bg.style.setProperty('--hero-zoom',(1+eased*MAX_ZOOM).toFixed(4));
    }
    function onScroll(){if(raf)return;raf=requestAnimationFrame(update);}
    page.addEventListener('scroll',onScroll,{passive:true});
    window.addEventListener('resize',onScroll,{passive:true});
    update();
  });
})();

/* METHOD PAGE — alternating directional reveal for the four-step sequence.
   Odd rows enter from the left, even from the right. Triggers ONCE on first
   intersection (no replay if user scrolls back), staggered slightly so the
   cluster reads as a sequence rather than four parallel slides. */
(function(){
  const steps=document.querySelectorAll('#page-method .mth-step');
  if(!steps.length)return;
  const reduceMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  if(reduceMotion){steps.forEach(s=>s.classList.add('is-in'));return;}

  const io=new IntersectionObserver((entries,obs)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        const el=e.target;
        const idx=Array.prototype.indexOf.call(el.parentNode.children,el);
        // small stagger so the rows feel sequential, not simultaneous
        const delay=Math.max(0,Math.min(3,idx))*120;
        el.style.transitionDelay=delay+'ms';
        el.classList.add('is-in');
        // reset delay after the transition lands so re-renders don't accumulate
        setTimeout(()=>{el.style.transitionDelay='';},1400+delay);
        obs.unobserve(el);
      }
    });
  },{threshold:.18,rootMargin:'0px 0px -10% 0px'});
  steps.forEach(s=>io.observe(s));
})();

/* TYPEWRITER ONCE — runs for any [data-typewriter-once] element.
   Reads the existing textContent, replaces it with empty wrapper + cursor,
   types the content character-by-character ONCE on first scroll-in,
   then permanently removes the cursor. Never replays. */
(function(){
  const els=document.querySelectorAll('[data-typewriter-once]');
  if(!els.length)return;
  const reduceMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  const BASE_MS=34;       // base per-keystroke
  const JITTER_MS=18;     // gentle hand-typed feel
  const PUNCT_PAUSE=180;  // brief breath after , and —
  const STOP_PAUSE=420;   // longer hold after .

  els.forEach(el=>{
    const original=(el.textContent||'').trim();
    if(!original)return;
    // Make the source text accessible to screen readers regardless of typing.
    el.setAttribute('aria-label',original);
    el.innerHTML='<span class="tw-out" aria-hidden="true"></span><span class="tw-cursor" aria-hidden="true"></span>';
    const out=el.querySelector('.tw-out');
    const cursor=el.querySelector('.tw-cursor');

    if(reduceMotion){
      out.textContent=original;
      cursor.classList.add('tw-cursor-done');
      return;
    }

    let started=false;
    function start(){
      if(started)return;
      started=true;
      let i=0;
      function next(){
        if(i>=original.length){
          // Done — cursor disappears permanently, never restarts.
          if(cursor)cursor.classList.add('tw-cursor-done');
          return;
        }
        const ch=original[i];
        out.textContent=original.slice(0,i+1);
        i++;
        let wait=BASE_MS+Math.random()*JITTER_MS;
        if(ch==='.'||ch==='?'||ch==='!')wait=STOP_PAUSE;
        else if(ch===','||ch===';'||ch==='—'||ch===':')wait=PUNCT_PAUSE;
        setTimeout(next,wait);
      }
      // small initial delay so the section settles before typing starts
      setTimeout(next,140);
    }

    // Once-only IntersectionObserver — disconnect after the first trigger
    // so the animation literally cannot replay even on scroll-back.
    const io=new IntersectionObserver(entries=>{
      for(const e of entries){
        if(e.isIntersecting){
          io.disconnect();
          start();
          break;
        }
      }
    },{threshold:.35});
    io.observe(el);
  });
})();

/* CURSOR GHOST TRAIL — grid tile illumination.
   The site's dark sections are split into 6 visible columns; we treat the
   grid as a tile field and "step" the cursor across it. The cell directly
   under the cursor lights up; previously-stepped cells fade out behind it.
   - Skipped on touch / coarse-pointer / reduced-motion.
   - Cells align to the same vertical grid CSS already paints, so the
     illumination sits on the actual background (not floating above it).
   - Tile dimensions match the column width — square cells. */
(function(){
  const isTouch=('ontouchstart' in window)||navigator.maxTouchPoints>0;
  const finePointer=window.matchMedia&&window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  if(isTouch||!finePointer)return;
  const reduceMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  if(reduceMotion)return;

  // Sections that should receive cursor-trail illumination.
  const DARK_SELECTOR='.hero, .monolith, .quote-mono, .doc-split, .mnd-hero, .mth-hero, .mth-cta-mono, .air-hero, .prn-hero, .itk-hero, .ghost-trail-zone';
  if(!document.querySelector(DARK_SELECTOR))return;

  // Grid geometry — anchored to the same 64px gutter as the painted grid.
  // Cells are 1/3 of a painted column wide (so every painted gridline still
  // aligns with a tile boundary, but stepping feels finer and more deliberate).
  const GX=64;
  const PAINTED_COLS=6;
  const SUB=3;                           // 3 tile-subdivisions per painted column
  const COLS=PAINTED_COLS*SUB;           // 18 tile columns
  function cellW(){return Math.max(28,(window.innerWidth-GX*2)/COLS);}

  // Build canvas once.
  let canvas=document.getElementById('ghost-trail');
  if(!canvas){
    canvas=document.createElement('canvas');
    canvas.id='ghost-trail';
    canvas.setAttribute('aria-hidden','true');
    document.body.appendChild(canvas);
  }
  const ctx=canvas.getContext('2d');
  let dpr=Math.min(window.devicePixelRatio||1,2);

  function resize(){
    dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=window.innerWidth*dpr;
    canvas.height=window.innerHeight*dpr;
    canvas.style.width=window.innerWidth+'px';
    canvas.style.height=window.innerHeight+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  resize();
  window.addEventListener('resize',resize,{passive:true});

  let mx=-9999,my=-9999;
  document.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;},{passive:true});
  document.addEventListener('mouseleave',()=>{mx=-9999;my=-9999;},{passive:true});

  // Cached dark sections + their rects — recomputed on scroll/resize.
  let sections=[];
  let rectsDirty=true;
  function markDirty(){rectsDirty=true;}
  document.querySelectorAll('.page').forEach(p=>p.addEventListener('scroll',markDirty,{passive:true}));
  window.addEventListener('scroll',markDirty,{passive:true});
  window.addEventListener('resize',markDirty,{passive:true});
  function refreshRects(){
    const els=document.querySelectorAll(DARK_SELECTOR);
    const vh=window.innerHeight,vw=window.innerWidth;
    sections=[];
    els.forEach(el=>{
      const r=el.getBoundingClientRect();
      if(r.bottom<=0||r.top>=vh||r.right<=0||r.left>=vw)return;
      sections.push({el,top:r.top,bottom:r.bottom});
    });
    rectsDirty=false;
  }

  // Map a viewport point to its (section, col, row) — or null if outside grid.
  // CRITICAL: when a sticky dark hero spans the viewport (e.g. mandates/doctrine),
  // its rect covers the entire viewport even after the user has scrolled —
  // including over the FOOTER which sits in front of it. Use elementFromPoint
  // to confirm the topmost element at the cursor is actually inside the dark
  // section, otherwise the trail bleeds over content above the hero.
  function tileAt(x,y){
    if(x<GX||x>window.innerWidth-GX)return null;
    // Find what's actually under the cursor
    const top=document.elementFromPoint(x,y);
    if(!top)return null;
    for(let i=0;i<sections.length;i++){
      const s=sections[i];
      if(y<s.top||y>s.bottom)continue;
      // Only count this section if the topmost element at cursor is inside it.
      // (sectionEl may not be cached on s — fetch fresh per check; cheap.)
      if(!s.el.contains(top))continue;
      const w=cellW();
      const col=Math.floor((x-GX)/w);
      if(col<0||col>=COLS)return null;
      const row=Math.floor((y-s.top)/w);
      return {sectionIdx:i,col,row,sectionTop:s.top};
    }
    return null;
  }

  // Active tile (under cursor right now) + faded trail behind it.
  let active=null;        // {sectionIdx,col,row,age:0}
  const trail=[];         // older tiles fading out
  const TILE_LIFE=58;     // ~1s @60fps — quick enough to feel like footsteps
  const MAX_TRAIL=32;     // smaller tiles = more steps per stroke; longer trail keeps it readable
  function sameTile(a,b){return a&&b&&a.sectionIdx===b.sectionIdx&&a.col===b.col&&a.row===b.row;}

  function drawTile(t,fade){
    // Resolve fresh viewport position from the (still-cached) section's top.
    const s=sections[t.sectionIdx];
    if(!s)return;
    const w=cellW();
    const x=GX+t.col*w;
    const y=s.top+t.row*w;
    if(x+w<0||y+w<0||x>window.innerWidth||y>window.innerHeight)return;
    // Clamp tile vertically so it never bleeds past the section.
    const top=Math.max(y,s.top);
    const bottom=Math.min(y+w,s.bottom);
    if(bottom<=top)return;
    const h=bottom-top;

    // soft fill — sits ON the dark background, not above it
    ctx.fillStyle='rgba(170,200,212,'+(0.085*fade).toFixed(3)+')';
    ctx.fillRect(x,top,w,h);

    // crisp 1px tile border so the cell shape reads as a "tile"
    ctx.strokeStyle='rgba(186,212,222,'+(0.55*fade).toFixed(3)+')';
    ctx.lineWidth=1;
    ctx.strokeRect(x+0.5,top+0.5,w-1,h-1);

    // accent corner brackets — Awwwards-grade detail without noise.
    // Shows only on tiles that are still bright (gives the "stepped"
    // tile a brief HUD-like flash).
    if(fade>0.55){
      const cl=Math.min(14,w*0.14);
      const a=(fade-0.55)/0.45; // 0..1 inside the bright window
      ctx.strokeStyle='rgba(226,240,240,'+(0.85*a).toFixed(3)+')';
      ctx.lineWidth=1.4;
      // top-left
      ctx.beginPath();ctx.moveTo(x,top+cl);ctx.lineTo(x,top);ctx.lineTo(x+cl,top);ctx.stroke();
      // top-right
      ctx.beginPath();ctx.moveTo(x+w-cl,top);ctx.lineTo(x+w,top);ctx.lineTo(x+w,top+cl);ctx.stroke();
      // bottom-left
      ctx.beginPath();ctx.moveTo(x,bottom-cl);ctx.lineTo(x,bottom);ctx.lineTo(x+cl,bottom);ctx.stroke();
      // bottom-right
      ctx.beginPath();ctx.moveTo(x+w-cl,bottom);ctx.lineTo(x+w,bottom);ctx.lineTo(x+w,bottom-cl);ctx.stroke();
    }
  }

  function tick(){
    if(rectsDirty)refreshRects();

    // Update active tile based on cursor position.
    const t=tileAt(mx,my);
    if(!t){
      // Cursor left the grid — push current active to trail and clear
      if(active){trail.push({...active,age:0});while(trail.length>MAX_TRAIL)trail.shift();active=null;}
    } else if(!sameTile(t,active)){
      if(active){trail.push({...active,age:0});while(trail.length>MAX_TRAIL)trail.shift();}
      active={...t,age:0};
    } else if(active){
      // same tile — keep it active (no aging while cursor is on it)
    }

    // Render
    ctx.clearRect(0,0,canvas.width/dpr,canvas.height/dpr);

    // Trail tiles — age + draw with quadratic ease-out
    for(let i=trail.length-1;i>=0;i--){
      const p=trail[i];p.age++;
      if(p.age>=TILE_LIFE){trail.splice(i,1);continue;}
      const k=1-p.age/TILE_LIFE;
      drawTile(p,k*k);
    }

    // Active tile — full brightness, with a brief settle
    if(active){
      active.age=Math.min(active.age+1,12);
      // 0..1 brightness ramp on first few frames so the flash feels
      // settled rather than instant — adds the "step" weight.
      const settle=Math.min(1,active.age/6);
      drawTile(active,0.92+0.08*settle);
    }

    requestAnimationFrame(tick);
  }
  refreshRects();
  requestAnimationFrame(tick);
})();

/* TYPEWRITER — "Three levels of engagement." headline.
   Types in character-by-character with a controlled, premium cadence,
   pauses at completion, and restarts every 30s. Subtle blinking cursor. */
(function(){
  const headlines=document.querySelectorAll('[data-typewriter]');
  if(!headlines.length)return;
  const reduceMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  // Sequence: text + optional html wrapper. Edit here to change the headline.
  const SEQUENCE=[
    {text:'Three levels',html:t=>t},
    {text:'\n',html:()=>'<br>'},                  // line break
    {text:'of ',html:t=>t},
    {text:'engagement.',html:t=>'<em>'+t+'</em>'} // italic ocean tail
  ];

  // Premium cadence — not too fast, not too slow.
  // Slight randomness on each keystroke makes it feel hand-typed
  // rather than mechanical, while staying controlled.
  const BASE_MS=58;
  const JITTER_MS=22;
  const PAUSE_AFTER_LINE_MS=420;       // brief breath at the line break
  const HOLD_AFTER_COMPLETE_MS=30000;  // stay completed for 30s
  const FADE_BEFORE_RESTART_MS=380;

  function escapeHtml(s){return s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}

  headlines.forEach(h=>{
    const out=h.querySelector('.tw-out');
    if(!out)return;

    // If the user prefers reduced motion, just render the final string once.
    if(reduceMotion){
      out.innerHTML=SEQUENCE.map(s=>s.html(escapeHtml(s.text==='\n'?'':s.text))).join('');
      return;
    }

    let cancelled=false;
    function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
    function delay(){return BASE_MS+Math.random()*JITTER_MS;}

    async function typeSequence(){
      const completed=[];        // fully-rendered HTML for done segments
      let currentHtml='';        // HTML for the segment being typed RIGHT NOW
      const render=()=>{out.innerHTML=completed.join('')+currentHtml;};
      out.innerHTML='';
      h.classList.remove('tw-paused');

      for(let i=0;i<SEQUENCE.length;i++){
        const seg=SEQUENCE[i];
        if(seg.text==='\n'){
          // commit the line break instantly, then breath
          currentHtml=seg.html('');
          render();
          completed.push(currentHtml);
          currentHtml='';
          await sleep(PAUSE_AFTER_LINE_MS);
          if(cancelled)return;
          continue;
        }
        let typed='';
        for(let c=0;c<seg.text.length;c++){
          if(cancelled)return;
          typed+=seg.text[c];
          currentHtml=seg.html(escapeHtml(typed));
          render();
          const ch=seg.text[c];
          await sleep(ch==='.'||ch===','?delay()*3:delay());
        }
        completed.push(currentHtml);
        currentHtml='';
      }

      // hold completed state
      h.classList.add('tw-paused');
      await sleep(HOLD_AFTER_COMPLETE_MS);
      if(cancelled)return;
      // soft fade before clearing then restart
      out.style.transition='opacity '+FADE_BEFORE_RESTART_MS+'ms cubic-bezier(.16,1,.3,1)';
      out.style.opacity='0';
      await sleep(FADE_BEFORE_RESTART_MS);
      if(cancelled)return;
      out.style.opacity='';
      out.style.transition='';
      typeSequence();
    }

    // Start when headline scrolls into view; otherwise the cycle would
    // already be partway through by the time the user gets there.
    const startWhenVisible=()=>{
      if(cancelled)return;
      const io=new IntersectionObserver(entries=>{
        entries.forEach(e=>{
          if(e.isIntersecting){
            io.disconnect();
            typeSequence();
          }
        });
      },{threshold:.25});
      io.observe(h);
    };
    startWhenVisible();
  });
})();

/* MONOLITH — scroll-driven word-by-word reveal (PRECISION · NOT · VOLUME) */
(function(){
  const section=document.querySelector('.monolith');
  if(!section)return;
  const lines=section.querySelectorAll('.mono-line');
  if(!lines.length)return;
  const scrollContainer=section.closest('.page')||document.scrollingElement||document.documentElement;

  // Each line is revealed once the section's progress through the viewport
  // crosses its individual threshold. Thresholds are tuned to feel
  // deliberate — there must be visible scroll between each reveal.
  // Progress 0 = section top at viewport bottom (just entering).
  // Progress 1 = section bottom at viewport top (about to leave).
  const n=lines.length;
  // Compress reveals into the central 60% of section travel so the
  // first/last 20% give breathing room before/after the sequence.
  const startP=0.22;
  const endP=0.62;
  const span=endP-startP;
  const thresholds=Array.from({length:n},(_,i)=>startP+span*((i+1)/(n+1)));

  let raf=null;
  let lastProgress=-1;
  function update(){
    raf=null;
    const rect=section.getBoundingClientRect();
    const vh=window.innerHeight||document.documentElement.clientHeight;
    const sectionH=rect.height;
    const travel=vh+sectionH;
    const traveled=vh-rect.top;
    let progress=traveled/travel;
    progress=Math.max(0,Math.min(1,progress));
    if(progress===lastProgress)return;
    lastProgress=progress;
    lines.forEach((line,i)=>{
      const t=thresholds[i];
      const should=progress>=t;
      if(should!==line.classList.contains('is-revealed')){
        line.classList.toggle('is-revealed',should);
      }
    });
  }
  function onScroll(){
    if(raf)return;
    raf=requestAnimationFrame(update);
  }
  scrollContainer.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',onScroll,{passive:true});
  // initial state
  update();
})();

})();
