(() => {
    const KEY = 'focus_pomodoro';
    const TITLE = document.title;
    let st = { focus: 25, short: 5, long: 15, done: 0, day: getTodayStr() };
    try { st = { ...st, ...JSON.parse(localStorage.getItem(KEY)) }; } catch (e) { /* ignore */ }
    if (st.day !== getTodayStr()) { st.done = 0; st.day = getTodayStr(); }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ } };

    const NAMES = { focus: 'Фокус', short: 'Перерыв', long: 'Длинный' };
    let mode = 'focus', total = st.focus * 60, left = total, timer = null, endAt = 0;

    const card = document.createElement('section');
    card.className = 'panel border border-white/5 rounded-3xl p-5 space-y-3';
    card.innerHTML = `
        <h3 class="text-sm font-bold flex items-center gap-2"><i class="fa-regular fa-clock text-[var(--accent)]"></i> Pomodoro</h3>
        <div class="flex gap-1.5">${Object.entries(NAMES).map(([k, n]) =>
            `<button data-mode="${k}" class="pomo-tab flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition">${n}</button>`).join('')}</div>
        <div id="pomo-time" class="text-4xl font-bold text-center tabular-nums tracking-tight"></div>
        <div class="h-1.5 rounded-full bg-white/10 overflow-hidden"><div id="pomo-bar" class="h-full bg-[var(--accent)] transition-[width] duration-300"></div></div>
        <div class="flex items-center justify-center gap-2">
            <button id="pomo-toggle" class="px-5 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-bold shadow-[0_0_15px_var(--accent-glow)]"></button>
            <button id="pomo-reset" aria-label="Сбросить" class="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs"><i class="fa-solid fa-rotate-left"></i></button>
        </div>
        <p class="text-center text-[11px] text-zinc-400">Сегодня сессий: <b id="pomo-done" class="text-white"></b></p>
        <details class="text-xs text-zinc-400"><summary class="cursor-pointer">Настроить минуты</summary>
            <div class="grid grid-cols-3 gap-2 mt-2">${Object.keys(NAMES).map(k =>
                `<label>${NAMES[k]}<input data-dur="${k}" type="number" min="1" max="120" value="${st[k]}" class="mt-1 w-full bg-[#1c1c28] border border-white/10 rounded-lg px-2 py-1.5 text-white"></label>`).join('')}</div>
        </details>`;

    const $ = (s) => card.querySelector(s);
    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    function paint() {
        $('#pomo-time').textContent = fmt(left);
        $('#pomo-bar').style.width = (100 - (left / total) * 100) + '%';
        $('#pomo-toggle').innerHTML = timer ? '<i class="fa-solid fa-pause mr-1.5"></i>Пауза' : '<i class="fa-solid fa-play mr-1.5"></i>Старт';
        $('#pomo-done').textContent = st.done;
        card.querySelectorAll('.pomo-tab').forEach(b => {
            const on = b.dataset.mode === mode;
            b.classList.toggle('bg-[var(--accent)]', on);
            b.classList.toggle('text-white', on);
            b.classList.toggle('bg-white/5', !on);
            b.classList.toggle('text-zinc-400', !on);
        });
        document.title = timer ? `${fmt(left)} · ${NAMES[mode]}` : TITLE;
    }

    function stop() { clearInterval(timer); timer = null; }
    function setMode(m) { stop(); mode = m; total = left = st[m] * 60; paint(); }
    function start() {
        if (timer) return;
        endAt = Date.now() + left * 1000;
        timer = setInterval(() => {
            left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
            if (left === 0) return finish();
            paint();
        }, 250);
        paint();
    }

    function beep() {
        try {
            const c = new AudioContext(), o = c.createOscillator(), g = c.createGain();
            o.connect(g); g.connect(c.destination);
            o.frequency.value = 880;
            g.gain.setValueAtTime(0.2, c.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 1);
            o.start(); o.stop(c.currentTime + 1);
        } catch (e) { /* ignore */ }
    }

    function finish() {
        beep();
        if (mode === 'focus') { st.done++; save(); }
        setMode(mode === 'focus' ? (st.done % 4 === 0 ? 'long' : 'short') : 'focus');
    }

    card.addEventListener('click', (e) => {
        const tab = e.target.closest('[data-mode]');
        if (tab) return setMode(tab.dataset.mode);
        if (e.target.closest('#pomo-toggle')) { if (timer) { stop(); paint(); } else start(); }
        if (e.target.closest('#pomo-reset')) setMode(mode);
    });

    card.addEventListener('change', (e) => {
        const k = e.target.dataset.dur;
        if (!k) return;
        st[k] = Math.min(120, Math.max(1, parseInt(e.target.value, 10) || st[k]));
        e.target.value = st[k];
        save();
        if (k === mode && !timer) setMode(mode);
    });

    const mount = document.querySelector('#section-home .xl\\:col-span-4');
    if (mount) mount.prepend(card);
    paint();
})();
