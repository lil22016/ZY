(function () {
    'use strict';

    var STORAGE_KEY = 'resonance_state_v1';
    var DETECTION_TTL = 30 * 60 * 1000;
    var BOOST_COOLDOWN = 6 * 60 * 60 * 1000;
    var MIN_CONNECTION_INTERVAL = 15 * 60 * 1000;
    var MAX_CONNECTION_INTERVAL = 24 * 60 * 60 * 1000;
    var NEARBY_CHANCE = 0.55;
    var state = null;
    var cooldownTimer = null;
    var connectionTimer = null;

    var nearbyMessages = [
        'A familiar presence has entered your range.',
        'Loki is nearby. Closer than you expected.',
        'A distinct Loki-shaped signal has been detected.',
        'He is here—quiet, but unmistakable.',
        'The radar caught him lingering close to you.'
    ];

    var awayMessages = [
        'Loki is currently out of range.',
        'No nearby signal. He may be handling TVA business.',
        'He seems to be wandering elsewhere—for now.',
        'No presence detected. Perhaps he is between timelines.',
        'The space around you is quiet. He may return later.',
        'Signal absent. He is probably occupied with some mischief.'
    ];

    var connectionLabels = [
        '',
        'Signal barely detected',
        'A faint, fragmented connection',
        'Steady resonance',
        'Strong and remarkably clear',
        'Perfect synchronization'
    ];

    function randomItem(list) {
        return list[Math.floor(Math.random() * list.length)];
    }

    function weightedConnection() {
        var r = Math.random();
        if (r < 0.08) return 1;
        if (r < 0.26) return 2;
        if (r < 0.64) return 3;
        if (r < 0.90) return 4;
        return 5;
    }

    function randomConnectionInterval() {
        var r = Math.random();
        var min;
        var max;
        if (r < 0.25) {
            min = 15 * 60 * 1000;
            max = 60 * 60 * 1000;
        } else if (r < 0.60) {
            min = 60 * 60 * 1000;
            max = 4 * 60 * 60 * 1000;
        } else if (r < 0.85) {
            min = 4 * 60 * 60 * 1000;
            max = 12 * 60 * 60 * 1000;
        } else {
            min = 12 * 60 * 60 * 1000;
            max = MAX_CONNECTION_INTERVAL;
        }
        return Math.max(MIN_CONNECTION_INTERVAL, Math.floor(min + Math.random() * (max - min)));
    }

    function nextDifferentConnection(current) {
        var next = current;
        for (var i = 0; i < 12 && next === current; i++) next = weightedConnection();
        if (next === current) next = current === 5 ? 4 : current + 1;
        return next;
    }

    function defaultState() {
        return {
            version: 2,
            connection: weightedConnection(),
            connectionNextChangeAt: Date.now() + randomConnectionInterval(),
            nearby: null,
            angle: 0,
            distance: 0,
            direction: '',
            detectionMessage: 'Tap Detect to scan your surroundings.',
            detectedAt: 0,
            detectionExpiresAt: 0,
            boostCooldownUntil: 0,
            boostMessage: 'Strengthening affects the connection only—not physical proximity.'
        };
    }

    async function loadState() {
        var saved = null;
        try {
            if (window.localforage) saved = await localforage.getItem(STORAGE_KEY);
        } catch (e) {}
        if (!saved) {
            try {
                var legacy = localStorage.getItem(STORAGE_KEY);
                if (legacy) saved = JSON.parse(legacy);
            } catch (e) {}
        }
        state = Object.assign(defaultState(), saved || {});
        state.version = 2;
        if (!state.connectionNextChangeAt) {
            state.connectionNextChangeAt = Date.now() + randomConnectionInterval();
        } else if (Date.now() >= state.connectionNextChangeAt) {
            state.connection = nextDifferentConnection(state.connection);
            state.connectionNextChangeAt = Date.now() + randomConnectionInterval();
            state.boostMessage = 'Loki’s availability shifted, and the natural signal changed.';
            await saveState();
        }
        if (state.detectionExpiresAt && Date.now() >= state.detectionExpiresAt) {
            state.nearby = null;
            state.detectionMessage = 'The previous reading has faded. Scan again.';
        }
        return state;
    }

    async function changeConnectionNaturally() {
        if (!state) return;
        state.connection = nextDifferentConnection(state.connection);
        state.connectionNextChangeAt = Date.now() + randomConnectionInterval();
        state.boostMessage = 'Loki’s availability shifted, and the natural signal changed.';
        await saveState();
        renderConnection();
        armConnectionTimer();
    }

    function armConnectionTimer() {
        if (connectionTimer) clearTimeout(connectionTimer);
        if (!state || !state.connectionNextChangeAt) return;
        var wait = Math.max(0, state.connectionNextChangeAt - Date.now());
        connectionTimer = setTimeout(changeConnectionNaturally, wait);
    }

    async function saveState() {
        try {
            if (window.localforage) {
                await localforage.setItem(STORAGE_KEY, state);
                try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
                return;
            }
        } catch (e) {}
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
    }

    function parseProfileAvatar(raw) {
        if (!raw) return '';
        if (typeof raw === 'object') return raw.avatar || '';
        try {
            var parsed = JSON.parse(raw);
            return parsed && parsed.avatar ? parsed.avatar : '';
        } catch (e) { return ''; }
    }

    async function getAvatar(who) {
        var isMe = who === 'me';
        var avatarKey = 'home_avatar_' + who;
        var profileKey = 'profile_' + who;
        var value = '';
        try {
            if (typeof window.homeGetGlobal === 'function') {
                value = window.homeGetGlobal(avatarKey) || parseProfileAvatar(window.homeGetGlobal(profileKey));
            }
        } catch (e) {}
        if (!value) {
            try { value = localStorage.getItem(avatarKey) || parseProfileAvatar(localStorage.getItem(profileKey)); } catch (e) {}
        }
        if (!value && window.settings) value = isMe ? window.settings.myAvatar : window.settings.partnerAvatar;
        if (!value && window.localforage) {
            try { value = await localforage.getItem(avatarKey) || parseProfileAvatar(await localforage.getItem(profileKey)); } catch (e) {}
        }
        return value || ('https://api.dicebear.com/7.x/avataaars/svg?seed=' + (isMe ? 'me' : 'partner'));
    }

    function getName(who) {
        var fallback = who === 'me' ? 'You' : 'Loki';
        try {
            if (window.profileData && window.profileData[who] && window.profileData[who].name) return window.profileData[who].name;
            var raw = typeof window.homeGetGlobal === 'function' ? window.homeGetGlobal('profile_' + who) : localStorage.getItem('profile_' + who);
            if (raw) {
                var p = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (p && p.name) return p.name;
            }
        } catch (e) {}
        return fallback;
    }

    function directionForAngle(angle) {
        var names = ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'];
        return names[Math.round(angle / 45) % 8];
    }

    function distanceLabel(distance) {
        if (distance < 18) return 'very close';
        if (distance < 27) return 'nearby';
        return 'at the edge of your range';
    }

    function injectStyles() {
        if (document.getElementById('resonance-styles')) return;
        var style = document.createElement('style');
        style.id = 'resonance-styles';
        style.textContent = `
            .app-icon[data-app="resonance"]{background:linear-gradient(145deg,#14243a,#527d83)!important;color:#d7fff5!important;box-shadow:0 7px 18px rgba(30,80,88,.32)}
            .resonance-overlay{position:fixed;inset:0;z-index:10050;display:none;background:radial-gradient(circle at 50% 20%,#193b44 0,#101b2b 38%,#090d17 100%);color:#eefdf8;font-family:var(--font-family,'Nunito',sans-serif);overflow:auto;-webkit-overflow-scrolling:touch}
            .resonance-overlay.active{display:block}
            .resonance-shell{width:min(100%,520px);min-height:100%;margin:0 auto;padding:calc(env(safe-area-inset-top) + 16px) 18px calc(env(safe-area-inset-bottom) + 30px)}
            .resonance-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
            .resonance-close{width:38px;height:38px;border:1px solid rgba(210,255,245,.22);border-radius:50%;background:rgba(255,255,255,.06);color:#eff;font-size:18px}
            .resonance-title{text-align:center;letter-spacing:.18em;font-size:16px;font-weight:700}
            .resonance-subtitle{text-align:center;color:rgba(222,255,247,.62);font-size:11px;letter-spacing:.12em;margin-bottom:14px}
            .resonance-radar{position:relative;width:min(82vw,350px);aspect-ratio:1;margin:0 auto;border-radius:50%;overflow:hidden;border:1px solid rgba(119,244,216,.5);background:radial-gradient(circle,rgba(88,217,191,.16) 0 1px,transparent 2px),repeating-radial-gradient(circle,transparent 0 16.2%,rgba(113,237,211,.18) 16.7% 17.1%,transparent 17.7% 33.1%);box-shadow:0 0 34px rgba(60,217,190,.14),inset 0 0 32px rgba(21,107,103,.24)}
            .resonance-radar:before,.resonance-radar:after{content:"";position:absolute;background:rgba(124,238,216,.18)}
            .resonance-radar:before{left:50%;top:0;width:1px;height:100%}.resonance-radar:after{top:50%;left:0;height:1px;width:100%}
            .resonance-sweep{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from -15deg,rgba(95,255,220,.38),rgba(95,255,220,.07) 25deg,transparent 72deg);opacity:.38;transform:rotate(0deg)}
            .resonance-radar.scanning .resonance-sweep{opacity:1;animation:resonanceSweep 1.15s linear infinite}
            @keyframes resonanceSweep{to{transform:rotate(360deg)}}
            .resonance-avatar{position:absolute;width:58px;height:58px;border-radius:50%;object-fit:cover;border:2px solid #c7fff1;background:#233;box-shadow:0 0 0 5px rgba(102,240,211,.12),0 0 22px rgba(111,255,225,.55);transform:translate(-50%,-50%);z-index:4}
            .resonance-avatar.me{left:50%;top:50%}.resonance-avatar.loki{opacity:0;transition:left .75s ease,top .75s ease,opacity .4s ease;filter:saturate(1.08)}
            .resonance-avatar.loki.visible{opacity:1}
            .resonance-ping{position:absolute;width:84px;height:84px;left:50%;top:50%;transform:translate(-50%,-50%);border:1px solid rgba(141,255,232,.55);border-radius:50%;animation:resonancePing 2s ease-out infinite}
            @keyframes resonancePing{0%{transform:translate(-50%,-50%) scale(.45);opacity:.9}100%{transform:translate(-50%,-50%) scale(1.35);opacity:0}}
            .resonance-result{min-height:66px;text-align:center;padding:13px 8px 7px}
            .resonance-result-main{font-size:15px;font-weight:700}.resonance-result-detail{font-size:12px;color:rgba(231,255,249,.68);margin-top:5px;line-height:1.45}
            .resonance-btn{display:block;width:min(84%,330px);margin:8px auto;border:0;border-radius:16px;padding:13px 16px;color:#09201d;background:linear-gradient(135deg,#b9f6e8,#68d7c0);font-weight:800;letter-spacing:.05em;box-shadow:0 8px 22px rgba(55,212,181,.18)}
            .resonance-card{margin:20px auto 0;padding:20px 16px;width:min(100%,410px);border:1px solid rgba(207,255,244,.15);border-radius:22px;background:rgba(255,255,255,.055);backdrop-filter:blur(14px);text-align:center}
            .resonance-card-title{font-size:12px;letter-spacing:.18em;color:rgba(231,255,249,.65);text-transform:uppercase}
            .resonance-hearts{display:flex;justify-content:center;gap:9px;margin:13px 0 8px}
            .resonance-heart{font-size:31px;color:rgba(255,255,255,.13);text-shadow:none;transition:.25s}.resonance-heart.on{color:#df7fa8;text-shadow:0 0 13px rgba(236,106,160,.56)}
            .resonance-connection-label{font-weight:700;font-size:15px}.resonance-explain{font-size:11px;line-height:1.45;color:rgba(232,255,249,.56);margin:7px auto 13px;max-width:330px}
            .resonance-boost{background:linear-gradient(135deg,#8c6cc7,#d48cac);color:#fff}.resonance-boost:disabled{opacity:.48;filter:grayscale(.25)}
            .resonance-boost-note{min-height:34px;font-size:11px;color:rgba(236,226,255,.68);line-height:1.45;margin-top:9px}
        `;
        document.head.appendChild(style);
    }

    function injectAppIcon() {
        if (document.querySelector('.app-icon[data-app="resonance"]')) return;
        var mapIcon = document.querySelector('.app-icon[data-app="map"]');
        var grid = mapIcon && mapIcon.closest('.apps-grid');
        if (!grid) return;
        var item = document.createElement('div');
        item.className = 'app-item';
        item.setAttribute('onclick', 'window.ResonanceApp.show()');
        item.innerHTML = '<div class="app-icon" data-app="resonance"><i class="fas fa-satellite-dish"></i></div><span class="app-name">Resonance</span>';
        var mapItem = mapIcon.closest('.app-item');
        if (mapItem && mapItem.nextSibling) grid.insertBefore(item, mapItem.nextSibling);
        else grid.appendChild(item);
    }

    function injectOverlay() {
        if (document.getElementById('resonance-overlay')) return;
        var overlay = document.createElement('div');
        overlay.id = 'resonance-overlay';
        overlay.className = 'resonance-overlay';
        overlay.innerHTML = `
            <div class="resonance-shell">
                <div class="resonance-header">
                    <button class="resonance-close" id="resonance-close" aria-label="Close">‹</button>
                    <div class="resonance-title">RESONANCE</div>
                    <div style="width:38px"></div>
                </div>
                <div class="resonance-subtitle">PROXIMITY & CONNECTION READER</div>
                <div class="resonance-radar" id="resonance-radar">
                    <div class="resonance-sweep"></div>
                    <div class="resonance-ping"></div>
                    <img class="resonance-avatar me" id="resonance-me-avatar" alt="You">
                    <img class="resonance-avatar loki" id="resonance-loki-avatar" alt="Loki">
                </div>
                <div class="resonance-result">
                    <div class="resonance-result-main" id="resonance-result-main">Ready to scan</div>
                    <div class="resonance-result-detail" id="resonance-result-detail">Tap Detect to scan your surroundings.</div>
                </div>
                <button class="resonance-btn" id="resonance-detect">Detect</button>
                <div class="resonance-card">
                    <div class="resonance-card-title">Current connection</div>
                    <div class="resonance-hearts" id="resonance-hearts"></div>
                    <div class="resonance-connection-label" id="resonance-connection-label"></div>
                    <div class="resonance-explain">Connection measures signal clarity, not physical distance. A nearby presence may still produce fragmented messages.</div>
                    <button class="resonance-btn resonance-boost" id="resonance-boost">Strengthen Connection</button>
                    <div class="resonance-boost-note" id="resonance-boost-note"></div>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        document.getElementById('resonance-close').addEventListener('click', hide);
        document.getElementById('resonance-detect').addEventListener('click', detect);
        document.getElementById('resonance-boost').addEventListener('click', strengthen);
    }

    async function refreshAvatars() {
        var values = await Promise.all([getAvatar('me'), getAvatar('partner')]);
        var me = document.getElementById('resonance-me-avatar');
        var loki = document.getElementById('resonance-loki-avatar');
        if (me) me.src = values[0];
        if (loki) loki.src = values[1];
    }

    function renderPresence() {
        var main = document.getElementById('resonance-result-main');
        var detail = document.getElementById('resonance-result-detail');
        var loki = document.getElementById('resonance-loki-avatar');
        if (!main || !detail || !loki) return;
        if (state.nearby === true && Date.now() < state.detectionExpiresAt) {
            var rad = state.angle * Math.PI / 180;
            loki.style.left = (50 + Math.cos(rad) * state.distance) + '%';
            loki.style.top = (50 + Math.sin(rad) * state.distance) + '%';
            loki.classList.add('visible');
            main.textContent = getName('partner') + ' is nearby';
            detail.textContent = state.detectionMessage + ' Detected ' + distanceLabel(state.distance) + ' to the ' + state.direction + '.';
        } else if (state.nearby === false && Date.now() < state.detectionExpiresAt) {
            loki.classList.remove('visible');
            main.textContent = 'No presence detected';
            detail.textContent = state.detectionMessage;
        } else {
            loki.classList.remove('visible');
            main.textContent = 'Ready to scan';
            detail.textContent = state.detectionMessage || 'Tap Detect to scan your surroundings.';
        }
    }

    function renderConnection() {
        var hearts = document.getElementById('resonance-hearts');
        var label = document.getElementById('resonance-connection-label');
        if (!hearts || !label) return;
        hearts.innerHTML = '';
        for (var i = 1; i <= 5; i++) {
            var heart = document.createElement('span');
            heart.className = 'resonance-heart' + (i <= state.connection ? ' on' : '');
            heart.textContent = '♥';
            hearts.appendChild(heart);
        }
        label.textContent = state.connection + '/5 · ' + connectionLabels[state.connection];
        updateCooldown();
    }

    function formatRemaining(ms) {
        var total = Math.max(0, Math.ceil(ms / 1000));
        var h = Math.floor(total / 3600);
        var m = Math.floor((total % 3600) / 60);
        var s = total % 60;
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    function updateCooldown() {
        var btn = document.getElementById('resonance-boost');
        var note = document.getElementById('resonance-boost-note');
        if (!btn || !note || !state) return;
        var remaining = state.boostCooldownUntil - Date.now();
        if (remaining > 0) {
            btn.disabled = true;
            btn.textContent = 'Available in ' + formatRemaining(remaining);
        } else {
            btn.disabled = false;
            btn.textContent = 'Strengthen Connection';
        }
        note.textContent = state.boostMessage || '';
    }

    async function detect() {
        var btn = document.getElementById('resonance-detect');
        var radar = document.getElementById('resonance-radar');
        var main = document.getElementById('resonance-result-main');
        var detail = document.getElementById('resonance-result-detail');
        var loki = document.getElementById('resonance-loki-avatar');
        if (!btn || btn.disabled) return;
        btn.disabled = true;
        radar.classList.add('scanning');
        loki.classList.remove('visible');
        main.textContent = 'Scanning…';
        detail.textContent = 'Reading the space around you.';
        setTimeout(async function () {
            var nearby = Math.random() < NEARBY_CHANCE;
            state.nearby = nearby;
            state.detectedAt = Date.now();
            state.detectionExpiresAt = Date.now() + DETECTION_TTL;
            if (nearby) {
                state.angle = Math.random() * 360;
                state.distance = 13 + Math.random() * 22;
                state.direction = directionForAngle(state.angle);
                state.detectionMessage = randomItem(nearbyMessages);
            } else {
                state.detectionMessage = randomItem(awayMessages);
            }
            await saveState();
            radar.classList.remove('scanning');
            btn.disabled = false;
            renderPresence();
        }, 2200);
    }

    async function strengthen() {
        if (Date.now() < state.boostCooldownUntil) return;
        var before = state.connection;
        var roll = Math.random();
        var gain = roll < 0.10 ? 2 : (roll < 0.70 ? 1 : 0);
        state.connection = Math.min(5, state.connection + gain);
        state.boostCooldownUntil = Date.now() + BOOST_COOLDOWN;
        state.connectionNextChangeAt = Math.max(state.connectionNextChangeAt || 0, Date.now() + MIN_CONNECTION_INTERVAL);
        if (before === 5) {
            state.boostMessage = 'Already fully synchronized. The signal simply settles deeper.';
        } else if (state.connection > before) {
            state.boostMessage = state.connection === 5 ? 'The channel opens completely.' : 'The connection brightens by ' + (state.connection - before) + ' level' + (state.connection - before > 1 ? 's' : '') + '.';
        } else {
            state.boostMessage = randomItem([
                'No visible change—but the attempt was received.',
                'The signal holds steady. Try again when the channel reopens.',
                'Nothing shifted this time, though the connection remains intact.'
            ]);
        }
        await saveState();
        renderConnection();
        armConnectionTimer();
    }

    async function show() {
        injectStyles();
        injectOverlay();
        await loadState();
        await refreshAvatars();
        renderPresence();
        renderConnection();
        armConnectionTimer();
        document.getElementById('resonance-overlay').classList.add('active');
        document.body.style.overflow = 'hidden';
        if (cooldownTimer) clearInterval(cooldownTimer);
        cooldownTimer = setInterval(updateCooldown, 1000);
    }

    function hide() {
        var overlay = document.getElementById('resonance-overlay');
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = '';
        if (cooldownTimer) clearInterval(cooldownTimer);
        cooldownTimer = null;
    }

    window.ResonanceApp = { show: show, hide: hide, detect: detect, strengthen: strengthen };
    injectStyles();
    injectAppIcon();
})();
