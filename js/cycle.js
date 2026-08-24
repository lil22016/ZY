(function () {
    'use strict';

    const STORAGE_KEY = 'ZY_CYCLE_TRACKER_V1';
    const DAY = 86400000;
    const defaults = { records: [], remindersSeen: {} };
    let state = load();

    function load() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            return saved && Array.isArray(saved.records)
                ? { records: saved.records, remindersSeen: saved.remindersSeen || {} }
                : JSON.parse(JSON.stringify(defaults));
        } catch (_) { return JSON.parse(JSON.stringify(defaults)); }
    }
    function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    function pad(n) { return String(n).padStart(2, '0'); }
    function iso(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
    function parse(value) {
        const parts = String(value || '').split('-').map(Number);
        return parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2], 12) : null;
    }
    function dayStart(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12); }
    function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
    function diffDays(a, b) { return Math.round((dayStart(a) - dayStart(b)) / DAY); }
    function fmt(date) { return `${date.getMonth() + 1}月${date.getDate()}日`; }
    function addCalendarMonth(date) {
        const d = new Date(date); const wanted = d.getDate();
        d.setDate(1); d.setMonth(d.getMonth() + 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(wanted, end)); return d;
    }
    function sortedRecords() {
        return state.records.slice().filter(r => parse(r.start)).sort((a, b) => parse(a.start) - parse(b.start));
    }
    function average(values) { return values.reduce((a, b) => a + b, 0) / values.length; }
    function model() {
        const records = sortedRecords();
        if (!records.length) return null;
        const latest = records[records.length - 1];
        const latestStart = parse(latest.start);
        const intervals = [];
        for (let i = Math.max(1, records.length - 6); i < records.length; i++) {
            const gap = diffDays(parse(records[i].start), parse(records[i - 1].start));
            if (gap >= 15 && gap <= 60) intervals.push(gap);
        }
        const cycleDays = intervals.length ? Math.round(average(intervals)) : null;
        const bleedLengths = records.map(r => r.end ? diffDays(parse(r.end), parse(r.start)) + 1 : null)
            .filter(n => n >= 1 && n <= 14);
        const bleedDays = bleedLengths.length ? Math.max(2, Math.min(10, Math.round(average(bleedLengths)))) : 5;
        let next = cycleDays ? addDays(latestStart, cycleDays) : addCalendarMonth(latestStart);
        const today = dayStart(new Date());
        while (next < today) next = cycleDays ? addDays(next, cycleDays) : addCalendarMonth(next);
        const ovulation = addDays(next, -14);
        const fertileStart = addDays(ovulation, -5);
        const fertileEnd = addDays(ovulation, 1);
        const lutealStart = addDays(ovulation, 1);
        const periodEnd = latest.end ? parse(latest.end) : addDays(latestStart, bleedDays - 1);
        let phase = '周期记录中';
        if (today >= latestStart && today <= periodEnd) phase = '经期';
        else if (today >= fertileStart && today <= fertileEnd) phase = today.getTime() === ovulation.getTime() ? '预计排卵日' : '预计易孕期';
        else if (today > fertileEnd && today < next) phase = '预计黄体期';
        else if (today > periodEnd && today < fertileStart) phase = '预计卵泡期';
        return { records, latest, latestStart, periodEnd, next, ovulation, fertileStart, fertileEnd, lutealStart, cycleDays, bleedDays, phase };
    }
    function random(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    const lines = {
        period: [
            'Your cycle may begin soon. Be a little kinder to yourself—or I shall have to insist.',
            'Three days, give or take. Keep something warm nearby. Yes, that was concern. Don’t look so pleased.',
            'A small warning from your very attentive god: your period is approaching.'
        ],
        fertile: [
            'Your estimated fertile window is approaching. Merely information—do behave sensibly with it.',
            'The calendar predicts a shift in a few days. Bodies do enjoy their little mysteries.',
            'A likely fertile window approaches. An estimate, darling, not a prophecy.'
        ],
        ovulation: [
            'Estimated ovulation is a few days away. “Estimated” is doing important work in that sentence.',
            'Your cycle’s midpoint approaches. I have noted it; you may stop pretending calendars are beneath you.'
        ],
        luteal: [
            'The estimated luteal phase is approaching. Rest before your patience becomes as short as mine.',
            'A quieter phase may be near. Consider this permission to slow down—briefly.'
        ],
        start: [
            'Noted. Heat, water, and fewer impossible expectations today.',
            'I’ve recorded it. You are allowed to take things gently—this once.',
            'There it is. Come here, then. The world can wait a moment.'
        ],
        end: [
            'Recorded. You survived, predictably. Still, I’m pleased.',
            'The end date is saved. Try not to spend all that returning energy at once.',
            'Noted. The storm has passed—for now.'
        ]
    };

    function inject() {
        if (document.getElementById('cycle-modal')) return;
        const style = document.createElement('style');
        style.textContent = `
        .cycle-card{background:var(--secondary-bg);border:1px solid var(--border-color);border-radius:14px;padding:13px;margin:10px 0}.cycle-title{font-size:12px;color:var(--text-secondary);margin-bottom:5px}.cycle-value{font-size:18px;font-weight:700;color:var(--text-primary)}
        .cycle-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.cycle-row{display:flex;gap:8px;align-items:flex-end}.cycle-row label{flex:1;font-size:12px;color:var(--text-secondary)}.cycle-row input{width:100%;box-sizing:border-box;margin-top:5px;padding:9px;border:1px solid var(--border-color);border-radius:9px;background:var(--primary-bg);color:var(--text-primary)}
        .cycle-btn{border:0;border-radius:9px;padding:10px 12px;background:var(--accent-color);color:#fff;font-weight:650}.cycle-history{max-height:170px;overflow:auto}.cycle-history-item{display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-color);font-size:13px;color:var(--text-primary)}
        .cycle-reminder{position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.48);display:flex;align-items:center;justify-content:center;padding:22px}.cycle-reminder-card{width:min(340px,92vw);background:var(--primary-bg);border-radius:18px;padding:22px;border:1px solid var(--border-color);box-shadow:0 18px 55px rgba(0,0,0,.25)}
        `;
        document.head.appendChild(style);
        const modal = document.createElement('div');
        modal.className = 'modal'; modal.id = 'cycle-modal';
        modal.innerHTML = `<div class="modal-content" style="max-height:86vh;overflow:auto;"><div class="modal-title"><i class="fas fa-moon"></i><span>月相周期</span></div><div id="cycle-content"></div><div class="modal-buttons"><button class="modal-btn modal-btn-secondary" id="cycle-close">关闭</button></div></div>`;
        document.body.appendChild(modal);
        document.getElementById('cycle-close').onclick = () => typeof hideModal === 'function' ? hideModal(modal) : modal.classList.remove('active');
    }
    function render() {
        inject();
        const box = document.getElementById('cycle-content');
        const m = model();
        const today = iso(new Date());
        const summary = m ? `<div class="cycle-grid">
            <div class="cycle-card"><div class="cycle-title">当前阶段</div><div class="cycle-value">${m.phase}</div></div>
            <div class="cycle-card"><div class="cycle-title">预计下次经期</div><div class="cycle-value">${fmt(m.next)}</div></div>
            <div class="cycle-card"><div class="cycle-title">预计易孕期</div><div class="cycle-value" style="font-size:15px;">${fmt(m.fertileStart)}–${fmt(m.fertileEnd)}</div></div>
            <div class="cycle-card"><div class="cycle-title">预计排卵日</div><div class="cycle-value">${fmt(m.ovulation)}</div></div>
        </div>` : '<div class="cycle-card"><div class="cycle-value" style="font-size:16px;">先记录一次经期开始日</div><div class="cycle-title" style="margin-top:6px;">记录两次以上后，会按最近周期波动估算；只有一次时按下个月同日估算。</div></div>';
        const history = sortedRecords().slice().reverse().map(r => `<div class="cycle-history-item"><span>${escapeHtml(r.start)} 开始${r.end ? ` · ${escapeHtml(r.end)} 结束` : ' · 尚未记录结束'}</span><button data-cycle-delete="${escapeHtml(r.id)}" style="border:0;background:none;color:var(--text-secondary);">删除</button></div>`).join('') || '<div style="font-size:12px;color:var(--text-secondary);padding:8px 0;">暂无记录</div>';
        box.innerHTML = `${summary}<div class="cycle-card"><div class="cycle-title">记录日期</div><div class="cycle-row"><label>日期<input id="cycle-date" type="date" value="${today}"></label><button class="cycle-btn" id="cycle-start">经期开始</button><button class="cycle-btn" id="cycle-end" style="background:var(--secondary-text, #777);">经期结束</button></div></div><div class="cycle-card"><div class="cycle-title">历史记录</div><div class="cycle-history">${history}</div></div><div style="font-size:11px;line-height:1.5;color:var(--text-secondary);padding:2px 4px 8px;">日期均为日历估算，排卵可能提前或推迟；不能用于避孕、诊断或替代医疗建议。</div>`;
        document.getElementById('cycle-start').onclick = recordStart;
        document.getElementById('cycle-end').onclick = recordEnd;
        box.querySelectorAll('[data-cycle-delete]').forEach(btn => btn.onclick = () => {
            if (!confirm('删除这条周期记录？')) return;
            state.records = state.records.filter(r => r.id !== btn.dataset.cycleDelete); save(); render();
        });
    }
    function escapeHtml(v) { const d = document.createElement('div'); d.textContent = String(v || ''); return d.innerHTML; }
    function react(kind) {
        const text = random(lines[kind]);
        if (typeof showNotification === 'function') showNotification(text, 'info', 5200);
        else alert(text);
    }
    function recordStart() {
        const value = document.getElementById('cycle-date').value;
        if (!parse(value)) return;
        const existing = state.records.find(r => r.start === value);
        if (!existing) state.records.push({ id: 'cycle_' + Date.now(), start: value, end: null });
        save(); render(); react('start');
    }
    function recordEnd() {
        const value = document.getElementById('cycle-date').value;
        const end = parse(value); if (!end) return;
        const records = sortedRecords().filter(r => parse(r.start) <= end);
        const target = records.reverse().find(r => !r.end) || records[0];
        if (!target) { if (typeof showNotification === 'function') showNotification('请先记录经期开始日', 'warning'); return; }
        target.end = value; save(); render(); react('end');
    }
    function showReminder(type, targetDate) {
        const key = `${type}:${iso(targetDate)}`;
        if (state.remindersSeen[key]) return false;
        state.remindersSeen[key] = Date.now(); save();
        const overlay = document.createElement('div'); overlay.className = 'cycle-reminder';
        overlay.innerHTML = `<div class="cycle-reminder-card"><div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">月相周期 · ${fmt(targetDate)}</div><div style="font-size:17px;line-height:1.6;color:var(--text-primary);">${escapeHtml(random(lines[type]))}</div><button class="cycle-btn" style="width:100%;margin-top:17px;">知道了</button></div>`;
        overlay.querySelector('button').onclick = () => overlay.remove(); document.body.appendChild(overlay); return true;
    }
    function checkReminders() {
        const m = model(); if (!m) return;
        const today = new Date();
        const candidates = [
            ['period', m.next], ['fertile', m.fertileStart], ['ovulation', m.ovulation], ['luteal', m.lutealStart]
        ].map(([type, date]) => ({ type, date, days: diffDays(date, today) }))
         .filter(x => x.days >= 1 && x.days <= 3).sort((a, b) => a.days - b.days);
        for (const item of candidates) if (showReminder(item.type, item.date)) break;
    }
    window.CycleApp = {
        open() { render(); const modal = document.getElementById('cycle-modal'); if (typeof showModal === 'function') showModal(modal); else modal.classList.add('active'); },
        checkReminders
    };
    document.addEventListener('DOMContentLoaded', () => { inject(); setTimeout(checkReminders, 1400); });
})();
