/**
 * Regio 휠 날짜 선택기
 * - input[type="date"] 클릭 시 네이티브 달력 대신 년/월/일 스크롤 휠 표시
 * - 선택값 위·아래에 앞뒤 숫자가 보이도록 구성
 */
(function (global) {
    'use strict';

    const ITEM_H = 40;
    const VISIBLE = 5;
    const PAD_COUNT = Math.floor(VISIBLE / 2);
    const YEAR_RANGE = 30; // 현재 기준 ±
    const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

    let overlay = null;
    let activeInput = null;
    let pending = { y: 0, m: 1, d: 1 };
    let columns = { year: null, month: null, day: null };
    let scrollTimers = {};

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function daysInMonth(year, month) {
        return new Date(year, month, 0).getDate();
    }

    function weekdayKo(year, month, day) {
        const wd = new Date(year, month - 1, day).getDay();
        return WEEKDAY_KO[wd] || '';
    }

    function formatDayLabel(year, month, day) {
        return `${day}일(${weekdayKo(year, month, day)})`;
    }

    function parseDateValue(value) {
        if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            const now = new Date();
            return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
        }
        const [y, m, d] = value.split('-').map(Number);
        return { y, m, d };
    }

    function formatDate(y, m, d) {
        return `${y}-${pad2(m)}-${pad2(d)}`;
    }

    function formatDisplay(y, m, d) {
        return `${y}년 ${m}월 ${d}일(${weekdayKo(y, m, d)})`;
    }

    function ensureStyles() {
        if (document.getElementById('regio-date-wheel-styles')) return;
        const style = document.createElement('style');
        style.id = 'regio-date-wheel-styles';
        style.textContent = `
            .regio-dw-overlay {
                position: fixed; inset: 0; z-index: 10050;
                background: rgba(15, 23, 42, 0.45);
                display: flex; align-items: flex-end; justify-content: center;
                opacity: 0; pointer-events: none; transition: opacity .2s ease;
            }
            .regio-dw-overlay.is-open { opacity: 1; pointer-events: auto; }
            .regio-dw-sheet {
                width: 100%; max-width: 480px;
                background: #fff;
                border-radius: 18px 18px 0 0;
                box-shadow: 0 -8px 28px rgba(15, 23, 42, 0.18);
                padding: 10px 12px calc(12px + env(safe-area-inset-bottom, 0px));
                transform: translateY(24px); transition: transform .22s ease;
            }
            .regio-dw-overlay.is-open .regio-dw-sheet { transform: translateY(0); }
            .regio-dw-header {
                display: flex; align-items: center; justify-content: space-between;
                gap: 8px; padding: 4px 4px 10px;
            }
            .regio-dw-title { font-size: 12px; font-weight: 700; color: #1f2937; }
            .regio-dw-value { font-size: 12px; font-weight: 600; color: #4A90E2; }
            .regio-dw-wheels {
                position: relative;
                display: grid;
                grid-template-columns: 1.15fr 0.85fr 1.15fr;
                gap: 4px;
                height: ${ITEM_H * VISIBLE}px;
                margin: 4px 0 12px;
                -webkit-mask-image: linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent);
                mask-image: linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent);
            }
            .regio-dw-highlight {
                position: absolute; left: 4px; right: 4px;
                top: 50%; height: ${ITEM_H}px; margin-top: -${ITEM_H / 2}px;
                border-radius: 10px;
                background: rgba(74, 144, 226, 0.12);
                border: 1px solid rgba(74, 144, 226, 0.28);
                pointer-events: none; z-index: 1;
            }
            .regio-dw-col {
                position: relative; z-index: 2;
                height: 100%;
                overflow-y: auto;
                overscroll-behavior: contain;
                scroll-snap-type: y mandatory;
                -webkit-overflow-scrolling: touch;
                scrollbar-width: none;
            }
            .regio-dw-col::-webkit-scrollbar { display: none; }
            .regio-dw-spacer { height: ${ITEM_H * PAD_COUNT}px; flex-shrink: 0; }
            .regio-dw-item {
                height: ${ITEM_H}px;
                display: flex; align-items: center; justify-content: center;
                scroll-snap-align: center;
                font-size: 12px; font-weight: 500; color: #94a3b8;
                user-select: none;
            }
            .regio-dw-item.is-selected {
                font-size: 12px; font-weight: 800; color: #0f172a;
            }
            .regio-dw-labels {
                display: grid;
                grid-template-columns: 1.15fr 0.85fr 1.15fr;
                gap: 4px;
                margin-bottom: 2px;
                text-align: center;
                font-size: 11px; font-weight: 700; color: #94a3b8;
                letter-spacing: 0.04em;
            }
            .regio-dw-col[data-unit="day"] .regio-dw-item {
                font-size: 12px;
            }
            .regio-dw-col[data-unit="day"] .regio-dw-item.is-selected {
                font-size: 12px;
            }
            .regio-dw-actions {
                display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
            }
            .regio-dw-btn {
                border: none; border-radius: 10px;
                min-height: 46px; font-size: 12px; font-weight: 700;
                cursor: pointer;
            }
            .regio-dw-btn.cancel { background: #e2e8f0; color: #334155; }
            .regio-dw-btn.confirm { background: #111827; color: #fff; }
            input[type="date"].regio-dw-bound {
                color: transparent !important;
                caret-color: transparent;
                position: relative;
            }
            input[type="date"].regio-dw-bound::-webkit-calendar-picker-indicator {
                opacity: 0; position: absolute; inset: 0; width: 100%; height: 100%;
                cursor: pointer;
            }
            input[type="date"].regio-dw-bound::-webkit-datetime-edit { color: transparent; }
            .regio-dw-display {
                position: absolute; inset: 0;
                display: flex; align-items: center;
                padding: 0 10px;
                pointer-events: none;
                font-size: 12px; font-weight: 600; color: #0f172a;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .regio-dw-input-wrap {
                position: relative;
                flex: 1.2; min-width: 0; max-width: none;
                display: flex; align-items: stretch;
            }
            .regio-dw-input-wrap input[type="date"] {
                width: 100%;
            }
        `;
        document.head.appendChild(style);
    }

    function buildColumn(unit, values, formatter) {
        const col = document.createElement('div');
        col.className = 'regio-dw-col';
        col.dataset.unit = unit;

        const top = document.createElement('div');
        top.className = 'regio-dw-spacer';
        col.appendChild(top);

        values.forEach((v) => {
            const item = document.createElement('div');
            item.className = 'regio-dw-item';
            item.dataset.value = String(v);
            item.textContent = formatter ? formatter(v) : String(v);
            col.appendChild(item);
        });

        const bottom = document.createElement('div');
        bottom.className = 'regio-dw-spacer';
        col.appendChild(bottom);

        col.addEventListener('scroll', () => onColumnScroll(unit), { passive: true });
        return col;
    }

    function getSelectedFromScroll(col) {
        const items = col.querySelectorAll('.regio-dw-item');
        if (!items.length) return null;
        const center = col.scrollTop + col.clientHeight / 2;
        let best = items[0];
        let bestDist = Infinity;
        items.forEach((item) => {
            const itemCenter = item.offsetTop + item.offsetHeight / 2;
            const dist = Math.abs(itemCenter - center);
            if (dist < bestDist) {
                bestDist = dist;
                best = item;
            }
        });
        return Number(best.dataset.value);
    }

    function markSelected(col, value) {
        col.querySelectorAll('.regio-dw-item').forEach((item) => {
            item.classList.toggle('is-selected', Number(item.dataset.value) === value);
        });
    }

    function scrollToValue(col, value, smooth) {
        const item = col.querySelector(`.regio-dw-item[data-value="${value}"]`);
        if (!item) return;
        const top = item.offsetTop - PAD_COUNT * ITEM_H;
        col.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
        markSelected(col, value);
    }

    function updateValueLabel() {
        const el = overlay && overlay.querySelector('.regio-dw-value');
        if (el) el.textContent = formatDisplay(pending.y, pending.m, pending.d);
    }

    function rebuildDayColumn(keepDay) {
        const maxDay = daysInMonth(pending.y, pending.m);
        const dayValues = [];
        for (let d = 1; d <= maxDay; d++) dayValues.push(d);
        const old = columns.day;
        const next = buildColumn('day', dayValues, (d) => formatDayLabel(pending.y, pending.m, d));
        old.replaceWith(next);
        columns.day = next;
        pending.d = Math.min(keepDay || pending.d, maxDay);
        requestAnimationFrame(() => scrollToValue(columns.day, pending.d, false));
    }

    function onColumnScroll(unit) {
        clearTimeout(scrollTimers[unit]);
        scrollTimers[unit] = setTimeout(() => {
            const col = columns[unit];
            if (!col) return;
            const value = getSelectedFromScroll(col);
            if (value == null || Number.isNaN(value)) return;
            markSelected(col, value);
            if (unit === 'year') {
                pending.y = value;
                rebuildDayColumn(pending.d);
            } else if (unit === 'month') {
                pending.m = value;
                rebuildDayColumn(pending.d);
            } else {
                pending.d = value;
            }
            updateValueLabel();
        }, 80);
    }

    function ensureOverlay() {
        if (overlay) return overlay;
        ensureStyles();
        overlay = document.createElement('div');
        overlay.className = 'regio-dw-overlay';
        overlay.innerHTML = `
            <div class="regio-dw-sheet" role="dialog" aria-modal="true" aria-label="날짜 선택">
                <div class="regio-dw-header">
                    <div class="regio-dw-title">날짜 선택</div>
                    <div class="regio-dw-value"></div>
                </div>
                <div class="regio-dw-labels"><span>년</span><span>월</span><span>일</span></div>
                <div class="regio-dw-wheels"></div>
                <div class="regio-dw-actions">
                    <button type="button" class="regio-dw-btn cancel">취소</button>
                    <button type="button" class="regio-dw-btn confirm">확인</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
        overlay.querySelector('.regio-dw-btn.cancel').addEventListener('click', close);
        overlay.querySelector('.regio-dw-btn.confirm').addEventListener('click', confirm);
        return overlay;
    }

    function open(input) {
        activeInput = input;
        const parsed = parseDateValue(input.value);
        pending = { ...parsed };

        const root = ensureOverlay();
        const wheels = root.querySelector('.regio-dw-wheels');

        const nowY = new Date().getFullYear();
        const years = [];
        for (let y = nowY - YEAR_RANGE; y <= nowY + YEAR_RANGE; y++) years.push(y);
        const months = [];
        for (let m = 1; m <= 12; m++) months.push(m);
        const maxDay = daysInMonth(pending.y, pending.m);
        const days = [];
        for (let d = 1; d <= maxDay; d++) days.push(d);

        columns.year = buildColumn('year', years, (y) => `${y}년`);
        columns.month = buildColumn('month', months, (m) => `${m}월`);
        columns.day = buildColumn('day', days, (d) => formatDayLabel(pending.y, pending.m, d));

        wheels.innerHTML = '<div class="regio-dw-highlight"></div>';
        wheels.appendChild(columns.year);
        wheels.appendChild(columns.month);
        wheels.appendChild(columns.day);

        updateValueLabel();
        root.classList.add('is-open');
        document.body.style.overflow = 'hidden';

        requestAnimationFrame(() => {
            scrollToValue(columns.year, pending.y, false);
            scrollToValue(columns.month, pending.m, false);
            scrollToValue(columns.day, pending.d, false);
        });
    }

    function close() {
        if (!overlay) return;
        overlay.classList.remove('is-open');
        document.body.style.overflow = '';
        activeInput = null;
    }

    function confirm() {
        if (!activeInput) return;
        // snap latest scroll positions
        pending.y = getSelectedFromScroll(columns.year) || pending.y;
        pending.m = getSelectedFromScroll(columns.month) || pending.m;
        pending.d = getSelectedFromScroll(columns.day) || pending.d;
        const maxDay = daysInMonth(pending.y, pending.m);
        pending.d = Math.min(pending.d, maxDay);

        const value = formatDate(pending.y, pending.m, pending.d);
        activeInput.value = value;
        syncDisplay(activeInput);
        activeInput.dispatchEvent(new Event('input', { bubbles: true }));
        activeInput.dispatchEvent(new Event('change', { bubbles: true }));
        close();
    }

    function syncDisplay(input) {
        const wrap = input.closest('.regio-dw-input-wrap');
        if (!wrap) return;
        let display = wrap.querySelector('.regio-dw-display');
        if (!display) {
            display = document.createElement('span');
            display.className = 'regio-dw-display';
            wrap.appendChild(display);
        }
        if (input.value) {
            const p = parseDateValue(input.value);
            display.textContent = formatDisplay(p.y, p.m, p.d);
        } else {
            display.textContent = '날짜 선택';
        }
    }

    function bindInput(input) {
        if (!input || input.dataset.regioDwBound === '1') return;
        if (input.type !== 'date') return;

        ensureStyles();
        input.dataset.regioDwBound = '1';
        input.classList.add('regio-dw-bound');
        input.setAttribute('readonly', 'readonly');
        input.setAttribute('inputmode', 'none');

        let wrap = input.closest('.regio-dw-input-wrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'regio-dw-input-wrap';
            input.parentNode.insertBefore(wrap, input);
            wrap.appendChild(input);
        }

        const openPicker = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof input.showPicker === 'function') {
                try { /* suppress native */ } catch (_) { /* ignore */ }
            }
            open(input);
        };

        input.addEventListener('click', openPicker);
        input.addEventListener('mousedown', (e) => e.preventDefault());
        input.addEventListener('focus', (e) => {
            e.preventDefault();
            input.blur();
            open(input);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open(input);
            }
        });

        syncDisplay(input);
        const observer = new MutationObserver(() => syncDisplay(input));
        observer.observe(input, { attributes: true, attributeFilter: ['value'] });

        // value set via JS (.value =) doesn't fire mutation on property — patch lightly
        const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        if (desc && desc.set) {
            Object.defineProperty(input, 'value', {
                configurable: true,
                enumerable: true,
                get() { return desc.get.call(this); },
                set(v) {
                    desc.set.call(this, v);
                    syncDisplay(this);
                }
            });
        }
    }

    function enhanceAll(root) {
        const scope = root || document;
        scope.querySelectorAll('input[type="date"]').forEach(bindInput);
    }

    function init() {
        enhanceAll(document);
        const mo = new MutationObserver((mutations) => {
            mutations.forEach((m) => {
                m.addedNodes.forEach((node) => {
                    if (node.nodeType !== 1) return;
                    if (node.matches && node.matches('input[type="date"]')) bindInput(node);
                    if (node.querySelectorAll) enhanceAll(node);
                });
            });
        });
        mo.observe(document.documentElement, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.RegioDateWheel = {
        open,
        close,
        enhanceAll,
        bindInput
    };
})(typeof window !== 'undefined' ? window : global);
