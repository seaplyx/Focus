class CalendarWidget {
    /**
     * @param {(dateStr: string|null) => void} onDateSelect вызывается при выборе/снятии даты
     * @param {() => Array} getTasks источник задач (чтобы не читать localStorage при каждой отрисовке)
     */
    constructor(onDateSelect, getTasks = () => AppStorage.getTasks()) {
        this.currentDate = new Date();
        // Фиксируем 1-е число: иначе setMonth() на 31-м числе перепрыгивает через месяц
        this.currentDate.setDate(1);
        this.selectedDate = null;
        this.onDateSelect = onDateSelect;
        this.getTasks = getTasks;

        this.monthYearEl = document.getElementById('calendar-month-year');
        this.gridEl = document.getElementById('calendar-grid');

        document.getElementById('cal-prev').addEventListener('click', () => this.shiftMonth(-1));
        document.getElementById('cal-next').addEventListener('click', () => this.shiftMonth(1));

        // Один обработчик на всю сетку вместо 30 отдельных
        this.gridEl.addEventListener('click', (e) => {
            const cell = e.target.closest('[data-date]');
            if (!cell) return;
            const dateStr = cell.dataset.date;
            this.selectedDate = this.selectedDate === dateStr ? null : dateStr;
            this.render();
            if (this.onDateSelect) this.onDateSelect(this.selectedDate);
        });
    }

    shiftMonth(delta) {
        this.currentDate.setMonth(this.currentDate.getMonth() + delta);
        this.render();
    }

    clearSelection() {
        this.selectedDate = null;
        this.render();
    }

    render() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        this.monthYearEl.textContent = this.currentDate.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });

        const firstDayRaw = new Date(year, month, 1).getDay();
        const startOffset = firstDayRaw === 0 ? 6 : firstDayRaw - 1; // неделя с понедельника
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const taskDates = new Set(this.getTasks().map(t => t.date));
        const todayStr = getTodayStr();

        const parts = [];

        for (let i = 0; i < startOffset; i++) {
            parts.push('<div class="cal-day empty text-zinc-700"></div>');
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const classes = ['cal-day', 'text-zinc-300', 'font-medium'];

            if (dateStr === todayStr) classes.push('border', 'border-[var(--accent)]', 'text-white');
            if (this.selectedDate === dateStr) classes.push('selected');
            if (taskDates.has(dateStr)) classes.push('has-task');

            parts.push(`<div class="${classes.join(' ')}" data-date="${dateStr}">${day}</div>`);
        }

        this.gridEl.innerHTML = parts.join('');
    }
}
