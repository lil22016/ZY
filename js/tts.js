/**
 * Loki TTS module
 * - Settings live only in this browser (never committed to GitHub).
 * - Generated audio is cached in IndexedDB through localforage.
 * - Supports Fish Audio, MiniMax and a generic custom proxy.
 */
(function () {
    'use strict';

    const SETTINGS_KEY = 'ZY_TTS_SETTINGS_V1';
    const AUDIO_KEY_PREFIX = 'ZY_TTS_AUDIO_';
    const DEFAULTS = {
        provider: 'fish',
        apiKey: '',
        voiceId: '',
        model: 's2.1-pro',
        endpoint: '',
        manualEnabled: true,
        autoEnabled: true,
        probability: 5,
        speed: 1,
        pitch: 0,
        volume: 80
    };

    let config = loadSettings();
    const busyMessages = new Set();
    const objectUrls = new Map();

    function clamp(value, min, max, fallback) {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.min(max, Math.max(min, number));
    }

    function loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
            return normalizeSettings(Object.assign({}, DEFAULTS, saved));
        } catch (error) {
            console.warn('[TTS] 设置读取失败，已使用默认值:', error);
            return Object.assign({}, DEFAULTS);
        }
    }

    function normalizeSettings(raw) {
        return {
            provider: ['fish', 'minimax', 'custom'].includes(raw.provider) ? raw.provider : 'fish',
            apiKey: String(raw.apiKey || '').trim(),
            voiceId: String(raw.voiceId || '').trim(),
            model: String(raw.model || '').trim(),
            endpoint: String(raw.endpoint || '').trim(),
            manualEnabled: raw.manualEnabled !== false,
            autoEnabled: raw.autoEnabled !== false,
            probability: clamp(raw.probability, 0, 100, 5),
            speed: clamp(raw.speed, 0.5, 2, 1),
            pitch: clamp(raw.pitch, -12, 12, 0),
            volume: clamp(raw.volume, 0, 100, 80)
        };
    }

    function persistSettings(nextConfig) {
        config = normalizeSettings(nextConfig);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(config));
        updateManualState();
        return config;
    }

    function notify(message, type, duration) {
        if (typeof showNotification === 'function') {
            showNotification(message, type || 'info', duration || 2500);
        } else {
            console.log('[TTS]', message);
        }
    }

    function isConfigured() {
        if (!config.apiKey || !config.voiceId) return false;
        if (config.provider === 'custom' && !config.endpoint) return false;
        return true;
    }

    function requireConfiguration() {
        if (isConfigured()) return true;
        notify('请先在「高级功能 → TTS 语音」填写 API Key 和 Voice ID', 'warning', 3500);
        openSettings();
        return false;
    }

    function hexToBlob(hex, mimeType) {
        const clean = String(hex || '').replace(/^0x/, '').replace(/\s/g, '');
        if (!clean || clean.length % 2 !== 0) throw new Error('服务返回的音频 Hex 无效');
        const bytes = new Uint8Array(clean.length / 2);
        for (let i = 0; i < clean.length; i += 2) bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
        return new Blob([bytes], { type: mimeType || 'audio/mpeg' });
    }

    function base64ToBlob(base64, mimeType) {
        const clean = String(base64 || '').replace(/^data:[^;]+;base64,/, '');
        const binary = atob(clean);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mimeType || 'audio/mpeg' });
    }

    async function parseResponse(response, provider) {
        if (!response.ok) {
            let detail = '';
            try {
                const body = await response.json();
                detail = body.message || body.reason || body.error || body.base_resp?.status_msg || JSON.stringify(body);
            } catch (_) {
                try { detail = await response.text(); } catch (_) {}
            }
            throw new Error(`TTS 请求失败（${response.status}）${detail ? '：' + detail : ''}`);
        }

        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('audio/') || contentType.includes('application/octet-stream')) {
            return { blob: await response.blob(), url: '' };
        }

        const data = await response.json();
        if (provider === 'minimax') {
            if (data.base_resp && data.base_resp.status_code !== 0) {
                throw new Error(data.base_resp.status_msg || 'MiniMax 生成失败');
            }
            const audio = data.data && data.data.audio;
            if (!audio) throw new Error('MiniMax 没有返回音频数据');
            if (/^https?:\/\//i.test(audio)) return { blob: null, url: audio };
            return { blob: hexToBlob(audio, 'audio/mpeg'), url: '' };
        }

        const candidate = data.audio_url || data.url || data.audio || data.data?.audio || data.data;
        if (!candidate) throw new Error('接口没有返回可识别的音频字段');
        if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) return { blob: null, url: candidate };
        if (typeof candidate === 'string' && /^[0-9a-fA-F]+$/.test(candidate) && candidate.length % 2 === 0) {
            return { blob: hexToBlob(candidate, 'audio/mpeg'), url: '' };
        }
        if (typeof candidate === 'string') return { blob: base64ToBlob(candidate, 'audio/mpeg'), url: '' };
        throw new Error('接口返回的音频格式无法识别');
    }

    async function synthesize(text) {
        const cleanText = String(text || '').trim();
        if (!cleanText) throw new Error('没有可以转换的文字');
        if (!isConfigured()) throw new Error('TTS 尚未配置');

        let endpoint;
        let headers = {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
        };
        let body;

        if (config.provider === 'fish') {
            endpoint = 'https://api.fish.audio/v1/tts';
            headers.model = config.model || 's2.1-pro';
            body = {
                text: cleanText,
                reference_id: config.voiceId,
                prosody: {
                    speed: config.speed,
                    volume: 0,
                    normalize_loudness: true
                },
                normalize: true,
                format: 'mp3',
                sample_rate: 44100,
                mp3_bitrate: 128,
                latency: 'normal'
            };
        } else if (config.provider === 'minimax') {
            endpoint = 'https://api.minimax.io/v1/t2a_v2';
            body = {
                model: config.model || 'speech-2.8-hd',
                text: cleanText,
                stream: false,
                language_boost: 'auto',
                output_format: 'hex',
                voice_setting: {
                    voice_id: config.voiceId,
                    speed: config.speed,
                    vol: Math.max(0.1, config.volume / 100),
                    pitch: Math.round(config.pitch)
                },
                audio_setting: {
                    sample_rate: 32000,
                    bitrate: 128000,
                    format: 'mp3',
                    channel: 1
                }
            };
        } else {
            endpoint = config.endpoint;
            body = {
                text: cleanText,
                voice_id: config.voiceId,
                model: config.model,
                speed: config.speed,
                pitch: config.pitch,
                volume: config.volume / 100,
                format: 'mp3'
            };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
        return parseResponse(response, config.provider);
    }

    async function getDuration(blobOrUrl) {
        return new Promise(function (resolve) {
            if (!blobOrUrl) return resolve(0);
            const tempUrl = blobOrUrl instanceof Blob ? URL.createObjectURL(blobOrUrl) : blobOrUrl;
            const audio = new Audio(tempUrl);
            let done = false;
            const finish = function (value) {
                if (done) return;
                done = true;
                if (blobOrUrl instanceof Blob) URL.revokeObjectURL(tempUrl);
                resolve(Number.isFinite(value) ? Math.round(value) : 0);
            };
            audio.addEventListener('loadedmetadata', function () { finish(audio.duration); }, { once: true });
            audio.addEventListener('error', function () { finish(0); }, { once: true });
            setTimeout(function () { finish(0); }, 2500);
        });
    }

    async function cacheAudio(messageId, blob) {
        if (!blob || typeof localforage === 'undefined') return '';
        const key = AUDIO_KEY_PREFIX + String(messageId);
        await localforage.setItem(key, blob);
        return key;
    }

    async function createVoiceMessage(text, baseMessage) {
        const result = await synthesize(text);
        const messageId = baseMessage.id || Date.now();
        const cacheKey = result.blob ? await cacheAudio(messageId, result.blob) : '';
        const duration = await getDuration(result.blob || result.url);
        return Object.assign({}, baseMessage, {
            id: messageId,
            text: '',
            type: 'voice',
            voiceText: String(text || ''),
            voiceUrl: result.url || '',
            voiceDuration: duration,
            ttsCacheKey: cacheKey,
            ttsGenerated: true
        });
    }

    async function convertMessage(messageId) {
        if (!config.manualEnabled) {
            notify('手动转换功能目前处于关闭状态', 'info');
            return;
        }
        if (!requireConfiguration()) return;
        const message = typeof messages !== 'undefined'
            ? messages.find(function (item) { return String(item.id) === String(messageId); })
            : null;
        if (!message || message.type !== 'normal' || !String(message.text || '').trim()) {
            notify('这条消息不能转换成语音', 'info');
            return;
        }
        if (busyMessages.has(String(messageId))) return;

        busyMessages.add(String(messageId));
        notify('正在生成 Loki 语音…', 'info', 1800);
        try {
            const voiceMessage = await createVoiceMessage(message.text, message);
            Object.keys(message).forEach(function (key) { delete message[key]; });
            Object.assign(message, voiceMessage);
            if (typeof throttledSaveData === 'function') throttledSaveData();
            if (typeof renderMessages === 'function') renderMessages(true);
            notify('已转换成语音', 'success');
        } catch (error) {
            console.error('[TTS] 手动转换失败:', error);
            notify(error.message || '语音生成失败', 'error', 4500);
        } finally {
            busyMessages.delete(String(messageId));
        }
    }

    async function resolveMessageAudio(message) {
        if (!message) return '';
        if (message.voiceUrl) return message.voiceUrl;
        if (!message.ttsCacheKey || typeof localforage === 'undefined') return '';
        if (objectUrls.has(message.ttsCacheKey)) return objectUrls.get(message.ttsCacheKey);
        const blob = await localforage.getItem(message.ttsCacheKey);
        if (!(blob instanceof Blob)) return '';
        const url = URL.createObjectURL(blob);
        objectUrls.set(message.ttsCacheKey, url);
        return url;
    }

    function shouldAutoVoice() {
        return config.autoEnabled && isConfigured() && Math.random() < (config.probability / 100);
    }

    function getPlaybackVolume() {
        return clamp(config.volume / 100, 0, 1, 0.8);
    }

    function readForm() {
        return normalizeSettings({
            provider: document.getElementById('tts-provider')?.value,
            apiKey: document.getElementById('tts-api-key')?.value,
            voiceId: document.getElementById('tts-voice-id')?.value,
            model: document.getElementById('tts-model')?.value,
            endpoint: document.getElementById('tts-endpoint')?.value,
            manualEnabled: !!document.getElementById('tts-manual-enabled')?.checked,
            autoEnabled: !!document.getElementById('tts-auto-enabled')?.checked,
            probability: document.getElementById('tts-probability')?.value,
            speed: document.getElementById('tts-speed')?.value,
            pitch: document.getElementById('tts-pitch')?.value,
            volume: document.getElementById('tts-volume')?.value
        });
    }

    function writeForm() {
        const setValue = function (id, value) {
            const element = document.getElementById(id);
            if (element) element.value = value;
        };
        const setChecked = function (id, value) {
            const element = document.getElementById(id);
            if (element) element.checked = !!value;
        };
        setValue('tts-provider', config.provider);
        setValue('tts-api-key', config.apiKey);
        setValue('tts-voice-id', config.voiceId);
        setValue('tts-model', config.model || (config.provider === 'minimax' ? 'speech-2.8-hd' : 's2.1-pro'));
        setValue('tts-endpoint', config.endpoint);
        setChecked('tts-manual-enabled', config.manualEnabled);
        setChecked('tts-auto-enabled', config.autoEnabled);
        setValue('tts-probability', config.probability);
        setValue('tts-speed', config.speed);
        setValue('tts-pitch', config.pitch);
        setValue('tts-volume', config.volume);
        updateOutputs();
        updateProviderUI();
    }

    function updateOutputs() {
        const probability = document.getElementById('tts-probability');
        const speed = document.getElementById('tts-speed');
        const pitch = document.getElementById('tts-pitch');
        const volume = document.getElementById('tts-volume');
        if (probability) document.getElementById('tts-probability-value').textContent = probability.value + '%';
        if (speed) document.getElementById('tts-speed-value').textContent = Number(speed.value).toFixed(2).replace(/0$/, '') + '×';
        if (pitch) document.getElementById('tts-pitch-value').textContent = Number(pitch.value) > 0 ? '+' + pitch.value : pitch.value;
        if (volume) document.getElementById('tts-volume-value').textContent = volume.value + '%';
    }

    function updateProviderUI() {
        const provider = document.getElementById('tts-provider')?.value || config.provider;
        const endpointField = document.getElementById('tts-endpoint-field');
        if (endpointField) endpointField.style.display = provider === 'custom' ? 'block' : 'none';
        const model = document.getElementById('tts-model');
        if (model && !model.value.trim()) model.placeholder = provider === 'minimax' ? 'speech-2.8-hd' : 's2.1-pro';
    }

    function openSettings() {
        writeForm();
        const advanced = document.getElementById('advanced-modal');
        const modal = document.getElementById('tts-modal');
        if (advanced && typeof hideModal === 'function') hideModal(advanced);
        if (modal && typeof showModal === 'function') showModal(modal);
        else if (modal) modal.style.display = 'flex';
    }

    function closeSettings() {
        const modal = document.getElementById('tts-modal');
        if (modal && typeof hideModal === 'function') hideModal(modal);
        else if (modal) modal.style.display = 'none';
    }

    async function testVoice() {
        persistSettings(readForm());
        if (!requireConfiguration()) return;
        const text = document.getElementById('tts-test-text')?.value.trim();
        if (!text) return notify('请输入试听内容', 'warning');
        const button = document.getElementById('tts-test-btn');
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中';
        }
        try {
            const result = await synthesize(text);
            const url = result.url || URL.createObjectURL(result.blob);
            const audio = new Audio(url);
            audio.volume = getPlaybackVolume();
            audio.addEventListener('ended', function () {
                if (result.blob) URL.revokeObjectURL(url);
            }, { once: true });
            await audio.play();
            notify('TTS 连接成功', 'success');
        } catch (error) {
            console.error('[TTS] 试听失败:', error);
            notify(error.message || '试听失败', 'error', 5000);
        } finally {
            if (button) {
                button.disabled = false;
                button.innerHTML = '<i class="fas fa-play"></i> 试听';
            }
        }
    }

    function updateManualState() {
        document.body.classList.toggle('tts-manual-disabled', !config.manualEnabled);
    }

    function injectStyles() {
        if (document.getElementById('tts-module-styles')) return;
        const style = document.createElement('style');
        style.id = 'tts-module-styles';
        style.textContent = `
            #tts-modal .modal-content{max-height:88vh;overflow-y:auto;}
            .tts-field{display:flex;flex-direction:column;gap:6px;margin:12px 0;}
            .tts-field label,.tts-slider-field label{font-size:13px;font-weight:600;color:var(--text-primary);}
            .tts-field input,.tts-field select,.tts-field textarea{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--border-color);border-radius:10px;background:var(--primary-bg);color:var(--text-primary);font-family:var(--font-family);font-size:13px;outline:none;}
            .tts-field small,.tts-slider-field small{display:block;color:var(--text-secondary);font-size:11px;line-height:1.45;margin-top:5px;}
            .tts-secret-row{display:flex;gap:7px;align-items:center;}.tts-secret-row input{flex:1;}
            .tts-mini-btn{width:40px;height:40px;border:1px solid var(--border-color);border-radius:10px;background:var(--primary-bg);color:var(--text-secondary);cursor:pointer;}
            .tts-security-note{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:10px;background:rgba(var(--accent-color-rgb),.08);color:var(--text-secondary);font-size:11px;line-height:1.5;}
            .tts-toggle-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px 0;border-bottom:1px solid var(--border-color);cursor:pointer;}
            .tts-toggle-row:last-child{border-bottom:0}.tts-toggle-row span{display:flex;flex-direction:column;gap:3px}.tts-toggle-row b{font-size:13px;color:var(--text-primary)}.tts-toggle-row small{font-size:11px;color:var(--text-secondary)}
            .tts-toggle-row input{width:20px;height:20px;accent-color:var(--accent-color);}
            .tts-slider-field{margin:14px 0}.tts-slider-field>div{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px}.tts-slider-field output{font-size:12px;color:var(--accent-color);font-weight:700}.tts-slider-field input[type=range]{width:100%;accent-color:var(--accent-color);}
            .message-content-wrapper.tts-actions-open .message-meta-actions{opacity:1;transform:translateY(0);pointer-events:auto;}
            body.tts-manual-disabled .tts-action-btn{display:none!important;}
            .tts-action-btn.tts-busy{pointer-events:none;opacity:.45;}
            @media (hover:none){.message-meta-actions{pointer-events:none}.message-content-wrapper.tts-actions-open .message-meta-actions{pointer-events:auto}}
        `;
        document.head.appendChild(style);
    }

    function setupLongPress() {
        let timer = null;
        let startX = 0;
        let startY = 0;
        let activeContent = null;
        const clearTimer = function () { if (timer) clearTimeout(timer); timer = null; };
        const closeOthers = function (except) {
            document.querySelectorAll('.message-content-wrapper.tts-actions-open').forEach(function (element) {
                if (element !== except) element.classList.remove('tts-actions-open');
            });
        };

        document.addEventListener('pointerdown', function (event) {
            const message = event.target.closest('.message');
            if (!message || message.querySelector('.voice-message-bubble') || event.target.closest('.meta-action-btn')) return;
            activeContent = message.closest('.message-content-wrapper');
            startX = event.clientX;
            startY = event.clientY;
            clearTimer();
            timer = setTimeout(function () {
                closeOthers(activeContent);
                if (activeContent) activeContent.classList.add('tts-actions-open');
                if (navigator.vibrate) navigator.vibrate(15);
                timer = null;
            }, 520);
        }, { passive: true });

        document.addEventListener('pointermove', function (event) {
            if (Math.abs(event.clientX - startX) > 12 || Math.abs(event.clientY - startY) > 12) clearTimer();
        }, { passive: true });
        document.addEventListener('pointerup', clearTimer, { passive: true });
        document.addEventListener('pointercancel', clearTimer, { passive: true });
        document.addEventListener('contextmenu', function (event) {
            const message = event.target.closest('.message');
            if (!message || message.querySelector('.voice-message-bubble')) return;
            activeContent = message.closest('.message-content-wrapper');
            closeOthers(activeContent);
            if (activeContent) activeContent.classList.add('tts-actions-open');
            event.preventDefault();
        });
        document.addEventListener('click', function (event) {
            if (event.target.closest('.message-content-wrapper') || event.target.closest('#tts-modal')) return;
            closeOthers(null);
        });
    }

    function initUI() {
        injectStyles();
        updateManualState();
        const entry = document.getElementById('tts-function');
        if (entry) entry.addEventListener('click', openSettings);
        document.getElementById('tts-close-btn')?.addEventListener('click', closeSettings);
        document.getElementById('tts-save-btn')?.addEventListener('click', function () {
            persistSettings(readForm());
            notify('TTS 设置已保存', 'success');
        });
        document.getElementById('tts-test-btn')?.addEventListener('click', testVoice);
        document.getElementById('tts-provider')?.addEventListener('change', function () {
            const model = document.getElementById('tts-model');
            if (model && (!model.value || model.value === 's2.1-pro' || model.value === 'speech-2.8-hd')) {
                model.value = this.value === 'minimax' ? 'speech-2.8-hd' : (this.value === 'fish' ? 's2.1-pro' : '');
            }
            updateProviderUI();
        });
        ['tts-probability', 'tts-speed', 'tts-pitch', 'tts-volume'].forEach(function (id) {
            document.getElementById(id)?.addEventListener('input', updateOutputs);
        });
        document.getElementById('tts-toggle-key')?.addEventListener('click', function () {
            const input = document.getElementById('tts-api-key');
            if (!input) return;
            input.type = input.type === 'password' ? 'text' : 'password';
            this.innerHTML = input.type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
        });
        writeForm();
        setupLongPress();
    }

    window.LokiTTS = {
        openSettings,
        closeSettings,
        convertMessage,
        createVoiceMessage,
        resolveMessageAudio,
        shouldAutoVoice,
        getPlaybackVolume,
        isConfigured,
        getSettings: function () { return Object.assign({}, config, { apiKey: config.apiKey ? '••••••••' : '' }); }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUI, { once: true });
    else initUI();
})();
