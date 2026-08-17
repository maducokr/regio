/**
 * 활동 종목 등 <select> — 모바일 네이티브 피커(큰 글씨) 대신
 * 앱과 같은 12px 목록 시트로 선택
 */
(function (global) {
    'use strict';

    const BOUND = new WeakSet();
    let overlay = null;
    let activeSelect = null;

    function shouldUseCustomPicker() {
        if (document.documentElement.classList.contains('regio-native-android')) return true;
        if (document.documentElement.classList.contains('regio-webview')) return true;
        if (window.matchMedia('(max-width: 900px)').matches) return true;
        if ('ontouchstart' in window && window.matchMedia('(pointer: coarse)').matches) return true;
        return false;
    }

    function ensureStyles() {
        if (document.getElementById('regio-select-picker-styles')) return;
        const style = document.createElement('style');
        style.id = 'regio-select-picker-styles';
        style.textContent = `
            .regio-sp-overlay {
                position: fixed; inset: 0; z-index: 10060;
                background: rgba(15, 23, 42, 0.45);
                display: flex; align-items: flex-end; justify-content: center;
                opacity: 0; pointer-events: none; transition: opacity .18s ease;
            }
            .regio-sp-overlay.is-open { opacity: 1; pointer-events: auto; }
            .regio-sp-sheet {
                width: 100%; max-width: 520px;
                max-height: min(78dvh, 640px);
                background: #fff;
                border-radius: 16px 16px 0 0;
                box-shadow: 0 -8px 28px rgba(15, 23, 42, 0.18);
                display: flex; flex-direction: column;
                transform: translateY(20px); transition: transform .2s ease;
                padding-bottom: env(safe-area-inset-bottom, 0px);
            }
            .regio-sp-overlay.is-open .regio-sp-sheet { transform: translateY(0); }
            .regio-sp-header {
                display: flex; align-items: center; justify-content: space-between;
                gap: 8px; padding: 10px 12px 8px;
                border-bottom: 1px solid #e5e7eb; flex: 0 0 auto;
            }
            .regio-sp-title {
                font-size: 12px !important; font-weight: 700; color: #1f2937; margin: 0;
            }
            .regio-sp-close {
                border: none; background: #f3f4f6; color: #475569;
                font-size: 12px !important; font-weight: 600;
                padding: 6px 10px; border-radius: 8px; cursor: pointer;
                min-height: 32px;
            }
            .regio-sp-search-wrap {
                padding: 8px 12px; border-bottom: 1px solid #eef2f7; flex: 0 0 auto;
            }
            .regio-sp-search {
                width: 100%; box-sizing: border-box;
                font-size: 12px !important; line-height: 1.3;
                padding: 8px 10px; min-height: 36px;
                border: 1px solid #dbe3ee; border-radius: 8px;
                background: #f8fafc; color: #111;
            }
            .regio-sp-list {
                overflow-y: auto; -webkit-overflow-scrolling: touch;
                flex: 1 1 auto; padding: 0 0 8px;
            }
            .regio-sp-item {
                display: flex; align-items: center; justify-content: space-between;
                gap: 10px; width: 100%;
                padding: 8px 14px; min-height: 36px;
                border: none; border-bottom: 1px solid #eceff3;
                background: #fff; color: #111; text-align: left;
                font-size: 12px !important; font-weight: 500; line-height: 1.35;
                cursor: pointer; -webkit-tap-highlight-color: transparent;
            }
            .regio-sp-item:active, .regio-sp-item.is-selected {
                background: #eef5fc; color: #1d4ed8;
            }
            .regio-sp-item .mark {
                flex: 0 0 auto; width: 16px; height: 16px;
                border: 1.5px solid #94a3b8; border-radius: 50%;
                box-sizing: border-box;
            }
            .regio-sp-item.is-selected .mark {
                border-color: #4A90E2;
                background: radial-gradient(circle at center, #4A90E2 0 45%, transparent 48%);
            }
            .regio-sp-item-label {
                flex: 1 1 auto; min-width: 0;
                font-size: 12px !important;
                word-break: keep-all; overflow-wrap: anywhere;
            }
            .regio-sp-empty {
                padding: 24px 16px; text-align: center;
                color: #94a3b8; font-size: 12px !important;
            }
        `;
        document.head.appendChild(style);
    }

    function closePicker() {
        if (!overlay) return;
        overlay.classList.remove('is-open');
        activeSelect = null;
        setTimeout(() => {
            if (overlay && !overlay.classList.contains('is-open')) {
                overlay.style.display = 'none';
            }
        }, 200);
    }

    function buildOverlay() {
        if (overlay) return overlay;
        ensureStyles();
        overlay = document.createElement('div');
        overlay.className = 'regio-sp-overlay';
        overlay.style.display = 'none';
        overlay.innerHTML = `
            <div class="regio-sp-sheet" role="dialog" aria-modal="true" aria-label="종목 선택">
                <div class="regio-sp-header">
                    <p class="regio-sp-title">활동 종목 선택</p>
                    <button type="button" class="regio-sp-close" data-sp-close>닫기</button>
                </div>
                <div class="regio-sp-search-wrap">
                    <input type="search" class="regio-sp-search" placeholder="종목 검색" autocomplete="off" enterkeyhint="search">
                </div>
                <div class="regio-sp-list"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closePicker();
        });
        overlay.querySelector('[data-sp-close]').addEventListener('click', closePicker);
        overlay.querySelector('.regio-sp-search').addEventListener('input', () => {
            if (activeSelect) renderList(activeSelect);
        });
        return overlay;
    }

    function getVisibleOptions(select) {
        return Array.from(select.options).filter((opt) => !opt.hidden && !opt.disabled);
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderList(select) {
        const list = overlay.querySelector('.regio-sp-list');
        const q = String(overlay.querySelector('.regio-sp-search').value || '').trim().toLowerCase();
        const options = getVisibleOptions(select).filter((opt) => {
            if (!q) return true;
            return String(opt.textContent || '').toLowerCase().includes(q);
        });

        list.innerHTML = '';
        if (!options.length) {
            list.innerHTML = '<div class="regio-sp-empty">검색 결과가 없습니다.</div>';
            return;
        }

        options.forEach((opt) => {
            const selected = opt.value === select.value;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `regio-sp-item${selected ? ' is-selected' : ''}`;
            btn.innerHTML = `<span class="regio-sp-item-label">${escapeHtml(opt.textContent || '')}</span><span class="mark" aria-hidden="true"></span>`;
            btn.addEventListener('click', () => {
                const prev = select.value;
                select.value = opt.value;
                if (prev !== opt.value) {
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    select.dispatchEvent(new Event('input', { bubbles: true }));
                }
                closePicker();
            });
            list.appendChild(btn);
        });
    }

    function openPicker(select) {
        if (!select) return;
        const sheet = buildOverlay();
        activeSelect = select;
        const title = select.getAttribute('data-picker-title')
            || select.closest('.list-row')?.querySelector('label')?.textContent?.trim()
            || '항목 선택';
        sheet.querySelector('.regio-sp-title').textContent = title;
        const search = sheet.querySelector('.regio-sp-search');
        search.value = '';
        renderList(select);
        sheet.style.display = 'flex';
        requestAnimationFrame(() => sheet.classList.add('is-open'));
        setTimeout(() => {
            try { search.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
        }, 220);
    }

    function bindSelect(select) {
        if (!select || BOUND.has(select)) return;
        BOUND.add(select);

        const openIfNeeded = (e) => {
            if (!shouldUseCustomPicker()) return;
            e.preventDefault();
            e.stopPropagation();
            try { select.blur(); } catch (err) { /* ignore */ }
            openPicker(select);
        };

        // 모바일 네이티브 피커 차단
        select.addEventListener('mousedown', openIfNeeded, true);
        select.addEventListener('touchstart', openIfNeeded, { capture: true, passive: false });
        select.addEventListener('click', openIfNeeded, true);
        select.addEventListener('keydown', (e) => {
            if (!shouldUseCustomPicker()) return;
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                e.preventDefault();
                openPicker(select);
            }
        });
    }

    function enhance(selectorOrElement) {
        const el = typeof selectorOrElement === 'string'
            ? document.querySelector(selectorOrElement)
            : selectorOrElement;
        if (el) bindSelect(el);
        return el;
    }

    function enhanceAll(selector) {
        document.querySelectorAll(selector || 'select[data-compact-picker], #categorySelect').forEach(bindSelect);
    }

    global.RegioSelectPicker = {
        enhance,
        enhanceAll,
        open: openPicker,
        close: closePicker,
        shouldUseCustomPicker
    };

    document.addEventListener('DOMContentLoaded', () => {
        enhanceAll();
    });
})(typeof window !== 'undefined' ? window : global);
