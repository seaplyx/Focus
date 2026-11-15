document.addEventListener('DOMContentLoaded', () => {
    // ---------- Хелперы ----------
    const $ = (id) => document.getElementById(id);
    const on = (id, evt, fn) => { const el = $(id); if (el) el.addEventListener(evt, fn); };

    const toggleModal = (el, open) => {
        if (!el) return;
        el.classList.toggle('hidden', !open);
        el.classList.toggle('flex', open);
    };

    // Любой пользовательский текст перед вставкой в innerHTML обязательно экранируем (защита от XSS)
    const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    // Уменьшаем картинку перед сохранением, чтобы не упереться в лимит localStorage
    function fileToResizedDataURL(file, maxSize, quality = 0.82) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);
            img.onload = () => {
                const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(objectUrl);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('Не удалось прочитать картинку'));
            };
            img.src = objectUrl;
        });
    }

    // ---------- 1. Авторизация ----------
    // Демо-профиль: без пароля, имя и аватар хранятся только в этом браузере.
    const authModal = $('auth-modal');
    let tempAvatar = null;

    on('auth-avatar-file', 'change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            tempAvatar = await fileToResizedDataURL(file, 128);
            $('auth-avatar-preview').src = tempAvatar;
        } catch (err) {
            console.warn(err);
        }
    });

    function initApp(user) {
        const name = $('user-username-label');
        const greetName = $('user-greeting-name');
        const avatar = $('user-avatar-img');
        if (name) name.textContent = user.username;
        if (greetName) greetName.textContent = user.username;
        if (avatar) avatar.src = user.avatar || defaultAvatar(user.username);
    }

    const currentUser = AppStorage.getUser();
    if (currentUser) {
        initApp(currentUser);
    } else {
        toggleModal(authModal, true);
    }

    on('auth-form', 'submit', (e) => {
        e.preventDefault();
        const username = $('auth-username').value.trim();
        if (!username) return;

        const user = { username, avatar: tempAvatar || defaultAvatar(username) };
        AppStorage.saveUser(user);
        toggleModal(authModal, false);
        initApp(user);
    });

    on('logout-btn', 'click', () => {
        AppStorage.clearUser();
        location.reload();
    });

    // ---------- 2. Состояние ----------
    let tasks = AppStorage.getTasks();
    let notes = AppStorage.getNotes();
    let currentFilter = 'all';
    let selectedDate = null;
    let searchQuery = '';

    const CATEGORY_STYLES = {
        'Web Dev': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
        'Study': 'bg-sky-500/15 text-sky-400 border-sky-500/30',
        'Health': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        'Design': 'bg-pink-500/15 text-pink-400 border-pink-500/30',
        'Personal': 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    };

    // ---------- 4. Дата и приветствие ----------
    function updateHeaderDate() {
        const now = new Date();
        const hour = now.getHours();
        let greeting = 'Good evening';
        if (hour < 12) greeting = 'Good morning';
        else if (hour < 18) greeting = 'Good afternoon';

        if ($('greeting-text')) $('greeting-text').textContent = greeting;
        if ($('current-date-label')) {
            $('current-date-label').textContent = now.toLocaleDateString(LOCALE, {
                weekday: 'long', month: 'short', day: 'numeric', year: 'numeric'
            });
        }
    }
    updateHeaderDate();

    // ---------- 5. Навигация ----------
    function switchTab(tabName) {
        document.querySelectorAll('.tab-section').forEach(sec => {
            sec.classList.toggle('hidden', sec.id !== `section-${tabName}`);
        });
        document.querySelectorAll('.nav-btn').forEach(btn => {
            const isActive = btn.dataset.tab === tabName;
            btn.classList.toggle('active', isActive);
            btn.classList.toggle('text-zinc-400', !isActive);
        });
    }
    window.switchTab = switchTab; // нужен для onclick="switchTab('tasks')" в index.html

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.tab === 'settings') toggleModal($('theme-modal'), true);
            else switchTab(btn.dataset.tab);
        });
    });

    // ---------- 6. Календарь ----------
    const calendar = new CalendarWidget((dateStr) => {
        selectedDate = dateStr;
        const banner = $('date-filter-banner');
        if (banner) banner.classList.toggle('hidden', !dateStr);
        if (dateStr && $('selected-date-text')) $('selected-date-text').textContent = dateStr;
        renderTasks();
        // раньше выбор даты ничего не показывал: фильтр менялся, но вкладка оставалась календарём
        if (dateStr) switchTab('tasks');
    }, () => tasks);
    calendar.render();

    on('clear-date-filter', 'click', () => {
        selectedDate = null;
        calendar.clearSelection();
        const banner = $('date-filter-banner');
        if (banner) banner.classList.add('hidden');
        renderTasks();
    });

    // ---------- 7. Задачи ----------
    const dayDiff = (dateStr, todayStr) => Math.round((new Date(dateStr) - new Date(todayStr)) / 86400000);

    function formatDateLabel(dateStr) {
        return dateStr === getTodayStr() ? 'Today' : dateStr;
    }

    function taskRowHTML(task) {
        const badge = CATEGORY_STYLES[task.category] || 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30';
        return `
            <div class="group flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#161620] hover:bg-[#1c1c29] border border-white/5 transition">
                <div class="flex items-center gap-3.5 min-w-0">
                    <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} data-id="${task.id}" aria-label="Выполнено">
                    <span data-id="${task.id}" class="task-title text-sm font-medium truncate ${task.completed ? 'line-through text-zinc-500' : 'text-zinc-100'}">
                        ${escapeHtml(task.title)}
                    </span>
                    <span class="shrink-0 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border ${badge}">
                        ${escapeHtml(task.category)}
                    </span>
                </div>
                <div class="flex items-center gap-3 shrink-0">
                    <span class="text-xs text-zinc-400 hidden sm:inline">
                        ${formatDateLabel(task.date)}${task.time ? ' • ' + task.time : ''}
                    </span>
                    <button class="delete-task-btn opacity-0 group-hover:opacity-100 focus:opacity-100 text-zinc-500 hover:text-rose-400 transition px-1" data-id="${task.id}" title="Удалить" aria-label="Удалить задачу">
                        <i class="fa-regular fa-trash-can text-xs"></i>
                    </button>
                </div>
            </div>
        `;
    }

    const EMPTY_TASKS_HTML = `
        <div class="text-center py-8 text-zinc-500 text-sm">
            <i class="fa-regular fa-folder-open text-2xl mb-2 block opacity-50"></i>
            Задач не найдено
        </div>
    `;

    function getFilteredTasks() {
        const today = getTodayStr();
        return tasks
            .filter(task => {
                if (searchQuery) {
                    const hay = `${task.title} ${task.category}`.toLowerCase();
                    if (!hay.includes(searchQuery)) return false;
                }
                if (selectedDate && task.date !== selectedDate) return false;
                if (currentFilter === 'today') return task.date === today;
                if (currentFilter === 'completed') return task.completed;
                if (currentFilter === 'week') {
                    const diff = dayDiff(task.date, today);
                    return diff >= 0 && diff <= 6;
                }
                return true;
            })
            .sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`));
    }

    function renderTasks() {
        const filtered = getFilteredTasks();
        const list = $('task-list');
        const homeList = $('home-task-list');
        if (list) list.innerHTML = filtered.length ? filtered.map(taskRowHTML).join('') : EMPTY_TASKS_HTML;
        if (homeList) homeList.innerHTML = tasks.length ? tasks.slice(0, 4).map(taskRowHTML).join('') : EMPTY_TASKS_HTML;
    }

    function updateStats() {
        const total = tasks.length;
        const completed = tasks.filter(t => t.completed).length;
        const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

        if ($('stat-total')) $('stat-total').textContent = total;
        if ($('stat-pending')) $('stat-pending').textContent = total - completed;
        if ($('stat-percent')) $('stat-percent').textContent = `${percent}%`;
    }

    function commitTasks() {
        AppStorage.saveTasks(tasks);
        calendar.render();
        renderTasks();
        updateStats();
    }

    // Делегирование: один обработчик на список вместо новых слушателей при каждой отрисовке
    ['task-list', 'home-task-list'].forEach(id => {
        const container = $(id);
        if (!container) return;

        container.addEventListener('change', (e) => {
            if (!e.target.classList.contains('task-checkbox')) return;
            const id = e.target.dataset.id;
            tasks = tasks.map(t => String(t.id) === id ? { ...t, completed: e.target.checked } : t);
            commitTasks();
        });

        container.addEventListener('click', (e) => {
            const btn = e.target.closest('.delete-task-btn');
            if (!btn) return;
            tasks = tasks.filter(t => String(t.id) !== btn.dataset.id);
            commitTasks();
        });
    });

    // Редактирование названия: двойной клик (Enter — сохранить, Esc — отмена)
    ['task-list', 'home-task-list'].forEach(id => {
        const c = $(id);
        if (!c) return;
        c.addEventListener('dblclick', (e) => {
            const span = e.target.closest('.task-title');
            if (!span) return;
            const taskId = span.dataset.id;
            let cancelled = false;
            span.classList.remove('truncate');
            span.contentEditable = 'true';
            span.focus();
            span.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); span.blur(); }
                if (ev.key === 'Escape') { cancelled = true; span.blur(); }
            });
            span.addEventListener('blur', () => {
                const text = span.textContent.trim();
                if (!cancelled && text) tasks = tasks.map(t => String(t.id) === taskId ? { ...t, title: text } : t);
                commitTasks();
            }, { once: true });
        });
    });

    // Фильтры и поиск
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => {
                b.classList.toggle('active', b === btn);
                b.classList.toggle('text-zinc-400', b !== btn);
            });
            currentFilter = btn.dataset.filter;
            renderTasks();
        });
    });

    on('global-search', 'input', (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        renderTasks();
        renderNotes();
    });

    // Модалка добавления задачи
    const taskModal = $('task-modal');

    on('open-task-modal', 'click', () => {
        if ($('task-date-input')) $('task-date-input').value = selectedDate || getTodayStr();
        toggleModal(taskModal, true);
    });
    on('close-task-modal', 'click', () => toggleModal(taskModal, false));

    on('add-task-form', 'submit', (e) => {
        e.preventDefault();
        const title = $('task-title-input').value.trim();
        if (!title) return;

        tasks.unshift({
            id: Date.now(),
            title,
            category: $('task-category-input').value,
            date: $('task-date-input').value,
            time: $('task-time-input').value,
            completed: false
        });
        e.target.reset();
        toggleModal(taskModal, false);
        commitTasks();
    });

    // ---------- 8. Заметки ----------
    function noteHTML(note, truncate) {
        return `
            <div class="flex items-start justify-between gap-2 bg-[#181822] p-3 rounded-xl border border-white/5 text-xs">
                <span class="text-zinc-300 ${truncate ? 'truncate' : 'break-words whitespace-pre-wrap min-w-0'}">${escapeHtml(note.text)}</span>
                <button class="del-note text-zinc-500 hover:text-rose-400 shrink-0" data-id="${note.id}" aria-label="Удалить заметку">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        `;
    }

    function renderNotes() {
        const items = notes.filter(n => !searchQuery || n.text.toLowerCase().includes(searchQuery));
        const empty = '<p class="text-xs text-zinc-500">Нет сохранённых заметок</p>';
        const list = $('notes-list');
        const homeList = $('home-notes-list');
        if (list) list.innerHTML = items.length ? items.map(n => noteHTML(n, false)).join('') : empty;
        if (homeList) homeList.innerHTML = items.length ? items.map(n => noteHTML(n, true)).join('') : empty;
    }

    ['notes-list', 'home-notes-list'].forEach(id => {
        const container = $(id);
        if (!container) return;
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('.del-note');
            if (!btn) return;
            notes = notes.filter(n => String(n.id) !== btn.dataset.id);
            AppStorage.saveNotes(notes);
            renderNotes();
        });
    });

    on('save-note-btn', 'click', () => {
        const input = $('quick-note-input');
        const text = input ? input.value.trim() : '';
        if (!text) return;
        notes.unshift({ id: Date.now(), text });
        AppStorage.saveNotes(notes);
        input.value = '';
        renderNotes();
    });

    // ---------- 9. Кастомизация (вся логика в js/customize.js) ----------
    const themeModal = $('theme-modal');
    on('open-theme-modal', 'click', () => toggleModal(themeModal, true));
    on('quick-bg-upload', 'change', (e) => { Theme.setWallpaperFile(e.target.files[0]); e.target.value = ''; });

    [taskModal, themeModal].forEach(modal => {
        if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) toggleModal(modal, false); });
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') [taskModal, themeModal].forEach(m => toggleModal(m, false));
    });

    // ---------- 10. Плеер ----------
    let tracks = [...INITIAL_TRACKS];
    let currentTrackIndex = 0;
    let isPlaying = false;
    const audio = new Audio();

    const playIcon = $('play-icon');
    const discIcon = $('disc-icon');
    const trackNameEl = $('track-name');

    function setPlaying(value) {
        isPlaying = value;
        if (playIcon) {
            playIcon.classList.toggle('fa-play', !value);
            playIcon.classList.toggle('fa-pause', value);
        }
        if (discIcon) discIcon.classList.toggle('animate-spin-slow', value);
    }

    function loadTrack(index) {
        currentTrackIndex = (index + tracks.length) % tracks.length;
        const track = tracks[currentTrackIndex];
        audio.src = track.url;
        if (trackNameEl) trackNameEl.textContent = track.name;
    }

    async function play() {
        try {
            await audio.play();
            setPlaying(true);
        } catch (err) {
            console.warn('Не удалось воспроизвести трек', err);
            setPlaying(false);
        }
    }

    function stepTrack(delta) {
        loadTrack(currentTrackIndex + delta);
        if (isPlaying) play();
    }

    audio.addEventListener('ended', () => stepTrack(1));
    audio.addEventListener('error', () => setPlaying(false));

    // Настройки звука: громкость, скорость, сохранение тона
    const AUDIO_KEY = 'focus_audio';
    let audioPrefs = { volume: 80, speed: 1, pitch: true, muted: false };
    try { audioPrefs = { ...audioPrefs, ...JSON.parse(localStorage.getItem(AUDIO_KEY)) }; } catch (e) { /* ignore */ }

    function applyAudioPrefs() {
        const shown = audioPrefs.muted ? 0 : audioPrefs.volume;
        audio.volume = audioPrefs.volume / 100;
        audio.muted = audioPrefs.muted;
        // defaultPlaybackRate нужен, чтобы скорость не сбрасывалась при смене трека
        audio.defaultPlaybackRate = audio.playbackRate = audioPrefs.speed;
        audio.preservesPitch = audio.mozPreservesPitch = audio.webkitPreservesPitch = audioPrefs.pitch;

        if ($('volume-slider')) $('volume-slider').value = audioPrefs.volume;
        if ($('volume-label')) $('volume-label').textContent = shown + '%';
        if ($('vol-icon')) {
            $('vol-icon').className = 'fa-solid ' + (shown === 0 ? 'fa-volume-xmark' : shown < 40 ? 'fa-volume-low' : 'fa-volume-high');
        }
        if ($('speed-slider')) $('speed-slider').value = audioPrefs.speed;
        if ($('speed-label')) $('speed-label').textContent = audioPrefs.speed.toFixed(2).replace(/0$/, '') + 'x';
        if ($('pitch-toggle')) $('pitch-toggle').checked = audioPrefs.pitch;
    }

    function updateAudioPrefs(patch) {
        Object.assign(audioPrefs, patch);
        applyAudioPrefs();
        try { localStorage.setItem(AUDIO_KEY, JSON.stringify(audioPrefs)); } catch (e) { /* ignore */ }
    }

    on('volume-slider', 'input', (e) => {
        const volume = Number(e.target.value);
        updateAudioPrefs({ volume, muted: volume === 0 });
    });
    on('mute-btn', 'click', () => {
        const muted = !audioPrefs.muted;
        updateAudioPrefs({ muted, volume: !muted && audioPrefs.volume === 0 ? 50 : audioPrefs.volume });
    });
    on('speed-slider', 'input', (e) => updateAudioPrefs({ speed: Number(e.target.value) }));
    on('speed-label', 'click', () => updateAudioPrefs({ speed: 1 }));
    on('pitch-toggle', 'change', (e) => updateAudioPrefs({ pitch: e.target.checked }));
    applyAudioPrefs();

    on('play-pause-btn', 'click', () => {
        if (isPlaying) {
            audio.pause();
            setPlaying(false);
        } else {
            play();
        }
    });
    on('next-track', 'click', () => stepTrack(1));
    on('prev-track', 'click', () => stepTrack(-1));

    on('upload-track-file', 'change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const track = { id: uid(), name: file.name.replace(/\.[^/.]+$/, ''), blob: file };
        try {
            await TrackDB.add(track);
        } catch (err) {
            console.warn(err);
            alert('Трек сыграет сейчас, но сохранить его не удалось.');
        }

        tracks.push({ id: track.id, name: track.name, url: URL.createObjectURL(file) });
        loadTrack(tracks.length - 1);
        play();
        e.target.value = '';
    });

    loadTrack(0);

    // Подгружаем сохранённые треки в фоне, чтобы не задерживать запуск интерфейса
    (async () => {
        try {
            await TrackDB.migrateLegacy();
            const saved = await TrackDB.getAll();
            saved.forEach(t => tracks.push({ id: t.id, name: t.name, url: URL.createObjectURL(t.blob) }));
        } catch (err) {
            console.warn('IndexedDB недоступна, свои треки не сохранятся', err);
        }
    })();

    // ---------- Старт ----------
    renderTasks();
    updateStats();
    renderNotes();
});
