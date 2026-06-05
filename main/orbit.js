(function(){
  const stage = document.getElementById('orbit-stage');
  if(!stage) return;
  const nodes = stage.querySelectorAll('.orbit-node');
  const links = stage.querySelectorAll('.orbit-link');

  const cCoord   = document.getElementById('orb-coord');
  const cTag     = document.getElementById('orb-tag');
  const cName    = document.getElementById('orb-name');
  const cClass   = document.getElementById('orb-class');
  const cDesc    = document.getElementById('orb-desc');
  const cCadence = document.getElementById('orb-cadence');
  const cTerm    = document.getElementById('orb-term');
  const cFit     = document.getElementById('orb-fit');

  const tiers = [
    {
      coord:'TIER.01', tag:'SIGNATURE PARTNER',
      name:'Signature Partner',
      cls:'Foundation · Professionalisation',
      desc:'Foundational growth and brand infrastructure for startups, SMEs, and service businesses ready to formalise their market presence. The launch-pad tier — where most engagements begin.',
      cadence:'Monthly strategy · Atlas advisory · Quarterly performance reviews',
      term:'Quarterly minimum · Reviewed every 90 days',
      fit:'Startups, SMEs, professional service firms establishing market presence'
    },
    {
      coord:'TIER.02', tag:'GROWTH PARTNER',
      name:'Growth Partner',
      cls:'Core HIMARK Tier · Scale & Optimisation',
      desc:'Scalable growth and operational integration — the core HIMARK tier. Where businesses begin relying on us strategically and operationally as part of the growth engine.',
      cadence:'Weekly principal cadence · Live Slack/WhatsApp · Monthly board update',
      term:'Six-month minimum · Reviewed every 90 days',
      fit:'Scaling businesses, mid-sized companies, operationally heavy service firms'
    },
    {
      coord:'TIER.03', tag:'PRIVATE PARTNER',
      name:'Private Partner',
      cls:'Executive Transformation · By Invitation',
      desc:'Executive-level strategic transformation with a dedicated principal embedded with leadership. Enterprise AI, M&A architecture, capital strategy, executive branding. By invitation only.',
      cadence:'Real-time access · Dedicated principal · Direct line to founder',
      term:'12-month minimum · By invitation only',
      fit:'High-growth firms, enterprise clients, executive-led businesses scaling aggressively'
    }
  ];

  const valueEls = [cName, cClass, cDesc, cCadence, cTerm, cFit];

  let activeIdx = 0;
  let timer = null;
  let userTookOver = false;
  let resumeAfter = null;
  const INTERVAL = 7000;
  const FADE = 240;
  const RESUME_DELAY = 14000;

  function setActive(idx){
    if(idx === activeIdx && stage.classList.contains('has-active')) return;
    nodes.forEach(function(n,i){ n.classList.toggle('active', i === idx); });
    links.forEach(function(l){ l.classList.toggle('active', l.getAttribute('data-tier') === String(idx)); });
    stage.classList.add('has-active');

    valueEls.forEach(function(el){ el && el.classList.add('fading'); });
    setTimeout(function(){
      const t = tiers[idx];
      if(cCoord)   cCoord.textContent   = t.coord;
      if(cTag)     cTag.textContent     = t.tag;
      if(cName)    cName.textContent    = t.name;
      if(cClass)   cClass.textContent   = t.cls;
      if(cDesc)    cDesc.textContent    = t.desc;
      if(cCadence) cCadence.textContent = t.cadence;
      if(cTerm)    cTerm.textContent    = t.term;
      if(cFit)     cFit.textContent     = t.fit;
      valueEls.forEach(function(el){ el && el.classList.remove('fading'); });
    }, FADE);

    activeIdx = idx;
  }

  function nextTier(){ setActive((activeIdx + 1) % tiers.length); }
  function startTimer(){ if(timer) clearInterval(timer); timer = setInterval(nextTier, INTERVAL); }
  function stopTimer(){ if(timer){ clearInterval(timer); timer = null; } }

  nodes.forEach(function(node, i){
    function activate(){
      userTookOver = true;
      setActive(i);
      stopTimer();
      if(resumeAfter) clearTimeout(resumeAfter);
      resumeAfter = setTimeout(function(){
        userTookOver = false;
        startTimer();
      }, RESUME_DELAY);
    }
    node.addEventListener('click', activate);
    node.addEventListener('keydown', function(e){
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); activate(); }
    });
  });

  if('IntersectionObserver' in window){
    const io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){ if(!userTookOver) startTimer(); }
        else stopTimer();
      });
    }, { threshold: 0.2 });
    io.observe(stage);
  } else { startTimer(); }

  setActive(0);

  document.addEventListener('visibilitychange', function(){
    if(document.hidden) stopTimer();
    else if(!userTookOver && !stage.classList.contains('collapsed')) startTimer();
  });

  /* Tap-to-collapse on the orbit centre. */
  const core = document.getElementById('orbit-core');
  if(core){
    function toggleCollapse(){
      const willCollapse = !stage.classList.contains('collapsed');
      stage.classList.toggle('collapsed', willCollapse);
      core.setAttribute('aria-pressed', willCollapse ? 'false' : 'true');
      if(willCollapse){
        stopTimer();
      } else {
        userTookOver = false;
        startTimer();
      }
    }
    core.addEventListener('click', function(e){
      e.stopPropagation();
      toggleCollapse();
    });
    core.addEventListener('keydown', function(e){
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        toggleCollapse();
      }
    });
  }

  /* Atlas shortcut card opens the floating chat. */
  const atlasBtn = document.getElementById('orbit-shortcut-atlas');
  if(atlasBtn){
    atlasBtn.addEventListener('click', function(){
      const chatTgl = document.getElementById('chatTgl');
      if(chatTgl) chatTgl.click();
    });
  }
})();
