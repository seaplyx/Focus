const LOCALE = 'en-US';

const DEFAULT_WALLPAPER = "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1400&auto=format&fit=crop";

function getTodayStr() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);
    return local.toISOString().split('T')[0];
}

function defaultAvatar(seed) {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed || 'user')}&backgroundColor=1e1b4b`;
}

function uid() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const INITIAL_TASKS = [
    { id: 1, title: "Plan the week", category: "Web Dev", date: getTodayStr(), time: "18:00", completed: true },
    { id: 2, title: "Study React (hooks, context)", category: "Study", date: getTodayStr(), time: "20:00", completed: false },
    { id: 3, title: "Gym workout session", category: "Health", date: getTodayStr(), time: "21:00", completed: false },
    { id: 4, title: "Design a landing page", category: "Design", date: getTodayStr(), time: "15:30", completed: false }
];

const INITIAL_TRACKS = [
    {
        id: 'default',
        name: "Lo-Fi Chill Stream",
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
    }
];

const INITIAL_NOTES = [
    { id: 101, text: "Двойной клик по задаче — редактировать. Здесь можно хранить быстрые заметки и идеи" }
];

// Назвали AppStorage, чтобы не перекрывать встроенный браузерный интерфейс Storage
const AppStorage = {
    _readJSON(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (err) {
            console.warn(`Не удалось прочитать "${key}"`, err);
            return fallback;
        }
    },

    _readRaw(key) {
        try {
            return localStorage.getItem(key);
        } catch (err) {
            return null;
        }
    },

    // Возвращает false, если не вышло записать (например, переполнен localStorage)
    _write(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (err) {
            console.warn(`Не удалось сохранить "${key}"`, err);
            return false;
        }
    },

    _writeJSON(key, value) {
        return this._write(key, JSON.stringify(value));
    },

    // --- Пользователь ---
    getUser() {
        return this._readJSON('focus_user', null);
    },
    saveUser(userObj) {
        return this._writeJSON('focus_user', userObj);
    },
    clearUser() {
        localStorage.removeItem('focus_user');
    },

    // --- Задачи ---
    getTasks() {
        const saved = this._readJSON('focus_tasks', null);
        if (Array.isArray(saved)) return saved;
        this.saveTasks(INITIAL_TASKS);
        return [...INITIAL_TASKS];
    },
    saveTasks(tasks) {
        return this._writeJSON('focus_tasks', tasks);
    },

    // --- Заметки ---
    getNotes() {
        const saved = this._readJSON('focus_notes', null);
        return Array.isArray(saved) ? saved : [...INITIAL_NOTES];
    },
    saveNotes(notes) {
        return this._writeJSON('focus_notes', notes);
    },

    // --- Тема ---
    getTheme() {
        return {
            accent: this._readRaw('focus_accent') || '#7c3aed',
            wallpaper: this._readRaw('focus_wallpaper') || DEFAULT_WALLPAPER
        };
    },
    saveAccent(hex) {
        return this._write('focus_accent', hex);
    },
    getOpacity() {
        const v = parseFloat(this._readRaw('focus_opacity'));
        return Number.isFinite(v) ? Math.min(0.9, Math.max(0.2, v)) : 0.55;
    },
    saveOpacity(v) {
        return this._write('focus_opacity', String(v));
    },
    saveWallpaper(urlOrBase64) {
        return this._write('focus_wallpaper', urlOrBase64);
    },
    resetWallpaper() {
        try { localStorage.removeItem('focus_wallpaper'); } catch (err) { /* ignore */ }
        return DEFAULT_WALLPAPER;
    }
};

// Аудио храним в IndexedDB: в localStorage лимит ~5 МБ, одна mp3 его легко съедает
const TrackDB = {
    _db: null,

    open() {
        return new Promise((resolve, reject) => {
            if (this._db) return resolve(this._db);
            const req = indexedDB.open('focus-db', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('tracks', { keyPath: 'id' });
            req.onsuccess = () => {
                this._db = req.result;
                resolve(this._db);
            };
            req.onerror = () => reject(req.error);
        });
    },

    async _run(mode, fn) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const store = db.transaction('tracks', mode).objectStore('tracks');
            const req = fn(store);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    getAll() { return this._run('readonly', s => s.getAll()); },
    add(track) { return this._run('readwrite', s => s.put(track)); },
    remove(id) { return this._run('readwrite', s => s.delete(id)); },

    // Переносим треки из старой версии (base64 в localStorage) в IndexedDB
    async migrateLegacy() {
        const raw = AppStorage._readRaw('focus_tracks');
        if (!raw) return;
        try {
            const old = JSON.parse(raw).filter(t => t.url && t.url.startsWith('data:'));
            for (const t of old) {
                const blob = await (await fetch(t.url)).blob();
                await this.add({ id: uid(), name: t.name, blob });
            }
        } catch (err) {
            console.warn('Миграция треков не удалась', err);
        }
        localStorage.removeItem('focus_tracks');
    }
};
