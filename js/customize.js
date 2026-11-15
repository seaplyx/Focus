const FONTS = {
    'Inter': null, 'System': null,
    'Manrope': 'Manrope:wght@400;500;600;700;800',
    'Space Grotesk': 'Space+Grotesk:wght@400;500;600;700',
    'Poppins': 'Poppins:wght@400;500;600;700',
    'JetBrains Mono': 'JetBrains+Mono:wght@400;500;700'
};

const THEME_DEFAULTS = {
    accent: '#7c3aed',
    bgType: 'image', bgImage: DEFAULT_WALLPAPER, bgColor: '#09090d',
    gradFrom: '#1e1b4b', gradTo: '#09090d', gradAngle: 135,
    dim: 55, bgBlur: 0, panelAlpha: 55, panelBlur: 16,
    radius: 24, font: 'Inter', fontScale: 100, motion: true
};

const P = (accent, gradFrom, gradTo, gradAngle = 135) => ({ accent, bgType: 'gradient', gradFrom, gradTo, gradAngle, dim: 15 });
const PRESETS = {
    'Violet Night': P('#7c3aed', '#1e1b4b', '#09090d'),
    'Ocean': P('#06b6d4', '#0c4a6e', '#020617', 160),
    'Forest': P('#10b981', '#064e3b', '#022c22', 150),
    'Sakura': P('#f43f5e', '#4c0519', '#1a0a10', 120),
    'Sunset': P('#f59e0b', '#7c2d12', '#1c0a05', 170),
    'Mono': P('#a1a1aa', '#27272a', '#09090b')
};

const UNITS = { dim: '%', bgBlur: 'px', panelAlpha: '%', panelBlur: 'px', radius: 'px', fontScale: '%', gradAngle: '°' };

const Theme = {
    s: { ...THEME_DEFAULTS },

    load() {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem('focus_settings')); } catch (e) { /* ignore */ }
        if (!saved) { // перенос настроек из старой версии
            saved = {};
            const a = localStorage.getItem('focus_accent');
            const w = localStorage.getItem('focus_wallpaper');
            const o = parseFloat(localStorage.getItem('focus_opacity'));
            if (a) saved.accent = a;
            if (w) saved.bgImage = w;
            if (Number.isFinite(o)) saved.panelAlpha = Math.round(o * 100);
        }
        this.s = { ...THEME_DEFAULTS, ...saved };
    },

    save() {
        try { localStorage.setItem('focus_settings', JSON.stringify(this.s)); return true; } catch (e) { return false; }
    },

    set(patch) {
        Object.assign(this.s, patch);
        this.apply();
        return this.save();
    },

    reset() { this.s = { ...THEME_DEFAULTS }; this.apply(); this.save(); },

    apply() {
        const s = this.s, root = document.documentElement.style;
        const [r, g, b] = [1, 3, 5].map(i => parseInt(s.accent.slice(i, i + 2), 16));
        root.setProperty('--accent', s.accent);
        root.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.35)`);
        root.setProperty('--panel-alpha', s.panelAlpha / 100);
        root.setProperty('--card-alpha', Math.max(0.15, s.panelAlpha / 100 - 0.1).toFixed(2));
        root.setProperty('--panel-blur', s.panelBlur + 'px');
        root.setProperty('--r-panel', s.radius + 'px');
        root.setProperty('--r-card', Math.max(6, s.radius - 8) + 'px');
        root.fontSize = s.fontScale + '%';

        this.loadFont(s.font);
        document.body.style.fontFamily = (s.font === 'System' ? 'system-ui' : `'${s.font}'`) + ', system-ui, sans-serif';
        document.body.dataset.motion = s.motion ? 'on' : 'off';

        const layer = document.getElementById('page-wallpaper');
        const dim = document.getElementById('wallpaper-dim');
        if (dim) dim.style.opacity = s.dim / 100;
        if (!layer) return;
        layer.style.backgroundColor = s.bgColor;
        layer.style.filter = s.bgBlur ? `blur(${s.bgBlur}px)` : '';
        layer.style.transform = s.bgBlur ? 'scale(1.08)' : '';

        if (s.bgType === 'gradient') {
            layer.style.backgroundImage = `linear-gradient(${s.gradAngle}deg, ${s.gradFrom}, ${s.gradTo})`;
        } else if (s.bgType === 'solid') {
            layer.style.backgroundImage = 'none';
        } else {
            const probe = new Image();
            probe.onload = () => {
                layer.style.backgroundImage = `url("${s.bgImage}")`;
                const side = document.getElementById('sidebar-wallpaper');
                if (side) side.src = s.bgImage;
            };
            probe.onerror = () => { layer.style.backgroundImage = `url("${DEFAULT_WALLPAPER}")`; };
            probe.src = s.bgImage;
        }
    },

    loadFont(name) {
        const id = 'font-' + name.replace(/\s/g, '');
        if (!FONTS[name] || document.getElementById(id)) return;
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${FONTS[name]}&display=swap`;
        document.head.appendChild(link);
    },

    resize(file, maxSize, quality = 0.82) {
        return new Promise((resolve, reject) => {
            const img = new Image(), url = URL.createObjectURL(file);
            img.onload = () => {
                const k = Math.min(1, maxSize / Math.max(img.width, img.height));
                const c = document.createElement('canvas');
                c.width = Math.round(img.width * k);
                c.height = Math.round(img.height * k);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                URL.revokeObjectURL(url);
                resolve(c.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
            img.src = url;
        });
    },

    async setWallpaperFile(file) {
        if (!file) return;
        try {
            const data = await this.resize(file, 1920);
            if (!this.set({ bgType: 'image', bgImage: data })) alert('Картинка слишком тяжёлая: применится только до перезагрузки.');
            Theme.build && Theme.build();
        } catch (e) {
            alert('Не удалось открыть эту картинку.');
        }
    }
};

// ---------- Интерфейс окна Customize ----------
(() => {
    const modal = document.getElementById('theme-modal');
    if (!modal) return;
    const box = modal.firstElementChild;
    box.className = 'bg-[#14141d] border border-white/10 rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scroll p-6 shadow-2xl space-y-6';

    const btn = 'px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold transition';
    const sec = (t, body) => `<section class="space-y-3"><h4 class="text-[11px] font-bold uppercase tracking-wider text-zinc-500">${t}</h4>${body}</section>`;
    const sl = (k, label, min, max) => `
        <div><div class="flex justify-between text-xs text-zinc-400 mb-1.5"><span>${label}</span><span data-val="${k}">${Theme.s[k]}${UNITS[k]}</span></div>
        <input type="range" data-key="${k}" min="${min}" max="${max}" value="${Theme.s[k]}" class="w-full accent-[var(--accent)]"></div>`;
    const col = (k) => `<input type="color" data-key="${k}" value="${Theme.s[k]}" class="w-10 h-8 rounded-lg bg-transparent border-0 cursor-pointer">`;

    function build() {
        const s = Theme.s;
        const tab = (id, label) => `<button data-bg="${id}" class="flex-1 ${btn} ${s.bgType === id ? '!bg-[var(--accent)] text-white' : 'text-zinc-400'}">${label}</button>`;
        const swatches = ['#7c3aed', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#ec4899']
            .map(c => `<button data-color="${c}" aria-label="${c}" class="w-8 h-8 rounded-full ring-2 ${s.accent === c ? 'ring-white' : 'ring-white/20'} hover:scale-110 transition" style="background:${c}"></button>`).join('');

        box.innerHTML = `
            <div class="flex items-center justify-between">
                <h3 class="text-lg font-bold">Кастомизация Focus.</h3>
                <button data-close aria-label="Закрыть" class="text-zinc-400 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
            </div>

            ${sec('Готовые темы', `<div class="grid grid-cols-3 gap-2">${Object.entries(PRESETS).map(([n, p]) => `
                <button data-preset="${n}" class="h-14 rounded-xl border border-white/10 hover:border-white/40 text-[11px] font-semibold text-white flex items-end p-2 transition" style="background:linear-gradient(${p.gradAngle}deg,${p.gradFrom},${p.gradTo})">
                    <span class="w-2 h-2 rounded-full mr-1.5 mb-1" style="background:${p.accent}"></span>${n}</button>`).join('')}</div>`)}

            ${sec('Акцентный цвет', `<div class="flex items-center gap-2.5 flex-wrap">${swatches}${col('accent')}</div>`)}

            ${sec('Фон', `
                <div class="flex gap-2">${tab('image', 'Картинка')}${tab('gradient', 'Градиент')}${tab('solid', 'Цвет')}</div>
                ${s.bgType === 'image' ? `
                    <div class="flex gap-2">
                        <input id="tm-url" type="text" placeholder="Ссылка на картинку (https://...)" class="flex-1 bg-[#1c1c28] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--accent)]">
                        <button data-act="url" class="${btn}">ОК</button>
                    </div>
                    <div class="flex gap-2">
                        <label class="flex-1 cursor-pointer py-2.5 rounded-xl bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-center text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition">
                            <i class="fa-solid fa-upload mr-1.5"></i>Загрузить с ПК<input id="tm-file" type="file" accept="image/*" class="hidden"></label>
                        <button data-act="wall-reset" class="${btn} text-zinc-400">Стандартная</button>
                    </div>` : ''}
                ${s.bgType === 'gradient' ? `<div class="flex items-center gap-3"><span class="text-xs text-zinc-400">Цвета</span>${col('gradFrom')}${col('gradTo')}</div>${sl('gradAngle', 'Угол', 0, 360)}` : ''}
                ${s.bgType === 'solid' ? `<div class="flex items-center gap-3"><span class="text-xs text-zinc-400">Цвет фона</span>${col('bgColor')}</div>` : ''}
                ${sl('dim', 'Затемнение фона', 0, 90)}${sl('bgBlur', 'Размытие фона', 0, 20)}`)}

            ${sec('Панели', `${sl('panelAlpha', 'Прозрачность панелей', 20, 90)}${sl('panelBlur', 'Размытие панелей', 0, 30)}${sl('radius', 'Скругление углов', 4, 40)}`)}

            ${sec('Текст и анимации', `
                <select data-key="font" class="w-full bg-[#1c1c28] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--accent)]">
                    ${Object.keys(FONTS).map(f => `<option ${f === s.font ? 'selected' : ''}>${f}</option>`).join('')}</select>
                ${sl('fontScale', 'Размер текста', 90, 120)}
                <label class="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer"><input type="checkbox" data-key="motion" ${s.motion ? 'checked' : ''} class="accent-[var(--accent)]"> Анимации и переходы</label>`)}

            ${sec('Данные', `<div class="flex gap-2 flex-wrap">
                <button data-act="export" class="${btn}"><i class="fa-solid fa-download mr-1.5"></i>Экспорт</button>
                <button data-act="import" class="${btn}"><i class="fa-solid fa-file-import mr-1.5"></i>Импорт</button>
                <button data-act="reset" class="${btn} text-rose-400">Сбросить оформление</button>
                <input id="tm-import" type="file" accept="application/json" class="hidden"></div>`)}`;
    }
    Theme.build = build;

    box.addEventListener('input', (e) => {
        const k = e.target.dataset.key;
        if (!k) return;
        const t = e.target;
        const v = t.type === 'checkbox' ? t.checked : t.type === 'range' ? Number(t.value) : t.value;
        Theme.set({ [k]: v });
        const lab = box.querySelector(`[data-val="${k}"]`);
        if (lab) lab.textContent = v + (UNITS[k] || '');
    });

    box.addEventListener('change', (e) => {
        if (e.target.id === 'tm-file') { Theme.setWallpaperFile(e.target.files[0]); e.target.value = ''; }
        if (e.target.id === 'tm-import') importData(e.target.files[0]);
    });

    box.addEventListener('click', (e) => {
        const t = e.target.closest('[data-close],[data-preset],[data-color],[data-bg],[data-act]');
        if (!t) return;
        if (t.hasAttribute('data-close')) { modal.classList.add('hidden'); modal.classList.remove('flex'); return; }
        if (t.dataset.preset) Theme.set(PRESETS[t.dataset.preset]);
        else if (t.dataset.color) Theme.set({ accent: t.dataset.color });
        else if (t.dataset.bg) Theme.set({ bgType: t.dataset.bg });
        else if (t.dataset.act === 'url') {
            const url = box.querySelector('#tm-url').value.trim();
            if (/^https?:\/\//i.test(url)) Theme.set({ bgType: 'image', bgImage: url });
        }
        else if (t.dataset.act === 'wall-reset') Theme.set({ bgType: 'image', bgImage: DEFAULT_WALLPAPER });
        else if (t.dataset.act === 'reset') Theme.reset();
        else if (t.dataset.act === 'export') return exportData();
        else if (t.dataset.act === 'import') return box.querySelector('#tm-import').click();
        build();
    });

    function exportData() {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k.startsWith('focus_') && k !== 'focus_user') data[k] = localStorage.getItem(k);
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
        a.download = `focus-backup-${getTodayStr()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    async function importData(file) {
        if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            Object.entries(data).forEach(([k, v]) => { if (k.startsWith('focus_') && typeof v === 'string') localStorage.setItem(k, v); });
            location.reload();
        } catch (e) {
            alert('Файл не похож на резервную копию Focus.');
        }
    }

    Theme.load();
    Theme.apply();
    build();
})();
