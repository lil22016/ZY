(function () {
  'use strict';

  var SETTINGS_KEY = 'loki_companion_settings_v1';
  var ART_KEY = 'loki_companion_art_v1';
  var state = null;
  var artUrl = '';
  var tickTimer = null;
  var wakeLock = null;
  var bubbleTimer = null;

  var support = [
    'One task at a time. You do not have to conquer the entire universe tonight.',
    'Stay with it. You are making more progress than it feels like.',
    'Finish this small part first. I will remain right here.',
    'You have handled far worse than an unfinished assignment.',
    'Breathe, read the next line, and continue.',
    'Your attention wandered. Bring it back gently.',
    'Keep going. I am watching, and yes, I am impressed.',
    'Do not measure the whole distance. Just take the next step.',
    'You are allowed to work slowly. You are not allowed to give up.',
    'Complete the paragraph. Then you may rest for a moment.'
  ];
  var soft = [
    'I am here. You can return to the task when you are ready.',
    'A little longer, darling. Then we can breathe.',
    'You need not do it perfectly. Only honestly.',
    'Come back to the page. I will keep you company.',
    'I know you are tired. Try one more small thing.'
  ];
  var tease = [
    'Poking me is not, regrettably, a recognized study method.',
    'Were you working, or merely arranging the appearance of work?',
    'Back to it. I refuse to be blamed for your deadline.',
    'You summoned a god merely to avoid one paragraph. Remarkable.',
    'Five more minutes of focus. Surely even you can manage that.'
  ];
  var stay = [
    'There you are.', 'Missed me already?', 'Yes, darling?',
    'You have my attention. Temporarily.',
    'Careful. Keep poking and I may retaliate.',
    'I was perfectly comfortable until you did that.',
    'How terribly needy. I approve.',
    'Again? Predictable—and rather endearing.',
    'I am still here.', 'Come closer, then.',
    'You do realize I can feel that, yes?'
  ];

  function defaults() {
    return { mode:'study', focusMinutes:25, breakMinutes:5, phase:'focus', running:false,
      endAt:0, remaining:1500, task:'', completed:0, artScale:100, artX:0, artY:0,
      flip:false, keepAwake:false };
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  async function load() {
    var saved = null;
    try { if (window.localforage) saved = await localforage.getItem(SETTINGS_KEY); } catch(e) {}
    if (!saved) { try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch(e) {} }
    state = Object.assign(defaults(), saved || {});
    if (state.running && state.endAt <= Date.now()) complete(true);
  }
  async function save() {
    try {
      if (window.localforage) { await localforage.setItem(SETTINGS_KEY, state); return; }
    } catch(e) {}
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state)); } catch(e) {}
  }

  function addStyles() {
    if (document.getElementById('lc-style')) return;
    var s = document.createElement('style'); s.id = 'lc-style';
    s.textContent = `
      .app-icon[data-app="companion"]{background:linear-gradient(145deg,#183728,#95753c)!important;color:#fff0bd!important}
      #lc-overlay{position:fixed;inset:0;z-index:10060;display:none;overflow:hidden;color:#faf5e6;background:radial-gradient(circle at 50% 15%,#3b5642 0,#18271f 43%,#090e0b 100%);font-family:var(--font-family,'Nunito',sans-serif)}
      #lc-overlay.on{display:block}.lc-shell{position:relative;width:min(100%,540px);height:100%;margin:auto;overflow:hidden}
      .lc-head{position:absolute;z-index:12;top:calc(env(safe-area-inset-top) + 12px);left:14px;right:14px;display:flex;align-items:center;justify-content:space-between}.lc-round{width:40px;height:40px;border:1px solid #ffffff32;border-radius:50%;background:#08100b66;color:white;font-size:18px}.lc-title{font-size:13px;letter-spacing:.17em;font-weight:800}
      .lc-tabs{position:absolute;z-index:12;top:calc(env(safe-area-inset-top) + 63px);left:50%;transform:translateX(-50%);display:flex;padding:4px;border-radius:18px;background:#07110b77;border:1px solid #ffffff20}.lc-tab{white-space:nowrap;border:0;border-radius:14px;padding:9px 13px;background:transparent;color:#ffffff8c;font-weight:700;font-size:12px}.lc-tab.active{background:#d8bc6f35;color:#fff1c4}
      #lc-stage{position:absolute;inset:0;overflow:hidden;touch-action:manipulation}.lc-glow{position:absolute;left:50%;bottom:3%;width:75%;height:18%;transform:translateX(-50%);border-radius:50%;background:radial-gradient(ellipse,#dfc27a40,transparent 68%);filter:blur(10px)}
      #lc-art-wrap{position:absolute;left:calc(50% + var(--x,0px));bottom:calc(3% + var(--y,0px));height:70%;width:92%;transform:translateX(-50%);display:flex;align-items:flex-end;justify-content:center;z-index:3;animation:lcIdle 5.5s ease-in-out infinite}#lc-art-wrap.tap{animation:lcTap .38s cubic-bezier(.2,.9,.3,1.25)}
      #lc-art{display:none;max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(0 14px 20px #0008);transform:scale(var(--scale,1)) scaleX(var(--flip,1));transform-origin:50% 100%;user-select:none;-webkit-user-drag:none}.lc-placeholder{align-self:center;text-align:center;color:#fff5d989;padding:30px}.lc-placeholder i{display:block;font-size:58px;color:#c0a15b;margin-bottom:14px}.lc-placeholder small{display:block;margin-top:7px}
      @keyframes lcIdle{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(-5px)}}@keyframes lcTap{0%{transform:translateX(-50%)}40%{transform:translateX(-50%) translateY(-15px) scale(.98,1.03)}100%{transform:translateX(-50%)}}
      #lc-bubble{position:absolute;z-index:8;left:50%;top:20%;width:min(78%,350px);padding:13px 16px;transform:translate(-50%,8px) scale(.96);opacity:0;border-radius:18px;background:#f7f0ddf2;color:#1c291f;text-align:center;font-size:13px;line-height:1.45;box-shadow:0 10px 30px #0005;transition:.22s;pointer-events:none}#lc-bubble.show{opacity:1;transform:translate(-50%,0) scale(1)}
      .lc-spark{position:absolute;z-index:7;width:8px;height:8px;border-radius:50%;background:#edcf73;box-shadow:0 0 12px #f5dc8c;pointer-events:none;animation:lcSpark .65s ease-out forwards}@keyframes lcSpark{to{transform:translate(var(--sx),var(--sy)) scale(0);opacity:0}}
      #lc-study{position:absolute;z-index:10;left:14px;right:14px;bottom:calc(env(safe-area-inset-bottom) + 14px);padding:14px;border:1px solid #fff2cc20;border-radius:22px;background:#08110cbb;backdrop-filter:blur(18px)}#lc-task{box-sizing:border-box;width:100%;padding:7px 3px 9px;border:0;border-bottom:1px solid #ffffff35;background:transparent;color:white;text-align:center;outline:none}.lc-clock{text-align:center;font-size:43px;font-weight:800;font-variant-numeric:tabular-nums;margin:8px 0 2px}.lc-phase{text-align:center;font-size:10px;letter-spacing:.2em;color:#dccb96}.lc-controls{display:flex;justify-content:center;gap:9px;margin-top:10px}.lc-btn{border:0;border-radius:14px;padding:10px 15px;background:#ffffff19;color:white;font-weight:700}.lc-btn.primary{background:linear-gradient(135deg,#ddc780,#8dad8d);color:#142118}.lc-count{text-align:center;margin-top:8px;font-size:10px;color:#ffffff7d}.lc-stay-hint{position:absolute;z-index:5;left:50%;bottom:calc(env(safe-area-inset-bottom) + 24px);transform:translateX(-50%);font-size:11px;color:#ffffff79;white-space:nowrap}
      #lc-settings{position:absolute;z-index:20;inset:0;display:none;overflow:auto;padding:calc(env(safe-area-inset-top) + 60px) 22px calc(env(safe-area-inset-bottom) + 30px);background:#080e0af7}#lc-settings.on{display:block}#lc-settings h3{text-align:center}.lc-card{max-width:430px;margin:0 auto 13px;padding:16px;border-radius:18px;background:#ffffff0f}.lc-upload{width:100%;padding:13px;border:1px dashed #e6d18e73;border-radius:14px;background:#d6be7614;color:#f4e3ac;font-weight:700}.lc-row{display:grid;grid-template-columns:82px 1fr 44px;align-items:center;gap:8px;margin:13px 0;font-size:12px}.lc-row input{width:100%}.lc-toggle{display:flex;justify-content:space-between;margin:12px 0;font-size:12px}.lc-number{width:58px;padding:7px;border:1px solid #ffffff2a;border-radius:9px;background:#152019;color:white;text-align:center}
    `; document.head.appendChild(s);
  }

  function replaceIcon() {
    if (document.querySelector('.app-icon[data-app="companion"]')) return;
    var icon = document.querySelector('.app-icon[data-app="accounting"]'); if (!icon) return;
    var item = icon.closest('.app-item'); icon.dataset.app = 'companion'; icon.innerHTML = '<i class="fas fa-hourglass-half"></i>';
    if (item) { item.setAttribute('onclick','window.LokiCompanionApp.show()'); var n=item.querySelector('.app-name'); if(n)n.textContent='Loki陪伴'; }
  }

  function addUI() {
    if (document.getElementById('lc-overlay')) return;
    var d=document.createElement('div'); d.id='lc-overlay';
    d.innerHTML=`<div class="lc-shell"><div class="lc-head"><button class="lc-round" id="lc-close">‹</button><div class="lc-title">LOKI COMPANION</div><button class="lc-round" id="lc-open-settings"><i class="fas fa-sliders-h"></i></button></div>
    <div class="lc-tabs"><button class="lc-tab" data-mode="study">Study with Loki</button><button class="lc-tab" data-mode="stay">Stay with Loki</button></div>
    <div id="lc-stage"><div class="lc-glow"></div><div id="lc-bubble"></div><div id="lc-art-wrap"><img id="lc-art" alt="Loki"><div class="lc-placeholder" id="lc-placeholder"><i class="fas fa-crown"></i>Upload Loki’s transparent artwork<small>PNG or WebP works best</small></div></div><div class="lc-stay-hint" id="lc-stay-hint">Tap Loki to interact</div></div>
    <div id="lc-study"><input id="lc-task" placeholder="What are we working on?"><div class="lc-clock" id="lc-clock">25:00</div><div class="lc-phase" id="lc-phase">FOCUS</div><div class="lc-controls"><button class="lc-btn" id="lc-reset">Reset</button><button class="lc-btn primary" id="lc-start">Start</button><button class="lc-btn" id="lc-switch">Break</button></div><div class="lc-count" id="lc-count"></div></div>
    <div id="lc-settings"><h3>Companion Settings</h3><div class="lc-card"><input type="file" accept="image/png,image/webp,image/*" id="lc-file" hidden><button class="lc-upload" id="lc-upload">Upload transparent artwork</button><button class="lc-btn" id="lc-remove" style="width:100%;margin-top:9px">Remove artwork</button></div>
    <div class="lc-card"><div class="lc-row"><span>Size</span><input type="range" id="lc-scale" min="50" max="145"><span id="lc-scale-v"></span></div><div class="lc-row"><span>Left/right</span><input type="range" id="lc-x" min="-120" max="120"><span id="lc-x-v"></span></div><div class="lc-row"><span>Up/down</span><input type="range" id="lc-y" min="-120" max="160"><span id="lc-y-v"></span></div><label class="lc-toggle"><span>Mirror artwork</span><input type="checkbox" id="lc-flip"></label><label class="lc-toggle"><span>Keep screen awake</span><input type="checkbox" id="lc-awake"></label></div>
    <div class="lc-card" style="text-align:center;font-size:12px">Timer lengths<br><br><label>Focus <input class="lc-number" type="number" id="lc-focus" min="1" max="180"></label>&nbsp;&nbsp;<label>Break <input class="lc-number" type="number" id="lc-break" min="1" max="60"></label></div><button class="lc-btn primary" id="lc-done" style="display:block;width:min(100%,430px);margin:18px auto">Done</button></div></div>`;
    document.body.appendChild(d); bind();
  }

  function bind() {
    document.getElementById('lc-close').onclick=hide;
    document.getElementById('lc-open-settings').onclick=openSettings;
    document.getElementById('lc-done').onclick=closeSettings;
    document.getElementById('lc-start').onclick=toggleTimer;
    document.getElementById('lc-reset').onclick=resetTimer;
    document.getElementById('lc-switch').onclick=switchPhase;
    document.getElementById('lc-task').onchange=function(){state.task=this.value;save();};
    document.querySelectorAll('.lc-tab').forEach(function(b){b.onclick=function(){setMode(b.dataset.mode);};});
    document.getElementById('lc-art-wrap').onclick=interact;
    document.getElementById('lc-upload').onclick=function(){document.getElementById('lc-file').click();};
    document.getElementById('lc-file').onchange=uploadArt;
    document.getElementById('lc-remove').onclick=removeArt;
    ['scale','x','y'].forEach(function(k){document.getElementById('lc-'+k).oninput=function(){state[k==='scale'?'artScale':'art'+k.toUpperCase()]=Number(this.value);applyArt();save();};});
    document.getElementById('lc-flip').onchange=function(){state.flip=this.checked;applyArt();save();};
    document.getElementById('lc-awake').onchange=function(){state.keepAwake=this.checked;save();state.keepAwake?requestWake():releaseWake();};
    document.getElementById('lc-focus').onchange=updateDurations; document.getElementById('lc-break').onchange=updateDurations;
  }

  async function loadArt(){var blob=null;try{blob=await localforage.getItem(ART_KEY);}catch(e){}if(artUrl)URL.revokeObjectURL(artUrl);artUrl=blob instanceof Blob?URL.createObjectURL(blob):'';var i=document.getElementById('lc-art'),p=document.getElementById('lc-placeholder');if(artUrl){i.src=artUrl;i.style.display='block';p.style.display='none';}else{i.style.display='none';p.style.display='block';}}
  async function uploadArt(e){var f=e.target.files&&e.target.files[0];if(!f)return;try{await localforage.setItem(ART_KEY,f);await loadArt();bubble('There. A far more suitable form.');}catch(x){alert('The image could not be saved. Try a smaller PNG or WebP.');}e.target.value='';}
  async function removeArt(){try{await localforage.removeItem(ART_KEY);}catch(e){}await loadArt();}
  function applyArt(){var w=document.getElementById('lc-art-wrap'),i=document.getElementById('lc-art');w.style.setProperty('--x',state.artX+'px');w.style.setProperty('--y',state.artY+'px');i.style.setProperty('--scale',state.artScale/100);i.style.setProperty('--flip',state.flip?-1:1);document.getElementById('lc-scale-v').textContent=state.artScale+'%';document.getElementById('lc-x-v').textContent=state.artX;document.getElementById('lc-y-v').textContent=state.artY;}

  function setMode(m){state.mode=m;document.querySelectorAll('.lc-tab').forEach(function(b){b.classList.toggle('active',b.dataset.mode===m);});document.getElementById('lc-study').style.display=m==='study'?'block':'none';document.getElementById('lc-stay-hint').style.display=m==='stay'?'block':'none';save();}
  function studyReply(){var r=Math.random();return r<.60?pick(support):(r<.85?pick(soft):pick(tease));}
  function interact(e){e.stopPropagation();var w=document.getElementById('lc-art-wrap');w.classList.remove('tap');void w.offsetWidth;w.classList.add('tap');setTimeout(function(){w.classList.remove('tap');},420);bubble(state.mode==='study'?studyReply():pick(stay));sparks(e.clientX,e.clientY);}
  function bubble(t){var b=document.getElementById('lc-bubble');b.textContent=t;b.classList.add('show');clearTimeout(bubbleTimer);bubbleTimer=setTimeout(function(){b.classList.remove('show');},4200);}
  function sparks(x,y){var st=document.getElementById('lc-stage'),r=st.getBoundingClientRect();for(var n=0;n<7;n++){var p=document.createElement('span');p.className='lc-spark';p.style.left=(x-r.left)+'px';p.style.top=(y-r.top)+'px';var a=Math.random()*Math.PI*2,d=25+Math.random()*35;p.style.setProperty('--sx',Math.cos(a)*d+'px');p.style.setProperty('--sy',Math.sin(a)*d+'px');st.appendChild(p);setTimeout((function(q){return function(){q.remove();};})(p),700);}}

  function left(){return state.running?Math.max(0,Math.ceil((state.endAt-Date.now())/1000)):state.remaining;}
  function fmt(v){return String(Math.floor(v/60)).padStart(2,'0')+':'+String(v%60).padStart(2,'0');}
  function renderTimer(){var v=left();if(state.running&&v<=0){complete(false);return;}document.getElementById('lc-clock').textContent=fmt(v);document.getElementById('lc-phase').textContent=state.phase==='focus'?'FOCUS':'BREAK';document.getElementById('lc-start').textContent=state.running?'Pause':'Start';document.getElementById('lc-switch').textContent=state.phase==='focus'?'Break':'Focus';document.getElementById('lc-count').textContent='Completed focus sessions: '+state.completed;}
  function toggleTimer(){if(state.running){state.remaining=left();state.running=false;state.endAt=0;}else{state.running=true;state.endAt=Date.now()+Math.max(1,state.remaining)*1000;bubble(state.phase==='focus'?'Very well. Let us begin.':'Take the break. You have earned it.');}save();renderTimer();}
  function resetTimer(){state.running=false;state.endAt=0;state.remaining=(state.phase==='focus'?state.focusMinutes:state.breakMinutes)*60;save();renderTimer();}
  function switchPhase(){state.phase=state.phase==='focus'?'break':'focus';resetTimer();}
  function complete(silent){var f=state.phase==='focus';if(f)state.completed++;state.running=false;state.endAt=0;state.phase=f?'break':'focus';state.remaining=(state.phase==='focus'?state.focusMinutes:state.breakMinutes)*60;save();if(!silent){chime();bubble(f?'Time. You did well—now breathe.':'Break is over. Shall we continue?');}if(document.getElementById('lc-clock'))renderTimer();}
  function chime(){try{var C=window.AudioContext||window.webkitAudioContext,c=new C(),o=c.createOscillator(),g=c.createGain();o.frequency.value=660;g.gain.setValueAtTime(.12,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.7);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.7);}catch(e){}}
  function updateDurations(){state.focusMinutes=Math.min(180,Math.max(1,Number(document.getElementById('lc-focus').value)||25));state.breakMinutes=Math.min(60,Math.max(1,Number(document.getElementById('lc-break').value)||5));if(!state.running)state.remaining=(state.phase==='focus'?state.focusMinutes:state.breakMinutes)*60;save();renderTimer();}

  function openSettings(){var q=function(id){return document.getElementById(id);};q('lc-settings').classList.add('on');q('lc-scale').value=state.artScale;q('lc-x').value=state.artX;q('lc-y').value=state.artY;q('lc-flip').checked=state.flip;q('lc-awake').checked=state.keepAwake;q('lc-focus').value=state.focusMinutes;q('lc-break').value=state.breakMinutes;applyArt();}
  function closeSettings(){updateDurations();document.getElementById('lc-settings').classList.remove('on');}
  async function requestWake(){try{if('wakeLock'in navigator)wakeLock=await navigator.wakeLock.request('screen');}catch(e){}}
  function releaseWake(){try{if(wakeLock)wakeLock.release();}catch(e){}wakeLock=null;}

  async function show(){addStyles();addUI();await load();await loadArt();document.getElementById('lc-task').value=state.task;applyArt();setMode(state.mode);renderTimer();clearInterval(tickTimer);tickTimer=setInterval(renderTimer,500);document.getElementById('lc-overlay').classList.add('on');document.body.style.overflow='hidden';if(state.keepAwake)requestWake();}
  function hide(){document.getElementById('lc-overlay').classList.remove('on');document.getElementById('lc-settings').classList.remove('on');document.body.style.overflow='';releaseWake();}

  window.LokiCompanionApp={show:show,hide:hide}; addStyles(); replaceIcon();
})();
