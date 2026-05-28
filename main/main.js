/* HIMARK · main.js
   Shared interactive layer for all pages.
   In multi-page mode, [data-page] links resolve to the right URL
   based on the current document's location depth (data-location on <body>). */

(function(){
'use strict';

/* PAGE URL MAP & RESOLVER */
const PAGE_URLS={
  home:'home.html',
  doctrine:'about.html',
  mandates:'services.html',
  method:'process.html',
  airass:'product.html',
  principals:'team.html',
  intake:'apply.html',
  /* New surfaces */
  engagements:'work.html',
  journal:'insights.html',
  direct:'contact.html',
  press:'press.html',
  subscribe:'subscribe.html',
  /* Legal + auth */
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

/* ACCESSIBILITY — inject skip-to-main link and tag the .page wrapper as
   the main landmark. Keyboard users can hit Tab once on load to focus the
   skip link, then Enter to jump straight past the header chrome. */
(function(){
  // Prepend skip link to body so it's the first focusable thing
  if(!document.querySelector('.skip-to-main')){
    const link=document.createElement('a');
    link.className='skip-to-main';
    link.href='#main-content';
    link.textContent='Skip to content';
    document.body.insertBefore(link,document.body.firstChild);
    link.addEventListener('click',e=>{
      e.preventDefault();
      const target=document.querySelector('.page.active')||document.querySelector('.page');
      if(target){
        if(!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');
        target.focus({preventScroll:true});
        target.scrollIntoView({behavior:'auto',block:'start'});
      }
    });
  }
  // Tag the page wrapper as the main landmark (helps screen readers + SEO crawlers)
  document.querySelectorAll('.page').forEach(p=>{
    if(!p.hasAttribute('role'))p.setAttribute('role','main');
  });
  // Ensure there's an element with id="main-content" so the skip-link anchor resolves
  const first=document.querySelector('.page');
  if(first&&!document.getElementById('main-content')){
    // Use a sentinel rather than overwriting first.id (which the SPA scripts depend on)
    const sentinel=document.createElement('span');
    sentinel.id='main-content';
    sentinel.setAttribute('aria-hidden','true');
    sentinel.style.cssText='position:absolute;left:-9999px;';
    first.insertBefore(sentinel,first.firstChild);
  }
})();

/* MPA: ensure the page on this document is visible (.active) */
(function(){
  const p=document.querySelector('.page');
  if(p&&!p.classList.contains('active'))p.classList.add('active');
})();

/* CURSOR — performance-tuned. Previously used style.cssText to set
   left/top each frame, which triggers a full layout reflow per frame
   and stutters under load. Now uses transform: translate3d(...) which
   stays on the compositor (GPU) and never touches layout. The dot
   tracks the cursor instantly; the ring lerps toward the target at
   .18/frame (was .11 — bumped for snappier follow without losing
   the trailing feel). */
const cd=document.getElementById('cd'),cr=document.getElementById('cr');
let mx=-100,my=-100,rx=-100,ry=-100;
if(cd&&cr){
  document.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;},{passive:true});
  (function aC(){
    cd.style.transform=`translate3d(${mx}px,${my}px,0) translate(-50%,-50%)`;
    rx+=(mx-rx)*.18;
    ry+=(my-ry)*.18;
    cr.style.transform=`translate3d(${rx}px,${ry}px,0) translate(-50%,-50%)`;
    requestAnimationFrame(aC);
  })();
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

/* MENU PANEL — opened by the mobile hamburger in the new top nav.
   The old right-edge #menu-trigger still wires up (no harm if hidden via CSS). */
const menuTrigger=document.getElementById('menu-trigger');
const menuBurger=document.getElementById('topnavBurger');
const menuPanel=document.getElementById('menu-panel');
const menuOverlay=document.getElementById('menuOverlay');
const menuClose=document.getElementById('menuClose');
let menuOpen=false;
function syncBurger(){if(menuBurger)menuBurger.classList.toggle('is-open',menuOpen);}
function openMenu(){if(!menuPanel)return;menuOpen=true;menuPanel.classList.add('open');menuOverlay&&menuOverlay.classList.add('on');syncBurger();}
function closeMenu(){if(!menuPanel)return;menuOpen=false;menuPanel.classList.remove('open');menuOverlay&&menuOverlay.classList.remove('on');syncBurger();}
function toggleMenu(){menuOpen?closeMenu():openMenu();}
menuTrigger&&menuTrigger.addEventListener('click',toggleMenu);
menuBurger&&menuBurger.addEventListener('click',toggleMenu);
menuOverlay&&menuOverlay.addEventListener('click',closeMenu);
menuClose&&menuClose.addEventListener('click',closeMenu);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menuOpen)closeMenu();});

/* TOP NAV — mark the current page so its link is highlighted */
(function(){
  const here=document.body.dataset.page;
  if(!here)return;
  document.querySelectorAll('.topnav-list a[data-page]').forEach(a=>{
    if(a.dataset.page===here)a.classList.add('is-current');
  });
})();

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

/* Magnetic-button hover effect intentionally removed — the buttons
   ("View Mandates" on home and the other .btn-dk/.btn-lt/.btn-ghost
   CTAs) felt unstable as they tracked the cursor. Buttons now hold
   still on hover; CSS still handles the colour/background hover
   states defined in styles.css. */

/* COUNTERS */
function aC2(el){const t=parseInt(el.dataset.count),sfx=el.dataset.suffix??'+',dur=1800,s=performance.now();(function tick(n){const p=Math.min((n-s)/dur,1),e=1-Math.pow(1-p,3);el.textContent=Math.round(e*t)+(p===1?sfx:'');if(p<1)requestAnimationFrame(tick);})(performance.now());}
const cobs=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting&&!e.target.dataset.done){e.target.dataset.done='1';aC2(e.target);}}),{threshold:.5});
document.querySelectorAll('[data-count]').forEach(el=>cobs.observe(el));

/* AMBIENT MUSIC — looping background track behind the mute toggle.
   The site is multi-page, so the audio element dies on every
   navigation. We work around that with sessionStorage: as soon as
   the user clicks "unmute" anywhere, we set himark-music-on=1 and
   continuously persist the current playback time. On every new
   page load, if that flag is set, we immediately recreate the
   audio element, seek to the saved time, and resume playback so
   the listener perceives one continuous track across the site.

   Browser autoplay policy: after the first user gesture on a
   page (or via Chrome's Media Engagement Index on subsequent
   visits), play() resolves without throwing. The promise is
   .catch()ed defensively for the mobile browsers that still
   require an explicit gesture — in that case the music silently
   waits for the user's next click of the mute button. */
const M_TARGET_VOL=0.55;          // peak playback volume
const M_FADE_MS=900;               // fade duration on unmute / mute
const M_SRC='/music/Calima%20-%20Forest%20Zen%20(freetouse.com).mp3';
const M_KEY_ON='himark-music-on';
const M_KEY_TIME='himark-music-time';
const M_SAVE_INTERVAL_MS=500;     // throttle for currentTime persistence
let mAudio=null,muted=true,mFadeId=null,mLastSave=0;
const mBtn=document.getElementById('mute-btn');
function mSaveTime(){
  if(!mAudio)return;
  const now=performance.now();
  if(now-mLastSave<M_SAVE_INTERVAL_MS)return;
  mLastSave=now;
  try{ sessionStorage.setItem(M_KEY_TIME,String(mAudio.currentTime)); }catch(_){}
}
function iAudio(){
  if(mAudio)return;
  mAudio=new Audio(M_SRC);
  mAudio.loop=true;
  mAudio.preload='auto';
  mAudio.volume=0;
  /* Seek to the saved time so the track feels continuous across
     page navigations. Browsers may reject the seek before the
     audio's metadata loads — wrap in try/catch and also listen
     for loadedmetadata as a second chance. */
  const seekToSaved=()=>{
    try{
      const t=parseFloat(sessionStorage.getItem(M_KEY_TIME)||'0');
      if(t>0&&isFinite(t))mAudio.currentTime=t;
    }catch(_){}
  };
  seekToSaved();
  mAudio.addEventListener('loadedmetadata',seekToSaved,{once:true});
  /* Persist currentTime continuously while playing so the next
     page can pick up at (or just after) the same position. */
  mAudio.addEventListener('timeupdate',mSaveTime);
  /* Also save on tab close / navigate-away in case timeupdate
     hasn't fired recently. */
  window.addEventListener('pagehide',()=>{
    if(!muted&&mAudio){
      try{ sessionStorage.setItem(M_KEY_TIME,String(mAudio.currentTime)); }catch(_){}
    }
  });
}
function mFade(to,done){
  if(!mAudio)return;
  if(mFadeId)cancelAnimationFrame(mFadeId);
  const from=mAudio.volume,start=performance.now();
  (function tick(now){
    const t=Math.min(1,(now-start)/M_FADE_MS);
    if(mAudio)mAudio.volume=Math.max(0,Math.min(1,from+(to-from)*t));
    if(t<1)mFadeId=requestAnimationFrame(tick); else { mFadeId=null; if(done)done(); }
  })(performance.now());
}
function mSetMuted(state,persist){
  muted=!!state;
  mBtn&&mBtn.classList.toggle('muted',muted);
  if(persist!==false){
    try{
      if(muted){ sessionStorage.removeItem(M_KEY_ON); }
      else{ sessionStorage.setItem(M_KEY_ON,'1'); }
    }catch(_){}
  }
  if(muted){
    mFade(0,()=>{ if(mAudio)mAudio.pause(); });
  }else{
    iAudio();
    const p=mAudio.play();
    if(p&&typeof p.catch==='function')p.catch(()=>{});
    mFade(M_TARGET_VOL);
  }
}
mBtn&&mBtn.addEventListener('click',()=>mSetMuted(!muted));

/* AUTO-RESUME on this page if the user previously unmuted in
   this session. We do NOT pass persist:true here because the
   sessionStorage flag is already set — no need to rewrite it. */
try{
  if(sessionStorage.getItem(M_KEY_ON)==='1'){
    mSetMuted(false,false);
  }
}catch(_){}

/* ============================================================
   ATLAS — chat + voice widget.
   Sends user messages to /api/chat (Vercel serverless function
   that proxies to Gemini 1.5 Flash; key stored server-side). The
   panel DOM and bubble CSS already exist in every page; this
   block just wires up the toggle, send, tab switch, and voice
   STT/TTS handlers.
   ============================================================ */
(function(){
  const cTgl   = document.getElementById('chatTgl');
  const cWin   = document.getElementById('chatWin');
  const cMsgs  = document.getElementById('chMsgs');
  const cIn    = document.getElementById('chIn');
  const qrEl   = document.getElementById('qr');
  const tChat  = document.getElementById('tChat');
  const tVoice = document.getElementById('tVoice');
  const cPan   = document.getElementById('cpanel');
  const vPan   = document.getElementById('vpanel');
  const vOrb   = document.getElementById('vOrb');
  const vWave  = document.getElementById('vWave');
  const vStat  = document.getElementById('vStat');
  if(!cTgl||!cWin||!cMsgs) return;

  const HIST = [];   // running conversation history sent to /api/chat
  let busy = false, lstn = false, recog = null;

  function ts(){
    return new Date().toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'});
  }

  /* Append a message bubble. role = 'bot' | 'user' (matches existing CSS) */
  function aM(role,text){
    const d=document.createElement('div');
    d.className='msg '+role;
    const body=document.createElement('div');
    body.className='msg-b';
    body.textContent=text;                       // textContent prevents HTML injection
    const tag=document.createElement('div');
    tag.className='msg-t';
    tag.textContent=ts();
    d.appendChild(body); d.appendChild(tag);
    cMsgs.appendChild(d);
    cMsgs.scrollTop=cMsgs.scrollHeight;
  }
  function shT(){
    const d=document.createElement('div');
    d.className='msg bot typing-i'; d.id='ti';
    d.innerHTML='<div class="typ-d"><span></span><span></span><span></span></div>';
    cMsgs.appendChild(d); cMsgs.scrollTop=cMsgs.scrollHeight;
  }
  function rmT(){ const e=document.getElementById('ti'); if(e)e.remove(); }

  /* Call the chat endpoint. Records turn in HIST so context carries
     across messages within the same page-load (resets on navigation,
     which is the right behaviour for a brief contact-style chat). */
  async function cC(msg){
    if(busy)return;
    busy=true;
    HIST.push({role:'user',content:msg});
    shT();
    /* Tell the server which mode we're in so it can append a
       voice-friendly hint to the system prompt for this turn. */
    const inVoice = !!(vPan&&vPan.classList.contains('on'));
    try{
      const res=await fetch('/api/chat',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({messages:HIST, mode: inVoice ? 'voice' : 'text'})
      });
      const data=await res.json().catch(()=>({reply:'Reach us at info@himark.co.za.'}));
      rmT();
      const reply=(data&&data.reply)||"I'm not able to respond just now. Please email info@himark.co.za.";
      HIST.push({role:'assistant',content:reply});
      aM('bot',reply);
      /* Read out the reply only when the user is on the voice tab. */
      if(inVoice) speak(reply);
    }catch(_){
      rmT();
      aM('bot','Atlas is offline for a moment. Reach us at info@himark.co.za.');
    }finally{
      busy=false;
    }
  }

  /* GREETING — show a soft, principal-trained-assistant intro the
     first time the panel opens. Without this, visitors stare at an
     empty thread and either type something tentative or leave.
     Greeting is local to this page-load (HIST.length === 0); it
     fires exactly once and only on initial open. We push it into
     HIST as an assistant turn so the server sees the visitor's
     first reply as turn 2 — its first-turn auto-introduction
     instruction therefore won't fire and Atlas won't introduce
     himself twice. */
  const GREETING = "Atlas here — HIMARK's principal-trained assistant. What brings you in today?";
  function showGreetingIfNeeded(){
    if(HIST.length > 0) return;
    if(cMsgs.children.length > 0) return;
    setTimeout(()=>{
      aM('bot', GREETING);
      HIST.push({role:'assistant', content: GREETING});
    }, 380);
  }

  /* TOGGLE — open/close the panel. Greeting fires on first open. */
  cTgl.addEventListener('click',()=>{
    const willOpen=!cWin.classList.contains('open');
    cWin.classList.toggle('open',willOpen);
    cTgl.classList.toggle('open',willOpen);
    if(willOpen){
      showGreetingIfNeeded();
      setTimeout(()=>cIn&&cIn.focus(),260);
    }
    /* Closing the panel mid-conversation: kill any in-flight
       speech (premium or browser) and recognition so nothing
       keeps running behind a hidden panel. */
    if(!willOpen){
      try{ window.speechSynthesis.cancel(); }catch(_){}
      if(atlasAudio){ try{ atlasAudio.pause(); }catch(_){} atlasAudio=null; }
      try{ if(recog && lstn) recog.stop(); }catch(_){}
      if(vStat) vStat.textContent='TAP TO SPEAK';
    }
  });

  /* SEND — inline onclick="sM()" handler from the markup */
  window.sM=function(){
    if(busy||!cIn) return;
    const t=cIn.value.trim();
    if(!t) return;
    cIn.value='';
    if(qrEl) qrEl.style.display='none';
    aM('user',t);
    cC(t);
  };
  /* QUICK REPLY chip — inline onclick="sQ(this)" handler from the markup */
  window.sQ=function(btn){
    if(busy) return;
    const t=(btn&&btn.textContent||'').trim();
    if(!t) return;
    if(qrEl) qrEl.style.display='none';
    aM('user',t);
    cC(t);
  };
  /* TAB SWITCH — inline onclick="swT('chat'|'voice')" from the markup */
  window.swT=function(tab){
    const isChat=(tab==='chat');
    if(cPan)  cPan.style.display=isChat?'':'none';
    if(vPan)  vPan.classList.toggle('on',!isChat);
    if(tChat) tChat.classList.toggle('active',isChat);
    if(tVoice)tVoice.classList.toggle('active',!isChat);
  };

  /* ENTER to send */
  cIn&&cIn.addEventListener('keydown',e=>{
    if(e.key==='Enter'){ e.preventDefault(); window.sM(); }
  });

  /* VOICE — browser-built-in Web Speech API. STT is free, TTS is
     free, both work offline-ish. Falls back gracefully on browsers
     without SpeechRecognition (Firefox desktop, some mobile).

     Voice selection: most browsers ship multiple TTS voices. The
     default is usually a low-quality robotic one. We prefer
     en-ZA where available, then a high-quality en-GB or en-US
     voice (Google's neural / Microsoft Natural). Voices load
     asynchronously in some browsers, so we cache on the
     `voiceschanged` event AND on first speak() call. */
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  let atlasVoice=null;

  /* MOBILE AUDIO UNLOCK
     iOS Safari (and Chrome on iOS, which uses the same WebKit
     audio backend) requires audio playback to originate inside
     a user-gesture handler synchronously. Our TTS flow:
       tap orb → recog → /api/chat → /api/voice → audio.play()
     hops through several async awaits, so by the time we call
     play() iOS has considered the gesture "spent" and blocks
     audio with a quiet rejection.

     Canonical fix: on the very first user interaction with the
     page, play a 1-sample silent AudioContext buffer. That
     unlocks the audio session for the rest of the page lifetime
     so subsequent HTMLAudio plays work after async hops.

     Listener is attached with `once:true` + capture-phase so it
     fires before any other handlers and self-removes — no
     ongoing cost. Catches click AND touchstart because some iOS
     versions need the touch event specifically. */
  let mobileAudioUnlocked = false;
  function unlockMobileAudio(){
    if(mobileAudioUnlocked) return;
    try{
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if(!Ctx) return;
      const ctx = new Ctx();
      if(ctx.state === 'suspended' && typeof ctx.resume === 'function'){
        ctx.resume().catch(()=>{});
      }
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      mobileAudioUnlocked = true;
      /* Close after a short delay so we don't keep the context
         open for the rest of the page lifetime. */
      setTimeout(()=>{ try{ ctx.close && ctx.close(); }catch(_){} }, 250);
    }catch(_){}
  }
  ['click','touchstart'].forEach(ev=>{
    document.addEventListener(ev, unlockMobileAudio, { once:true, capture:true, passive:true });
  });

  /* HIDE VOICE TAB ON BROWSERS WITHOUT SR
     iOS Safari and Chrome-on-iOS don't ship SpeechRecognition.
     Showing the voice tab and then erroring on tap is a worse
     UX than just not offering it. Hide the button entirely;
     the chat tab's flex:1 expands to fill the row. */
  if(!SR){
    if(tVoice) tVoice.style.display='none';
    if(vPan)   vPan.style.display='none';
  }

  function pickAtlasVoice(){
    if(!('speechSynthesis'in window)) return null;
    const voices=window.speechSynthesis.getVoices();
    if(!voices||!voices.length) return null;
    /* Picking a SOFT MALE voice for Atlas. The Web Speech API
       doesn't expose voice gender, so we heuristic on name. The
       neural / natural variants from Google + Microsoft sound
       noticeably less robotic than the OS defaults, so we prefer
       those first. Priority order:
         1.  en-ZA male (any)              — rare but ideal
         2.  en-GB male + neural           — Daniel on macOS, MS Ryan/George on Windows, Google UK Male
         3.  en-GB male (any quality)
         4.  en-AU male
         5.  en-US male + neural           — MS Ryan/Guy/Davis Natural
         6.  en-US male (any quality)
         7.  en-GB neural any              — fallback to soft tone over gender match
         8.  any en-GB
         9.  any en-* */
    const isMale = v => /\b(daniel|aaron|albert|alex|arthur|bruce|brian|david|fred|george|guy|davis|james|jamie|john|junior|mark|oliver|ralph|reed|ryan|thomas|tom|tony|microsoft (david|mark|george|ryan|guy|davis|brian|tony)|google (uk )?english male)\b/i.test(v.name);
    const isQuality = v => /natural|neural|wavenet|online|google/i.test(v.name);
    const tests=[
      v => v.lang==='en-ZA' && isMale(v),
      v => v.lang==='en-ZA',
      v => v.lang==='en-GB' && isMale(v) && isQuality(v),
      v => v.lang==='en-GB' && isMale(v),
      v => v.lang==='en-AU' && isMale(v),
      v => v.lang==='en-US' && isMale(v) && isQuality(v),
      v => v.lang==='en-US' && isMale(v),
      v => v.lang==='en-GB' && isQuality(v),
      v => v.lang==='en-GB',
      v => v.lang==='en-US' && isQuality(v),
      v => v.lang==='en-US',
      v => v.lang && v.lang.startsWith('en-')
    ];
    for(const t of tests){
      const m=voices.find(t);
      if(m) return m;
    }
    return voices[0];
  }
  if('speechSynthesis'in window){
    /* Some browsers populate getVoices() asynchronously. Register
       a callback so atlasVoice updates as soon as the list lands. */
    atlasVoice=pickAtlasVoice();
    window.speechSynthesis.onvoiceschanged=()=>{ atlasVoice=pickAtlasVoice(); };
  }
  /* Pronunciation overrides for text-to-speech only. These rewrites
     apply only to the spoken stream — the chat log still shows the
     original spelling. Add more entries here as we discover words
     the engine mangles. */
  function speakable(text){
    return text
      /* HIMARK is read letter-by-letter or as "him-ark" by most
         TTS engines. Force it to "Highmark" so it lands as
         "high-mark" — closer to the intended brand pronunciation. */
      .replace(/\bHIMARK(s|'s)?\b/g, (m,suf)=>'Highmark'+(suf||''))

      /* Principal name pronunciation — phonetic respellings that
         English TTS engines render close to the intended SA Sotho
         pronunciation. Captures possessives ("'s") via the \b
         boundary so "Matime's" → "Mahteemay's" automatically. */
      .replace(/\bMatime\b/g,   'Mahteemay')   // CEO  Neo Matime    →  Neo Ma-tih-meh
      .replace(/\bMothiba\b/g,  'Moteeba')     // COO  Thelma Mothiba →  Thelma Mo-tih-ba
      .replace(/\bMokgwadi\b/g, 'Mokwadee')    // CMO  Neo Mokgwadi   →  Neo Mo-kgwa-di

      /* South African Rand pricing — TTS reads "R50,000" as
         letter-by-letter "R fifty thousand" or "are fifty
         thousand". Strip the R prefix and append " rand" so the
         engine speaks "fifty thousand rand". Matches grouped
         (R50,000) and ungrouped (R50000) forms; ignores R&B,
         R2D2, etc. since they don't fit the digit pattern. */
      .replace(/\bR(\d[\d,]*)\b/g, (m, num) => num + ' rand');
  }

  /* Single audio element reused across turns so each new reply
     replaces the previous one cleanly. */
  let atlasAudio=null;
  /* Once we've discovered there's no premium TTS configured, stop
     hitting /api/tts on every reply — saves a wasted round-trip. */
  let premiumTtsDisabled=false;

  /* Shared handlers for both premium-audio and browser-TTS playback
     so the v-stat lifecycle + continuous-conversation loop work the
     same way regardless of which engine produced the audio. */
  function onAtlasSpeechStart(){ if(vStat) vStat.textContent='ATLAS REPLYING…'; }
  function onAtlasSpeechEnd(){
    /* CONTINUOUS CONVERSATION — after Atlas finishes, auto-reopen
       the mic so the visitor can reply without tapping. */
    const stillInVoice = vPan && vPan.classList.contains('on') && cWin && cWin.classList.contains('open');
    if(stillInVoice && !busy && !lstn){
      if(vStat) vStat.textContent='…';
      setTimeout(()=>{
        const stillInVoiceNow = vPan && vPan.classList.contains('on') && cWin && cWin.classList.contains('open');
        if(stillInVoiceNow && !busy && !lstn) window.tV();
      }, 600);
    } else {
      if(vStat) vStat.textContent='TAP TO SPEAK';
    }
  }
  function onAtlasSpeechError(){ if(vStat) vStat.textContent='TAP TO SPEAK'; }

  /* Browser built-in TTS — used as fallback when ElevenLabs isn't
     configured, the API call fails, or audio playback is blocked
     by browser autoplay policy. */
  function speakBrowser(text){
    try{
      if(!('speechSynthesis'in window)||!text) return;
      window.speechSynthesis.cancel();
      if(!atlasVoice) atlasVoice=pickAtlasVoice();
      const u=new SpeechSynthesisUtterance(speakable(text));
      if(atlasVoice){ u.voice=atlasVoice; u.lang=atlasVoice.lang; }
      else { u.lang='en-ZA'; }
      u.rate=1.0; u.pitch=1.0; u.volume=1.0;
      u.onstart = onAtlasSpeechStart;
      u.onend   = onAtlasSpeechEnd;
      u.onerror = onAtlasSpeechError;
      window.speechSynthesis.speak(u);
    }catch(_){}
  }

  /* Premium TTS — POST the reply to /api/tts, which proxies to
     ElevenLabs (server-side, key never exposed) and returns an
     MP3. We play the MP3 through a single Audio element so each
     reply replaces the prior one cleanly. Falls back to the
     browser TTS if the endpoint isn't configured or returns an
     error.

     Verbose console logging is on this path so we can diagnose
     why a particular turn fell back. Open DevTools → Console
     while testing voice mode to see which branch fired. */
  function ttsLog(stage, info){
    try{ console.log('[atlas tts]', stage, info||''); }catch(_){}
  }

  async function speak(text){
    if(!text) return;
    const spoken = speakable(text);
    ttsLog('speak called', { textPreview: text.slice(0,60), len: text.length });

    /* Kill any in-flight playback before starting a new turn. */
    try{ window.speechSynthesis.cancel(); }catch(_){}
    if(atlasAudio){ try{ atlasAudio.pause(); }catch(_){} atlasAudio=null; }

    if(premiumTtsDisabled){
      ttsLog('premium-disabled-for-session — using browser TTS');
      speakBrowser(text); return;
    }

    try{
      ttsLog('fetching /api/voice');
      const res = await fetch('/api/voice',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ text: spoken })
      });
      ttsLog('/api/voice response', { status: res.status, contentType: res.headers.get('content-type') });
      if(!res.ok){
        if(res.status === 503){
          /* No ELEVENLABS_API_KEY configured. Remember this for the
             rest of the session so we don't keep retrying. */
          premiumTtsDisabled = true;
          ttsLog('503 — disabling premium TTS for session');
        } else {
          ttsLog('non-200 — falling back to browser', { status: res.status });
        }
        speakBrowser(text);
        return;
      }
      const blob = await res.blob();
      ttsLog('blob received', { size: blob.size, type: blob.type });
      if(!blob.size){
        ttsLog('empty blob — falling back');
        speakBrowser(text);
        return;
      }
      const url = URL.createObjectURL(blob);
      atlasAudio = new Audio(url);
      /* iOS: keep audio inline (don't hand off to the OS media
         controller, don't trigger fullscreen on tap). preload
         'auto' tells the browser it can buffer immediately. */
      atlasAudio.playsInline = true;
      atlasAudio.preload = 'auto';
      atlasAudio.onplay  = ()=>{ ttsLog('audio onplay (ElevenLabs is being heard)'); onAtlasSpeechStart(); };
      atlasAudio.onended = ()=>{
        ttsLog('audio onended');
        try{ URL.revokeObjectURL(url); }catch(_){}
        onAtlasSpeechEnd();
      };
      atlasAudio.onerror = (e)=>{
        ttsLog('audio onerror', { error: (atlasAudio && atlasAudio.error && atlasAudio.error.code) || String(e) });
        try{ URL.revokeObjectURL(url); }catch(_){}
        /* Audio decode/playback failed — fall back to browser TTS
           for this turn so the visitor still hears Atlas. */
        speakBrowser(text);
      };
      ttsLog('calling audio.play()');
      const playPromise = atlasAudio.play();
      if(playPromise && typeof playPromise.catch === 'function'){
        playPromise
          .then(()=>{ ttsLog('audio.play() resolved'); })
          .catch((e)=>{
            ttsLog('audio.play() REJECTED — fallback', { name: e && e.name, message: e && e.message });
            speakBrowser(text);
          });
      }
    }catch(e){
      ttsLog('speak() threw — fallback', { message: e && e.message });
      speakBrowser(text);
    }
  }
  /* CONTINUOUS LISTENING — the default browser SpeechRecognition
     ends as soon as it thinks you've stopped, which means a
     mid-sentence pause-to-think gets read as "end of turn" and the
     user is cut off. We switch to continuous mode + interim results
     + a manual silence timer so visitors have a generous pause
     window before Atlas processes their input:
       - INITIAL_TIMEOUT_MS  → how long to wait for the first word
       - SILENCE_AFTER_MS    → how long to wait for the next word
                              once the user has started speaking */
  const INITIAL_TIMEOUT_MS = 5000;  // 5s to start talking
  const SILENCE_AFTER_MS   = 3000;  // 3s of silence after speech = done

  window.tV=function(){
    if(!SR){ if(vStat)vStat.textContent='VOICE NOT SUPPORTED — TRY CHROME'; return; }
    /* INTERRUPT — if Atlas is mid-reply when the visitor taps the
       orb, cut him off and switch to listening. Kills BOTH the
       premium audio element and the browser speech-synthesis
       queue in case the reply is running through either path. */
    try{ window.speechSynthesis.cancel(); }catch(_){}
    if(atlasAudio){ try{ atlasAudio.pause(); }catch(_){} atlasAudio=null; }
    if(lstn&&recog){ recog.stop(); return; }

    recog=new SR();
    recog.lang='en-ZA';
    recog.continuous=true;        // keep listening through natural pauses
    recog.interimResults=true;    // get partial transcripts so we can track speech activity
    recog.maxAlternatives=1;

    let finalTranscript='';
    let hasReceivedSpeech=false;
    let silenceTimer=null;

    function armSilenceTimer(ms){
      if(silenceTimer) clearTimeout(silenceTimer);
      silenceTimer=setTimeout(()=>{
        if(lstn && recog){ try{ recog.stop(); }catch(_){} }
      }, ms);
    }

    recog.onstart=()=>{
      lstn=true;
      vOrb&&vOrb.classList.add('on');
      vWave&&vWave.classList.add('on');
      if(vStat) vStat.textContent='LISTENING…';
      finalTranscript='';
      hasReceivedSpeech=false;
      armSilenceTimer(INITIAL_TIMEOUT_MS);
    };

    recog.onresult=e=>{
      let interim='';
      for(let i=e.resultIndex;i<e.results.length;i++){
        const r=e.results[i];
        if(r.isFinal) finalTranscript += r[0].transcript;
        else interim += r[0].transcript;
      }
      hasReceivedSpeech = true;
      /* Reset silence timer every time we hear something — gives
         the user the full SILENCE_AFTER_MS window between words. */
      armSilenceTimer(SILENCE_AFTER_MS);
      /* Live transcript on the voice panel so the user knows the
         mic is hearing them. */
      const display=(finalTranscript+interim).trim();
      if(display && vStat) vStat.textContent='"'+display+'"';
    };

    recog.onend=()=>{
      if(silenceTimer){ clearTimeout(silenceTimer); silenceTimer=null; }
      lstn=false;
      vOrb&&vOrb.classList.remove('on');
      vWave&&vWave.classList.remove('on');

      const said=finalTranscript.trim();
      if(said){
        if(vStat) vStat.textContent='ATLAS THINKING…';
        if(qrEl) qrEl.style.display='none';
        aM('user',said);
        cC(said);   /* async — speak() will drive v-stat through ATLAS REPLYING… */
      } else if(hasReceivedSpeech){
        /* Mic heard SOMETHING but it didn't finalise. Rare; show
           a recoverable status. */
        if(vStat) vStat.textContent='DIDN\'T CATCH THAT — TAP AGAIN';
      } else {
        if(vStat) vStat.textContent='NO SPEECH HEARD — TAP AGAIN';
      }
    };

    /* Surface the actual SR error to the visitor so they know
       why it's not working. Most common case: 'not-allowed' = user
       denied microphone permission, or the site isn't on HTTPS. */
    recog.onerror=e=>{
      if(silenceTimer){ clearTimeout(silenceTimer); silenceTimer=null; }
      let msg='TAP TO SPEAK';
      const code=(e&&e.error)||'';
      if(code==='not-allowed')   msg='MIC ACCESS DENIED — CHECK BROWSER SETTINGS';
      else if(code==='audio-capture') msg='NO MIC FOUND';
      else if(code==='no-speech')     msg='NO SPEECH HEARD — TAP AGAIN';
      else if(code==='network')       msg='NETWORK ERROR';
      else if(code==='service-not-allowed') msg='VOICE BLOCKED BY BROWSER';
      else if(code==='aborted')       msg='TAP TO SPEAK'; /* user-initiated stop */
      else if(code)                   msg='ERROR · '+code.toUpperCase();
      if(vStat) vStat.textContent=msg;
      lstn=false;
      vOrb&&vOrb.classList.remove('on');
      vWave&&vWave.classList.remove('on');
    };

    try{ recog.start(); }
    catch(err){ if(vStat) vStat.textContent='COULD NOT START — TAP AGAIN'; lstn=false; }
  };
  /* The .v-orb element doesn't carry an inline handler in the markup,
     so bind a click directly. */
  vOrb&&vOrb.addEventListener('click',()=>window.tV());
})();

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
   300 sequential JPEGs are preloaded; the user's scroll position through a
   300vh "spacer" below the sticky hero scrubs the canvas from frame 0 to
   frame 299. Result: a cinematic film sequence the visitor scrubs by hand.
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

  const FRAME_COUNT=300;
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
    // Map scroll progress directly against the page's scroll position.
    // PREVIOUS implementation measured spacer.getBoundingClientRect().top,
    // which only became negative once the spacer crossed the viewport top —
    // meaning scrubbing didn't begin until the user had scrolled the entire
    // hero height (100vh). That delay felt broken.
    //
    // New: scrub frames 0 → 299 across the spacer's height starting at
    // scroll = 0. First pixel of scroll moves the frame; the sequence
    // completes by the time scroll reaches spacer.offsetHeight, after
    // which the final frame holds while the sticky hero finishes releasing.
    const total=spacer.offsetHeight||1;
    const scrolled=page.scrollTop;
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

  // Scattered "explosion" positions, per card index.
  // Bumped a touch outward (from 340/280 to 400/320) so the reverse-scroll
  // dispersion reads as a real release rather than a small drift back.
  const scatter=[
    {x:-400,y:-260,r:-26},
    {x:-160,y:320, r:-10},
    {x:160, y:320, r:10},
    {x:400, y:-260,r:26},
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

  /* Convergence curve: progress 0 = fully scattered, progress 1 = fully
     assembled. smoothstep (3t² − 2t³) gives a gentle deceleration both
     ways — converges naturally to a stop on scroll-down and accelerates
     gracefully outward as the curve unwinds on scroll-up. */
  function applyScatter(progress){
    const eased=3*progress*progress-2*progress*progress*progress; // smoothstep
    cards.forEach((card,idx)=>{
      const s=scatter[idx]||scatter[scatter.length-1];
      const k=1-eased;        // 1 = scattered, 0 = assembled
      const px=s.x*k;
      const py=s.y*k;
      const pr=s.r*k;
      // opacity: fade in as cards converge — gives the "deconstruction" feel
      // on reverse where panels visibly soften as they fly outward
      const po=0.18+0.82*eased;
      // scale: subtle shrink-on-scatter for added depth
      const ps=0.9+0.1*eased;
      card.style.setProperty('--px',px.toFixed(1)+'px');
      card.style.setProperty('--py',py.toFixed(1)+'px');
      card.style.setProperty('--pr',pr.toFixed(2)+'deg');
      card.style.setProperty('--po',po.toFixed(3));
      card.style.setProperty('--ps',ps.toFixed(3));
    });
  }

  /* Raw scroll → animation progress.
     Section enters viewport at raw 0, leaves at raw 1. We do the entire
     assembly inside the front half (raw 0 → 0.55) and HOLD assembled past
     that — so as the user keeps scrolling down through the section, the
     panels stay together without ever flying off again. */
  function rawScrollProgress(){
    const rect=section.getBoundingClientRect();
    const vh=window.innerHeight||document.documentElement.clientHeight;
    const sectionH=rect.height;
    const travel=vh+sectionH;
    const traveled=vh-rect.top;
    return Math.max(0,Math.min(1,traveled/travel));
  }
  function animTarget(){
    const raw=rawScrollProgress();
    // raw 0..0.55 → anim 0..1 ; raw > 0.55 → hold at 1
    return Math.max(0,Math.min(1,raw/0.55));
  }

  /* Lerp the displayed progress toward the scroll-derived target each
     RAF tick. The smoothing factor (0.16) dampens jumpy scroll input —
     wheel ticks, touch flings, anchor jumps all get visually softened.
     When the gap is tiny we snap and pause RAF for efficiency. */
  let currentProgress=0;
  let targetProgress=0;
  let raf=null;
  let settled=false;

  function tick(){
    raf=null;
    targetProgress=animTarget();
    const diff=targetProgress-currentProgress;
    if(Math.abs(diff)<0.0008){
      currentProgress=targetProgress;
      applyScatter(currentProgress);
      // direction-agnostic in-view: panels reveal/un-reveal as the cluster
      // converges past / disperses below the threshold
      cards.forEach(c=>c.classList.toggle('in-view',currentProgress>0.25));
      settled=true;
      return;
    }
    settled=false;
    currentProgress+=diff*0.16;
    applyScatter(currentProgress);
    cards.forEach(c=>c.classList.toggle('in-view',currentProgress>0.25));
    raf=requestAnimationFrame(tick);
  }

  function kick(){
    settled=false;
    if(raf)return;
    raf=requestAnimationFrame(tick);
  }

  function bindScroll(){
    const sc=getScrollContainer();
    if(!sc)return;
    sc.addEventListener('scroll',kick,{passive:true});
    window.addEventListener('resize',kick,{passive:true});
    // initial paint
    targetProgress=animTarget();
    currentProgress=targetProgress;
    applyScatter(currentProgress);
    cards.forEach(c=>c.classList.toggle('in-view',currentProgress>0.25));
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

/* CINEMATIC STICKY HERO — scroll-zoom for every content page hero. As
   the user scrolls past the hero, the background image scales up subtly
   (max ~12%) on a quadratic ease-out so most of the zoom happens early,
   settling toward the end. The hero is held in place by CSS
   `position:sticky`; we only animate the inner image layer via a CSS
   variable, so layout never re-flows. */
(function(){
  // Each entry: { pageId, heroSelector, bgSelector }.
  // page-home is driven by the canvas frame-sequence scrubber instead —
  // the cinematic film *is* the motion, no extra zoom on the video layer.
  // page-doctrine kept its bespoke two-column split, so it uses .doc-split /
  // .doc-right-bg. Every other content page (mandates, method, airass,
  // principals, intake, plus the three new surfaces journal/engagements/
  // direct) now shares the unified .np-hero / .np-hero-bg structure.
  const TARGETS=[
    {pageId:'page-doctrine',    heroSelector:'.doc-split', bgSelector:'.doc-right-bg'},
    {pageId:'page-mandates',    heroSelector:'.np-hero',   bgSelector:'.np-hero-bg'},
    {pageId:'page-method',      heroSelector:'.np-hero',   bgSelector:'.np-hero-bg'},
    {pageId:'page-airass',      heroSelector:'.np-hero',   bgSelector:'.np-hero-bg'},
    {pageId:'page-principals',  heroSelector:'.np-hero',   bgSelector:'.np-hero-bg'},
    {pageId:'page-sessions',    heroSelector:'.np-hero',   bgSelector:'.np-hero-bg'},
    {pageId:'page-intake',      heroSelector:'.np-hero',   bgSelector:'.np-hero-bg'},
    {pageId:'page-journal',     heroSelector:'.np-hero',   bgSelector:'.np-hero-bg'},
    {pageId:'page-engagements', heroSelector:'.np-hero',   bgSelector:'.np-hero-bg'},
    {pageId:'page-direct',      heroSelector:'.np-hero',   bgSelector:'.np-hero-bg'}
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

/* ============================================================
   APPLY PAGE · BEFORE-THE-FORM ATLAS PROMPT
   - Triggers staggered fade-up of copy + demo conversation when
     the section scrolls into view (plays once)
   - Wires the "Talk to Atlas" CTA to open the floating chat
     panel and auto-seed the LeadSense flow by sending
     "I'd like to apply" as the first user turn
   No-op on every page that doesn't have an #ap-atlas section.
   ============================================================ */
(function(){
  const section = document.getElementById('ap-atlas');
  if(!section) return;

  /* Trigger animations on first viewport entry. The CSS does the
     work — we just toggle .is-in on the section and .in on each
     demo bubble in sequence so they appear like a live chat. */
  const demoMsgs = section.querySelectorAll('.ap-atlas-demo-msg');
  let played = false;
  const playDemo = ()=>{
    if(played) return;
    played = true;
    section.classList.add('is-in');
    /* Stagger the demo bubbles. Reduced-motion mode skips the
       per-bubble delays and shows everything immediately. */
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduce){
      demoMsgs.forEach(m => m.classList.add('in'));
      return;
    }
    /* First bubble appears after the panel itself slides in
       (~700ms), then each subsequent bubble follows. */
    const base = 700;
    const gap  = 850;
    demoMsgs.forEach((m, i) => setTimeout(() => m.classList.add('in'), base + i * gap));
  };

  if('IntersectionObserver' in window){
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if(e.isIntersecting) playDemo(); });
    }, { threshold: 0.35 });
    io.observe(section);
  } else {
    /* Old browser fallback: just play it on load. */
    playDemo();
  }

  /* "Talk to Atlas" CTA — open the chat panel (which lives in
     the floating widget at bottom-right) and seed the
     conversation with "I'd like to apply" so the LeadSense
     flow begins immediately. Falls back gracefully if any
     handles aren't wired (e.g. on a page where the chat isn't
     mounted). */
  const launchBtn = document.getElementById('ap-launch-atlas');
  if(launchBtn){
    launchBtn.addEventListener('click', () => {
      const cTgl = document.getElementById('chatTgl');
      const cWin = document.getElementById('chatWin');
      const willOpen = cWin && !cWin.classList.contains('open');
      if(willOpen && cTgl){
        cTgl.click();
      }
      /* Wait for the panel to open + auto-greet, then send the
         intent message so Atlas begins LeadSense. The 1.1s
         delay leaves room for the greeting bubble's 380ms
         delay plus a beat for the visitor to register it. */
      setTimeout(() => {
        if(typeof window.sQ === 'function'){
          /* sQ expects an element with textContent — supply a
             plain object that looks enough like one. */
          window.sQ({ textContent: "I'd like to apply" });
        }
      }, 1100);
    });
  }

  /* Skip-to-form link — smooth-scroll into the form section
     instead of jumping. The actual scroller on this site is the
     .page element (each route scrolls independently), so we
     compute the offset against that container and animate it
     manually for consistent behaviour across browsers. */
  const skipLink = section.querySelector('.ap-atlas-skip');
  if(skipLink){
    skipLink.addEventListener('click', e => {
      e.preventDefault();
      const target = document.getElementById('ap-form');
      if(!target) return;
      /* The scrollable container is the .page wrapper for this
         route. Fall back to documentElement if .page isn't found
         (e.g. if the markup moves to a different shell). */
      const scroller = target.closest('.page') || document.scrollingElement || document.documentElement;
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      /* Compute target Y inside the scroller. getBoundingClientRect
         returns viewport-relative coords; add the current scrollTop
         to convert to scroller-relative. */
      const targetY = target.getBoundingClientRect().top
                    - scroller.getBoundingClientRect().top
                    + scroller.scrollTop;
      /* Land a touch above the s-num-bar that sits just above the
         form, so the visitor sees the section heading too. */
      const offsetY = Math.max(0, targetY - 32);
      if(reduce){
        scroller.scrollTop = offsetY;
        return;
      }
      /* Most modern browsers (incl. Chrome / Edge / Safari / FF)
         honour scrollTo({behavior:'smooth'}) on scrollable
         elements, not just window. */
      if(typeof scroller.scrollTo === 'function'){
        scroller.scrollTo({ top: offsetY, behavior: 'smooth' });
      } else {
        scroller.scrollTop = offsetY;
      }
    });
  }
})();

})();

/* ============================================================
   TOPNAV — pure-CSS checkbox hack drives the mobile menu now.
   JS only handles two UX niceties:
     1. Mark current page link with aria-current.
     2. Uncheck the checkbox when a nav link is clicked or when
        the user clicks outside the menu (auto-close).
   No JS click handler on the toggle itself — the label/checkbox
   does it natively. That makes the menu work even before main.js
   loads (race-condition-proof) and on iOS Safari where some JS
   click handlers fail on first tap.
   ============================================================ */
(function topnavInit(){
  function bind(){
    var list   = document.getElementById('topnav-list');
    var toggle = document.querySelector('.topnav-toggle');

    /* CRITICAL iOS FIX: relocate .topnav-list based on viewport.
       On mobile (≤1024px): move it to be a direct child of <body> so
       position:fixed is truly relative to the viewport, not trapped by
       the position:sticky .topnav parent (which on iOS Safari and even
       desktop Chromium causes the dropdown to render under .page).
       On desktop (>1024px): keep it inside .topnav-inner so the
       horizontal navbar layout works naturally. */
    var inner = document.querySelector('.topnav-inner');
    function relocateMenu(){
      if (!list || !inner) return;
      var isMobile = window.innerWidth <= 1024;
      if (isMobile && list.parentElement !== document.body) {
        document.body.appendChild(list);
      } else if (!isMobile && list.parentElement !== inner) {
        inner.appendChild(list);
      }
    }
    relocateMenu();
    window.addEventListener('resize', relocateMenu);

    if (toggle && list) {
      /* Auto-close when a nav link is clicked. */
      list.addEventListener('click', function(e){
        if (e.target.tagName === 'A' && list.classList.contains('open')) {
          list.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
      /* Auto-close when clicking outside the menu/toggle. */
      document.addEventListener('click', function(e){
        if (!list.classList.contains('open')) return;
        if (toggle.contains(e.target) || list.contains(e.target)) return;
        list.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    }

    /* Mark the current page's nav link with aria-current="page". */
    try {
      var here = (location.pathname.split('/').pop() || 'home.html').toLowerCase();
      if (here === '' || here === 'index.html') here = 'home.html';
      document.querySelectorAll('.topnav-list a[href]').forEach(function(a){
        var href = (a.getAttribute('href') || '').toLowerCase();
        var base = href.split('/').pop();
        if (base === here) a.setAttribute('aria-current', 'page');
      });
    } catch(_){}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
