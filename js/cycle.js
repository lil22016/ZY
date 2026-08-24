(function () {
    'use strict';

    const STORAGE_KEY = 'ZY_CYCLE_TRACKER_V1';
    const DAY = 86400000;
    const defaults = { records: [], remindersSeen: {} };
    let state = load();
    let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12);

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
        .app-icon[data-app="cycle"]{position:relative;background:linear-gradient(145deg,#4b1834 0%,#8d4367 53%,#d49a75 100%)!important;color:#fff1dd!important;border:1px solid rgba(255,220,202,.32)!important;box-shadow:0 7px 18px rgba(92,31,65,.34),inset 0 1px 0 rgba(255,255,255,.16)!important;overflow:hidden}.app-icon[data-app="cycle"]:after{content:"";position:absolute;width:30px;height:30px;right:-12px;top:-12px;border:1px solid rgba(255,240,221,.28);border-radius:50%;box-shadow:0 0 14px rgba(255,210,190,.2)}.app-icon[data-app="cycle"] i{position:relative;z-index:1;text-shadow:0 0 10px rgba(255,229,204,.55)}
        .cycle-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.cycle-row{display:flex;gap:8px;align-items:flex-end}.cycle-row label{flex:1;font-size:12px;color:var(--text-secondary)}.cycle-row input{width:100%;box-sizing:border-box;margin-top:5px;padding:9px;border:1px solid var(--border-color);border-radius:9px;background:var(--primary-bg);color:var(--text-primary)}
        .cycle-btn{border:0;border-radius:9px;padding:10px 12px;background:var(--accent-color);color:#fff;font-weight:650}.cycle-history{max-height:170px;overflow:auto}.cycle-history-item{display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-color);font-size:13px;color:var(--text-primary)}
        .cycle-reminder{position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.48);display:flex;align-items:center;justify-content:center;padding:22px}.cycle-reminder-card{width:min(340px,92vw);background:var(--primary-bg);border-radius:18px;padding:22px;border:1px solid var(--border-color);box-shadow:0 18px 55px rgba(0,0,0,.25)}
        .cycle-calendar{background:var(--secondary-bg);border:1px solid var(--border-color);border-radius:16px;padding:12px;margin:8px 0 10px}.cycle-calendar-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.cycle-calendar-head button{width:32px;height:32px;border:0;border-radius:9px;background:var(--primary-bg);color:var(--text-primary);font-size:18px}.cycle-month-label{font-weight:700;color:var(--text-primary)}
        .cycle-week,.cycle-days{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.cycle-week span{text-align:center;font-size:10px;color:var(--text-secondary);padding:3px 0}.cycle-day{position:relative;min-height:42px;border:0;border-radius:10px;background:transparent;color:var(--text-primary);padding:5px 2px 12px;font-size:12px}.cycle-day.other{opacity:.28}.cycle-day.today{box-shadow:inset 0 0 0 1.5px var(--accent-color);font-weight:750}.cycle-day.actual{background:rgba(235,87,87,.16)}.cycle-dots{position:absolute;left:3px;right:3px;bottom:5px;display:flex;justify-content:center;gap:2px}.cycle-dot{width:5px;height:5px;border-radius:50%}.cycle-dot.actual{background:#eb5757}.cycle-dot.period{background:#ff8b9b}.cycle-dot.fertile{background:#35b8a0}.cycle-dot.ovulation{background:#8c63d8}.cycle-dot.luteal{background:#e5a93d}
        .cycle-legend{display:flex;flex-wrap:wrap;gap:7px 10px;margin-top:9px;font-size:10px;color:var(--text-secondary)}.cycle-legend span{display:flex;align-items:center;gap:4px}.cycle-summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.cycle-summary{background:var(--secondary-bg);border:1px solid var(--border-color);border-radius:11px;padding:9px}.cycle-summary .cycle-title{font-size:10px;margin-bottom:3px}.cycle-summary .cycle-value{font-size:13px;line-height:1.35}
        `;
        document.head.appendChild(style);
        const modal = document.createElement('div');
        modal.className = 'modal'; modal.id = 'cycle-modal';
        modal.innerHTML = `<div class="modal-content" style="max-height:86vh;overflow:auto;"><div class="modal-title"><i class="fas fa-moon"></i><span>月相周期</span></div><div id="cycle-content"></div><div class="modal-buttons"><button class="modal-btn modal-btn-secondary" id="cycle-close">关闭</button></div></div>`;
        document.body.appendChild(modal);
        document.getElementById('cycle-close').onclick = () => typeof hideModal === 'function' ? hideModal(modal) : modal.classList.remove('active');
    }
    function dateInRange(date, start, end) { return date >= dayStart(start) && date <= dayStart(end); }
    function eventTypesForDate(date, m) {
        const types = [];
        let actual = false;
        sortedRecords().forEach(r => {
            const start = parse(r.start); const end = r.end ? parse(r.end) : addDays(start, m ? m.bleedDays - 1 : 4);
            if (dateInRange(date, start, end)) actual = true;
        });
        if (actual) types.push('actual');
        if (!m) return types;
        let periodStart = new Date(m.next);
        for (let i = 0; i < 10; i++) {
            const periodEnd = addDays(periodStart, m.bleedDays - 1);
            const ovulation = addDays(periodStart, -14);
            const fertileStart = addDays(ovulation, -5);
            const fertileEnd = addDays(ovulation, 1);
            const previousPeriod = m.cycleDays ? addDays(periodStart, -m.cycleDays) : (() => { const d = new Date(periodStart); d.setMonth(d.getMonth() - 1); return d; })();
            const lutealStart = addDays(ovulation, 1);
            if (dateInRange(date, periodStart, periodEnd)) types.push('period');
            if (dateInRange(date, fertileStart, fertileEnd)) types.push('fertile');
            if (iso(date) === iso(ovulation)) types.push('ovulation');
            if (dateInRange(date, lutealStart, addDays(periodStart, -1))) types.push('luteal');
            if (date > addDays(periodStart, 370)) break;
            periodStart = m.cycleDays ? addDays(periodStart, m.cycleDays) : addCalendarMonth(periodStart);
            if (previousPeriod > date) break;
        }
        return [...new Set(types)];
    }
    function calendarHtml(m) {
        const year = calendarCursor.getFullYear(); const month = calendarCursor.getMonth();
        const first = new Date(year, month, 1, 12); const start = addDays(first, -first.getDay());
        const todayIso = iso(new Date());
        let days = '';
        for (let i = 0; i < 42; i++) {
            const date = addDays(start, i); const types = eventTypesForDate(date, m);
            const classes = ['cycle-day'];
            if (date.getMonth() !== month) classes.push('other');
            if (iso(date) === todayIso) classes.push('today');
            if (types.includes('actual')) classes.push('actual');
            const dots = types.slice(0, 4).map(t => `<i class="cycle-dot ${t}"></i>`).join('');
            days += `<button class="${classes.join(' ')}" data-cycle-date="${iso(date)}"><span>${date.getDate()}</span><span class="cycle-dots">${dots}</span></button>`;
        }
        return `<div class="cycle-calendar"><div class="cycle-calendar-head"><button id="cycle-prev-month" aria-label="上个月">‹</button><div class="cycle-month-label">${year}年 ${month + 1}月</div><button id="cycle-next-month" aria-label="下个月">›</button></div><div class="cycle-week"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div><div class="cycle-days">${days}</div><div class="cycle-legend"><span><i class="cycle-dot actual"></i>已记录经期</span><span><i class="cycle-dot period"></i>预计经期</span><span><i class="cycle-dot fertile"></i>预计易孕期</span><span><i class="cycle-dot ovulation"></i>预计排卵日</span><span><i class="cycle-dot luteal"></i>预计黄体期</span></div></div>`;
    }
    function render() {
        inject();
        const box = document.getElementById('cycle-content');
        const m = model();
        const summary = m ? `<div class="cycle-summary-grid">
            <div class="cycle-summary"><div class="cycle-title">当前阶段</div><div class="cycle-value">${m.phase}</div></div>
            <div class="cycle-summary"><div class="cycle-title">预计下次经期</div><div class="cycle-value">${fmt(m.next)}</div></div>
            <div class="cycle-summary"><div class="cycle-title">预计易孕期</div><div class="cycle-value">${fmt(m.fertileStart)}–${fmt(m.fertileEnd)}</div></div>
            <div class="cycle-summary"><div class="cycle-title">预计排卵日</div><div class="cycle-value">${fmt(m.ovulation)}</div></div>
        </div>` : '<div class="cycle-card"><div class="cycle-value" style="font-size:16px;">先在日历上记录一次经期</div><div class="cycle-title" style="margin-top:6px;">点击日期即可记录。两次以上会按最近周期波动估算；只有一次时按下个月同日估算。</div></div>';
        const history = sortedRecords().slice().reverse().map(r => `<div class="cycle-history-item"><span>${escapeHtml(r.start)} 开始${r.end ? ` · ${escapeHtml(r.end)} 结束` : ' · 尚未记录结束'}</span><button data-cycle-delete="${escapeHtml(r.id)}" style="border:0;background:none;color:var(--text-secondary);">删除</button></div>`).join('') || '<div style="font-size:12px;color:var(--text-secondary);padding:8px 0;">暂无记录</div>';
        box.innerHTML = `${calendarHtml(m)}${summary}<div class="cycle-card"><div class="cycle-title">历史记录</div><div class="cycle-history">${history}</div></div><div style="font-size:11px;line-height:1.5;color:var(--text-secondary);padding:2px 4px 8px;">日期均为日历估算，排卵可能提前或推迟；不能用于避孕、诊断或替代医疗建议。</div>`;
        document.getElementById('cycle-prev-month').onclick = () => { calendarCursor.setMonth(calendarCursor.getMonth() - 1); render(); };
        document.getElementById('cycle-next-month').onclick = () => { calendarCursor.setMonth(calendarCursor.getMonth() + 1); render(); };
        box.querySelectorAll('[data-cycle-date]').forEach(btn => btn.onclick = () => showDateActions(btn.dataset.cycleDate));
        box.querySelectorAll('[data-cycle-delete]').forEach(btn => btn.onclick = () => {
            if (!confirm('删除这条周期记录？')) return;
            state.records = state.records.filter(r => r.id !== btn.dataset.cycleDelete); save(); render();
        });
    }
    function escapeHtml(v) { const d = document.createElement('div'); d.textContent = String(v || ''); return d.innerHTML; }
    function react(kind) {
        showLokiDialog(kind === 'start' ? '经期开始已记录' : '经期结束已记录', random(lines[kind]));
    }
    function showLokiDialog(title, text) {
        const overlay = document.createElement('div'); overlay.className = 'cycle-reminder';
        overlay.innerHTML = `<div class="cycle-reminder-card"><div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">Loki · ${escapeHtml(title)}</div><div style="font-size:17px;line-height:1.6;color:var(--text-primary);">${escapeHtml(text)}</div><button class="cycle-btn" style="width:100%;margin-top:17px;">知道了</button></div>`;
        overlay.querySelector('button').onclick = () => overlay.remove(); document.body.appendChild(overlay);
    }
    function showDateActions(value) {
        const overlay = document.createElement('div'); overlay.className = 'cycle-reminder';
        overlay.innerHTML = `<div class="cycle-reminder-card"><div style="font-size:12px;color:var(--text-secondary);margin-bottom:7px;">${escapeHtml(value)}</div><div style="font-size:17px;font-weight:700;color:var(--text-primary);">要记录这一天吗？</div><div style="display:grid;gap:8px;margin-top:16px;"><button class="cycle-btn" data-action="start">记录为经期开始</button><button class="cycle-btn" data-action="end" style="background:#8b8290;">记录为经期结束</button><button class="cycle-btn" data-action="cancel" style="background:var(--secondary-bg);color:var(--text-primary);border:1px solid var(--border-color);">取消</button></div></div>`;
        overlay.querySelector('[data-action="start"]').onclick = () => { overlay.remove(); recordStart(value); };
        overlay.querySelector('[data-action="end"]').onclick = () => { overlay.remove(); recordEnd(value); };
        overlay.querySelector('[data-action="cancel"]').onclick = () => overlay.remove();
        document.body.appendChild(overlay);
    }
    function recordStart(value) {
        if (!parse(value)) return;
        const existing = state.records.find(r => r.start === value);
        if (!existing) state.records.push({ id: 'cycle_' + Date.now(), start: value, end: null });
        save(); render(); react('start');
    }
    function recordEnd(value) {
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
