(function () {
    'use strict';

    const PLAYLIST_ID = 'PLC9EYW4lXtkI';
    const STORAGE_KEY = 'ZY_LISTEN_TOGETHER_V1';
    const INVITE_COOLDOWN = 24 * 60 * 60 * 1000;
    let player = null;
    let playerReady = false;
    let progressTimer = null;
    let actionTimer = null;
    let currentVideoId = '';
    let state = loadState();

    const fallbackComments = [
        'Not a terrible choice. I may even allow it to continue.',
        'This one has atmosphere. Try not to ruin it by talking over the best part.',
        'You chose this deliberately, I assume. Good.',
        'Stay. Listen properly. The rest of the universe can wait.',
        'I can see why you kept this one.',
        'Hm. This sounds better with you here.',
        'Don’t look so pleased. I only said I liked the song.',
        'I was going to make a cutting remark, but the chorus saved you.',
        'This one stays.',
        'A surprisingly elegant choice, darling.'
    ];
    const inviteLines = [
        'Loki wants to listen to music with you.',
        'Come along. I found something worth hearing—with you, apparently.',
        'Put down whatever you are doing. One song. Perhaps two.',
        'I require your company for a listening session. Try not to be late.'
    ];

    function defaults() {
        return { lokiFavorites: {}, events: [], lastInviteAt: 0, shuffle: false, openedOnce: false };
    }
    function loadState() {
        try { return Object.assign(defaults(), JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {}); }
        catch (_) { return defaults(); }
    }
    function saveState() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function escapeHtml(value) {
        const div = document.createElement('div'); div.textContent = String(value == null ? '' : value); return div.innerHTML;
    }
    function plainCardPool() {
        try {
            if (!Array.isArray(customReplies)) return fallbackComments;
            const pool = customReplies.map(x => String(x || '').trim()).filter(x => x && x.length <= 150 && !/<[a-z][\s\S]*>/i.test(x) && !/^data:|^https?:/i.test(x));
            return pool.length ? pool : fallbackComments;
        } catch (_) { return fallbackComments; }
    }
    function addStyles() {
        if (document.getElementById('listen-together-style')) return;
        const style = document.createElement('style'); style.id = 'listen-together-style';
        style.textContent = `
        .app-icon[data-app="listen-together"]{position:relative;background:linear-gradient(145deg,#161832 0%,#443267 50%,#a14e73 100%)!important;color:#ffe9f1!important;border:1px solid rgba(255,220,239,.28)!important;box-shadow:0 7px 18px rgba(47,28,83,.38),inset 0 1px 0 rgba(255,255,255,.14)!important;overflow:hidden}.app-icon[data-app="listen-together"]:after{content:"";position:absolute;left:-9px;bottom:-13px;width:34px;height:34px;border-radius:50%;background:radial-gradient(circle,rgba(255,124,176,.35),transparent 68%)}.app-icon[data-app="listen-together"] i{position:relative;z-index:1;text-shadow:0 0 11px rgba(255,213,233,.58)}
        #lt-overlay{position:fixed;inset:0;z-index:10080;display:none;overflow:auto;-webkit-overflow-scrolling:touch;color:#f9f4ff;background:radial-gradient(circle at 50% 8%,#4a2852 0,#191a35 42%,#090a14 100%);font-family:var(--font-family,'Nunito',sans-serif)}#lt-overlay.on{display:block}
        .lt-shell{width:min(100%,500px);min-height:100%;margin:auto;padding:calc(env(safe-area-inset-top) + 14px) 16px calc(env(safe-area-inset-bottom) + 28px);box-sizing:border-box}.lt-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:15px}.lt-close{width:40px;height:40px;border-radius:50%;border:1px solid #ffffff29;background:#ffffff0d;color:#fff;font-size:18px}.lt-kicker{text-align:center;font-size:10px;letter-spacing:.22em;color:#e7b7d1}.lt-title{text-align:center;font-size:18px;font-weight:800;margin-top:3px}.lt-presence{width:40px;height:40px;border-radius:50%;border:1px solid #ffffff20;display:grid;place-items:center;color:#f3bad4;background:#ffffff0a}
        .lt-player-card{padding:11px;border:1px solid #ffffff20;border-radius:22px;background:#ffffff0b;box-shadow:0 18px 45px #0005;backdrop-filter:blur(16px)}.lt-video{position:relative;width:100%;aspect-ratio:16/9;border-radius:15px;overflow:hidden;background:#080811}.lt-video iframe{width:100%!important;height:100%!important}.lt-now{padding:13px 4px 4px}.lt-song{font-size:15px;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lt-artist{font-size:11px;color:#ffffff91;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .lt-progress{height:4px;border-radius:4px;background:#ffffff18;margin-top:12px;overflow:hidden}.lt-progress-fill{height:100%;width:0;background:linear-gradient(90deg,#c77aa7,#f3c9a7);transition:width .35s linear}.lt-time{display:flex;justify-content:space-between;font-size:9px;color:#ffffff72;margin-top:5px}.lt-controls{display:flex;align-items:center;justify-content:center;gap:16px;margin:14px 0 4px}.lt-control{border:0;background:transparent;color:#fff;font-size:19px;width:42px;height:42px;border-radius:50%}.lt-control.main{width:54px;height:54px;background:linear-gradient(145deg,#f1c3d5,#c983aa);color:#261629;font-size:20px;box-shadow:0 8px 24px #a34d7a55}.lt-control.active{color:#ff759d;background:#ffffff0c}.lt-control:disabled{opacity:.38}
        .lt-loki-card{margin-top:14px;padding:15px;border-radius:18px;border:1px solid #ffffff1c;background:#ffffff0b}.lt-loki-line{font-size:13px;line-height:1.55;color:#f8edf5;min-height:40px}.lt-loki-meta{display:flex;align-items:center;justify-content:space-between;margin-top:10px;font-size:10px;color:#ffffff73}.lt-heart{font-size:22px;color:#ffffff40;transition:.25s}.lt-heart.on{color:#ff587f;text-shadow:0 0 15px #ff547f99;transform:scale(1.08)}
        .lt-events{margin-top:14px;padding:13px;border-radius:18px;background:#08091475;border:1px solid #ffffff13}.lt-events-title{font-size:10px;letter-spacing:.16em;color:#d7aac1;margin-bottom:7px}.lt-event{font-size:11px;color:#ffffff98;padding:6px 0;border-bottom:1px solid #ffffff0d}.lt-event:last-child{border-bottom:0}.lt-hint{text-align:center;font-size:10px;color:#ffffff65;margin-top:12px;line-height:1.5}
        `;
        document.head.appendChild(style);
    }
    function inject() {
        addStyles();
        if (document.getElementById('lt-overlay')) return;
        const overlay = document.createElement('div'); overlay.id = 'lt-overlay';
        overlay.innerHTML = `<div class="lt-shell"><div class="lt-head"><button class="lt-close" id="lt-close"><i class="fas fa-chevron-left"></i></button><div><div class="lt-kicker">A SHARED FREQUENCY</div><div class="lt-title">Listen Together</div></div><div class="lt-presence"><i class="fas fa-link"></i></div></div><div class="lt-player-card"><div class="lt-video"><div id="lt-youtube-player"></div></div><div class="lt-now"><div class="lt-song" id="lt-song">Your YouTube Music playlist</div><div class="lt-artist" id="lt-artist">Tap play to begin listening together</div><div class="lt-progress"><div class="lt-progress-fill" id="lt-progress-fill"></div></div><div class="lt-time"><span id="lt-current">0:00</span><span id="lt-duration">0:00</span></div><div class="lt-controls"><button class="lt-control" id="lt-shuffle" title="随机播放"><i class="fas fa-random"></i></button><button class="lt-control" id="lt-prev"><i class="fas fa-step-backward"></i></button><button class="lt-control main" id="lt-play"><i class="fas fa-play"></i></button><button class="lt-control" id="lt-next"><i class="fas fa-step-forward"></i></button><button class="lt-control" id="lt-open-youtube" title="在 YouTube Music 打开"><i class="fas fa-external-link-alt"></i></button></div></div></div><div class="lt-loki-card"><div class="lt-loki-line" id="lt-loki-line">“Whenever you are ready, darling.”</div><div class="lt-loki-meta"><span id="lt-loki-status">Loki is waiting.</span><span class="lt-heart" id="lt-heart">♥</span></div></div><div class="lt-events"><div class="lt-events-title">SESSION</div><div id="lt-event-list"><div class="lt-event">The room is quiet. Press play when you are ready.</div></div></div><div class="lt-hint">YouTube controls the audio stream. On iPhone, the first play must be started by your tap, and background playback may still follow iOS restrictions.</div></div>`;
        document.body.appendChild(overlay);
        document.getElementById('lt-close').onclick = close;
        document.getElementById('lt-play').onclick = togglePlay;
        document.getElementById('lt-prev').onclick = () => playerReady && player.previousVideo();
        document.getElementById('lt-next').onclick = () => { if (playerReady) { addEvent('You skipped to the next song.'); player.nextVideo(); } };
        document.getElementById('lt-shuffle').onclick = toggleShuffle;
        document.getElementById('lt-open-youtube').onclick = () => window.open(`https://music.youtube.com/playlist?list=${PLAYLIST_ID}`, '_blank');
    }
    function loadYouTubeApi() {
        return new Promise(resolve => {
            if (window.YT && window.YT.Player) { resolve(); return; }
            window.__ltYouTubeWaiters = window.__ltYouTubeWaiters || [];
            window.__ltYouTubeWaiters.push(resolve);
            if (document.getElementById('youtube-iframe-api')) return;
            const previous = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = function () {
                if (typeof previous === 'function') { try { previous(); } catch (_) {} }
                const waiters = window.__ltYouTubeWaiters.splice(0); waiters.forEach(fn => fn());
            };
            const script = document.createElement('script'); script.id = 'youtube-iframe-api'; script.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(script);
        });
    }
    async function ensurePlayer() {
        if (player) return;
        await loadYouTubeApi();
        player = new YT.Player('lt-youtube-player', {
            width: '100%', height: '100%',
            playerVars: { playsinline: 1, controls: 1, rel: 0, origin: location.origin },
            events: {
                onReady: event => {
                    playerReady = true;
                    event.target.cuePlaylist({ listType: 'playlist', list: PLAYLIST_ID, index: 0, startSeconds: 0 });
                    event.target.setLoop(true);
                    if (state.shuffle) event.target.setShuffle(true);
                    updateButtons(); updateTrackInfo();
                },
                onStateChange: onPlayerState,
                onError: () => setLokiLine('The player refused that track. Irritating. Try the next one.', 'Playback error')
            }
        });
    }
    function open() {
        inject(); document.getElementById('lt-overlay').classList.add('on');
        state.openedOnce = true; saveState(); renderEvents(); ensurePlayer(); startProgress();
    }
    function close() {
        document.getElementById('lt-overlay').classList.remove('on'); stopProgress();
    }
    function togglePlay() {
        if (!playerReady) { setLokiLine('Patience. The playlist is still arriving.', 'Loading YouTube Music…'); return; }
        const status = player.getPlayerState();
        if (status === YT.PlayerState.PLAYING) player.pauseVideo();
        else if (status === YT.PlayerState.CUED || status === YT.PlayerState.UNSTARTED) player.loadPlaylist({ listType: 'playlist', list: PLAYLIST_ID, index: Math.max(0, player.getPlaylistIndex() || 0), startSeconds: 0 });
        else player.playVideo();
    }
    function toggleShuffle() {
        state.shuffle = !state.shuffle; saveState();
        if (playerReady) player.setShuffle(state.shuffle);
        updateButtons(); addEvent(state.shuffle ? 'The playlist was shuffled.' : 'The original playlist order was restored.');
    }
    function onPlayerState(event) {
        updateButtons();
        if (event.data === YT.PlayerState.PLAYING) {
            updateTrackInfo(); startProgress();
            const data = player.getVideoData ? player.getVideoData() : {};
            const videoId = data.video_id || '';
            if (videoId && videoId !== currentVideoId) {
                currentVideoId = videoId; addEvent(`Now playing: ${data.title || 'a new song'}`); scheduleLokiAction(videoId);
            }
            setLokiLine(pick(plainCardPool()), 'Loki is listening with you.');
        } else if (event.data === YT.PlayerState.PAUSED) {
            setLokiLine('Paused? Very well. I shall wait.', 'Loki is waiting.');
        } else if (event.data === YT.PlayerState.ENDED) {
            setLokiLine('That one is over. Let us see what comes next.', 'Choosing the next song…');
        }
    }
    function scheduleLokiAction(videoId) {
        clearTimeout(actionTimer);
        actionTimer = setTimeout(() => {
            if (!playerReady || currentVideoId !== videoId || player.getPlayerState() !== YT.PlayerState.PLAYING) return;
            const roll = Math.random();
            if (roll < 0.05) {
                setLokiLine('No. Not this one.', 'Loki skipped the song.'); addEvent('Loki skipped this song.'); player.nextVideo();
            } else if (roll < 0.35) {
                state.lokiFavorites[videoId] = true; saveState(); updateHeart();
                setLokiLine('This one stays.', 'Loki added this song to his favorites.'); addEvent('Loki liked this song ♥');
            } else if (roll < 0.78) {
                const line = pick(plainCardPool()); setLokiLine(line, 'Loki commented on the song.'); addEvent(`Loki: ${line}`);
            }
        }, 22000 + Math.random() * 38000);
    }
    function updateTrackInfo() {
        if (!playerReady || !player.getVideoData) return;
        const data = player.getVideoData() || {};
        const song = document.getElementById('lt-song'); const artist = document.getElementById('lt-artist');
        if (song) song.textContent = data.title || 'Your YouTube Music playlist';
        if (artist) artist.textContent = data.author || 'Listening together';
        updateHeart();
    }
    function updateHeart() {
        const heart = document.getElementById('lt-heart'); if (!heart) return;
        const data = playerReady && player.getVideoData ? player.getVideoData() : {};
        heart.classList.toggle('on', !!state.lokiFavorites[data.video_id || currentVideoId]);
    }
    function updateButtons() {
        const play = document.getElementById('lt-play'); const shuffle = document.getElementById('lt-shuffle');
        if (play) play.innerHTML = playerReady && player.getPlayerState() === 1 ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
        if (shuffle) shuffle.classList.toggle('active', !!state.shuffle);
    }
    function formatTime(seconds) {
        seconds = Math.max(0, Math.floor(Number(seconds) || 0)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }
    function startProgress() {
        stopProgress(); progressTimer = setInterval(() => {
            if (!playerReady) return;
            const current = player.getCurrentTime() || 0; const duration = player.getDuration() || 0;
            const fill = document.getElementById('lt-progress-fill'); if (fill) fill.style.width = duration ? `${Math.min(100, current / duration * 100)}%` : '0%';
            const a = document.getElementById('lt-current'); const b = document.getElementById('lt-duration'); if (a) a.textContent = formatTime(current); if (b) b.textContent = formatTime(duration);
        }, 700);
    }
    function stopProgress() { if (progressTimer) clearInterval(progressTimer); progressTimer = null; }
    function setLokiLine(text, status) {
        const line = document.getElementById('lt-loki-line'); const meta = document.getElementById('lt-loki-status');
        if (line) line.textContent = `“${String(text || '')}”`; if (meta) meta.textContent = status || 'Loki is listening.';
    }
    function addEvent(text) {
        state.events.unshift({ text: String(text || ''), at: Date.now() }); state.events = state.events.slice(0, 8); saveState(); renderEvents();
    }
    function renderEvents() {
        const box = document.getElementById('lt-event-list'); if (!box) return;
        box.innerHTML = state.events.length ? state.events.map(event => `<div class="lt-event">${escapeHtml(event.text)}</div>`).join('') : '<div class="lt-event">The room is quiet. Press play when you are ready.</div>';
    }
    function sendInvitation(force) {
        if (!force && (Date.now() - state.lastInviteAt < INVITE_COOLDOWN || Math.random() > 0.12)) return false;
        if (typeof addMessage !== 'function') return false;
        const line = pick(inviteLines);
        const card = `<div style="width:250px;max-width:100%;padding:11px;border-radius:13px;background:linear-gradient(145deg,#211d3e,#543058);border:1px solid rgba(255,225,240,.24);color:#fff;"><div style="font-size:11px;opacity:.68;letter-spacing:.1em;">LISTEN TOGETHER</div><div style="font-size:13px;line-height:1.5;margin:7px 0 10px;">${escapeHtml(line)}</div><button onclick="window.ListenTogetherApp.open()" style="width:100%;border:0;border-radius:9px;padding:8px;background:#e9b6cf;color:#2a1830;font-weight:700;">Join Loki</button></div>`;
        addMessage({ id: 'listen_invite_' + Date.now(), sender: 'ta', text: card, timestamp: new Date(), status: 'received', type: 'share', favorited: false, note: null });
        state.lastInviteAt = Date.now(); saveState(); return true;
    }

    window.ListenTogetherApp = { open, close, sendInvitation: () => sendInvitation(true), playlistId: PLAYLIST_ID };
    document.addEventListener('DOMContentLoaded', () => {
        inject(); loadYouTubeApi();
        setTimeout(() => sendInvitation(false), 45000 + Math.random() * 75000);
    });
})();
