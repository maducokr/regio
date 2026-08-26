/**
 * Pr 쁘레시디움 사업 보고서 양식
 * activity-report.html?scope=pr + 일년 집계 시 활동요약 위에 표시
 */
(function (global) {
    'use strict';

    const FIXED_EVENTS = [
        { key: 'acies', labels: ['아치에스'], title: '아치에스' },
        { key: 'outdoor', labels: ['야외 행사', '야외행사'], title: '야외 행사' },
        { key: 'pr_social', labels: ['쁘레시디움 친목회', 'Pr친목회', 'Pr 친목회'], title: '쁘레시디움 친목회' },
        { key: 'annual_social', labels: ['연차 총 친목회', '연차총친목회', '총친목회'], title: '연차 총 친목회' },
        { key: 'debate', labels: ['토론 대회', '토론대회'], title: '토론 대회' }
    ];

    const OTHER_EVENTS = [
        { key: 'mary_night', labels: ['성모의 밤', '성모의밤'], title: '성모의 밤' },
        { key: 'requiem', labels: ['위령미사', '위령성월'], title: '위령미사(위령성월)' },
        { key: 'president_meet', labels: ['단장 간담회', '단장간담회', '단장 회의', '단장회의'], title: '단장 간담회' }
    ];

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function cell(value, cls) {
        return blank(value, cls || 'w6');
    }

    /** 값이 있어도 PDF 전 수정 가능(저장 없음). 빈칸만 빨간 깜빡임 */
    function blank(value, cls) {
        const text = value === null || value === undefined || value === '' ? '' : String(value);
        const c = cls ? ` blank ${cls}` : ' blank';
        const has = text.trim() ? ' has-value' : '';
        return `<input type="text" class="${c.trim()} blank-editable${has}" value="${escapeHtml(text)}" placeholder=" " inputmode="text" autocomplete="off" aria-label="출력 전 수정">`;
    }

    function ratioBlank(present, total) {
        return `${blank(present, 'w3')} / ${blank(total, 'w3')}`;
    }

    function fitBlankInputWidth(inp) {
        if (!inp || !inp.classList.contains('blank-editable')) return;
        const cs = window.getComputedStyle(inp);
        const minPx = parseFloat(cs.minWidth) || 8;
        const probe = document.createElement('span');
        probe.setAttribute('aria-hidden', 'true');
        probe.style.cssText = [
            'position:absolute',
            'left:-9999px',
            'top:0',
            'visibility:hidden',
            'white-space:pre',
            `font:${cs.font}`,
            `letter-spacing:${cs.letterSpacing}`,
            `padding-left:${cs.paddingLeft}`,
            `padding-right:${cs.paddingRight}`
        ].join(';');
        const raw = String(inp.value || '');
        probe.textContent = raw.length ? raw : '0';
        document.body.appendChild(probe);
        const w = Math.ceil(probe.getBoundingClientRect().width) + 8;
        document.body.removeChild(probe);
        inp.style.width = `${Math.max(minPx, raw.length ? w : minPx)}px`;
    }

    function wireBlankEditables(root) {
        if (!root) return;
        root.querySelectorAll('input.blank-editable').forEach((inp) => {
            const sync = () => {
                inp.classList.toggle('has-value', !!String(inp.value || '').trim());
                fitBlankInputWidth(inp);
            };
            sync();
            inp.addEventListener('input', sync);
        });
        root.querySelectorAll('.line-box.blank-editable').forEach((box) => {
            const sync = () => box.classList.toggle('has-value', !!String(box.textContent || '').trim());
            sync();
            box.addEventListener('input', sync);
        });
    }

    function freezeBlankInputsForExport(formEl) {
        const restorers = [];
        formEl.querySelectorAll('input.blank-editable').forEach((input) => {
            const span = document.createElement('span');
            const base = String(input.className || '')
                .replace(/\bblank-editable\b/g, '')
                .replace(/\bhas-value\b/g, '')
                .trim();
            span.className = `${base} blank-print`.trim();
            span.textContent = input.value || '';
            const parent = input.parentNode;
            parent.replaceChild(span, input);
            restorers.push(() => {
                parent.replaceChild(input, span);
            });
        });
        formEl.querySelectorAll('.line-box.blank-editable').forEach((box) => {
            const prevEditable = box.getAttribute('contenteditable');
            const prevClass = box.className;
            box.setAttribute('contenteditable', 'false');
            box.classList.remove('blank-editable');
            box.classList.add('blank-print');
            restorers.push(() => {
                if (prevEditable == null) box.removeAttribute('contenteditable');
                else box.setAttribute('contenteditable', prevEditable);
                box.className = prevClass;
            });
        });
        return () => restorers.forEach((fn) => fn());
    }

    function lineBoxHtml(text, minHeight) {
        const t = String(text || '').trim();
        const styleParts = [];
        if (minHeight) styleParts.push(`min-height:${minHeight}`);
        styleParts.push('white-space:pre-wrap');
        const styleAttr = ` style="${styleParts.join(';')}"`;
        const has = t ? ' has-value' : '';
        return `<div class="line-box blank-editable${has}"${styleAttr} contenteditable="true" data-placeholder="직접 입력">${escapeHtml(t)}</div>`;
    }

    function getLoggedInUser() {
        if (global.RegioAdminMenu && typeof global.RegioAdminMenu.getLoggedInUser === 'function') {
            return global.RegioAdminMenu.getLoggedInUser();
        }
        try {
            const raw = sessionStorage.getItem('userInfo') || localStorage.getItem('userInfo');
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    async function refreshLoggedInUser() {
        if (global.RegioAuth && typeof global.RegioAuth.refreshLoggedInUserFromServer === 'function') {
            return global.RegioAuth.refreshLoggedInUserFromServer();
        }
        const user = getLoggedInUser();
        if (!user || !user.id) return user;
        try {
            const response = await fetch(`/api/members/${encodeURIComponent(user.id)}`);
            if (!response.ok) return user;
            const row = await response.json();
            if (!row || !row.id) return user;
            const next = {
                ...user,
                church_name: row.church_name != null ? row.church_name : user.church_name,
                curia_name: row.curia_name != null ? row.curia_name : user.curia_name,
                comitia_name: row.comitia_name != null ? row.comitia_name : user.comitia_name,
                regia_name: row.regia_name != null ? row.regia_name : user.regia_name,
                senatus_name: row.senatus_name != null ? row.senatus_name : user.senatus_name,
                pr_name: row.pr_name != null ? row.pr_name : user.pr_name,
                position: row.position != null ? row.position : user.position
            };
            const raw = JSON.stringify(next);
            sessionStorage.setItem('userInfo', raw);
            localStorage.setItem('userInfo', raw);
            return next;
        } catch (e) {
            return user;
        }
    }

    function resolveSenatusName(...candidates) {
        for (const raw of candidates) {
            const s = String(raw == null ? '' : raw).trim();
            if (!s || s === '-' || /미등록/.test(s)) continue;
            if (/대구/.test(s)) return '대구';
            if (/광주/.test(s)) return '광주';
            if (/서울/.test(s)) return '서울';
            if (/^LA$/i.test(s) || /엘에이/.test(s)) return 'LA';
            if (/뉴욕|New\s*York/i.test(s)) return '뉴욕';
            if (/필라델피아|Philadelphia|릴라델피아/i.test(s)) return '필라델피아';
            if (/^세계$/.test(s)) return '세계';
            if (/토론토|토론트|Toronto/i.test(s)) return '토론토';
            if (/몬트리올|Montreal/i.test(s)) return '몬트리올';
            if (/브라질|Brazil/i.test(s)) return '브라질';
            if (/아르헨|Argentina|아르헨티나/i.test(s)) return '아르헨';
            if (/파리|Paris/i.test(s)) return '파리';
            if (/마드리드|Madrid/i.test(s)) return '마드리드';
            if (/바르셀로나|Barcelona/i.test(s)) return '바르셀로나';
            if (/빌바오|Bilbao/i.test(s)) return '빌바오';
            return s;
        }
        return '';
    }

    /** 출력 양식용: 대구·광주만 전용, 그 외(서울·해외 등)는 서울 양식. 집계 필터는 실제 senatus_name 유지. */
    function formTemplateSenatus(name) {
        const s = resolveSenatusName(name);
        if (s === '대구' || s === '광주') return s;
        return '서울';
    }

    function sumActivityTotals(totals, matcher, field) {
        const key = field || 'count';
        let nSum = 0;
        for (const row of totals || []) {
            const name = String(row.category_name || '');
            if (typeof matcher === 'function' ? matcher(name) : matcher.test(name)) {
                nSum += Number(row[key]) || 0;
            }
        }
        return nSum > 0 ? nSum : '';
    }

    function officerField(officers, role, field) {
        const found = (officers || []).find((o) => String(o.role || '') === role) || {};
        const v = found[field];
        return v == null || v === '' ? '' : String(v);
    }

    function normalizeReportDiocese(value) {
        const s = String(value == null ? '' : value).trim();
        if (!s) return '';
        if (/제주/.test(s)) return '제주';
        if (/마산/.test(s)) return '마산';
        if (/광주|전주/.test(s)) return '광주(전주)';
        if (/부산/.test(s)) return '부산';
        return s;
    }

    function resolveReportDiocese(opts) {
        const fromOpts = normalizeReportDiocese(opts?.dioceseName || opts?.reportDiocese || '');
        if (fromOpts) return fromOpts;
        try {
            const fromUrl = normalizeReportDiocese(
                new URLSearchParams(window.location.search).get('diocese')
            );
            if (fromUrl) return fromUrl;
        } catch (e) { /* ignore */ }
        try {
            return normalizeReportDiocese(sessionStorage.getItem('prReportDiocese') || '');
        } catch (e2) {
            return '';
        }
    }

    function isJejuReportContext(m) {
        return resolveFormReportDiocese(m) === '제주';
    }

    function isBusanReportContext(m) {
        return resolveFormReportDiocese(m) === '부산';
    }

    function isMasanReportContext(m) {
        return resolveFormReportDiocese(m) === '마산';
    }

    /** Pr 사업보고 양식 분기용 교구 — model·URL·sessionStorage 통합 */
    function resolveFormReportDiocese(m) {
        const fromModel = normalizeReportDiocese(m && m.report_diocese);
        if (fromModel) return fromModel;
        return normalizeReportDiocese(resolveReportDiocese({}));
    }

    function formatAppointedOn(raw) {
        if (raw == null || raw === '') return '';
        const s = String(raw).trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        return s;
    }


    const ACTIVITY_TOTAL_KEYS = [
        'count', 'catechism_guide', 'group_join', 'resolution', 'sacrament',
        'confirmation', 'baptism', 'first_communion', 'funeral_attendance',
        'funeral_mass', 'memorial_mass', 'conditional_baptism', 'conditional_communion',
        'membership'
    ];

    async function fetchActivityTotals(churchName, prName, startDate, endDate) {
        const qs = new URLSearchParams({
            start_date: startDate,
            end_date: endDate,
            church_name: churchName,
            pr_name: prName
        });
        const res = await fetch(`/api/activities/summary?${qs.toString()}`);
        if (!res.ok) return [];
        const data = await res.json();
        if (!Array.isArray(data)) return [];
        const map = new Map();
        data.forEach((rec) => {
            const name = String(rec.category_name || '').trim();
            if (!name) return;
            if (!map.has(name)) {
                const row = { category_name: name };
                ACTIVITY_TOTAL_KEYS.forEach((k) => { row[k] = 0; });
                map.set(name, row);
            }
            const row = map.get(name);
            ACTIVITY_TOTAL_KEYS.forEach((k) => {
                row[k] += Number(rec[k]) || 0;
            });
        });
        return Array.from(map.values());
    }

    /**
     * 대구 Pr 월례 — DB 종목·세목명(유사 포함)으로 횟수(count)·인원 결과필드 집계
     * 예: "유아 세례"↔유아세례, "혼인 장애"↔혼인장애, 복음선교-입교권면 등
     */
    function computeDaeguActivityCounts(totals) {
        const one = (matcher, field) => sumActivityTotals(totals, matcher, field);

        // 1. 이웃에 가톨릭 알리기 — 입교·가두·방문선교·신규 대구형 세목 (교우·환자·호구 방문 제외)
        const neighbor = one((n) =>
            /이웃에\s*가톨릭|신앙전하기|교리반수강|통신교리수강|교리반중단자|주택방문|선교책자|접촉활동/.test(n)
            || ((/외인\s*입교|입교\s*권면|개종권면|가두선교|방문선교|교리\s*중단자/.test(n)
                || (/복음선교/.test(n) && /외인|입교|개종|가두|방문선교|중단/.test(n)))
                && !/예비|교리반|통신교리/.test(n)));

        // 교리반인도 결과 — 신규 종목 포함
        const catechismLead = one((n) =>
            /교리반\s*인도|교리반인도|교리반수강|통신교리수강|교리반중단자|이웃에\s*가톨릭|신앙전하기|가두선교|주택방문|선교책자|접촉활동/.test(n),
            'catechism_guide')
            || one((n) => /교리반\s*인도|교리반인도|교리반\s*봉사|교리반협조/.test(n), 'catechism_guide')
            || one((n) => /교리반\s*인도|교리반인도/.test(n));

        // 2. 예비신자와 함께 — 예비신자·통신교리·교리반 돌봄/인도
        const catechumen = one((n) =>
            /예비신자와\s*함께|교리반에\s*동반|미사동반|본당행사\s*동반|본당생활\s*안내|신앙생활\s*지도|출석\s*점검|예비자행정|교리반간식|예비신자의\s*아기|예비신자|예비자|통신교리|교리반\s*인도|교리반인도|교리반\s*봉사|교리반협조|교리반\s*협조/.test(n)
            && !/첫\s*영성체|첫영성체|교리반수강|통신교리수강|교리반중단자|이웃에\s*가톨릭/.test(n));
        const baptized = one((n) =>
            /예비신자와\s*함께|예비신자|예비자|통신교리|교리반/.test(n) && !/유아|교리반수강|통신교리수강|교리반중단자|이웃에\s*가톨릭/.test(n),
            'baptism')
            || one((n) => /세례자|영세자/.test(n) && !/유아/.test(n));

        // 3. 가정·교우 돌봄 (성사권유·첫영성체 세목은 4·6으로)
        const familyCare = one((n) =>
            /가정을\s*위한\s*활동|가족일상기도|외짝교우|가족불우|출가자녀|2대3대|신심단체|다문화가정|신영세자방문|신영세자영적|가족간축복|가정성화/.test(n)
            || /신영세자|전입교우|교우\s*가정|청소년\s*돌봄|군인선원/.test(n)
            || (/교우돌봄|교우\s*돌봄/.test(n)
                && !/냉담|회두|판공|견진|유아|혼인|첫\s*영성체|첫영성체|성사/.test(n)));
        const groupJoin = one((n) =>
            /신영세자|전입교우|교우\s*가정|단체\s*가입|단체가입|신심단체|가정을\s*위한\s*활동/.test(n),
            'group_join')
            || one((n) => /단체\s*가입|단체가입|신심단체/.test(n));

        // 4. 성사권유·혼인장애
        const sacramentInvite = one((n) =>
            /성사권유\s*및\s*혼인|쉬는\s*교우|성사표|견진성사|유아세례\s*권유|유아세례\s*시|유아세례\s*행정|혼인장애|냉담자\s*접촉|성사권유|성사\s*권면|조당|판공|견진|유아\s*세례|냉담/.test(n)
            && !/가정을\s*위한\s*활동|이웃에\s*가톨릭|예비신자와\s*함께/.test(n));
        const conversion = one((n) =>
            /성사권유\s*및\s*혼인|쉬는\s*교우|냉담자\s*접촉|냉담교우회두|회두/.test(n), 'meeting_head')
            || one((n) => /회두/.test(n));
        const confession = one((n) =>
            /성사권유\s*및\s*혼인|판공|고해|성사표/.test(n), 'sacrament')
            || one((n) => /판공|고해/.test(n));
        const confirmation = one((n) =>
            /성사권유\s*및\s*혼인|견진/.test(n), 'confirmation')
            || one((n) => /견진/.test(n));
        const infantBaptism = one((n) =>
            /성사권유\s*및\s*혼인|유아\s*세례|유아세례/.test(n), 'baptism')
            || one((n) => /유아\s*세례|유아세례/.test(n));
        const marriageFix = one((n) =>
            /성사권유\s*및\s*혼인|혼인\s*장애|혼인장애|조당/.test(n), 'resolution')
            || one((n) => /혼인\s*장애|혼인장애|조당/.test(n));

        // 5. 어려움 나눔 — 상가·환자·병원·복지·재해/사고·신규 대구형 세목
        const neighborShare = one((n) =>
            /어려움을\s*겪는\s*이웃|상가|위령|장례|장지|추모미사|병자|환자|봉성체|대세|보례|병원|복지|재해|사고\s*피해자|재소자|교통사고|어려운자/.test(n)
            && !/가정성화|가정을\s*위한\s*활동|다문화가정|성사권유\s*및\s*혼인/.test(n));
        const funeralVisit = one((n) =>
            /어려움을\s*겪는\s*이웃|상가/.test(n), 'funeral_attendance')
            || one((n) => /상가/.test(n));
        const memorialPrayer = one((n) =>
            /어려움을\s*겪는\s*이웃|위령기도/.test(n), 'year_count')
            || one((n) => /위령기도|연도|위령미사|보미사/.test(n), 'memorial_mass')
            || one((n) => /위령기도|연도|위령미사|보미사/.test(n));
        const funeralMass = one((n) =>
            /어려움을\s*겪는\s*이웃|장례미사|고별식/.test(n), 'funeral_mass')
            || one((n) => /장례미사|고별식/.test(n));
        const burialEscort = one((n) =>
            /어려움을\s*겪는\s*이웃|장지|장례수행|장지수행/.test(n), 'inout_count')
            || one((n) => /장지|장례수행|장지수행/.test(n));
        const anointing = one((n) =>
            /어려움을\s*겪는\s*이웃|병자성사/.test(n), 'sacrament')
            || one((n) => /병자성사/.test(n));
        const sickCommunion = one((n) =>
            /어려움을\s*겪는\s*이웃|봉성체/.test(n), 'first_communion')
            || one((n) => /봉성체/.test(n), 'conditional_communion')
            || one((n) => /봉성체/.test(n));
        const conditionalBaptism = one((n) =>
            /어려움을\s*겪는\s*이웃|대세/.test(n), 'conditional_baptism')
            || one((n) => /대세/.test(n));
        const baptismComplete = one((n) =>
            /어려움을\s*겪는\s*이웃|보례/.test(n), 'conditional_communion')
            || one((n) => /보례/.test(n));
        const hospital = one((n) =>
            /어려움을\s*겪는\s*이웃/.test(n), 'establishment')
            || one((n) => /병원|복지시설|복지\s*봉사|복지시설/.test(n) && !/가정성화/.test(n));
        const shareOther = one((n) =>
            /어려움을\s*겪는\s*이웃/.test(n), 'group_join')
            || one((n) => /나눔|돌봄-기타|재해|사고\s*피해자|재소자|교통사고/.test(n) && !/병원|복지|상가/.test(n));

        // 6. 본당 협조 (+호구조사·본당협조활동) — 소공동체·구역·반은 8번
        const parishOps = one((n) =>
            (/본당협조활동|본당|주일학교|전례|사도직|호구|교세조사|청소|정비|보수공사|성시간|차량|교통정리|피정참가|피정\s*봉사|행사\s*준비|미사안내|제구|사무협조|본당교회협조|교육·피정|교육▪피정/.test(n)
                || /특별활동-호구조사|호구조사/.test(n))
            && !/첫\s*영성체|첫영성체|소공동체|구역|반모임|반장|직장공동체|교통사고|어려움을\s*겪는/.test(n));
        const firstCommunionLead = one((n) =>
            /본당협조활동.*첫영성체|첫\s*영성체|첫영성체/.test(n), 'catechism_guide')
            || one((n) => /첫\s*영성체|첫영성체/.test(n));
        const firstCommunionBaptism = one((n) =>
            /본당협조활동.*첫영성체|첫\s*영성체|첫영성체/.test(n), 'baptism')
            || one((n) => /첫\s*영성체|첫영성체/.test(n), 'first_communion');

        // 7. 레지오 발전
        const legionGrow = one((n) => /레지오의\s*발전을\s*위한\s*활동|행동단원\s*모집|협조단원\s*모집|Pr설립|Pr\.\s*설립|레지오활동|입단권면|소년\s*레지오|소년\s*Pr|유년|평의회\s*순방|평의회\s*참석|교본공부|활동소홀/.test(n));
        const activeRecruit = one((n) => /레지오의\s*발전을\s*위한\s*활동/.test(n), 'membership')
            || one((n) => /행동단원\s*모집|행동\s*단원\s*모집|입단권면/.test(n), 'membership')
            || one((n) => /행동단원\s*모집|행동\s*단원\s*모집|입단권면/.test(n));
        const auxRecruit = one((n) => /레지오의\s*발전을\s*위한\s*활동/.test(n), 'group_join')
            || one((n) => /협조단원\s*모집|협조단원\s*돌봄/.test(n), 'membership')
            || one((n) => /협조단원\s*모집|협조단원/.test(n));

        // 8. 소공동체
        const smallCommunity = one((n) => /소공동체와\s*함께하는\s*활동|소공동체|구역|반모임|반장|직장공동체/.test(n));

        // 9. 자연보호·생명존중·지구와함께
        const nature = one((n) =>
            /자연보호\s*및\s*생명존중|자연보호|생태|환경|생명존중|낙태|장기기증|헌혈|지구와함께|아껴쓰기|고쳐쓰기|다시쓰기|거절하기|재고하기|재생하기/.test(n));

        // 10. 상급평의회 지시·기도생활
        const higherCouncil = one((n) =>
            /상급평의회가\s*지시한\s*활동|기도생활|성경통독|성경\s*통독|성경읽기|성경쓰기|성경필사|복음묵상|빛잡지|성모님의\s*군단|평일미사|상급|묵주기도|성체조배|십자가의\s*길|소성무일도|주회\s*전후\s*미사/.test(n));
        const bibleRead = one((n) => /상급평의회가\s*지시한\s*활동/.test(n), 'year_count')
            || one((n) => /성경통독|성경\s*통독|성경읽기/.test(n));
        const bibleWrite = one((n) => /상급평의회가\s*지시한\s*활동/.test(n), 'catechism_guide')
            || one((n) => /성경필사|성경\s*쓰기|성경쓰기|필사/.test(n));
        const rosary = one((n) => /상급평의회가\s*지시한\s*활동/.test(n), 'establishment')
            || one((n) => /묵주기도|묵주\s*기도/.test(n));

        // 11. 기타 (병원·복지·재해·호구는 위 칸으로)
        const otherAct = one((n) =>
            /기타\s*활동|기타활동|기타사목/.test(n)
            || (/특별활동/.test(n) && !/병원|복지|재해|사고|호구/.test(n)));

        return {
            neighbor, catechismLead, catechumen, baptized,
            familyCare, groupJoin,
            sacramentInvite, conversion, confession, confirmation, infantBaptism, marriageFix,
            neighborShare, funeralVisit, memorialPrayer, funeralMass, burialEscort,
            anointing, sickCommunion, conditionalBaptism, baptismComplete, hospital, shareOther,
            parishOps, firstCommunionLead, firstCommunionBaptism,
            legionGrow, activeRecruit, auxRecruit,
            smallCommunity, nature, higherCouncil, bibleRead, bibleWrite, rosary, otherAct
        };
    }

    function computeGwangjuActivityCounts(totals) {
        return {
            evangelism: sumActivityTotals(totals, (n) =>
                /복음선교|입교권면|외인|가두선교|방문선교|교리반|통신교리|예비|타인인도/.test(n) && !/교우|성사권유|상가|병자/.test(n)),
            catechismLead: sumActivityTotals(totals, (n) => /교리반\s*인도|교리반인도/.test(n))
                || sumActivityTotals(totals, (n) => /교리반/.test(n), 'catechism_guide'),
            baptized: sumActivityTotals(totals, (n) => /예비신자|예비자|세례|영세/.test(n), 'baptism')
                || sumActivityTotals(totals, (n) => /세례자|영세/.test(n)),
            selfIntro: sumActivityTotals(totals, (n) => /자기소개서|소개서/.test(n)),

            believerCare: sumActivityTotals(totals, (n) =>
                /교우\s*돌봄|교우방문|냉담|성사권유|혼인장애|회두|판공|견진|유아세례|상가|병자|영세자\s*방문|첫\s*영성체|청소년\s*돌봄/.test(n)
                && !/비신자|외인\s*병|외인\s*상가/.test(n)),
            groupJoin: sumActivityTotals(totals, (n) => /단체\s*가입|단체가입/.test(n), 'group_join')
                || sumActivityTotals(totals, (n) => /단체\s*가입|단체가입/.test(n)),
            conversion: sumActivityTotals(totals, (n) => /회두|개종/.test(n)),
            marriageFix: sumActivityTotals(totals, (n) => /혼인장애/.test(n), 'resolution')
                || sumActivityTotals(totals, (n) => /혼인장애/.test(n)),
            confession: sumActivityTotals(totals, (n) => /판공|고해/.test(n), 'sacrament')
                || sumActivityTotals(totals, (n) => /판공|고해/.test(n)),
            confirmation: sumActivityTotals(totals, (n) => /견진/.test(n), 'confirmation')
                || sumActivityTotals(totals, (n) => /견진/.test(n)),
            infantBaptism: sumActivityTotals(totals, (n) => /유아세례/.test(n), 'baptism')
                || sumActivityTotals(totals, (n) => /유아세례/.test(n)),
            firstCommunion: sumActivityTotals(totals, (n) => /첫\s*영성체|첫영성체/.test(n), 'first_communion')
                || sumActivityTotals(totals, (n) => /첫\s*영성체|첫영성체/.test(n)),
            yeondo: sumActivityTotals(totals, (n) => /연도|위령기도/.test(n)),
            funeralMass: sumActivityTotals(totals, (n) => /장례미사|고별식/.test(n), 'funeral_mass')
                || sumActivityTotals(totals, (n) => /장례미사|고별식/.test(n)),
            burialEscort: sumActivityTotals(totals, (n) => /장지수행|장지\s*수행/.test(n))
                || sumActivityTotals(totals, (n) => /장지/.test(n) && !/장례미사|고별식|상가|연도/.test(n)),
            funeralOther: sumActivityTotals(totals, (n) => /상가|장례수행/.test(n) && !/장지/.test(n))
                || sumActivityTotals(totals, (n) => /상가/.test(n), 'funeral_attendance'),

            neighborCare: sumActivityTotals(totals, (n) =>
                /이웃\s*돌봄|비신자|병원|복지|재난|사고|다문화|죽을\s*위험|대세자\s*돌봄/.test(n)
                || (/병자|상가/.test(n) && /외인|비신자/.test(n))),
            conditionalBaptism: sumActivityTotals(totals, (n) => /대세/.test(n), 'conditional_baptism')
                || sumActivityTotals(totals, (n) => /대세/.test(n)),
            baptismComplete: sumActivityTotals(totals, (n) => /보례/.test(n)),

            expansion: sumActivityTotals(totals, (n) =>
                /레지오의\s*발전을\s*위한\s*활동|행동단원\s*모집|협조단원\s*모집|유년|확장|입단권면|회원모집|Pr설립|Pr\.\s*설립|소년\s*Pr|교본공부|평의회\s*업무|평의회업무/.test(n)),
            activeRecruit: sumActivityTotals(totals, (n) => /레지오의\s*발전을\s*위한\s*활동/.test(n), 'membership')
                || sumActivityTotals(totals, (n) => /행동단원\s*모집|행동\s*단원\s*모집|입단권면/.test(n), 'membership')
                || sumActivityTotals(totals, (n) => /행동단원\s*모집|행동\s*단원\s*모집|입단권면/.test(n)),
            auxRecruit: sumActivityTotals(totals, (n) => /레지오의\s*발전을\s*위한\s*활동/.test(n), 'group_join')
                || sumActivityTotals(totals, (n) => /협조단원\s*모집/.test(n), 'membership')
                || sumActivityTotals(totals, (n) => /협조단원\s*모집/.test(n)),
            foundedPr: sumActivityTotals(totals, (n) => /Pr설립|Pr\.\s*설립|쁘레시디움\s*설립/.test(n), 'establishment')
                || sumActivityTotals(totals, (n) => /Pr설립|Pr\.\s*설립|쁘레시디움\s*설립/.test(n)),

            parishOps: sumActivityTotals(totals, (n) =>
                /본당|주일학교|전례|호구조사|청소|차량|교통|소공동체|교육.*피정|피정|제단체|사무협조|업무협조|성지|교구.*시설/.test(n)
                && !/첫\s*영성체|평의회업무|기타활동/.test(n)),
            parishVisit: sumActivityTotals(totals, (n) => /호구조사|면담|방문조사/.test(n)),

            otherAct: sumActivityTotals(totals, (n) =>
                /간행물|배포|생태|환경|자연보호|생명존중|가정성화|기타활동|기타사목|차량봉사및교통|기타.*차량/.test(n)
                && !/지구와함께|거절하기|아껴쓰기|고쳐쓰기|재고하기|다시쓰기|재생하기/.test(n)),

            earthRefuse: sumActivityTotals(totals, (n) => /거절하기|지구와함께-거절/.test(n)),
            earthSave: sumActivityTotals(totals, (n) => /아껴쓰기|지구와함께-아껴/.test(n)),
            earthReuse: sumActivityTotals(totals, (n) => /다시쓰기|지구와함께-다시/.test(n)),
            earthRepair: sumActivityTotals(totals, (n) => /고쳐쓰기|지구와함께-고쳐/.test(n)),
            earthRethink: sumActivityTotals(totals, (n) => /재고하기|지구와함께-재고/.test(n)),
            earthRecycle: sumActivityTotals(totals, (n) => /재생하기|지구와함께-재생/.test(n)),
            earthCount: sumActivityTotals(totals, (n) =>
                /지구와함께|거절하기|아껴쓰기|고쳐쓰기|재고하기|다시쓰기|재생하기/.test(n)),

            weekdayMass: sumActivityTotals(totals, (n) => /평일미사/.test(n)),
            rosary: sumActivityTotals(totals, (n) => /상급평의회가\s*지시한\s*활동/.test(n), 'establishment')
                || sumActivityTotals(totals, (n) => /묵주기도|묵주\s*기도/.test(n)),
            stations: sumActivityTotals(totals, (n) => /십자가의\s*길|십자가의길/.test(n)),
            bible: sumActivityTotals(totals, (n) => /성경|봉독|필사|통독/.test(n)),
            littleOffice: sumActivityTotals(totals, (n) => /소성무일도|성무일도/.test(n)),
            eucharistAdoration: sumActivityTotals(totals, (n) => /성체조배/.test(n)),
            familyPray: sumActivityTotals(totals, (n) => /가족이\s*함께\s*기도|가족기도|가정\s*기도/.test(n)),
            legionDiary: sumActivityTotals(totals, (n) => /성모님의\s*군단|군단일기|빛\s*잡지|빛잡지/.test(n)),
            spiritualOther: sumActivityTotals(totals, (n) => /프랭크|더프|시복|지향기도/.test(n))
        };
    }

    /** 부산 교구 Pr 사업보고 — 활동 세목 집계 (11.활동상황) */
    function computeBusanActivityCounts(totals) {
        const one = (matcher, field) => sumActivityTotals(totals, matcher, field);

        const nonbelieverInvite = one((n) => /비신자\s*입교|외인\s*입교|입교\s*권면/.test(n) && !/중단|재권면/.test(n));
        const catechismRestart = one((n) => /교리\s*중단|재권면|중단자/.test(n));
        const visitStreetMission = one((n) => /방문\s*선교|방문선교|가두\s*선교|가두선교|접촉활동|접촉\s*활동/.test(n));
        const catechumenCare = one((n) => /예비자\s*돌보|예비신자\s*돌보|교리반\s*인도|타인\s*인도|타인인도/.test(n) && !/통신/.test(n))
            || one((n) => /교리반/.test(n), 'catechism_guide');
        const correspondence = one((n) => /통신\s*교리|통신교리/.test(n));
        const catechismHelp = one((n) => /교리반\s*봉사|교리반\s*협조|교리\s*봉사/.test(n));
        const catechismLead = one((n) => /교리반\s*인도|교리반인도/.test(n), 'catechism_guide')
            || one((n) => /교리반\s*인도|교리반인도/.test(n));
        const baptized = one((n) => /예비신자|예비자|세례|영세/.test(n), 'baptism')
            || one((n) => /세례자|영세/.test(n));

        const homeVisit = one((n) => /교우\s*방문|교우방문|교우\s*가정|가정\s*방문/.test(n));
        const coldCare = one((n) => /쉬는\s*교우|냉담/.test(n));
        const marriageGuide = one((n) => /혼인\s*장애|혼인장애|조당/.test(n));
        const sacramentInvite = one((n) => /판공|견진|성사\s*권면|성사권유|회두/.test(n));
        const believerSick = one((n) => /교우\s*환자|교우환자|병자/.test(n) && !/외인|비신자/.test(n));
        const believerFuneral = one((n) => /교우\s*상가|교우상가/.test(n))
            || one((n) => /상가/.test(n) && !/외인|비신자/.test(n), 'funeral_attendance');
        const infantBaptismInvite = one((n) => /유아\s*세례|유아세례/.test(n) && !/세례\s*자/.test(n));
        const youthCare = one((n) => /청소년\s*돌봄|청소년돌봄/.test(n));
        const groupJoin = one((n) => /단체\s*가입|단체가입/.test(n), 'group_join')
            || one((n) => /단체\s*가입|단체가입/.test(n));
        const conversion = one((n) => /회두|개종/.test(n));
        const marriageFix = one((n) => /혼인\s*장애|혼인장애|조당/.test(n), 'resolution')
            || one((n) => /혼인\s*장애|혼인장애|조당/.test(n));
        const confession = one((n) => /판공|고해/.test(n), 'sacrament')
            || one((n) => /판공|고해/.test(n));
        const confirmation = one((n) => /견진/.test(n), 'confirmation')
            || one((n) => /견진/.test(n));
        const sickCommunion = one((n) => /봉성체|병자\s*영성체|병자영성체/.test(n), 'first_communion')
            || one((n) => /봉성체|병자\s*영성체|병자영성체/.test(n), 'conditional_communion')
            || one((n) => /봉성체|병자\s*영성체|병자영성체/.test(n));
        const yeondo = one((n) => /연도|위령기도|위령미사|보미사/.test(n), 'memorial_mass')
            || one((n) => /연도|위령기도|위령미사|보미사/.test(n));
        const funeralMass = one((n) => /장례미사|고별식/.test(n), 'funeral_mass')
            || one((n) => /장례미사|고별식/.test(n));
        const burialEscort = one((n) => /장지수행|장지\s*수행/.test(n))
            || one((n) => /장지/.test(n) && !/장례미사|고별식|상가|연도/.test(n));
        const infantBaptism = one((n) => /유아\s*세례|유아세례/.test(n), 'baptism')
            || one((n) => /유아\s*세례|유아세례/.test(n));
        const firstCommunion = one((n) => /첫\s*영성체|첫영성체/.test(n), 'first_communion')
            || one((n) => /첫\s*영성체|첫영성체/.test(n));

        const nonbelieverSick = one((n) => /비신자\s*환자|외인\s*환자|비신자환자|외인환자/.test(n));
        const nonbelieverFuneral = one((n) => /비신자\s*상가|외인\s*상가/.test(n));
        const disaster = one((n) => /이재|재해|재난|사고\s*피해|어려움/.test(n));
        const multicultural = one((n) => /다문화/.test(n));
        const hospitalWelfare = one((n) => /병원|복지시설|복지\s*봉사/.test(n) && !/가정성화/.test(n));
        const dangerBaptismCare = one((n) => /죽을\s*위험|대세자\s*돌봄/.test(n));
        const conditionalBaptism = one((n) => /대세|죽을\s*위험/.test(n), 'conditional_baptism')
            || one((n) => /대세/.test(n));
        const baptismComplete = one((n) => /보례|세례\s*보충/.test(n), 'conditional_communion')
            || one((n) => /보례|세례\s*보충/.test(n));

        const juniorLegion = one((n) => /소년\s*쁘레시디움|소년\s*Pr|소년\s*레지오|유년/.test(n));
        const activeRecruitCare = one((n) => /레지오의\s*발전을\s*위한\s*활동/.test(n), 'membership')
            || one((n) => /행동\s*단원\s*모집|행동단원\s*모집|입단권면/.test(n), 'membership')
            || one((n) => /행동\s*단원\s*모집|행동단원\s*모집|입단권면/.test(n));
        const auxRecruitCare = one((n) => /레지오의\s*발전을\s*위한\s*활동/.test(n), 'group_join')
            || one((n) => /협조\s*단원\s*모집|협조단원\s*모집/.test(n), 'membership')
            || one((n) => /협조\s*단원\s*모집|협조단원\s*모집/.test(n));
        const prEstablishInvite = one((n) => /Pr\s*설립|Pr\.\s*설립|쁘레시디움\s*설립|설립\s*권면/.test(n));
        const handbookStudy = one((n) => /교본\s*공부|교본공부/.test(n));
        const councilCoop = one((n) => /평의회\s*업무|평의회업무/.test(n));
        const juniorJoin = one((n) => /소년\s*쁘레시디움|소년\s*Pr|소년\s*레지오|유년/.test(n), 'membership')
            || one((n) => /소년/.test(n), 'membership');
        const activeJoin = activeRecruitCare;
        const auxJoin = auxRecruitCare;
        const foundedPr = one((n) => /Pr\s*설립|Pr\.\s*설립|쁘레시디움\s*설립/.test(n), 'establishment')
            || one((n) => /Pr\s*설립|Pr\.\s*설립|쁘레시디움\s*설립/.test(n));

        const smallCommunity = one((n) => /소공동체/.test(n));
        const businessCoop = one((n) => /업무\s*협조|업무협조|사무협조/.test(n));
        const sundaySenior = one((n) => /주일학교|노인대학/.test(n));
        const eduRetreat = one((n) => /교육.*피정|피정|연수/.test(n) && /본당|교회|협조/.test(n))
            || one((n) => /교육및피정|교육\s*및\s*피정/.test(n));
        const liturgy = one((n) => /전례\s*봉사|전례\s*협조|미사\s*안내|미사안내|성가/.test(n));
        const parishEvent = one((n) => /본당\s*행사|제\s*단체|제단체|행사\s*준비|행사\s*협조/.test(n));
        const shrineFacility = one((n) => /성지|교구.*시설/.test(n));

        const publication = one((n) => /출판물|간행물|보급|배포/.test(n) && !/선교책자|선교지/.test(n));
        const vehicle = one((n) => /차량\s*봉사|차량봉사/.test(n));
        const nature = one((n) => /자연\s*보호|자연보호|생태|환경/.test(n) && !/지구/.test(n));

        const rosary = one((n) => /묵주기도|묵주\s*기도|상급평의회가\s*지시한\s*활동/.test(n), 'establishment')
            || one((n) => /묵주기도|묵주\s*기도/.test(n));
        const weekdayMass = one((n) => /평일\s*미사|평일미사/.test(n));
        const stations = one((n) => /십자가의\s*길|십자가의길/.test(n));
        const bibleRead = one((n) => /성경\s*읽기|성경읽기|봉독|통독/.test(n));
        const bibleWrite = one((n) => /성경\s*쓰기|성경쓰기|필사/.test(n));
        const littleOffice = one((n) => /소성무일도|성무일도/.test(n));
        const eucharistAdoration = one((n) => /성체\s*조배|성체조배/.test(n));
        const familyPray = one((n) => /가족\s*기도|가족기도|가정\s*기도/.test(n));
        const legionRead = one((n) => /성모님의\s*군단|군단일기|빛\s*잡지|빛잡지/.test(n));

        const earthRefuse = one((n) => /거절하기|지구와함께-거절/.test(n));
        const earthSave = one((n) => /아껴쓰기|지구와함께-아껴/.test(n));
        const earthReuse = one((n) => /다시쓰기|지구와함께-다시/.test(n));
        const earthRepair = one((n) => /고쳐쓰기|지구와함께-고쳐/.test(n));
        const earthRethink = one((n) => /재고하기|지구와함께-재고/.test(n));
        const earthRecycle = one((n) => /재생하기|지구와함께-재생/.test(n));

        return {
            nonbelieverInvite, catechismRestart, visitStreetMission, catechumenCare,
            correspondence, catechismHelp, catechismLead, baptized,
            homeVisit, coldCare, marriageGuide, sacramentInvite, believerSick,
            believerFuneral, infantBaptismInvite, youthCare,
            groupJoin, conversion, marriageFix, confession, confirmation,
            sickCommunion, yeondo, funeralMass, burialEscort, infantBaptism, firstCommunion,
            nonbelieverSick, nonbelieverFuneral, disaster, multicultural,
            hospitalWelfare, dangerBaptismCare, conditionalBaptism, baptismComplete,
            juniorLegion, activeRecruitCare, auxRecruitCare, prEstablishInvite,
            handbookStudy, councilCoop, juniorJoin, activeJoin, auxJoin, foundedPr,
            smallCommunity, businessCoop, sundaySenior, eduRetreat, liturgy,
            parishEvent, shrineFacility,
            publication, vehicle, nature,
            rosary, weekdayMass, stations, bibleRead, bibleWrite, littleOffice,
            eucharistAdoration, familyPray, legionRead,
            earthRefuse, earthSave, earthReuse, earthRepair, earthRethink, earthRecycle
        };
    }

    /** 서울 무염시태 세나뚜스 사업보고 활동 사항 세목 집계 */
    function computeSeoulActivityCounts(totals) {
        const one = (matcher, field) => sumActivityTotals(totals, matcher, field);

        const nonbelieverInvite = one((n) => /외인\s*입교|입교\s*권면|외인권면/.test(n) && !/중단|재권면/.test(n));
        const catechismRestart = one((n) => /교리\s*중단|재권면|중단자/.test(n));
        const convertInvite = one((n) => /개종\s*권면|개종권면|개종/.test(n) && !/회두/.test(n));
        const streetMission = one((n) => /가두\s*선교|가두선교/.test(n));
        const visitMission = one((n) => /방문\s*선교|방문선교/.test(n));
        const evangelismCount = sumParenCounts(
            nonbelieverInvite, catechismRestart, convertInvite, streetMission, visitMission
        ) || one((n) => /입교\s*권면|복음선교|가두|외인/.test(n) && !/예비|교리반\s*인도/.test(n));

        const catechismCare = one((n) => /교리반\s*인도|예비신자\s*돌봄|예비자\s*돌봄/.test(n) && !/타인\s*인도|타인인도/.test(n))
            || one((n) => /교리반/.test(n), 'catechism_guide');
        const otherIntroducedCatechumen = one((n) => /타인\s*인도\s*예비|타인인도\s*예비|타인\s*인도\s*예비자|타인인도예비자/.test(n));
        const correspondence = one((n) => /통신교리/.test(n));
        const catechismHelp = one((n) => /교리반\s*봉사|교리반\s*협조|교리\s*봉사/.test(n));
        const catechumenCount = sumParenCounts(catechismCare, otherIntroducedCatechumen, correspondence, catechismHelp)
            || one((n) => /예비신자|예비자|통신교리|교리반|타인\s*인도/.test(n));

        const newBaptized = one((n) => /새\s*영세|영세자\s*돌봄|새영세자/.test(n));
        const transferIn = one((n) => /전입\s*교우|전입교우/.test(n));
        const coldCare = one((n) => /냉담/.test(n));
        const marriageGuide = one((n) => /조당|혼인장애/.test(n));
        const sacramentInvite = one((n) => /성사\s*권면|성사권유|판공|견진|회두/.test(n));
        const infantBaptism = one((n) => /유아\s*세례|유아세례/.test(n));
        const firstCommunion = one((n) => /첫\s*영성체|첫영성체/.test(n));
        const homeVisit = one((n) => /교우\s*가정|가정\s*방문|교우방문/.test(n));
        const massWayBlessInvite = one((n) =>
            /미사.*참례\s*권유|십자가의\s*길.*권유|성체강복.*권유|미사\/?\s*길\/?\s*성체강복|미사.*길.*성체강복/.test(n)
            || (/참례\s*권유/.test(n) && /미사|십자가|성체강복/.test(n))
        );
        const retreatLectureInvite = one((n) =>
            /피정.*참석\s*권유|특강.*참석\s*권유|피정\/?\s*특강|피정.*특강.*권유/.test(n)
            || (/참석\s*권유/.test(n) && /피정|특강/.test(n))
        );
        const believerCount = sumParenCounts(
            newBaptized, transferIn, coldCare, marriageGuide,
            sacramentInvite, infantBaptism, firstCommunion, homeVisit,
            massWayBlessInvite, retreatLectureInvite
        ) || one((n) => /교우\s*돌봄|교우방문|냉담|성사|혼인|영세자|전입|첫\s*영성체|유아세례|피정|특강|성체강복/.test(n));

        const believerSick = one((n) => /교우\s*환자|교우환자|병자/.test(n) && !/외인|비신자/.test(n));
        const nonbelieverSick = one((n) => /외인\s*환자|비신자\s*환자|외인환자/.test(n));
        const multicultural = one((n) => /다문화/.test(n));
        const nonbelieverFuneral = one((n) => /외인\s*상가|비신자\s*상가/.test(n));
        const believerFuneral = one((n) => /교우\s*상가|교우상가/.test(n))
            || one((n) => /상가/.test(n) && !/외인|비신자/.test(n), 'funeral_attendance');
        const yeondo = one((n) => /위령기도|연도/.test(n));
        const funeralMass = one((n) => /장례미사/.test(n), 'funeral_mass') || one((n) => /장례미사/.test(n));
        const memorialMass = one((n) => /추모미사|위령미사|보미사/.test(n), 'memorial_mass')
            || one((n) => /추모미사|위령미사|보미사/.test(n));
        const coffin = one((n) => /입출관|입관|출관/.test(n));
        const burial = one((n) => /장지수행|장지|장례수행/.test(n));
        const apostleRite = one((n) => /사도예절/.test(n));
        const hardshipCount = sumParenCounts(
            believerSick, nonbelieverSick, multicultural,
            nonbelieverFuneral, believerFuneral, yeondo,
            funeralMass, memorialMass, coffin, burial, apostleRite
        ) || one((n) => /상가|위령|장례|환자|병자|장지|다문화|연도|사도예절/.test(n));

        const activeRecruit = one((n) => /레지오의\s*발전을\s*위한\s*활동/.test(n), 'membership')
            || one((n) => /행동단원\s*모집|행동\s*단원\s*모집|입단권면/.test(n), 'membership')
            || one((n) => /행동단원\s*모집|행동\s*단원\s*모집|입단권면/.test(n));
        const auxRecruit = one((n) => /레지오의\s*발전을\s*위한\s*활동/.test(n), 'group_join')
            || one((n) => /협조단원\s*모집|협조단원\s*돌봄/.test(n), 'membership')
            || one((n) => /협조단원/.test(n));
        const juniorLegion = one((n) => /소년\s*레지오|소년\s*Pr|유년|소년단/.test(n));
        const expansionCount = sumParenCounts(activeRecruit, auxRecruit, juniorLegion)
            || one((n) => /레지오의\s*발전을\s*위한\s*활동|행동단원|협조단원|레지오\s*확장|회원모집|Pr설립|Pr\.\s*설립/.test(n));

        const disaster = one((n) => /재해|사고\s*피해자|재난/.test(n));
        const welfare = one((n) => /복지시설|복지\s*봉사/.test(n));
        const hospital = one((n) => /병원\s*방문|병원방문|병원\s*활동/.test(n));
        const specialCount = sumParenCounts(disaster, welfare, hospital)
            || one((n) => /특별\s*활동|재해|복지|병원/.test(n));

        const eventHelp = one((n) => /행사\s*준비|행사\s*협조|본당\s*행사/.test(n));
        const sundaySchool = one((n) => /주일학교/.test(n));
        const cleaning = one((n) => /청소|미화/.test(n));
        const massGuide = one((n) => /미사\s*안내|전례\s*협조|미사안내/.test(n));
        const householdSurvey = one((n) => /호구조사|호별방문|교세\s*조사|호구/.test(n));
        const parishOther = one((n) => /기타\s*본당|본당\s*협조/.test(n) && !/행사|주일|청소|미사|호구|호별|교세/.test(n));
        const parishCount = sumParenCounts(eventHelp, sundaySchool, cleaning, massGuide, householdSurvey, parishOther)
            || one((n) => /본당|주일학교|전례|청소|미사안내|호구|호별|교세/.test(n) && !/첫\s*영성체/.test(n));

        const smallMeet = one((n) => /소공동체와\s*함께하는\s*활동|소공동체\s*모임|소공동체\s*참석|소공동체\s*회의|소공동체\s*교육/.test(n));
        const zoneEdu = one((n) => /구역|반장\s*교육|반장교육/.test(n));
        const banInvite = one((n) => /반모임|반\s*모임/.test(n));
        const smallOther = one((n) => /소공동체/.test(n) && !/모임|회의|교육|구역|반장|반모임|권유/.test(n));
        const smallCount = sumParenCounts(smallMeet, zoneEdu, banInvite, smallOther)
            || one((n) => /소공동체와\s*함께하는\s*활동|소공동체|구역|반모임|반장/.test(n));

        const familyPray = one((n) => /가족이\s*함께\s*기도|가정\s*기도|가족기도/.test(n));
        const familyBible = one((n) => /성경\s*봉독|성경\s*묵상|가정.*성경/.test(n));
        const familyMass = one((n) => /가정.*미사|가족.*미사|미사참례/.test(n) && /가정|가족/.test(n));
        const familyWelfare = one((n) => /가정성화|가족.*복지|가정.*봉사/.test(n));
        const familyCount = sumParenCounts(familyPray, familyBible, familyMass, familyWelfare)
            || one((n) => /가정성화|가족이\s*함께|가정\s*단위/.test(n));

        const nature = one((n) => /자연보호\s*및\s*생명존중|자연보호|생태|환경|생명존중|낙태|장기기증|헌혈/.test(n));
        const publication = one((n) => /출판물|간행물|보급|배포/.test(n) && !/선교책자|선교지/.test(n));
        const rosary = one((n) => /묵주기도|묵주\s*기도/.test(n));
        const weekdayMass = one((n) => /평일미사|평일\s*미사/.test(n));
        const bibleReadWrite = one((n) => /성경읽기|성경쓰기|성경\s*읽기|성경\s*쓰기|성경통독|성경필사/.test(n));
        const dailyMassMeditate = one((n) => /매일미사|미사.*묵상|미사읽고/.test(n));
        const loveWelfare = one((n) => /사랑의\s*증언|복지시설/.test(n) && !/가정성화|가족/.test(n));
        const loveHospital = one((n) => /요양원|병원.*요양|요양.*병원/.test(n))
            || one((n) => /병원\s*방문|병원방문/.test(n) && /증언|사랑|요양/.test(n));
        const loveOther = one((n) => /사랑의\s*증언/.test(n) && /기타/.test(n));
        const vehicleCoop = one((n) => /기타활동.*차량|기타.*차량봉사|차량봉사및교통|차량봉사및협조|차량\s*봉사.*교통/.test(n));
        const otherCount = sumParenCounts(
            nature, publication, rosary, weekdayMass, bibleReadWrite, dailyMassMeditate,
            loveWelfare, loveHospital, loveOther, vehicleCoop
        ) || one((n) => /기타\s*활동|기타활동|자연보호|출판물|묵주|평일미사|성경|매일미사|사랑의\s*증언|차량봉사|차량\s*봉사/.test(n));

        const dioceseOrder = one((n) => /교구\s*지시|세나뚜스\s*지시|상급.*지시/.test(n));
        const parishMinistryHelp = one((n) => /본당사목의\s*모든\s*협조/.test(n))
            || sumParenCounts(
                one((n) => /성가/.test(n) && /협조|봉사|지도/.test(n)),
                one((n) => /전례/.test(n) && /협조|봉사/.test(n)),
                one((n) => /복사/.test(n)),
                one((n) => /차량\s*봉사|차량봉사/.test(n)),
                one((n) => /미사\s*안내|미사안내/.test(n)),
                one((n) => /봉성체/.test(n))
            );
        const pastorOrder = sumParenCounts(parishMinistryHelp)
            || one((n) => /사목자\s*지시|본당\s*신부|주임신부|본당사목/.test(n));

        return {
            dioceseOrder,
            pastorOrder,
            parishMinistryHelp,
            evangelismCount,
            nonbelieverInvite,
            catechismRestart,
            convertInvite,
            streetMission,
            visitMission,
            catechumenCount,
            catechismCare,
            otherIntroducedCatechumen,
            correspondence,
            catechismHelp,
            believerCount,
            newBaptized,
            transferIn,
            coldCare,
            marriageGuide,
            sacramentInvite,
            infantBaptism,
            firstCommunion,
            homeVisit,
            massWayBlessInvite,
            retreatLectureInvite,
            hardshipCount,
            believerSick,
            nonbelieverSick,
            multicultural,
            nonbelieverFuneral,
            believerFuneral,
            yeondo,
            funeralMass,
            memorialMass,
            coffin,
            burial,
            apostleRite,
            expansionCount,
            activeRecruit,
            auxRecruit,
            juniorLegion,
            specialCount,
            disaster,
            welfare,
            hospital,
            parishCount,
            eventHelp,
            sundaySchool,
            cleaning,
            massGuide,
            householdSurvey,
            parishOther,
            smallCount,
            smallMeet,
            zoneEdu,
            banInvite,
            smallOther,
            familyCount,
            familyPray,
            familyBible,
            familyMass,
            familyWelfare,
            otherCount,
            nature,
            publication,
            rosary,
            weekdayMass,
            bibleReadWrite,
            dailyMassMeditate,
            loveWelfare,
            loveHospital,
            loveOther,
            vehicleCoop
        };
    }

    function seoulParen(label, value) {
        return `${blank(label, 'w8')}(${blank(value, 'w3')})`;
    }

    /** 서울 양식 활동내용 칸: 라벨·횟수 포함 전체 줄을 PDF 전 편집 */
    function seoulActContentCell(parts) {
        const text = (parts || [])
            .map((p) => String(p || '').trim())
            .filter(Boolean)
            .join(', ');
        return `<td class="left seoul-act-content">${lineBoxHtml(text, '32px')}</td>`;
    }

    function seoulParenPlain(label, value) {
        const v = value === null || value === undefined || value === '' ? '' : String(value);
        return `${label}(${v})`;
    }

    function sumParenCounts(...vals) {
        let n = 0;
        let any = false;
        vals.forEach((v) => {
            const num = Number(v);
            if (Number.isFinite(num) && num > 0) {
                n += num;
                any = true;
            }
        });
        return any ? String(n) : '';
    }

    function attendancePct(present, total) {
        const p = Number(present);
        const t = Number(total);
        if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return '';
        return String(Math.round((p / t) * 100));
    }

    function resultCell(label, value, unit) {
        return `${escapeHtml(label)} ${blank(value, 'w4')}${unit ? ` ${escapeHtml(unit)}` : ''}`;
    }

    function countWithTarget(countVal) {
        return `${blank(countVal, 'w4')}<br>대상(${blank('', 'w3')})`;
    }

    function caseParen(label, value) {
        return `${escapeHtml(label)}(${blank(value, 'w3')})`;
    }

    function targetCountCells(targetVal, countVal) {
        return `<td class="gj-act-split">${blank(targetVal, 'w2')}</td><td class="gj-act-split">${blank(countVal, 'w2')}</td>`;
    }

    /** 제주 교구 Pr 사업보고 — 활동 세목 집계 */
    function computeJejuActivityCounts(totals) {
        const one = (matcher, field) => sumActivityTotals(totals, matcher, field);
        const nonbelieverInvite = one((n) => /비신자\s*입교|외인\s*입교|입교\s*권면/.test(n) && !/중단|재권면/.test(n));
        const correspondence = one((n) => /통신교리/.test(n));
        const otherIntroduced = one((n) => /타인\s*인도|타인인도/.test(n));
        const catechismHelp = one((n) => /교리반\s*봉사|교리반\s*협조|교리\s*봉사/.test(n));
        const catechismRestart = one((n) => /교리\s*중단|재권면|중단자/.test(n));
        const catechismCare = one((n) => /교리반\s*인도|예비신자\s*돌봄|예비자\s*돌봄/.test(n) && !/타인/.test(n))
            || one((n) => /교리반/.test(n), 'catechism_guide');
        const streetMission = one((n) => /가두\s*선교|가두선교/.test(n));
        const visitMission = one((n) => /방문\s*선교|방문선교|접촉활동|접촉\s*활동/.test(n));
        const evangelismCount = sumParenCounts(
            nonbelieverInvite, correspondence, otherIntroduced, catechismHelp,
            catechismRestart, catechismCare, streetMission, visitMission
        ) || one((n) => /복음선교|입교권면|가두|예비|교리반|통신교리/.test(n) && !/교우|성사권유|상가|병자/.test(n));
        const catechismLead = one((n) => /교리반\s*인도|교리반인도/.test(n), 'catechism_guide')
            || one((n) => /교리반\s*인도|교리반인도/.test(n));
        const baptized = one((n) => /예비신자|예비자|세례|영세/.test(n), 'baptism')
            || one((n) => /세례자|영세/.test(n));
        const baptizedCorr = one((n) => /통신교리/.test(n), 'baptism');
        const baptizedOther = one((n) => /타인\s*인도|타인인도/.test(n), 'baptism');
        const streetDays = one((n) => /가두\s*선교|가두선교/.test(n));
        const selfIntro = one((n) => /자기소개서|소개서/.test(n));

        const coldCare = one((n) => /쉬는\s*교우|냉담/.test(n));
        const marriageGuide = one((n) => /혼인\s*장애|조당/.test(n));
        const newBaptized = one((n) => /신\s*세례|새\s*영세|영세자\s*돌봄|새영세자/.test(n));
        const homeVisit = one((n) => /교우\s*가정|가정\s*방문|교우방문/.test(n));
        const sacramentInvite = one((n) => /성사\s*권면|성사권유|판공|견진|회두/.test(n));
        const transferIn = one((n) => /전입\s*교우|전입교우/.test(n));
        const firstCommunionInvite = one((n) => /첫\s*영성체/.test(n));
        const infantBaptismInvite = one((n) => /유아\s*세례|유아세례/.test(n));
        const believerSick = one((n) => /교우\s*환자|교우환자|병자/.test(n) && !/외인|비신자/.test(n));
        const believerFuneral = one((n) => /교우\s*상가|교우상가/.test(n))
            || one((n) => /상가/.test(n) && !/외인|비신자/.test(n), 'funeral_attendance');
        const believerCount = sumParenCounts(
            coldCare, marriageGuide, newBaptized, homeVisit, sacramentInvite,
            transferIn, firstCommunionInvite, infantBaptismInvite, believerSick, believerFuneral
        ) || one((n) => /교우\s*돌봄|교우방문|냉담|성사|혼인|영세자|전입|첫\s*영성체|유아세례|상가|병자/.test(n)
            && !/비신자|외인/.test(n));
        const conversion = one((n) => /회두/.test(n));
        const marriageFix = one((n) => /혼인장애/.test(n), 'resolution') || one((n) => /혼인장애|해소/.test(n));
        const groupJoin = one((n) => /단체\s*가입|단체가입/.test(n), 'group_join')
            || one((n) => /단체\s*가입|단체가입/.test(n));
        const confession = one((n) => /판공|고해/.test(n), 'sacrament') || one((n) => /판공|고해/.test(n));
        const confirmation = one((n) => /견진/.test(n), 'confirmation') || one((n) => /견진/.test(n));
        const firstCommunion = one((n) => /첫\s*영성체|첫영성체/.test(n), 'first_communion')
            || one((n) => /첫\s*영성체|첫영성체/.test(n));
        const infantBaptism = one((n) => /유아세례/.test(n), 'baptism') || one((n) => /유아세례/.test(n));
        const funeralMass = one((n) => /장례미사|고별식/.test(n), 'funeral_mass')
            || one((n) => /장례미사|고별식/.test(n));
        const yeondo = one((n) => /연도|위령기도/.test(n));
        const funeralOther = one((n) => /기타\s*상가|상가|장례수행|장지/.test(n) && !/장례미사|고별식/.test(n));

        const nonbelieverSick = one((n) => /비신자\s*환자|외인\s*환자|외인환자/.test(n));
        const nonbelieverFuneral = one((n) => /비신자\s*상가|외인\s*상가/.test(n));
        const hospital = one((n) => /병원\s*방문|병원방문|병원\s*활동/.test(n));
        const welfare = one((n) => /복지시설|어려운\s*이웃|복지\s*봉사/.test(n));
        const disaster = one((n) => /재해|사고\s*피해자|재난/.test(n));
        const neighborCount = sumParenCounts(nonbelieverSick, nonbelieverFuneral, hospital, welfare, disaster)
            || one((n) => /이웃\s*돌봄|비신자|병원|복지|재난|사고/.test(n));
        const conditionalBaptism = one((n) => /대세|죽을\s*위험/.test(n), 'conditional_baptism')
            || one((n) => /대세|죽을\s*위험/.test(n));
        const baptismComplete = one((n) => /보례|세례\s*보충|보충\s*예식/.test(n))
            || one((n) => /보례/.test(n));

        const activeRecruit = one((n) => /행동단원\s*모집|입단권면/.test(n), 'membership')
            || one((n) => /행동단원\s*모집|입단권면/.test(n));
        const auxRecruit = one((n) => /협조단원\s*모집|협조단원\s*돌봄/.test(n), 'membership')
            || one((n) => /협조단원/.test(n));
        const juniorLegion = one((n) => /소년\s*레지오|소년\s*Pr|유년|소년단/.test(n));
        const legionPromo = one((n) => /레지오\s*홍보|홍보|확장/.test(n) && !/행동|협조|소년/.test(n));
        const expansionCount = sumParenCounts(activeRecruit, auxRecruit, juniorLegion, legionPromo)
            || one((n) => /레지오의\s*발전|행동단원|협조단원|레지오\s*확장|회원모집|소년/.test(n));
        const juniorDispatch = one((n) => /소년\s*팀|소년팀|파견|유년단/.test(n));

        const eventHelp = one((n) => /행사\s*준비|행사\s*협조|본당\s*행사/.test(n));
        const householdSurvey = one((n) => /호구조사|호별방문|교세\s*조사|호구/.test(n));
        const sundaySchool = one((n) => /주일학교/.test(n));
        const liturgy = one((n) => /전례|복사|성가|미사\s*안내|미사안내|주보\s*접기|주보접기|준비\s*및\s*협조/.test(n));
        const cleaning = one((n) => /청소|미화/.test(n));
        const smallCommunity = one((n) =>
            /소공동체|구역|반장\s*교육|반장교육|반모임|참석\s*권유/.test(n)
        );
        const parishOther = one((n) =>
            (/본당.*기타|기타\s*본당|본당협조.*기타|본당활동.*기타/.test(n)
                || (/본당/.test(n) && /기타/.test(n)))
            && !/행사|호구|주일|전례|청소|소공동체|구역|반장|미사|성가|주보/.test(n)
        );
        const parishCount = sumParenCounts(
            eventHelp, householdSurvey, sundaySchool, liturgy, cleaning, smallCommunity, parishOther
        ) || one((n) => /본당|주일학교|전례|호구|청소|소공동체/.test(n) && !/첫\s*영성체/.test(n));
        const parishVisit = one((n) => /호구조사|면담|방문조사/.test(n));

        const envPersonal = one((n) => /개인\s*실천|지구와함께|거절하기|아껴쓰기|고쳐쓰기|재고하기|다시쓰기|재생하기/.test(n));
        const envCommunity = one((n) => /공동체\s*활동|환경정화|생태\s*환경/.test(n));
        const envEdu = one((n) => /환경.*교육|교육.*환경|생명존중.*교육/.test(n));
        const envCount = sumParenCounts(envPersonal, envCommunity, envEdu)
            || one((n) => /환경보호|자연보호|생태|지구와함께/.test(n));

        const publication = one((n) => /출판물|간행물|보급|배포/.test(n));
        const shrine = one((n) => /성지\s*미화|성지미화|성지/.test(n));
        const vehicle = one((n) => /차량봉사|차량\s*봉사|교통정리/.test(n));
        const proLife = one((n) => /생명존중|헌혈|낙태|장기기증/.test(n));
        const familySanct = one((n) => /가정성화|가족이\s*함께|가정\s*단위/.test(n));
        const otherCount = sumParenCounts(publication, shrine, vehicle, proLife, familySanct)
            || one((n) => /기타\s*활동|기타활동|출판물|성지|차량|생명존중|가정성화/.test(n));

        const weekdayMass = one((n) => /평일미사|평일\s*미사/.test(n));
        const rosary = one((n) => /묵주기도|묵주\s*기도/.test(n));
        const stations = one((n) => /십자가의\s*길|십자가의길/.test(n));
        const eucharistAdoration = one((n) => /성체조배/.test(n));
        const bible = one((n) => /성경|봉독|필사|통독|쓰기/.test(n));
        const littleOffice = one((n) => /소성무일도|성무일도/.test(n));
        const otherPray = one((n) => /기타기도|묘지|선종|단장지시|모바일성경|지향기도|프랭크|더프/.test(n));

        return {
            evangelismTarget: '',
            evangelismCount,
            nonbelieverInvite,
            correspondence,
            otherIntroduced,
            catechismHelp,
            catechismRestart,
            catechismCare,
            streetMission,
            visitMission,
            catechismLead,
            baptized,
            baptizedCorr,
            baptizedOther,
            streetDays,
            selfIntro,
            believerTarget: '',
            believerCount,
            coldCare,
            marriageGuide,
            newBaptized,
            homeVisit,
            sacramentInvite,
            transferIn,
            firstCommunionInvite,
            infantBaptismInvite,
            believerSick,
            believerFuneral,
            conversion,
            marriageFix,
            groupJoin,
            confession,
            confirmation,
            firstCommunion,
            infantBaptism,
            funeralMass,
            yeondo,
            funeralOther,
            neighborTarget: '',
            neighborCount,
            nonbelieverSick,
            nonbelieverFuneral,
            hospital,
            welfare,
            disaster,
            conditionalBaptism,
            baptismComplete,
            expansionTarget: '',
            expansionCount,
            activeRecruit,
            auxRecruit,
            juniorLegion,
            legionPromo,
            juniorDispatch,
            parishTarget: '',
            parishCount,
            eventHelp,
            householdSurvey,
            sundaySchool,
            liturgy,
            cleaning,
            smallCommunity,
            parishOther,
            parishVisit,
            envTarget: '',
            envCount,
            envPersonal,
            envCommunity,
            envEdu,
            otherTarget: '',
            otherCount,
            publication,
            shrine,
            vehicle,
            proLife,
            familySanct,
            weekdayMass,
            rosary,
            stations,
            eucharistAdoration,
            bible,
            littleOffice,
            otherPray
        };
    }

    /** 마산 교구 Pr 사업보고 — 활동 세목 집계 */
    function computeMasanActivityCounts(totals) {
        const j = computeJejuActivityCounts(totals);
        const one = (matcher, field) => sumActivityTotals(totals, matcher, field);
        const convertInvite = one((n) => /개종|개종자|개종\s*권면/.test(n) && !/회두/.test(n));
        const catechumen = one((n) => /예비자|예비신자/.test(n) && !/타인|교리반\s*인도/.test(n));
        const marriageDivorceMass = one((n) => /혼인\s*장애|이혼|미사\s*참례|조당/.test(n));
        const firstInfantInvite = sumParenCounts(j.firstCommunionInvite, j.infantBaptismInvite)
            || one((n) => /첫\s*영성체|유아\s*세례|유아세례/.test(n));
        const believerSickFuneral = sumParenCounts(j.believerSick, j.believerFuneral)
            || one((n) => /교우\s*환자|교우\s*상가|병자|상가/.test(n) && !/외인|비신자/.test(n));
        const neighborSickFuneral = sumParenCounts(j.nonbelieverSick, j.nonbelieverFuneral)
            || one((n) => /비신자\s*환자|비신자\s*상가|외인\s*환자|외인\s*상가/.test(n));
        const nature = one((n) => /자연\s*보호|자연보호|생태|환경/.test(n) && !/지구/.test(n));
        const legionActivity = j.legionPromo
            || one((n) => /레지오\s*관련|레지오홍보|Pr\s*설립|교본\s*공부/.test(n) && !/행동|협조|소년/.test(n));
        const masanOtherCount = sumParenCounts(j.publication, nature, j.vehicle, j.proLife, j.familySanct)
            || j.otherCount;

        return Object.assign({}, j, {
            convertInvite,
            catechumen,
            marriageDivorceMass,
            firstInfantInvite,
            believerSickFuneral,
            neighborSickFuneral,
            nature,
            legionActivity,
            otherCount: masanOtherCount
        });
    }

    function buildJejuActivitySpiritualSectionHtml(a) {
        const joinCases = (parts) => parts.filter(Boolean).join(', ');
        return `
                <div class="daegu-page-break">
                    <div class="biz-sec-title" style="display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;">
                        <span>활동상황</span>
                        <span style="border:1px dashed #666;padding:3px 8px;font-size:10px;font-weight:400;line-height:1.4;max-width:420px;">
                            아래의 활동은 대표적인 예시이며 이외의 다른 유사한 활동도 횟수에 추가할 수 있다.
                        </span>
                    </div>
                    <div class="biz-scroll">
                    <table class="biz-table gj-act-table jeju-act-table">
                        <thead>
                            <tr>
                                <th rowspan="2">종목</th>
                                <th colspan="2">활동</th>
                                <th rowspan="2">활동 사례 (횟수)</th>
                                <th rowspan="2">결과</th>
                            </tr>
                            <tr>
                                <th>대상</th>
                                <th>횟수</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="gj-cat">복음선교</td>
                                ${targetCountCells(a.evangelismTarget, a.evangelismCount)}
                                <td class="gj-cases">${joinCases([
                                    caseParen('비신자입교권면', a.nonbelieverInvite),
                                    caseParen('통신 교리자 돌봄', a.correspondence),
                                    caseParen('타인이 인도한 예비신자 돌봄', a.otherIntroduced),
                                    caseParen('교리반 봉사 및 협조', a.catechismHelp),
                                    caseParen('교리 중단자 권면', a.catechismRestart),
                                    caseParen('교리반 인도 예비신자 돌봄', a.catechismCare),
                                    caseParen('가두 선교(단원수)', a.streetMission)
                                ])}<br>접촉활동 ${blank(a.visitMission, 'w3')} 회</td>
                                <td class="gj-result">
                                    ${resultCell('교리반인도', a.catechismLead, '명')}<br>
                                    ${resultCell('세례자', a.baptized, '명')}<br>
                                    ${resultCell('세례자(통신교리)', a.baptizedCorr, '명')}<br>
                                    ${resultCell('세례자(타인인도)', a.baptizedOther, '명')}<br>
                                    ${resultCell('가두선교한 일수', a.streetDays, '일')}<br>
                                    ${resultCell('자기소개서', a.selfIntro, '')}
                                </td>
                            </tr>
                            <tr>
                                <td class="gj-cat">교우돌봄</td>
                                ${targetCountCells(a.believerTarget, a.believerCount)}
                                <td class="gj-cases">${joinCases([
                                    caseParen('쉬는교우 방문 및 돌봄', a.coldCare),
                                    caseParen('혼인 장애자 방문 해소 권면', a.marriageGuide),
                                    caseParen('신세례자 방문 돌봄', a.newBaptized),
                                    caseParen('교우 가정 방문 돌봄', a.homeVisit),
                                    caseParen('성사 권면', a.sacramentInvite),
                                    caseParen('전입 교우 방문 돌봄', a.transferIn),
                                    caseParen('첫 영성체 권면', a.firstCommunionInvite),
                                    caseParen('유아 세례 권면', a.infantBaptismInvite),
                                    caseParen('교우 환자 방문 및 돌봄', a.believerSick),
                                    caseParen('교우 상가 방문 및 돌봄', a.believerFuneral)
                                ])}</td>
                                <td class="gj-result">
                                    ${resultCell('회두', a.conversion, '명')}<br>
                                    ${resultCell('해소', a.marriageFix, '명')}<br>
                                    ${resultCell('단체가입', a.groupJoin, '명')}<br>
                                    ${resultCell('판공', a.confession, '명')} / ${resultCell('견진', a.confirmation, '명')}<br>
                                    ${resultCell('첫영성체', a.firstCommunion, '명')}<br>
                                    ${resultCell('유아세례', a.infantBaptism, '명')}<br>
                                    ${resultCell('장례미사', a.funeralMass, '명')}<br>
                                    ${resultCell('연도', a.yeondo, '명')}<br>
                                    ${resultCell('기타상가활동', a.funeralOther, '명')}
                                </td>
                            </tr>
                            <tr>
                                <td class="gj-cat">이웃돌봄</td>
                                ${targetCountCells(a.neighborTarget, a.neighborCount)}
                                <td class="gj-cases">${joinCases([
                                    caseParen('비신자환자 방문 및 돌봄', a.nonbelieverSick),
                                    caseParen('비신자상가 기도 및 돌봄', a.nonbelieverFuneral),
                                    caseParen('비신자대상 병원 방문, 활동', a.hospital),
                                    caseParen('복지시설 및 어려운 이웃돌봄', a.welfare),
                                    caseParen('재해 및 사고 피해자', a.disaster)
                                ])}</td>
                                <td class="gj-result">
                                    ${resultCell('죽을 위험중의세례', a.conditionalBaptism, '명')}<br>
                                    ${resultCell('세례 보충 예식', a.baptismComplete, '명')}
                                </td>
                            </tr>
                            <tr>
                                <td class="gj-cat">레지오확장</td>
                                ${targetCountCells(a.expansionTarget, a.expansionCount)}
                                <td class="gj-cases">${joinCases([
                                    caseParen('행동단원 모집', a.activeRecruit),
                                    caseParen('협조단원 모집/돌봄', a.auxRecruit),
                                    caseParen('소년 레지오 지도', a.juniorLegion),
                                    caseParen('레지오홍보 및 기타 유사 활동', a.legionPromo)
                                ])}</td>
                                <td class="gj-result">
                                    ${resultCell('행동 입단', a.activeRecruit, '명')}<br>
                                    ${resultCell('협조 입단', a.auxRecruit, '명')}<br>
                                    ${resultCell('소년팀 파견', a.juniorDispatch, '명')}
                                </td>
                            </tr>
                            <tr>
                                <td class="gj-cat">본당활동</td>
                                ${targetCountCells(a.parishTarget, a.parishCount)}
                                <td class="gj-cases">${joinCases([
                                    caseParen('본당 행사 준비 및 협조', a.eventHelp),
                                    caseParen('교세조사(호별방문)', a.householdSurvey),
                                    caseParen('주일학교 돌봄', a.sundaySchool),
                                    caseParen('전례봉사/준비및협조(미사안내,주보접기,성가대)', a.liturgy),
                                    caseParen('청소', a.cleaning),
                                    caseParen('소공동체활동(구역,반장교육및참석,참석권유)', a.smallCommunity),
                                    caseParen('기타', a.parishOther)
                                ])}</td>
                                <td class="gj-result">${resultCell('면담', a.parishVisit, '세대')}</td>
                            </tr>
                            <tr>
                                <td class="gj-cat">환경보호</td>
                                ${targetCountCells(a.envTarget, a.envCount)}
                                <td class="gj-cases">${joinCases([
                                    caseParen('개인실천', a.envPersonal),
                                    caseParen('공동체 활동', a.envCommunity),
                                    caseParen('교육', a.envEdu)
                                ])}</td>
                                <td class="gj-result">${blank('', 'w8')}</td>
                            </tr>
                            <tr>
                                <td class="gj-cat">기타활동</td>
                                ${targetCountCells(a.otherTarget, a.otherCount)}
                                <td class="gj-cases">${joinCases([
                                    caseParen('출판물보급', a.publication),
                                    caseParen('성지미화', a.shrine),
                                    caseParen('차량봉사및 교통정리', a.vehicle),
                                    caseParen('생명존중 활동(헌혈 등)', a.proLife),
                                    caseParen('가정성화 활동', a.familySanct)
                                ])}</td>
                                <td class="gj-result">${blank('', 'w8')}</td>
                            </tr>
                        </tbody>
                    </table>
                    </div>

                    <div class="biz-sec-title" style="margin-top:12px;">영성생활</div>
                    <div class="biz-scroll">
                    <table class="biz-table">
                        <tbody>
                            <tr>
                                <th style="width:22%">평일미사</th>
                                <td class="left">의무축일, 장례미사 제외 참례수</td>
                                <td>${blank(a.weekdayMass, 'w4')} 회</td>
                            </tr>
                            <tr>
                                <th>묵주기도</th>
                                <td class="left">봉헌한 단수</td>
                                <td>${blank(a.rosary, 'w4')} 단</td>
                            </tr>
                            <tr>
                                <th>십자가의 길</th>
                                <td class="left">개인/합동 (1인 1회)</td>
                                <td>${blank(a.stations, 'w4')} 회</td>
                            </tr>
                            <tr>
                                <th>성체조배</th>
                                <td class="left">횟수 (10분 이상)</td>
                                <td>${blank(a.eucharistAdoration, 'w4')} 회</td>
                            </tr>
                            <tr>
                                <th>성경봉독, 쓰기</th>
                                <td class="left">합계 시간</td>
                                <td>${blank(a.bible, 'w4')} 분</td>
                            </tr>
                            <tr>
                                <th>소성무일도</th>
                                <td class="left">1일 1회</td>
                                <td>${blank(a.littleOffice, 'w4')} 회</td>
                            </tr>
                            <tr>
                                <th>기타기도</th>
                                <td class="left">묘지순례, 선종단원지향, 단장지시기도, 모바일성경쓰기 등</td>
                                <td>${blank(a.otherPray, 'w4')} 회</td>
                            </tr>
                        </tbody>
                    </table>
                    </div>
                </div>
        `;
    }

    /** 마산 교구 Pr 사업보고 — 활동상황·영성생활 */
    function buildMasanActivitySpiritualSectionHtml(a) {
        const joinCases = (parts) => parts.filter(Boolean).join(', ');
        return `
                <div class="daegu-page-break">
                    <div class="biz-sec-title" style="display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;">
                        <span>활동상황</span>
                        <span style="border:1px dashed #666;padding:3px 8px;font-size:10px;font-weight:400;line-height:1.4;max-width:420px;">
                            아래의 활동은 대표적인 예시이며 이외의 다른 활동을 추가할 수 있다.
                        </span>
                    </div>
                    <div class="biz-scroll">
                    <table class="biz-table gj-act-table jeju-act-table masan-act-table">
                        <thead>
                            <tr>
                                <th rowspan="2">종목</th>
                                <th colspan="2">활동</th>
                                <th rowspan="2">활동 사례 예</th>
                                <th rowspan="2">결과</th>
                            </tr>
                            <tr>
                                <th>대상</th>
                                <th>횟수</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="gj-cat">복음선교</td>
                                ${targetCountCells(a.evangelismTarget, a.evangelismCount)}
                                <td class="gj-cases">${joinCases([
                                    caseParen('비신자', a.nonbelieverInvite),
                                    caseParen('개종자', a.convertInvite),
                                    caseParen('교리중단자', a.catechismRestart),
                                    caseParen('예비자', a.catechumen),
                                    caseParen('가두선교', a.streetMission),
                                    caseParen('교리반인도 예비자 돌봄', a.catechismCare),
                                    caseParen('타인이 인도한 예비자 돌봄', a.otherIntroduced),
                                    caseParen('교리반 봉사 및 협조', a.catechismHelp)
                                ])}</td>
                                <td class="gj-result">
                                    ${resultCell('교리반인도', a.catechismLead, '명')}<br>
                                    ${resultCell('영세자', a.baptized, '명')}
                                </td>
                            </tr>
                            <tr>
                                <td class="gj-cat">교우돌봄</td>
                                ${targetCountCells(a.believerTarget, a.believerCount)}
                                <td class="gj-cases">${joinCases([
                                    caseParen('신영세자 방문·돌봄(전례·기도지도)', a.newBaptized),
                                    caseParen('교우가정방문(종교활동 권장)', a.homeVisit),
                                    caseParen('쉬는교우 방문', a.coldCare),
                                    caseParen('혼인장애·이혼·미사참례 권면', a.marriageDivorceMass),
                                    caseParen('성사권면', a.sacramentInvite),
                                    caseParen('전입교우 방문(친목·단체가입)', a.transferIn),
                                    caseParen('첫영성체·유아세례 권면', a.firstInfantInvite),
                                    caseParen('교우환자·상가 방문', a.believerSickFuneral)
                                ])}</td>
                                <td class="gj-result">
                                    ${resultCell('단체가입', a.groupJoin, '명')}<br>
                                    ${resultCell('회두', a.conversion, '명')}<br>
                                    ${resultCell('해소', a.marriageFix, '명')}<br>
                                    ${resultCell('판공', a.confession, '명')}<br>
                                    ${resultCell('견진', a.confirmation, '명')}<br>
                                    ${resultCell('첫 영성체', a.firstCommunion, '명')}<br>
                                    ${resultCell('유아세례', a.infantBaptism, '명')}<br>
                                    ${resultCell('장례미사', a.funeralMass, '명')}<br>
                                    ${resultCell('연도', a.yeondo, '명')}<br>
                                    ${resultCell('기타상가활동', a.funeralOther, '명')}
                                </td>
                            </tr>
                            <tr>
                                <td class="gj-cat">이웃돌봄</td>
                                ${targetCountCells(a.neighborTarget, a.neighborCount)}
                                <td class="gj-cases">${joinCases([
                                    caseParen('비신자환자·상가 방문', a.neighborSickFuneral),
                                    caseParen('병원활동', a.hospital),
                                    caseParen('복지시설 봉사', a.welfare),
                                    caseParen('재해·사고 피해자', a.disaster)
                                ])}</td>
                                <td class="gj-result">
                                    ${resultCell('대세', a.conditionalBaptism, '명')}<br>
                                    ${resultCell('보례', a.baptismComplete, '명')}
                                </td>
                            </tr>
                            <tr>
                                <td class="gj-cat">레지오확장</td>
                                ${targetCountCells(a.expansionTarget, a.expansionCount)}
                                <td class="gj-cases">${joinCases([
                                    caseParen('소년레지오 지도', a.juniorLegion),
                                    caseParen('행동단원 모집', a.activeRecruit),
                                    caseParen('협조단원 모집·돌봄', a.auxRecruit),
                                    caseParen('레지오 관련 활동', a.legionActivity)
                                ])}</td>
                                <td class="gj-result">
                                    ${resultCell('행동 입단', a.activeRecruit, '명')}<br>
                                    ${resultCell('협조 입단', a.auxRecruit, '명')}
                                </td>
                            </tr>
                            <tr>
                                <td class="gj-cat">본당활동</td>
                                ${targetCountCells(a.parishTarget, a.parishCount)}
                                <td class="gj-cases">${joinCases([
                                    caseParen('본당행사 준비·협조', a.eventHelp),
                                    caseParen('교세조사(호별방문)', a.householdSurvey),
                                    caseParen('주일학교', a.sundaySchool),
                                    caseParen('전례봉사', a.liturgy),
                                    caseParen('청소·미화', a.cleaning),
                                    caseParen('소공동체활동', a.smallCommunity)
                                ])}</td>
                                <td class="gj-result">${resultCell('면담', a.parishVisit, '세대')}</td>
                            </tr>
                            <tr>
                                <td class="gj-cat">기타</td>
                                ${targetCountCells(a.otherTarget, a.otherCount)}
                                <td class="gj-cases">${joinCases([
                                    caseParen('출판물 보급', a.publication),
                                    caseParen('자연보호', a.nature),
                                    caseParen('차량봉사·교통정리', a.vehicle),
                                    caseParen('생명존중', a.proLife),
                                    caseParen('가정성화(가정단위)', a.familySanct)
                                ])}</td>
                                <td class="gj-result">${blank('', 'w8')}</td>
                            </tr>
                        </tbody>
                    </table>
                    </div>

                    <div class="biz-sec-title" style="margin-top:12px;">영성 생활</div>
                    <div class="biz-scroll">
                    <table class="biz-table masan-spirit-table">
                        <tbody>
                            <tr>
                                <td class="masan-spirit-label" rowspan="6">영<br>성<br>생<br>활</td>
                                <th>평일미사</th>
                                <td>${blank(a.weekdayMass, 'w4')}</td>
                                <td class="left">평일미사 참여 횟수</td>
                            </tr>
                            <tr>
                                <th>묵주기도</th>
                                <td>${blank(a.rosary, 'w4')}</td>
                                <td class="left">묵주기도 봉헌 단수</td>
                            </tr>
                            <tr>
                                <th>성체조배</th>
                                <td>${blank(a.eucharistAdoration, 'w4')}</td>
                                <td class="left">합산 횟수</td>
                            </tr>
                            <tr>
                                <th>성경 봉독, 쓰기</th>
                                <td>${blank(a.bible, 'w4')}</td>
                                <td class="left">성경읽기, 쓰기 합산 시간</td>
                            </tr>
                            <tr>
                                <th>소성무일도</th>
                                <td>${blank(a.littleOffice, 'w4')}</td>
                                <td class="left">1회-아침/저녁/끝 기도 이상을 바친 경우</td>
                            </tr>
                            <tr>
                                <th>기타 기도</th>
                                <td>${blank(a.otherPray, 'w4')}</td>
                                <td class="left">${blank('', 'w8')}</td>
                            </tr>
                        </tbody>
                    </table>
                    </div>
                </div>
        `;
    }

    function busanActCategoryRows(categoryLabel, rows, resultHtml) {
        const n = rows.length;
        const hasResult = resultHtml != null && String(resultHtml).trim() !== '';
        return rows.map(function (row, i) {
            const catCell = i === 0
                ? `<td class="gj-cat" rowspan="${n}">${categoryLabel}</td>`
                : '';
            const resCell = (hasResult && i === 0)
                ? `<td class="gj-result" rowspan="${n}">${resultHtml}</td>`
                : '';
            const label = row.label ? escapeHtml(row.label) : '&nbsp;';
            return `<tr>${catCell}<td class="left bs-act-content">${label}</td><td class="bs-count">${blank(row.count, 'w3')}</td>${resCell}</tr>`;
        }).join('');
    }

    function busanGridCell(label, value, unit) {
        return `<td class="bs-grid-cell"><div class="bs-grid-label">${escapeHtml(label)}</div><div class="bs-grid-val">${blank(value, 'w3')} ${escapeHtml(unit)}</div></td>`;
    }

    /** 부산 교구 Pr 사업보고 — 11.활동상황 (1페이지) */
    function buildBusanActivitySectionHtml(a) {
        return `
                <div class="daegu-page-break">
                    <div class="biz-sec-title">활동상황</div>
                    <div class="biz-scroll">
                    <table class="biz-table gj-act-table busan-act-table">
                        <thead>
                            <tr>
                                <th>종목</th>
                                <th>활동내용</th>
                                <th>활동횟수</th>
                                <th>활동결과</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${busanActCategoryRows('복음선교', [
                                { label: '비신자 입교 권면', count: a.nonbelieverInvite },
                                { label: '교리 중단자 권면', count: a.catechismRestart },
                                { label: '방문 및 가두 선교 (참여단원수 = 횟수)', count: a.visitStreetMission },
                                { label: '예비자 돌보기 (직접, 타인 인도)', count: a.catechumenCare },
                                { label: '통신 교리자 돌봄', count: a.correspondence },
                                { label: '교리반 봉사 및 협조', count: a.catechismHelp }
                            ], `
                                ${resultCell('교리반 인도', a.catechismLead, '명')}<br>
                                ${resultCell('세례자', a.baptized, '명')}
                            `)}
                            ${busanActCategoryRows('교우돌봄', [
                                { label: '교우 방문 및 돌봄', count: a.homeVisit },
                                { label: '쉬는 (냉담) 교우 돌봄', count: a.coldCare },
                                { label: '혼인 장애자 돌봄', count: a.marriageGuide },
                                { label: '판공성사 및 견진성사 권면', count: a.sacramentInvite },
                                { label: '교우 환자 방문 및 돌봄', count: a.believerSick },
                                { label: '교우 상가 방문 및 돌봄', count: a.believerFuneral },
                                { label: '유아 세례 권면', count: a.infantBaptismInvite },
                                { label: '청소년 돌봄', count: a.youthCare }
                            ], `
                                ${resultCell('단체가입', a.groupJoin, '명')}<br>
                                ${resultCell('회두', a.conversion, '명')}<br>
                                ${resultCell('해소', a.marriageFix, '명')}<br>
                                ${resultCell('판공', a.confession, '명')} / ${resultCell('견진', a.confirmation, '명')}<br>
                                ${resultCell('병자영성체', a.sickCommunion, '명')}<br>
                                ${resultCell('연도', a.yeondo, '회')}, ${resultCell('장례미사', a.funeralMass, '회')}, ${resultCell('장지수행', a.burialEscort, '명')}<br>
                                ${resultCell('유아세례', a.infantBaptism, '명')}<br>
                                ${resultCell('첫영성체', a.firstCommunion, '명')}
                            `)}
                            ${busanActCategoryRows('이웃돌봄', [
                                { label: '비신자 환자 방문 및 기도', count: a.nonbelieverSick },
                                { label: '비신자 상가 방문 및 기도', count: a.nonbelieverFuneral },
                                { label: '이재 및 어려움을 겪는 자 돌봄', count: a.disaster },
                                { label: '다문화 가족 돌봄', count: a.multicultural },
                                { label: '병원 및 복지시설 봉사', count: a.hospitalWelfare },
                                { label: '죽을 위험 중의 세례자 돌봄', count: a.dangerBaptismCare }
                            ], `
                                ${resultCell('죽을 위험 중의 세례', a.conditionalBaptism, '명')}<br>
                                ${resultCell('세례 보충 예식', a.baptismComplete, '명')}
                            `)}
                            ${busanActCategoryRows('레지오확장', [
                                { label: '소년 쁘레시디움 지도', count: a.juniorLegion },
                                { label: '행동 단원 모집 및 돌봄', count: a.activeRecruitCare },
                                { label: '협조 단원 모집 및 돌봄', count: a.auxRecruitCare },
                                { label: '쁘레시디움 설립 권면', count: a.prEstablishInvite },
                                { label: '교본 공부', count: a.handbookStudy },
                                { label: '평의회 업무 협조', count: a.councilCoop }
                            ], `
                                ${resultCell('입단', a.juniorJoin, '명')}<br>
                                ${resultCell('입단', a.activeJoin, '명')}<br>
                                ${resultCell('입단', a.auxJoin, '명')}<br>
                                ${resultCell('설립', a.foundedPr, 'Pr.')}
                            `)}
                        </tbody>
                    </table>
                    </div>
                </div>
        `;
    }

    /** 부산 교구 Pr 사업보고 — 11.활동상황 (2페이지: 본당협조·영성생활·지구살리기) */
    function buildBusanActivityPage2Html(a) {
        return `
                <div class="daegu-page-break">
                    <div class="biz-scroll">
                    <table class="biz-table gj-act-table busan-act-table">
                        <thead>
                            <tr>
                                <th>종목</th>
                                <th>활동내용</th>
                                <th>활동횟수</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${busanActCategoryRows('본당 및<br>교회 협조', [
                                { label: '소공동체 활동', count: a.smallCommunity },
                                { label: '업무 협조', count: a.businessCoop },
                                { label: '주일학교 및 노인대학 봉사', count: a.sundaySenior },
                                { label: '교육 및 피정', count: a.eduRetreat },
                                { label: '전례 봉사', count: a.liturgy },
                                { label: '본당 행사 및 제 단체 봉사', count: a.parishEvent },
                                { label: '성지 및 교구 관련 시설 봉사', count: a.shrineFacility }
                            ], '')}
                            ${busanActCategoryRows('레지아 지시사항', [
                                { label: '', count: '' },
                                { label: '', count: '' }
                            ], '')}
                            ${busanActCategoryRows('기타', [
                                { label: '출판물 보급', count: a.publication },
                                { label: '차량 봉사', count: a.vehicle },
                                { label: '자연 보호', count: a.nature }
                            ], '')}
                        </tbody>
                    </table>
                    </div>

                    <div class="biz-sec-title" style="margin-top:12px;">영성생활</div>
                    <table class="biz-table bs-grid-table">
                        <tbody>
                            <tr>
                                ${busanGridCell('묵주기도', a.rosary, '단')}
                                ${busanGridCell('평일 미사', a.weekdayMass, '회')}
                                ${busanGridCell('십자가의 길', a.stations, '회')}
                            </tr>
                            <tr>
                                ${busanGridCell('성경 읽기', a.bibleRead, '시간')}
                                ${busanGridCell('성경 쓰기', a.bibleWrite, '시간')}
                                ${busanGridCell('소성무일도', a.littleOffice, '회')}
                            </tr>
                            <tr>
                                ${busanGridCell('성체 조배', a.eucharistAdoration, '회')}
                                ${busanGridCell('가족 기도', a.familyPray, '회')}
                                ${busanGridCell('성모님의 군단 읽기', a.legionRead, '시간')}
                            </tr>
                        </tbody>
                    </table>

                    <div class="biz-sec-title" style="margin-top:12px;">지구 살리기</div>
                    <table class="biz-table bs-grid-table">
                        <tbody>
                            <tr>
                                ${busanGridCell('거절하기', a.earthRefuse, '회')}
                                ${busanGridCell('아껴쓰기', a.earthSave, '회')}
                                ${busanGridCell('다시쓰기', a.earthReuse, '회')}
                            </tr>
                            <tr>
                                ${busanGridCell('고쳐쓰기', a.earthRepair, '회')}
                                ${busanGridCell('재고하기', a.earthRethink, '회')}
                                ${busanGridCell('재생하기', a.earthRecycle, '회')}
                            </tr>
                        </tbody>
                    </table>
                </div>
        `;
    }

    /** 부산 교구 Pr 사업보고 — 중점 활동 (특기사항 대체) */
    function buildBusanFocusSectionHtml(officers) {
        return `
                <div class="daegu-page-break">
                    <table class="biz-table bs-focus-table">
                        <tr>
                            <td class="bs-focus-label" rowspan="2">중점<br>활동</td>
                            <td class="bs-focus-body">
                                <div class="bs-focus-hint">
                                    복음 선교 ("종목" 기재)<br>
                                    소제목 (예: 하느님의 사랑을 실천한 결실)
                                </div>
                                ${lineBoxHtml('', '200px')}
                            </td>
                        </tr>
                        <tr>
                            <td class="bs-focus-plan">
                                (내년도 계획)<br>
                                ${lineBoxHtml('', '48px')}
                            </td>
                        </tr>
                    </table>
                    <div class="daegu-sign" style="margin-top:16px; text-align:right;">
                        Pr. 단장 ${blank(officerField(officers, '단장', 'name'), 'w8')} (인)
                    </div>
                </div>
        `;
    }

    function daeguActBlock(num, title, examples, count, resultsHtml) {
        return `
            <div class="daegu-act-block">
                <div class="daegu-act-title">${escapeHtml(String(num))}. ${escapeHtml(title)}</div>
                <div class="daegu-act-ex">
                    <strong>활동 예시:</strong>
                    ${lineBoxHtml(examples, '36px')}
                </div>
                <div class="daegu-act-count">활동 회수: ${blank(count, 'w4')} 회</div>
                ${resultsHtml ? `<div class="daegu-act-result"><strong>활동 결과:</strong> ${resultsHtml}</div>` : ''}
            </div>
        `;
    }

    function buildSeoulActivitySectionHtml(activityTotals) {
        const a = computeSeoulActivityCounts(activityTotals || []);
        return `
            <div class="biz-sec-title">활동 사항</div>
            <p class="seoul-act-hint">
                ※ 아래 내용은 대표적 활동 예시이며, 각 쁘레시디움에서 필요에 따라 추가·삭제·수정하여 해당 활동의 횟수를 기재합니다. (종목·활동횟수·활동내용 모두 PDF 출력 전 수정 가능, 저장 안 함)
            </p>
            <div class="biz-scroll">
            <table class="biz-table seoul-act-table">
                <thead>
                    <tr>
                        <th style="width:18%">종 목</th>
                        <th style="width:10%">활동횟수</th>
                        <th>활동 내용</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>${blank('교구 또는 세나뚜스 지시 사항', 'w10')}</td>
                        <td>${blank(a.dioceseOrder, 'w4')}</td>
                        ${seoulActContentCell([])}
                    </tr>
                    <tr>
                        <td>${blank('본당 사목자 지시 사항', 'w10')}</td>
                        <td>${blank(a.pastorOrder, 'w4')}</td>
                        ${seoulActContentCell([
                            seoulParenPlain('본당사목의 모든 협조(성가,전례,복사,차량봉사,미사안내,봉성체동행)', a.parishMinistryHelp)
                        ])}
                    </tr>
                    <tr>
                        <td>${blank('입교 권면', 'w10')}</td>
                        <td>${blank(a.evangelismCount, 'w4')}</td>
                        ${seoulActContentCell([
                            seoulParenPlain('외인 입교 권면', a.nonbelieverInvite),
                            seoulParenPlain('교리 중단자 재권면', a.catechismRestart),
                            seoulParenPlain('개종 권면', a.convertInvite),
                            seoulParenPlain('가두 선교', a.streetMission),
                            seoulParenPlain('방문 선교', a.visitMission)
                        ])}
                    </tr>
                    <tr>
                        <td>${blank('예비신자 돌봄', 'w10')}</td>
                        <td>${blank(a.catechumenCount, 'w4')}</td>
                        ${seoulActContentCell([
                            seoulParenPlain('교리반 인도 예비신자 돌봄', a.catechismCare),
                            seoulParenPlain('타인인도 예비자 돌봄', a.otherIntroducedCatechumen),
                            seoulParenPlain('통신교리자 돌봄', a.correspondence),
                            seoulParenPlain('교리반 봉사 또는 협조', a.catechismHelp)
                        ])}
                    </tr>
                    <tr>
                        <td>${blank('교우 돌봄', 'w10')}</td>
                        <td>${blank(a.believerCount, 'w4')}</td>
                        ${seoulActContentCell([
                            seoulParenPlain('새 영세자 돌봄', a.newBaptized),
                            seoulParenPlain('전입교우 돌봄', a.transferIn),
                            seoulParenPlain('냉담 교우 돌봄', a.coldCare),
                            seoulParenPlain('조당(혼인장애)자 안내', a.marriageGuide),
                            seoulParenPlain('성사 권면', a.sacramentInvite),
                            seoulParenPlain('유아 세례 권면', a.infantBaptism),
                            seoulParenPlain('첫 영성체', a.firstCommunion),
                            seoulParenPlain('교우 가정 방문', a.homeVisit),
                            seoulParenPlain('미사/십자가의 길/성체강복 참례권유', a.massWayBlessInvite),
                            seoulParenPlain('피정/특강 참석권유', a.retreatLectureInvite)
                        ])}
                    </tr>
                    <tr>
                        <td>${blank('어려움 겪는 분 돌봄', 'w10')}</td>
                        <td>${blank(a.hardshipCount, 'w4')}</td>
                        ${seoulActContentCell([
                            seoulParenPlain('교우 환자 방문', a.believerSick),
                            seoulParenPlain('외인 환자 방문', a.nonbelieverSick),
                            seoulParenPlain('다문화 가정 돌봄', a.multicultural),
                            seoulParenPlain('외인 상가 돌봄', a.nonbelieverFuneral),
                            seoulParenPlain('교우 상가 돌봄', a.believerFuneral),
                            seoulParenPlain('위령기도[연도]', a.yeondo),
                            seoulParenPlain('장례미사', a.funeralMass),
                            seoulParenPlain('추모미사', a.memorialMass),
                            seoulParenPlain('입출관', a.coffin),
                            seoulParenPlain('장지수행', a.burial),
                            seoulParenPlain('사도예절', a.apostleRite)
                        ])}
                    </tr>
                    <tr>
                        <td>${blank('레지오 확장', 'w10')}</td>
                        <td>${blank(a.expansionCount, 'w4')}</td>
                        ${seoulActContentCell([
                            seoulParenPlain('행동단원 모집', a.activeRecruit),
                            seoulParenPlain('협조단원 모집 및 돌봄', a.auxRecruit),
                            seoulParenPlain('소년 레지오 지도', a.juniorLegion)
                        ])}
                    </tr>
                    <tr>
                        <td>${blank('특별 활동', 'w10')}</td>
                        <td>${blank(a.specialCount, 'w4')}</td>
                        ${seoulActContentCell([
                            seoulParenPlain('재해 및 사고 피해자 돌봄', a.disaster),
                            seoulParenPlain('복지시설 노력 봉사', a.welfare),
                            seoulParenPlain('병원방문 활동', a.hospital)
                        ])}
                    </tr>
                    <tr>
                        <td>${blank('본당 협조', 'w10')}</td>
                        <td>${blank(a.parishCount, 'w4')}</td>
                        ${seoulActContentCell([
                            seoulParenPlain('행사 준비 및 협조', a.eventHelp),
                            seoulParenPlain('주일학교 돌봄', a.sundaySchool),
                            seoulParenPlain('청소 미화', a.cleaning),
                            seoulParenPlain('미사안내 봉사', a.massGuide),
                            seoulParenPlain('호구조사(호별방문)', a.householdSurvey),
                            seoulParenPlain('기타 본당 협조', a.parishOther)
                        ])}
                    </tr>
                    <tr>
                        <td>${blank('소공동체 활동(본당과 직장)', 'w10')}</td>
                        <td>${blank(a.smallCount, 'w4')}</td>
                        ${seoulActContentCell([
                            seoulParenPlain('소공동체 모임 참석', a.smallMeet),
                            seoulParenPlain('구역·반장교육 참석', a.zoneEdu),
                            seoulParenPlain('반모임 참석 권유', a.banInvite),
                            seoulParenPlain('기타', a.smallOther)
                        ])}
                    </tr>
                    <tr>
                        <td>${blank('가정성화 활동(가족 단위)', 'w10')}</td>
                        <td>${blank(a.familyCount, 'w4')}</td>
                        ${seoulActContentCell([
                            seoulParenPlain('가족이 함께 기도하기', a.familyPray),
                            seoulParenPlain('성경 봉독 및 묵상', a.familyBible),
                            seoulParenPlain('미사참례', a.familyMass),
                            seoulParenPlain('복지시설 봉사', a.familyWelfare)
                        ])}
                    </tr>
                    <tr>
                        <td>${blank('기타 활동', 'w10')}</td>
                        <td>${blank(a.otherCount, 'w4')}</td>
                        ${seoulActContentCell([
                            seoulParenPlain('자연보호 활동', a.nature),
                            seoulParenPlain('출판물 보급', a.publication),
                            seoulParenPlain('차량봉사및협조', a.vehicleCoop),
                            `기도및 신심행위: ${[
                                seoulParenPlain('묵주기도', a.rosary),
                                seoulParenPlain('평일미사참례', a.weekdayMass),
                                seoulParenPlain('성경읽기쓰기', a.bibleReadWrite),
                                seoulParenPlain('매일미사읽고묵상하기', a.dailyMassMeditate)
                            ].join(', ')}`,
                            `사랑의 증언활동: ${[
                                seoulParenPlain('복지시설', a.loveWelfare),
                                seoulParenPlain('병원,요양원', a.loveHospital),
                                seoulParenPlain('기타', a.loveOther)
                            ].join(', ')}`
                        ])}
                    </tr>
                </tbody>
            </table>
            </div>

            <div class="biz-sec-title">쁘레시디움 운영 상황</div>
            <div class="seoul-ops-label">어려운 상황을 극복한 내용과 자랑하고 싶은 내용</div>
            ${lineBoxHtml('', '120px')}
            <div class="seoul-ops-label">운영상 애로 사항</div>
            ${lineBoxHtml('', '72px')}
        `;
    }

    function formatEduText(eduEvents) {
        return (eduEvents || []).map((ev) => {
            const parts = [
                String(ev.kind || '').trim(),
                String(ev.title || '').trim(),
                String(ev.datetime || ev.date || '').trim(),
                String(ev.place || '').trim(),
                String(ev.attendance || ev.attendees || '').trim(),
                String(ev.content || '').trim()
            ].filter(Boolean);
            return parts.join(' / ');
        }).filter(Boolean).join('\n');
    }

    function legionEventRowHtml(def, events) {
        const ev = matchEvent(events, def.labels);
        return `<tr>
            <td class="left">${blank(def.title, 'w10')}</td>
            <td>${blank(ev ? String(ev.organizer || '').trim() : '', 'w6')}</td>
            <td>${blank(ev ? String(ev.datetime || ev.date || '').trim() : '', 'w6')}</td>
            <td>${blank(ev ? String(ev.place || '').trim() : '', 'w6')}</td>
            <td>${blank(ev ? String(ev.attendance || ev.attendees || '').trim() : '', 'w4')} / ${blank('', 'w3')}</td>
        </tr>`;
    }

    async function withFrozenBlanks(formEl, work) {
        const restore = freezeBlankInputsForExport(formEl);
        try {
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            return await work();
        } finally {
            restore();
        }
    }

    function n(value) {
        if (value === null || value === undefined || value === '') return '';
        const num = Number(value);
        if (Number.isNaN(num)) return String(value);
        return String(num);
    }

    function parseYmd(dateStr) {
        const m = String(dateStr || '').match(/(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return null;
        return { y: m[1], m: m[2], d: m[3], year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10) };
    }

    function matchEvent(events, labels) {
        if (!Array.isArray(events) || !events.length) return null;
        const lowerLabels = labels.map((l) => l.toLowerCase());
        const matches = events.filter((ev) => {
            const title = String(ev.title || ev.content || '').toLowerCase();
            const content = String(ev.content || '').toLowerCase();
            return lowerLabels.some((lb) => title.includes(lb.toLowerCase()) || content.includes(lb.toLowerCase()));
        });
        if (!matches.length) return null;
        // 참석인원 있는 기록을 우선 (꾸리아 등 상위 주관 참석 포함)
        return matches.find((ev) => String(ev.attendance || ev.attendees || '').trim()) || matches[0];
    }

    function eventDateAtt(ev) {
        if (!ev) return { date: '', attendance: '' };
        return {
            date: String(ev.datetime || ev.date || '').trim(),
            attendance: String(ev.attendance || ev.attendees || '').trim()
        };
    }

    function isHigherOrgLabel(text) {
        return /^(꾸리아|꼬미시움|레지아|본당)(\s*[:：]|$)/i.test(String(text || '').trim());
    }

    function formatEventRowLabel(defTitle, ev) {
        const parts = [defTitle];
        const org = String(ev?.organizer || '').trim();
        if (org && (isHigherOrgLabel(org) || !/^Pr\s*[:：]/i.test(org))) {
            parts.push(`(주관:${org})`);
        }
        return parts.join(' ');
    }

    function parseEventNoteLines(note, fallbackType) {
        const text = note != null ? String(note).trim() : '';
        if (!text) return [];

        const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        let startIdx = 0;
        if (lines.length && !/^\d+\.\s*/.test(lines[0])) {
            startIdx = 1; // 헤더(교육/피정및연수/Pr:…)
        }

        const rows = [];
        for (let i = startIdx; i < lines.length; i += 1) {
            const line = lines[i].replace(/^\d+\.\s*/, '');
            const parts = line.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
            const row = {
                kind: '',
                title: '',
                host: '',
                date: '',
                place: '',
                content: '',
                attendees: ''
            };
            parts.forEach((part, idx) => {
                if (part.startsWith('구분:')) row.kind = part.slice(3).trim();
                else if (part.startsWith('제목:')) {
                    const t = part.slice(3).trim();
                    row.title = (t === '(제목없음)' || t === '(명칭없음)') ? '' : t;
                }
                else if (part.startsWith('주관:')) row.host = part.slice(3).trim();
                else if (part.startsWith('일자:')) row.date = part.slice(3).trim();
                else if (part.startsWith('장소:')) row.place = part.slice(3).trim();
                else if (part.startsWith('내용:')) row.content = part.slice(3).trim();
                else if (part.startsWith('참석:')) row.attendees = part.slice(3).trim();
                else if (idx === 0 || (idx === 1 && !row.title && !row.kind)) {
                    const raw = (part === '(명칭없음)' || part === '(제목없음)') ? '' : part;
                    if (!row.kind && /^(실시|계획)$/.test(raw)) row.kind = raw;
                    else if (!row.title) row.title = raw;
                } else if (!row.content) {
                    row.content = part;
                }
            });
            if (row.kind || row.title || row.date || row.place || row.content || row.attendees) {
                rows.push(row);
            }
        }

        if (!rows.length && text) {
            rows.push({
                kind: '',
                title: fallbackType || '',
                host: '',
                date: '',
                place: '',
                content: text,
                attendees: ''
            });
        }
        return rows;
    }

    function educationEventKey(ev) {
        const title = String(ev.title || '').trim();
        const content = String(ev.content || '').trim();
        return [
            String(ev.event_type || ''),
            title || content,
            String(ev.datetime || ev.date || ''),
            String(ev.place || ''),
            String(ev.organizer || ev.host || ''),
            String(ev.attendance || ev.attendees || ''),
            content && content !== title ? content : ''
        ].join('|');
    }

    function mergeEducationEvents(primary, secondary) {
        const map = new Map();
        [...(primary || []), ...(secondary || [])].forEach((ev) => {
            if (!ev) return;
            const key = educationEventKey(ev);
            if (!map.has(key)) map.set(key, ev);
        });
        return Array.from(map.values());
    }

    /** Pr 소속 회원의 교육·피정 활동을 활동요약 API에서 직접 수집 */
    async function fetchPrEducationFromSummary(churchName, prName, startDate, endDate) {
        const qs = new URLSearchParams({
            start_date: startDate,
            end_date: endDate,
            church_name: churchName,
            pr_name: prName
        });
        const res = await fetch(`/api/activities/summary?${qs.toString()}`);
        if (!res.ok) return [];
        const data = await res.json();
        if (!Array.isArray(data)) return [];

        const out = [];
        data.forEach((record) => {
            const category = String(record.category_name || '');
            let eventType = '';
            if (category === '메모및 행사-교육' || category.endsWith('-교육')) eventType = '교육';
            else if (category === '메모및 행사-피정및연수' || category.includes('피정및연수')) eventType = '피정및연수';
            else return;

            const activityDate = String(record.activity_date || '').slice(0, 10);
            const noteRows = parseEventNoteLines(record.note, eventType);
            if (!noteRows.length) {
                out.push({
                    kind: '',
                    title: eventType,
                    organizer: '',
                    datetime: activityDate,
                    place: '',
                    attendance: Number(record.count) > 0 ? String(record.count) : '',
                    content: '',
                    event_type: eventType
                });
                return;
            }
            noteRows.forEach((row) => {
                const kind = String(row.kind || '').trim();
                out.push({
                    kind,
                    title: row.title || eventType,
                    organizer: row.host || '',
                    datetime: row.date || activityDate,
                    place: row.place || '',
                    attendance: row.attendees
                        || (Number(record.count) > 0 ? String(record.count) : '')
                        || (kind === '계획' ? '0' : ''),
                    content: row.content || '',
                    event_type: eventType
                });
            });
        });
        return out;
    }

    function officerName(officers, role) {
        const list = officers || [];
        const found = list.find((o) => String(o.role || '') === role);
        if (!found) return '';
        const name = String(found.name || '').trim();
        const baptism = String(found.baptism_name || '').trim();
        if (name && baptism) return `${name}(${baptism})`;
        return name || baptism;
    }

    function memVal(bucket, key) {
        if (!bucket) return '';
        const v = bucket[key];
        if (v === null || v === undefined || v === '') return '';
        return n(v);
    }

    /** 단원수 표: 행=유형, 열=전차/현재/증감 — 빈칸은 편집 가능 */
    function membershipRowHtml(label, prev, curr, inc, dec, keys) {
        const pM = memVal(prev, keys.m);
        const pF = memVal(prev, keys.f);
        const pT = memVal(prev, keys.t);
        const cM = memVal(curr, keys.m);
        const cF = memVal(curr, keys.f);
        const cT = memVal(curr, keys.t);
        const iT = memVal(inc, keys.t);
        const dT = memVal(dec, keys.t);
        let delta = '';
        if (iT !== '' || dT !== '') {
            const iv = Number(iT) || 0;
            const dv = Number(dT) || 0;
            delta = String(iv - dv);
        }
        return `<tr>
            <td class="row-label">${escapeHtml(label)}</td>
            <td>${blank(pM, 'w3')}</td><td>${blank(pF, 'w3')}</td><td>${blank(pT, 'w3')}</td>
            <td>${blank(cM, 'w3')}</td><td>${blank(cF, 'w3')}</td><td>${blank(cT, 'w3')}</td>
            <td>${blank(iT, 'w3')}</td><td>${blank(dT, 'w3')}</td><td>${blank(delta, 'w3')}</td>
        </tr>`;
    }

    function membershipTotalOnlyRow(label, prev, curr, inc, dec, key) {
        const iRaw = memVal(inc, key);
        const dRaw = memVal(dec, key);
        let delta = '';
        if (iRaw !== '' || dRaw !== '') {
            delta = String((Number(iRaw) || 0) - (Number(dRaw) || 0));
        }
        return `<tr>
            <td class="row-label">${escapeHtml(label)}</td>
            <td>${blank('', 'w3')}</td><td>${blank('', 'w3')}</td><td>${blank(memVal(prev, key), 'w3')}</td>
            <td>${blank('', 'w3')}</td><td>${blank('', 'w3')}</td><td>${blank(memVal(curr, key), 'w3')}</td>
            <td>${blank(iRaw, 'w3')}</td><td>${blank(dRaw, 'w3')}</td>
            <td>${blank(delta, 'w3')}</td>
        </tr>`;
    }

    function ensureStyles() {
        let style = document.getElementById('pr-business-report-styles');
        if (!style) {
            style = document.createElement('style');
            style.id = 'pr-business-report-styles';
            document.head.appendChild(style);
        }
        style.textContent = `
            .pr-biz-form {
                border: 1px solid #222;
                padding: 14px 12px 18px;
                background: #fff;
                color: #111;
                font-size: 12px;
                line-height: 1.4;
                margin-bottom: 8px;
                max-width: 100%;
                box-sizing: border-box;
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
            }
            .pr-biz-form .biz-head {
                display: grid;
                grid-template-columns: 56px 1fr auto;
                gap: 8px;
                align-items: start;
                margin-bottom: 10px;
            }
            .pr-biz-form .biz-logo {
                width: 52px;
                height: 52px;
                border: 1px solid #999;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 9px;
                text-align: center;
                color: #555;
                line-height: 1.15;
            }
            .pr-biz-form .biz-titles { text-align: center; padding-top: 2px; }
            .pr-biz-form .biz-titles .org { font-size: 12px; font-weight: 700; }
            .pr-biz-form .biz-titles .doc-title { font-size: 12px; font-weight: 700; margin-top: 4px; }
            .pr-biz-form .biz-submit { font-size: 11px; text-align: right; white-space: nowrap; }
            .pr-biz-form .biz-affil { text-align: center; margin: 4px 0 10px; font-size: 12px; }
            .pr-biz-form .blank {
                display: inline-block;
                min-width: 2em;
                border-bottom: 1px solid #333;
                text-align: center;
                padding: 0 3px;
                min-height: 1.1em;
            }
            .pr-biz-form .blank.w2 { min-width: 1.6em; }
            .pr-biz-form .blank.w3 { min-width: 2.4em; }
            .pr-biz-form .blank.w4 { min-width: 3.2em; }
            .pr-biz-form .blank.w6 { min-width: 4.5em; }
            .pr-biz-form .blank.w8 { min-width: 6em; }
            .pr-biz-form .blank.w12 { min-width: 9em; }
            .pr-biz-form .blank.w20 { min-width: 14em; }
            @keyframes pr-biz-blank-blink {
                0%, 100% { border-bottom-color: #dc2626; box-shadow: 0 2px 0 rgba(220, 38, 38, 0.55); }
                50% { border-bottom-color: #fca5a5; box-shadow: 0 2px 0 rgba(252, 165, 165, 0.35); }
            }
            .pr-biz-form input.blank.blank-editable {
                border: none;
                border-bottom: 2px solid #dc2626;
                border-radius: 0;
                background: rgba(220, 38, 38, 0.06);
                color: #7f1d1d;
                font: inherit;
                font-size: inherit !important;
                line-height: 1.3;
                padding: 1px 2px;
                margin: 0 1px;
                min-height: 1.25em !important;
                height: auto !important;
                min-width: 2mm !important;
                width: 2mm;
                max-width: 100%;
                box-sizing: border-box;
                animation: pr-biz-blank-blink 1.1s ease-in-out infinite;
                field-sizing: content;
            }
            .pr-biz-form input.blank.w2.blank-editable,
            .pr-biz-form input.blank.w3.blank-editable,
            .pr-biz-form input.blank.w4.blank-editable,
            .pr-biz-form input.blank.w6.blank-editable,
            .pr-biz-form input.blank.w8.blank-editable,
            .pr-biz-form input.blank.w12.blank-editable,
            .pr-biz-form input.blank.w20.blank-editable {
                min-width: 2mm !important;
            }
            .pr-biz-form input.blank.blank-editable:placeholder-shown {
                animation: pr-biz-blank-blink 1.1s ease-in-out infinite;
            }
            /* DB·기입된 값: 파란색 / 빈칸: 위 빨간색 깜빡임 */
            .pr-biz-form input.blank.blank-editable:not(:placeholder-shown),
            .pr-biz-form input.blank.blank-editable.has-value {
                animation: none;
                border-bottom-color: #2563eb;
                background: rgba(37, 99, 235, 0.06);
                color: #1d4ed8;
            }
            .pr-biz-form input.blank.blank-editable:focus {
                outline: none;
                animation: none;
                border-bottom-color: #2563eb;
                background: rgba(37, 99, 235, 0.1);
                color: #1d4ed8;
            }
            .pr-biz-form .blank.blank-print {
                display: inline-block;
                min-width: 2em;
                border-bottom: 1px solid #333;
                text-align: center;
                padding: 0 3px;
                min-height: 1.1em;
            }
            .pr-biz-form table.biz-table {
                width: 100%;
                border-collapse: collapse;
                margin: 0 0 10px;
                font-size: 12px;
                table-layout: fixed;
                box-sizing: border-box;
            }
            .pr-biz-form table.biz-table th,
            .pr-biz-form table.biz-table td {
                border: 1px solid #333;
                padding: 4px 5px;
                text-align: center;
                vertical-align: middle;
                word-break: keep-all;
                overflow-wrap: anywhere;
            }
            .pr-biz-form table.biz-table th { background: #f3f4f6; font-weight: 600; }
            .pr-biz-form table.biz-table td.left,
            .pr-biz-form table.biz-table .row-label {
                text-align: left;
                white-space: normal;
            }
            .pr-biz-form .biz-sec-title {
                font-weight: 700;
                font-size: 12px;
                margin: 8px 0 4px;
            }
            .pr-biz-form.pr-biz-seoul .seoul-act-hint {
                font-size: 11px;
                color: #444;
                margin: 0 0 8px;
                line-height: 1.45;
            }
            .pr-biz-form.pr-biz-seoul table.seoul-act-table td.left {
                font-size: 11px;
                line-height: 1.55;
            }
            .pr-biz-form.pr-biz-seoul table.seoul-act-table .seoul-act-content .line-box {
                border: 1px solid #cbd5e1;
                min-height: 32px;
                padding: 4px 6px;
                margin: 0;
                background: #fff;
                font-size: 11px;
                line-height: 1.4;
            }
            .pr-biz-form.pr-biz-seoul .seoul-ops-label {
                font-weight: 600;
                margin: 8px 0 4px;
                font-size: 12px;
            }
            .pr-biz-form.pr-biz-seoul table.seoul-officer-table {
                table-layout: fixed;
                width: 100%;
                min-width: 640px;
            }
            .pr-biz-form.pr-biz-seoul table.seoul-officer-table th,
            .pr-biz-form.pr-biz-seoul table.seoul-officer-table td {
                text-align: center;
                vertical-align: middle;
                padding: 5px 3px;
                font-size: 11px;
            }
            .pr-biz-form.pr-biz-seoul table.seoul-officer-table .row-label {
                text-align: center;
                font-weight: 600;
                white-space: nowrap;
                width: 7.2em;
            }
            .pr-biz-form.pr-biz-seoul table.seoul-officer-table .seoul-member-att-head {
                letter-spacing: 0.15em;
                font-weight: 700;
                width: 3.2em;
                white-space: normal;
                line-height: 1.25;
            }
            .pr-biz-form.pr-biz-seoul table.seoul-officer-table .seoul-diag {
                position: relative;
                width: 5.2em;
                min-width: 5.2em;
                height: 2.8em;
                padding: 0;
                background:
                    linear-gradient(
                        to top right,
                        transparent calc(50% - 0.6px),
                        #333 50%,
                        transparent calc(50% + 0.6px)
                    );
            }
            .pr-biz-form.pr-biz-seoul table.seoul-officer-table .seoul-diag .diag-tr {
                position: absolute;
                top: 3px;
                right: 5px;
                font-size: 10px;
                font-weight: 700;
            }
            .pr-biz-form.pr-biz-seoul table.seoul-officer-table .seoul-diag .diag-bl {
                position: absolute;
                bottom: 3px;
                left: 5px;
                font-size: 10px;
                font-weight: 700;
            }
            .pr-biz-form.pr-biz-seoul table.seoul-officer-table .slash-cell,
            .pr-biz-form.pr-biz-seoul table.seoul-officer-table .seoul-member-att-cell {
                font-size: 15px;
                font-weight: 600;
                line-height: 1;
            }
            .pr-biz-form.pr-biz-seoul table.seoul-officer-table .seoul-member-att-cell {
                font-size: 18px;
            }
            .pr-biz-form .biz-scroll {
                width: 100%;
                max-width: 100%;
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
                margin-bottom: 10px;
            }
            .pr-biz-form .biz-scroll table.biz-table {
                table-layout: auto;
                min-width: 560px;
            }
            .pr-biz-form .biz-two-col {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 0;
                border: 1px solid #333;
                margin-bottom: 10px;
                max-width: 100%;
                box-sizing: border-box;
            }
            .pr-biz-form .biz-two-col > div { min-width: 0; overflow: hidden; }
            .pr-biz-form .biz-two-col > div:first-child { border-right: 1px solid #333; }
            .pr-biz-form .biz-two-col table {
                margin: 0;
                border: none;
                width: 100%;
                table-layout: fixed;
            }
            .pr-biz-form .biz-two-col table th,
            .pr-biz-form .biz-two-col table td { border-color: #333; }
            /* 행사 / 일자 / 참석 3열 비율 고정 — 참석열 잘림 방지 */
            .pr-biz-form .biz-two-col table th:nth-child(1),
            .pr-biz-form .biz-two-col table td:nth-child(1) { width: 46%; }
            .pr-biz-form .biz-two-col table th:nth-child(2),
            .pr-biz-form .biz-two-col table td:nth-child(2) { width: 36%; }
            .pr-biz-form .biz-two-col table th:nth-child(3),
            .pr-biz-form .biz-two-col table td:nth-child(3) { width: 18%; min-width: 2.5em; }
            .pr-biz-form .finance-grid {
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                border: 1px solid #333;
                margin-bottom: 10px;
                max-width: 100%;
            }
            .pr-biz-form .finance-grid > div { border-right: 1px solid #333; min-width: 0; }
            .pr-biz-form .finance-grid > div:last-child { border-right: none; }
            .pr-biz-form .finance-grid h4 {
                margin: 0;
                padding: 4px;
                text-align: center;
                border-bottom: 1px solid #333;
                background: #f3f4f6;
                font-size: 12px;
            }
            .pr-biz-form .finance-grid table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 0; table-layout: fixed; }
            .pr-biz-form .finance-grid td { border-bottom: 1px solid #ddd; padding: 4px 6px; word-break: keep-all; overflow-wrap: anywhere; }
            .pr-biz-form .finance-grid tr:last-child td { border-bottom: none; }
            .pr-biz-form .finance-balance {
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                gap: 8px;
                padding: 12px 8px;
                font-weight: 700;
                min-width: 0;
                width: 100%;
                box-sizing: border-box;
            }
            .pr-biz-form .finance-balance .blank-editable {
                min-width: 4.5em;
            }
            .pr-biz-form .biz-note { font-size: 12px; color: #666; margin-top: 4px; line-height: 1.45; }
            .pr-biz-form.pr-biz-pdf-export .biz-note { display: none !important; }
            @media (max-width: 720px) {
                .pr-biz-form {
                    padding: 10px 8px 14px;
                    overflow-x: visible;
                    font-size: 11px;
                }
                .pr-biz-form .biz-titles .org,
                .pr-biz-form .biz-titles .doc-title { font-size: 11px; }
                .pr-biz-form .biz-affil { font-size: 11px; }
                .pr-biz-form .biz-two-col,
                .pr-biz-form .finance-grid { grid-template-columns: 1fr; }
                .pr-biz-form .biz-two-col > div:first-child,
                .pr-biz-form .finance-grid > div { border-right: none; border-bottom: 1px solid #333; }
                .pr-biz-form .biz-two-col > div:last-child,
                .pr-biz-form .finance-grid > div:last-child { border-bottom: none; }
                .pr-biz-form .biz-head { grid-template-columns: 48px 1fr; }
                .pr-biz-form .biz-submit { grid-column: 1 / -1; text-align: left; white-space: normal; font-size: 10px; }
                .pr-biz-form .biz-two-col table th:nth-child(1),
                .pr-biz-form .biz-two-col table td:nth-child(1) { width: 42%; }
                .pr-biz-form .biz-two-col table th:nth-child(2),
                .pr-biz-form .biz-two-col table td:nth-child(2) { width: 40%; }
                .pr-biz-form .biz-two-col table th:nth-child(3),
                .pr-biz-form .biz-two-col table td:nth-child(3) { width: 18%; min-width: 2.8em; }
                .pr-biz-form table.biz-table { font-size: 10px; }
                .pr-biz-form table.biz-table th,
                .pr-biz-form table.biz-table td { padding: 3px 3px; }
                .pr-biz-form .biz-scroll table.biz-table { min-width: 480px; }
                .pr-biz-form .biz-sec-title { font-size: 11px; margin: 6px 0 3px; }
                .pr-biz-form .finance-grid h4 { font-size: 11px; padding: 5px 4px; }
                .pr-biz-form .finance-grid table { font-size: 10px; }
                .pr-biz-form .finance-grid td { padding: 3px 4px; }
                .pr-biz-form .finance-balance { font-size: 10px; padding: 5px 8px; }
                .pr-biz-form .line-box { min-height: 40px; padding: 5px 6px; }
                .pr-biz-form.pr-biz-daegu .daegu-act-ex,
                .pr-biz-form.pr-biz-gwangju .daegu-act-ex { font-size: 10px; }
                .pr-biz-form.pr-biz-daegu .daegu-model-title { font-size: 13px; }
                .pr-biz-form.pr-biz-daegu .daegu-act-block { padding: 6px 8px; margin-bottom: 6px; }
                .pr-biz-form.pr-biz-daegu .daegu-act-result { font-size: 10px; word-break: break-word; }
                .pr-biz-form.pr-biz-daegu .biz-scroll table.biz-table { min-width: 680px; }
                .pr-biz-form.pr-biz-gwangju .biz-scroll table.biz-table { min-width: 680px; }
                .pr-biz-form.pr-biz-gwangju .biz-scroll table.gj-act-table { min-width: 720px; }
                .pr-biz-form.pr-biz-gwangju .gj-act-table td.left { font-size: 10px; }
                .pr-biz-form.pr-biz-gwangju .gj-special-title { font-size: 12px; }
                .pr-biz-form.pr-biz-seoul .seoul-act-hint { font-size: 10px; }
                .pr-biz-form.pr-biz-seoul table.seoul-act-table td.left { font-size: 10px; }
                .pr-biz-form .blank.w8,
                .pr-biz-form .blank.w12 { min-width: 4em; max-width: 100%; }
            }
            .pr-biz-form.pr-biz-daegu .line-box,
            .pr-biz-form.pr-biz-gwangju .line-box,
            .pr-biz-form.pr-biz-seoul .line-box {
                border: 1px solid #333;
                min-height: 48px;
                padding: 6px 8px;
                margin-top: 4px;
                background: #fff;
            }
            .pr-biz-form.pr-biz-daegu .line-box.blank-editable,
            .pr-biz-form.pr-biz-gwangju .line-box.blank-editable,
            .pr-biz-form.pr-biz-seoul .line-box.blank-editable {
                animation: pr-biz-blank-blink 1.1s ease-in-out infinite;
                border-color: #dc2626;
                background: rgba(220, 38, 38, 0.04);
                color: #7f1d1d;
                outline: none;
            }
            .pr-biz-form.pr-biz-daegu .line-box.blank-editable.has-value,
            .pr-biz-form.pr-biz-daegu .line-box.blank-editable:focus,
            .pr-biz-form.pr-biz-gwangju .line-box.blank-editable.has-value,
            .pr-biz-form.pr-biz-gwangju .line-box.blank-editable:focus,
            .pr-biz-form.pr-biz-seoul .line-box.blank-editable.has-value,
            .pr-biz-form.pr-biz-seoul .line-box.blank-editable:focus {
                animation: none;
                border-color: #2563eb;
                background: rgba(37, 99, 235, 0.06);
                color: #1d4ed8;
            }
            .pr-biz-form.pr-biz-daegu .line-box.blank-editable:empty::before,
            .pr-biz-form.pr-biz-gwangju .line-box.blank-editable:empty::before,
            .pr-biz-form.pr-biz-seoul .line-box.blank-editable:empty::before {
                content: attr(data-placeholder);
                color: #b91c1c;
                opacity: 0.7;
            }
            .pr-biz-form.pr-biz-daegu .daegu-page-break,
            .pr-biz-form.pr-biz-gwangju .daegu-page-break {
                page-break-before: always;
                break-before: page;
                margin-top: 18px;
                padding-top: 10px;
                border-top: 1px dashed #999;
            }
            .pr-biz-form.pr-biz-daegu .daegu-act-block {
                border: 1px solid #333;
                padding: 8px 10px;
                margin-bottom: 8px;
            }
            .pr-biz-form.pr-biz-daegu .daegu-act-title {
                font-weight: 700;
                margin-bottom: 4px;
            }
            .pr-biz-form.pr-biz-daegu .daegu-act-ex {
                font-size: 11px;
                line-height: 1.45;
                color: #333;
                margin-bottom: 6px;
            }
            .pr-biz-form.pr-biz-daegu .daegu-act-ex .line-box {
                margin-top: 4px;
                font-size: 11px;
                line-height: 1.45;
            }
            .pr-biz-form.pr-biz-daegu .daegu-act-count,
            .pr-biz-form.pr-biz-daegu .daegu-act-result {
                margin-top: 4px;
                line-height: 1.55;
            }
            .pr-biz-form.pr-biz-daegu .daegu-model-title {
                text-align: center;
                font-size: 16px;
                font-weight: 700;
                margin: 8px 0 4px;
            }
            .pr-biz-form.pr-biz-daegu .daegu-model-guide {
                font-size: 11px;
                color: #444;
                margin-bottom: 8px;
                line-height: 1.5;
            }
            .pr-biz-form.pr-biz-daegu .daegu-sign {
                margin-top: 16px;
                text-align: right;
            }
            .pr-biz-form.pr-biz-daegu .affil-flags {
                text-align: center;
                margin: 2px 0 8px;
                font-size: 12px;
            }
            .pr-biz-form.pr-biz-gwangju .gj-act-table td.left {
                text-align: left;
                font-size: 11px;
                line-height: 1.45;
            }
            .pr-biz-form.pr-biz-gwangju .gj-act-table .line-box {
                margin: 0;
                font-size: 11px;
                line-height: 1.45;
                min-height: 2.2em;
            }
            .pr-biz-form.pr-biz-gwangju .gj-act-table .gj-cat {
                font-weight: 700;
                white-space: nowrap;
                width: 12%;
            }
            .pr-biz-form.pr-biz-gwangju .gj-act-table .gj-count {
                width: 10%;
                vertical-align: middle;
            }
            .pr-biz-form.pr-biz-gwangju .gj-act-table.jeju-act-table th,
            .pr-biz-form.pr-biz-gwangju .gj-act-table.jeju-act-table td {
                font-size: 11px;
                vertical-align: top;
            }
            .pr-biz-form.pr-biz-gwangju .gj-act-table.jeju-act-table .gj-cat {
                writing-mode: horizontal-tb;
                text-align: center;
                vertical-align: middle;
                font-weight: 700;
                width: 9%;
            }
            .pr-biz-form.pr-biz-gwangju .gj-act-table.jeju-act-table .gj-act-split {
                width: 6%;
                max-width: 3.2em;
                text-align: center;
                vertical-align: middle;
                white-space: nowrap;
                padding-left: 2px;
                padding-right: 2px;
            }
            .pr-biz-form.pr-biz-gwangju .gj-act-table.jeju-act-table .gj-act-split .blank {
                min-width: 1.6em;
                max-width: 2.4em;
            }
            .pr-biz-form.pr-biz-gwangju .gj-act-table.jeju-act-table .gj-cases {
                text-align: left;
                line-height: 1.55;
                width: 54%;
            }
            .pr-biz-form.pr-biz-gwangju .gj-act-table.jeju-act-table .gj-result {
                text-align: left;
                line-height: 1.55;
                width: 25%;
            }
            .pr-biz-form.pr-biz-gwangju .gj-special-title {
                font-weight: 700;
                margin-bottom: 6px;
            }
            .pr-biz-form.pr-biz-gwangju .gj-special-guide {
                font-size: 11px;
                color: #444;
                margin-top: 10px;
                line-height: 1.5;
            }
            .pr-biz-form.pr-biz-busan .busan-act-table th,
            .pr-biz-form.pr-biz-busan .busan-act-table td {
                font-size: 10px;
                padding: 3px 4px;
                vertical-align: middle;
            }
            .pr-biz-form.pr-biz-busan .busan-act-table .gj-cat {
                width: 12%;
                text-align: center;
                font-weight: 700;
                vertical-align: middle;
            }
            .pr-biz-form.pr-biz-busan .busan-act-table .bs-act-content {
                width: 52%;
                text-align: left;
                line-height: 1.45;
            }
            .pr-biz-form.pr-biz-busan .busan-act-table .bs-count {
                width: 10%;
                text-align: center;
            }
            .pr-biz-form.pr-biz-busan .busan-act-table .gj-result {
                width: 26%;
                text-align: left;
                line-height: 1.5;
                vertical-align: middle;
            }
            .pr-biz-form.pr-biz-busan .bs-grid-table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 4px;
            }
            .pr-biz-form.pr-biz-busan .bs-grid-cell {
                border: 1px solid #333;
                padding: 6px 8px;
                text-align: center;
                width: 33.33%;
                vertical-align: middle;
            }
            .pr-biz-form.pr-biz-busan .bs-grid-label {
                font-weight: 700;
                margin-bottom: 4px;
                font-size: 11px;
            }
            .pr-biz-form.pr-biz-busan .bs-grid-val {
                font-size: 11px;
            }
            .pr-biz-form.pr-biz-busan .bs-focus-table {
                width: 100%;
                border-collapse: collapse;
            }
            .pr-biz-form.pr-biz-busan .bs-focus-label {
                width: 8%;
                border: 1px solid #333;
                text-align: center;
                font-weight: 700;
                vertical-align: middle;
                writing-mode: vertical-rl;
                letter-spacing: 2px;
                padding: 8px 4px;
            }
            .pr-biz-form.pr-biz-busan .bs-focus-body,
            .pr-biz-form.pr-biz-busan .bs-focus-plan {
                border: 1px solid #333;
                padding: 8px 10px;
                vertical-align: top;
            }
            .pr-biz-form.pr-biz-busan .bs-focus-hint {
                color: #b91c1c;
                font-size: 11px;
                line-height: 1.5;
                margin-bottom: 6px;
            }
            .pr-biz-form.pr-biz-busan .bs-focus-plan {
                border-top: none;
            }
            .pr-biz-form.pr-biz-masan .masan-spirit-table th,
            .pr-biz-form.pr-biz-masan .masan-spirit-table td {
                border: 1px solid #333;
                padding: 5px 8px;
                font-size: 11px;
                vertical-align: middle;
            }
            .pr-biz-form.pr-biz-masan .masan-spirit-label {
                width: 6%;
                text-align: center;
                font-weight: 700;
                line-height: 1.5;
                vertical-align: middle;
            }
            .pr-biz-form.pr-biz-masan .masan-spirit-table th {
                width: 18%;
                font-weight: 700;
                text-align: center;
            }
            .pr-biz-form.pr-biz-masan .masan-spirit-table td:nth-child(3) {
                width: 12%;
                text-align: center;
            }
            .pr-biz-form.pr-biz-masan .masan-spirit-table td.left {
                text-align: left;
            }
        `;
    }

    /** 대구 세나뚜스 Pr 사업보고서 양식 */
    function buildDaeguBusinessFormHtml(model) {
        const m = model || {};
        const officers = m.officers || [];
        const mem = m.membership || {};
        const prev = mem.previous || {};
        const curr = mem.current || {};
        const att = m.attendance || {};
        const meeting = m.meeting || {};
        const fin = m.finance || {};
        const start = parseYmd(m.start_date);
        const end = parseYmd(m.end_date);
        const today = parseYmd(m.submit_date) || parseYmd(new Date().toISOString().slice(0, 10));
        const events = m.events || [];
        const a = computeDaeguActivityCounts(m.activity_totals || []);
        const eduText = formatEduText(m.education_events || []);
        const requiemEv = matchEvent(events, ['위령미사', '위령성월']);
        const otherEventText = requiemEv
            ? [
                'Pr.별 위령미사(11월)',
                String(requiemEv.datetime || requiemEv.date || '').trim(),
                String(requiemEv.place || '').trim(),
                String(requiemEv.attendance || requiemEv.attendees || '').trim()
            ].filter(Boolean).join(' / ')
            : 'Pr.별 위령미사(11월)';

        const officerRoles = [
            { key: '영적지도자', label: '담당사제', fromModel: true },
            { key: '대리자', label: '대리자', fromModel: false },
            { key: '단장', label: '단장' },
            { key: '부단장', label: '부단장' },
            { key: '서기', label: '서기' },
            { key: '회계', label: '회계' }
        ];

        function officerCol(roleDef, field) {
            if (roleDef.key === '영적지도자') {
                if (field === 'name') return blank(m.spiritual_director, 'w6');
                return blank('', 'w6');
            }
            if (roleDef.key === '대리자') {
                if (field === 'name') return blank(m.proxy_name, 'w6');
                return blank('', 'w6');
            }
            if (field === 'name') return blank(officerField(officers, roleDef.key, 'name'), 'w6');
            if (field === 'baptism_name') return blank(officerField(officers, roleDef.key, 'baptism_name'), 'w6');
            if (field === 'appointed_on') {
                return blank(formatAppointedOn(officerField(officers, roleDef.key, 'appointed_on')), 'w6');
            }
            return blank('', 'w6');
        }

        const legionRows = FIXED_EVENTS.map((def) => legionEventRowHtml(def, events)).join('');

        const mf = (bucket, key) => blank(memVal(bucket, key), 'w3');

        return `
            <div class="pr-biz-form pr-biz-daegu" id="prBusinessFormPrint">
                <div class="biz-head">
                    <div class="biz-logo">LEGIO<br>MARIAE</div>
                    <div class="biz-titles">
                        <div class="org">레지오 마리애</div>
                        <div class="doc-title">쁘레시디움 제 ${blank(m.report_seq, 'w4')} 차 사업보고서</div>
                    </div>
                    <div class="biz-submit">
                        보고 일자: ${blank(today?.y, 'w4')} 년 ${blank(today?.m, 'w3')} 월 ${blank(today?.d, 'w3')} 일
                    </div>
                </div>
                <div class="biz-affil">
                    천주교 ${blank(m.church_name, 'w8')} 성당
                    &nbsp; Pr: ${blank(m.pr_name, 'w12')}
                </div>
                <div class="affil-flags">
                    Cu. / Co. / Re. / Se. 직속:
                    ${blank(m.council_name || m.curia_name, 'w12')}
                </div>

                <div class="biz-scroll">
                <table class="biz-table">
                    <tr>
                        <th style="width:14%">설립일</th>
                        <td class="left">${blank(m.founded_y, 'w4')} 년 ${blank(m.founded_m, 'w3')} 월 ${blank(m.founded_d, 'w3')} 일</td>
                        <th style="width:14%">승인일</th>
                        <td class="left">${blank(m.approved_y, 'w4')} 년 ${blank(m.approved_m, 'w3')} 월 ${blank(m.approved_d, 'w3')} 일</td>
                    </tr>
                    <tr>
                        <th>보고기간</th>
                        <td colspan="3" class="left">
                            ${blank(start?.y, 'w4')} 년 ${blank(start?.m, 'w3')} 월 ${blank(start?.d, 'w3')} 일 ~
                            ${blank(end?.y, 'w4')} 년 ${blank(end?.m, 'w3')} 월 ${blank(end?.d, 'w3')} 일
                            (${blank(m.meeting_from, 'w3')}차 ~ ${blank(m.meeting_to, 'w3')}차)
                            (${blank(m.weeks, 'w3')}주간)
                        </td>
                    </tr>
                    <tr>
                        <th>주회합</th>
                        <td colspan="3" class="left">
                            매주 ${blank(meeting.weekday, 'w4')} 요일
                            ${blank(meeting.hour, 'w3')} 시 ${blank(meeting.minute, 'w3')} 분
                            &nbsp; ${blank(meeting.place, 'w12')}
                        </td>
                    </tr>
                </table>
                </div>

                <div class="biz-sec-title">간부</div>
                <div class="biz-scroll">
                <table class="biz-table">
                    <thead>
                        <tr>
                            <th>구분</th>
                            ${officerRoles.map((r) => `<th>${escapeHtml(r.label)}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="row-label">성명</td>
                            ${officerRoles.map((r) => `<td>${officerCol(r, 'name')}</td>`).join('')}
                        </tr>
                        <tr>
                            <td class="row-label">세례명</td>
                            ${officerRoles.map((r) => `<td>${officerCol(r, 'baptism_name')}</td>`).join('')}
                        </tr>
                        <tr>
                            <td class="row-label">임명일자</td>
                            ${officerRoles.map((r) => `<td>${officerCol(r, 'appointed_on')}</td>`).join('')}
                        </tr>
                        <tr>
                            <td class="row-label">평의회출석률</td>
                            ${officerRoles.map(() => `<td>${blank('', 'w4')} %</td>`).join('')}
                        </tr>
                    </tbody>
                </table>
                </div>

                <div class="biz-sec-title">단원수</div>
                <div class="biz-scroll">
                <table class="biz-table">
                    <thead>
                        <tr>
                            <th rowspan="2">구분</th>
                            <th colspan="3">행동단원</th>
                            <th colspan="3">협조단원</th>
                            <th rowspan="2">쁘레또리움</th>
                            <th rowspan="2">아듀또리움</th>
                        </tr>
                        <tr>
                            <th>남</th><th>여</th><th>계</th>
                            <th>남</th><th>여</th><th>계</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="row-label">전차</td>
                            <td>${mf(prev, 'active_m')}</td><td>${mf(prev, 'active_f')}</td><td>${mf(prev, 'active_t')}</td>
                            <td>${mf(prev, 'aux_m')}</td><td>${mf(prev, 'aux_f')}</td><td>${mf(prev, 'aux_t')}</td>
                            <td>${mf(prev, 'praetorian')}</td>
                            <td>${mf(prev, 'adjutorian')}</td>
                        </tr>
                        <tr>
                            <td class="row-label">현재</td>
                            <td>${mf(curr, 'active_m')}</td><td>${mf(curr, 'active_f')}</td><td>${mf(curr, 'active_t')}</td>
                            <td>${mf(curr, 'aux_m')}</td><td>${mf(curr, 'aux_f')}</td><td>${mf(curr, 'aux_t')}</td>
                            <td>${mf(curr, 'praetorian')}</td>
                            <td>${mf(curr, 'adjutorian')}</td>
                        </tr>
                    </tbody>
                </table>
                </div>
                <div style="margin:4px 0 10px;">
                    비고: 장기 유고 ${blank('', 'w4')} /
                    입단·전입 ${blank('', 'w4')} /
                    퇴단·전출 ${blank('', 'w4')}
                    &nbsp; 출석률 ${blank(att.rate, 'w4')} %
                    <br>
                    정단원: ${blank(curr.active_t, 'w4')} 명
                    &nbsp;&nbsp; 예비단원: ${blank('', 'w4')} 명
                    <br>
                    단원 구성의 특성: ${blank('', 'w12')}
                </div>

                <div class="biz-sec-title">통신교환</div>
                <div style="margin-bottom:10px;">
                    수신 ${blank('', 'w4')} 건 &nbsp; 발신 ${blank('', 'w4')} 건
                </div>

                <div class="biz-sec-title">회계 보고</div>
                <div class="finance-grid">
                    <div>
                        <h4>수입</h4>
                        <table>
                            <tr><td class="left">이월금</td><td>${blank(fin.carry_in, 'w6')}</td></tr>
                            <tr><td class="left">비밀헌금</td><td>${blank(fin.secret_bag, 'w6')}</td></tr>
                            <tr><td class="left">이자</td><td>${blank(fin.interest, 'w6')}</td></tr>
                            <tr><td class="left">${blank(fin.income_other_label, 'w8')}</td><td>${blank(fin.income_other, 'w6')}</td></tr>
                            <tr><td class="left">${blank('', 'w8')}</td><td>${blank('', 'w6')}</td></tr>
                            <tr><td class="left"><strong>수입계</strong></td><td>${blank(fin.income_total, 'w6')}</td></tr>
                        </table>
                    </div>
                    <div>
                        <h4>지출</h4>
                        <table>
                            <tr><td class="left">의연금</td><td>${blank((fin.expense_detail || {}).levy, 'w6')}</td></tr>
                            <tr><td class="left">인쇄비</td><td>${blank((fin.expense_detail || {}).print, 'w6')}</td></tr>
                            <tr><td class="left">위령미사예물</td><td>${blank((fin.expense_detail || {}).mass, 'w6')}</td></tr>
                            <tr><td class="left">${blank(fin.expense_other_label, 'w8')}</td><td>${blank(fin.expense_other, 'w6')}</td></tr>
                            <tr><td class="left">${blank('', 'w8')}</td><td>${blank('', 'w6')}</td></tr>
                            <tr><td class="left"><strong>지출계</strong></td><td>${blank(fin.expense_total, 'w6')}</td></tr>
                        </table>
                    </div>
                    <div class="finance-balance">
                        <div>잔액</div>
                        <div>${blank(fin.balance, 'w6')}</div>
                    </div>
                </div>

                <div class="biz-sec-title">레지오 행사</div>
                <div class="biz-scroll">
                <table class="biz-table">
                    <thead>
                        <tr>
                            <th>내용</th><th>주관</th><th>일시</th><th>장소</th><th>참석/대상자</th>
                        </tr>
                    </thead>
                    <tbody>${legionRows}</tbody>
                </table>
                </div>

                <div class="biz-sec-title">교육 및 피정</div>
                ${lineBoxHtml(eduText, '72px')}

                <div class="biz-sec-title">기타행사</div>
                ${lineBoxHtml(otherEventText, '48px')}

                <div class="daegu-page-break">
                    <div class="biz-sec-title">※ 쁘레시디움 활동 내용</div>
                    ${daeguActBlock(
                        1,
                        '이웃에 가톨릭 알리기 활동',
                        '이웃·가족에게 가톨릭 신앙 전하기, 교리반 권유(통신교리 포함), 교리반 재등록 권유, 가두선교, 가정방문, 선교지 배포, 기타 예비신자 접촉 활동 등',
                        a.neighbor,
                        resultCell('교리반 인도', a.catechismLead, '명')
                    )}
                    ${daeguActBlock(
                        2,
                        '예비신자와 함께하는 활동',
                        '예비신자와 교리반 동반 참석, 미사 동반·주선, 본당 행사 동반, 본당생활 안내, 기도 등 영적 지도, 출석 확인 등 행정 협조, 교리반 간식 봉사, 예비신자 자녀 돌봄 등',
                        a.catechumen,
                        resultCell('영세자', a.baptized, '명')
                    )}
                    ${daeguActBlock(
                        3,
                        '가정을 위한 활동, 교우 돌봄',
                        '가정 전례 기도, 부부 성경·기도·미사, 성사권유 후 동반 미사, 가정 봉사, 성인 자녀와 기도·봉사, 세대 간 기도·평일미사, 신심단체 가입 권유 방문, 다문화 가정 돕기, 영세자 가정방문·돌봄, 가정축복 등',
                        a.familyCare,
                        resultCell('단체 가입', a.groupJoin, '명')
                    )}
                    ${daeguActBlock(
                        4,
                        '성사권유 및 혼인장애자를 위한 활동',
                        '냉담자 방문·성사·본당행사·영적상담 권유, 판공성사 권유 및 성사표 전달, 견진 권유·대부모 주선, 유아세례 권유·대부모·행정 협조, 혼인장애 해소 방문·지원 등',
                        a.sacramentInvite,
                        [
                            resultCell('회두', a.conversion, '명'),
                            resultCell('판공', a.confession, '명'),
                            resultCell('견진', a.confirmation, '명'),
                            resultCell('유아세례', a.infantBaptism, '명'),
                            resultCell('혼인장애 해소', a.marriageFix, '명')
                        ].join(' &nbsp; ')
                    )}
                    ${daeguActBlock(
                        5,
                        '어려움을 겪는 이웃과 나눔 활동',
                        '상가 방문, 위령기도, 장례미사 참석, 장지 수행, 위령미사 참석, 병자성사·봉성체 주선, 병원 봉사·환자 방문, 복지시설 봉사·방문, 재난·사고 피해자 방문, 수용자 돌봄, 급작 위험 돌봄 등',
                        a.neighborShare,
                        [
                            resultCell('상가방문, 돌봄', a.funeralVisit, '회'),
                            resultCell('위령기도', a.memorialPrayer, '회'),
                            resultCell('장례미사', a.funeralMass, '회'),
                            resultCell('장지수행', a.burialEscort, '회'),
                            resultCell('병자성사', a.anointing, '명'),
                            resultCell('봉성체', a.sickCommunion, '명'),
                            resultCell('대세자', a.conditionalBaptism, '명'),
                            resultCell('보례자', a.baptismComplete, '명'),
                            resultCell('병원 및 복지시설', a.hospital, '회'),
                            resultCell('기타', a.shareOther, '회')
                        ].join('<br>')
                    )}
                    ${daeguActBlock(
                        6,
                        '본당 운영에 기여(본당협조) 활동',
                        '본당 행사 준비·협조, 전례 봉사, 성시간 참석, 본당 교육·피정 권유·봉사, 주일학교 봉사, 본당 대청소, 시설 청소·정비, 본당 수리 노력봉사, 본당 호구조사, 차량·교통정리 봉사, 첫영성체 교리반 인도 등',
                        a.parishOps,
                        [
                            resultCell('첫 영성체 교리반 인도', a.firstCommunionLead, '명'),
                            resultCell('(유아세례 외 영세', a.firstCommunionBaptism, '명)')
                        ].join(' &nbsp; ')
                    )}
                    ${daeguActBlock(
                        7,
                        '레지오의 발전을 위한 활동',
                        '유년 Pr. 설립 권유·지도, 행동단원·협조단원 권유·모집, 휴면 단원 돌봄, Pr. 설립 권유, 레지오 교육·행사·피정 참석·봉사, Pr. 주회·평의회 방문, 간부·방청 출석, 교본 연구, 차량·교통정리 봉사 등',
                        a.legionGrow,
                        [
                            resultCell('행동단원 모집', a.activeRecruit, '명'),
                            resultCell('협조단원 모집', a.auxRecruit, '명')
                        ].join(' &nbsp; ')
                    )}
                    ${daeguActBlock(
                        8,
                        '소공동체와 함께하는 활동',
                        '소공동체 모임 참석·권유, 소공동체 사업회의 참석, 소공동체 교육 참석',
                        a.smallCommunity,
                        ''
                    )}
                    ${daeguActBlock(
                        9,
                        '자연보호 및 생명존중 운동에 동참',
                        '생태환경 운동 실천, 낙태반대 운동 동참, 사후장기기증 운동 동참, 헌혈 및 헌혈 권유',
                        a.nature,
                        ''
                    )}
                    ${daeguActBlock(
                        10,
                        '상급평의회가 지시한 활동',
                        '성경 통독, 성경 쓰기, 주회 전후 미사, 미사 전 독서·복음 묵상, 「성모님의 군단」·「빛」 읽기, 평일미사 참석·권유, 기타 상급평의회 지시 활동',
                        a.higherCouncil,
                        [
                            resultCell('성경 통독', a.bibleRead, '장'),
                            resultCell('묵주 기도', a.rosary, '단'),
                            resultCell('성경 쓰기', a.bibleWrite, '장')
                        ].join(' &nbsp; ')
                    )}
                    ${daeguActBlock(
                        11,
                        '기타 활동',
                        '위에 해당하지 않는 기타 활동',
                        a.otherAct,
                        ''
                    )}

                    <div class="biz-sec-title">쁘레시디움 운영 상 상급평의회에 건의 사항</div>
                    ${lineBoxHtml('', '64px')}
                </div>

                <div class="daegu-page-break">
                    <div class="daegu-model-title">모범 활동 사항</div>
                    <div class="daegu-model-guide">
                        (쁘레시디움 전 단원이 함께 활동한 내용을 중심으로 기술)<br>
                        (1) 육하원칙(누가, 언제, 어디서, 무엇을, 왜, 어떻게)에 의해 작성하며, 가명을 사용합니다.<br>
                        (2) 물질적인 도움을 주는 활동은 금지합니다.(교본 제 39장 10절)
                    </div>
                    ${lineBoxHtml('', '240px')}
                    <div class="daegu-sign">
                        ${blank(m.pr_name, 'w10')} Pr. 단장
                        ${blank(officerField(officers, '단장', 'name'), 'w8')} (인)
                    </div>
                </div>

                <p class="biz-note">※ 공식 양식에 DB 보유 항목만 자동 기입합니다. (대구·광주 전용 양식, 그 외 세나뚜스는 서울 양식 · 집계는 소속 세나뚜스 기준)</p>
            </div>
        `;
    }


    function buildGwangjuActivitySpiritualSectionHtml(a) {
        return `
                <div class="daegu-page-break">
                    <div class="biz-sec-title">11. 활동 상황</div>
                    <p style="font-size:11px; color:#555; margin:0 0 6px;">
                        ※ 아래 활동은 대표적인 예이므로 수정·추가할 수 있습니다. 활동 횟수는 DB 세목 합계입니다.
                    </p>
                    <div class="biz-scroll">
                    <table class="biz-table gj-act-table">
                        <thead>
                            <tr>
                                <th>종목</th>
                                <th>활동 횟수</th>
                                <th>활동 내용</th>
                                <th>결과</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="gj-cat">복음선교</td>
                                <td class="gj-count">${countWithTarget(a.evangelism)}</td>
                                <td class="left">${lineBoxHtml('외인 입교권면, 교리중단자 권면, 가두선교, 방문선교, 교리반 인도, 통신교리+자돌봄, 타인인도예비자+돌보기, 교리반 봉사·협조', '28px')}</td>
                                <td class="left">
                                    ${resultCell('교리반 인도', a.catechismLead, '명')}<br>
                                    ${resultCell('영세자', a.baptized, '명')}<br>
                                    ${resultCell('자기소개서', a.selfIntro, '명')}
                                </td>
                            </tr>
                            <tr>
                                <td class="gj-cat">교우 돌봄</td>
                                <td class="gj-count">${countWithTarget(a.believerCare)}</td>
                                <td class="left">${lineBoxHtml('새영세자·냉담자·교우가정·혼인장애자 방문, 성사권유, 이사온 교우, 첫영성체·유아세례 권유, 청소년 돌봄, 교우 상가·병자 방문·돌봄', '28px')}</td>
                                <td class="left">
                                    ${resultCell('단체 가입', a.groupJoin, '명')}<br>
                                    ${resultCell('회두', a.conversion, '명')}<br>
                                    ${resultCell('혼인장애 해소', a.marriageFix, '명')}<br>
                                    ${resultCell('판공', a.confession, '명')}<br>
                                    ${resultCell('견진', a.confirmation, '명')}<br>
                                    ${resultCell('유아세례', a.infantBaptism, '명')}<br>
                                    ${resultCell('첫영성체', a.firstCommunion, '명')}<br>
                                    ${resultCell('연도', a.yeondo, '명')}<br>
                                    ${resultCell('장례미사·고별식', a.funeralMass, '명')}<br>
                                    ${resultCell('장지수행', a.burialEscort, '명')}<br>
                                    ${resultCell('기타 장례', a.funeralOther, '명')}
                                </td>
                            </tr>
                            <tr>
                                <td class="gj-cat">이웃 돌봄</td>
                                <td class="gj-count">${countWithTarget(a.neighborCare)}</td>
                                <td class="left">${lineBoxHtml('비신자 병자·상가 방문·돌봄, 병원 방문·활동, 복지시설 봉사, 재난·사고 피해자 돌봄, 다문화가족돌봄, 죽을위험중의 세례자돌봄', '28px')}</td>
                                <td class="left">
                                    ${resultCell('대세자', a.conditionalBaptism, '명')}<br>
                                    ${resultCell('보례자', a.baptismComplete, '명')}
                                </td>
                            </tr>
                            <tr>
                                <td class="gj-cat">확장</td>
                                <td class="gj-count">${countWithTarget(a.expansion)}</td>
                                <td class="left">${lineBoxHtml('행동단원·협조단원 모집, 유년단 설립 활동, 유년단 돌봄, Pr설립권면, 교본공부, 평의회업무협조', '28px')}</td>
                                <td class="left">
                                    ${resultCell('행동단원 입단', a.activeRecruit, '명')}<br>
                                    ${resultCell('협조단원 입단', a.auxRecruit, '명')}<br>
                                    ${resultCell('설립Pr', a.foundedPr, '개')}
                                </td>
                            </tr>
                            <tr>
                                <td class="gj-cat">본당 협조</td>
                                <td class="gj-count">${blank(a.parishOps, 'w4')}</td>
                                <td class="left">${lineBoxHtml('행사 준비·협조, 호구조사, 주일학교 돌봄, 전례 협조, 청소·미화, 차량·교통정리, 소공동체 활동, 교육및피정, 제단체봉사, 업무협조, 성지및교구관련시설봉사 등', '28px')}</td>
                                <td class="left">${resultCell('면담', a.parishVisit, '호')}</td>
                            </tr>
                            <tr>
                                <td class="gj-cat">지구 살리기</td>
                                <td class="gj-count">${blank(a.earthCount, 'w4')}</td>
                                <td class="left">${lineBoxHtml('거절하기, 아껴쓰기, 다시쓰기, 고쳐쓰기, 재고하기, 재생하기', '28px')}</td>
                                <td class="left">
                                    ${resultCell('거절하기', a.earthRefuse, '회')}<br>
                                    ${resultCell('아껴쓰기', a.earthSave, '회')}<br>
                                    ${resultCell('다시쓰기', a.earthReuse, '회')}<br>
                                    ${resultCell('고쳐쓰기', a.earthRepair, '회')}<br>
                                    ${resultCell('재고하기', a.earthRethink, '회')}<br>
                                    ${resultCell('재생하기', a.earthRecycle, '회')}
                                </td>
                            </tr>
                            <tr>
                                <td class="gj-cat">기타</td>
                                <td class="gj-count">${blank(a.otherAct, 'w4')}</td>
                                <td class="left">${lineBoxHtml('간행물 배포, 생태·환경보호, 생명존중, 가정성화(가정단위) 활동, 차량봉사', '28px')}</td>
                                <td class="left">${blank('', 'w8')}</td>
                            </tr>
                        </tbody>
                    </table>
                    </div>

                    <div class="biz-sec-title" style="margin-top:12px;">영성 생활</div>
                    <div class="biz-scroll">
                    <table class="biz-table">
                        <tbody>
                            <tr>
                                <th style="width:22%">평일 미사</th>
                                <td class="left">평일미사 참석</td>
                                <td>${blank(a.weekdayMass, 'w4')} 회</td>
                            </tr>
                            <tr>
                                <th>묵주 기도</th>
                                <td class="left">상급평의회 지시 지향</td>
                                <td>${blank(a.rosary, 'w4')} 단</td>
                            </tr>
                            <tr>
                                <th>십자가의 길</th>
                                <td class="left">개인 또는 단체 십자가의 길</td>
                                <td>${blank(a.stations, 'w4')} 회</td>
                            </tr>
                            <tr>
                                <th>성경 봉독, 쓰기</th>
                                <td class="left">
                                    봉독·쓰기 (통독 ${blank('', 'w3')} / ${blank('', 'w3')},
                                    필사 ${blank('', 'w3')} / ${blank('', 'w3')})
                                </td>
                                <td>${blank(a.bible, 'w4')} 분</td>
                            </tr>
                            <tr>
                                <th>소성무일도</th>
                                <td class="left">소성무일도 봉헌 횟수</td>
                                <td>${blank(a.littleOffice, 'w4')} 회</td>
                            </tr>
                            <tr>
                                <th>성체조배</th>
                                <td class="left">성체조배</td>
                                <td>${blank(a.eucharistAdoration, 'w4')} 회</td>
                            </tr>
                            <tr>
                                <th>가족기도</th>
                                <td class="left">가족이 함께 기도하기</td>
                                <td>${blank(a.familyPray, 'w4')} 회</td>
                            </tr>
                            <tr>
                                <th>성모님의 군단일기</th>
                                <td class="left">성모님의 군단 및 빛 잡지 읽기</td>
                                <td>${blank(a.legionDiary, 'w4')} 회</td>
                            </tr>
                            <tr>
                                <th>기타</th>
                                <td class="left">프랭크 더프 시복 기원 등</td>
                                <td>${blank(a.spiritualOther, 'w4')} 회</td>
                            </tr>
                        </tbody>
                    </table>
                    </div>
                </div>`;
    }

    /** 광주 세나뚜스 Pr 사업보고서 양식 */
    function buildGwangjuBusinessFormHtml(model) {
        const m = model || {};
        const officers = m.officers || [];
        const mem = m.membership || {};
        const prev = mem.previous || {};
        const curr = mem.current || {};
        const att = m.attendance || {};
        const meeting = m.meeting || {};
        const fin = m.finance || {};
        const exp = fin.expense_detail || {};
        const start = parseYmd(m.start_date);
        const end = parseYmd(m.end_date);
        const events = m.events || [];
        const formDiocese = resolveFormReportDiocese(m);
        const isJejuReport = formDiocese === '제주';
        const isBusanReport = formDiocese === '부산';
        const isMasanReport = formDiocese === '마산';
        const a = isJejuReport
            ? computeJejuActivityCounts(m.activity_totals || [])
            : isBusanReport
                ? computeBusanActivityCounts(m.activity_totals || [])
                : isMasanReport
                    ? computeMasanActivityCounts(m.activity_totals || [])
                    : computeGwangjuActivityCounts(m.activity_totals || []);
        const mf = (bucket, key) => blank(memVal(bucket, key), 'w3');

        const officerRoles = [
            { key: '영적지도자', label: '영적 지도신부' },
            { key: '대리자', label: '대리자' },
            { key: '단장', label: '단장' },
            { key: '부단장', label: '부단장' },
            { key: '서기', label: '서기' },
            { key: '회계', label: '회계' }
        ];

        function officerCol(roleDef, field) {
            if (roleDef.key === '영적지도자') {
                if (field === 'name') return blank(m.spiritual_director, 'w6');
                return blank('', 'w6');
            }
            if (roleDef.key === '대리자') {
                if (field === 'name') return blank(m.proxy_name, 'w6');
                return blank('', 'w6');
            }
            if (field === 'name') return blank(officerField(officers, roleDef.key, 'name'), 'w6');
            if (field === 'baptism_name') return blank(officerField(officers, roleDef.key, 'baptism_name'), 'w6');
            if (field === 'appointed_on') {
                return blank(formatAppointedOn(officerField(officers, roleDef.key, 'appointed_on')), 'w6');
            }
            return blank('', 'w6');
        }

        function eventDetailRow(title, ev) {
            return `<tr>
                <td class="left">${blank(title, 'w8')}</td>
                <td>${blank(ev ? String(ev.organizer || '').trim() : '', 'w6')}</td>
                <td>${blank(ev ? String(ev.datetime || ev.date || '').trim() : '', 'w6')}</td>
                <td>${blank(ev ? String(ev.place || '').trim() : '', 'w6')}</td>
                <td>${blank(ev ? String(ev.attendance || ev.attendees || '').trim() : '', 'w4')} / ${blank('', 'w3')}</td>
            </tr>`;
        }

        const legionRows = FIXED_EVENTS.map((def) =>
            eventDetailRow(def.title, matchEvent(events, def.labels))
        ).join('');

        const eduList = (m.education_events || []).filter((ev) => {
            const t = String(ev.event_type || '');
            return t === '교육' || (/교육/.test(`${t} ${ev.title || ''}`) && !/피정|연수/.test(`${t} ${ev.title || ''}`));
        });
        const retreatList = (m.education_events || []).filter((ev) => {
            const blob = `${ev.event_type || ''} ${ev.title || ''} ${ev.content || ''}`;
            return /피정|연수/.test(blob);
        });
        const otherEvList = (events || []).filter((ev) => {
            const t = String(ev.event_type || '');
            if (t === '교육' || t === '피정및연수') return false;
            const title = String(ev.title || ev.content || '');
            return !FIXED_EVENTS.some((def) => def.labels.some((lb) => title.includes(lb)));
        });

        function padEventRows(list, minRows, sectionLabel) {
            const rows = [];
            const n = Math.max(minRows, list.length || 0);
            for (let i = 0; i < n; i++) {
                const ev = list[i];
                const label = i === 0 ? sectionLabel : '';
                const title = ev
                    ? [String(ev.kind || '').trim(), String(ev.title || '').trim()].filter(Boolean).join(' ')
                    : '';
                rows.push(`<tr>
                    <td class="left">${i === 0 ? `<strong>${escapeHtml(label)}</strong> ` : ''}${blank(title, 'w8')}</td>
                    <td>${blank(ev ? String(ev.organizer || '').trim() : '', 'w6')}</td>
                    <td>${blank(ev ? String(ev.datetime || ev.date || '').trim() : '', 'w6')}</td>
                    <td>${blank(ev ? String(ev.place || '').trim() : '', 'w6')}</td>
                    <td>${blank(ev ? String(ev.attendance || ev.attendees || '').trim() : '', 'w4')}</td>
                </tr>`);
            }
            return rows.join('');
        }

        const officerPct = attendancePct(att.officers_present, att.officers_total);
        const memberPct = attendancePct(att.members_present, att.members_total);
        const overallPct = att.rate || '';
        const activitySpiritualSectionHtml = isJejuReport
            ? buildJejuActivitySpiritualSectionHtml(a)
            : isBusanReport
                ? buildBusanActivitySectionHtml(a) + buildBusanActivityPage2Html(a)
                : isMasanReport
                    ? buildMasanActivitySpiritualSectionHtml(a)
                    : buildGwangjuActivitySpiritualSectionHtml(a);
        if (isJejuReport) {
            console.info('[Pr사업보고] 제주 양식 적용: 활동상황·영성생활 교체');
        }
        if (isBusanReport) {
            console.info('[Pr사업보고] 부산 양식 적용: 활동상황·중점활동 교체');
        }
        if (isMasanReport) {
            console.info('[Pr사업보고] 마산 양식 적용: 활동상황·영성생활 교체');
        }

        const specialSectionHtml = isBusanReport
            ? buildBusanFocusSectionHtml(officers)
            : `
                <div class="daegu-page-break">
                    <div class="gj-special-title">모범활동사례</div>
                    ${lineBoxHtml('', '260px')}
                    <div class="gj-special-guide">
                        (1) 육하원칙 (누가, 언제, 어디서, 어떻게, 무엇을, 왜)에 의해 작성하며, 가명을 사용합니다.<br>
                        (2) 물질적 구제 활동을 금지합니다. (교본 제39장 10절)
                    </div>
                    <div class="daegu-sign" style="margin-top:16px; text-align:right;">
                        Pr. 단장 ${blank(officerField(officers, '단장', 'name'), 'w8')} (인)
                    </div>
                </div>`;

        return `
            <div class="pr-biz-form pr-biz-gwangju${isJejuReport ? ' pr-biz-jeju' : ''}${isBusanReport ? ' pr-biz-busan' : ''}${isMasanReport ? ' pr-biz-masan' : ''}" id="prBusinessFormPrint" data-report-diocese="${escapeHtml(String(formDiocese || m.report_diocese || ''))}" data-form-diocese="${escapeHtml(String(formDiocese || ''))}">
                ${isJejuReport ? '<div class="biz-note" style="margin:0 0 8px;border:1px solid #2c5aa0;background:#eef4ff;padding:6px 10px;">제주 교구 Pr 사업보고 양식 · 활동상황·영성생활</div>' : ''}
                ${isBusanReport ? '<div class="biz-note" style="margin:0 0 8px;border:1px solid #2c5aa0;background:#eef4ff;padding:6px 10px;">부산 교구 Pr 사업보고 양식 · 활동상황·중점활동</div>' : ''}
                ${isMasanReport ? '<div class="biz-note" style="margin:0 0 8px;border:1px solid #2c5aa0;background:#eef4ff;padding:6px 10px;">마산 교구 Pr 사업보고 양식 · 활동상황·영성생활</div>' : ''}
                <div class="biz-titles" style="text-align:center; margin-bottom:8px;">
                    <div class="doc-title">제 ${blank(m.report_seq, 'w4')} 차 사업 보고서</div>
                    <div style="margin-top:4px; font-size:12px;">
                        ${blank(m.church_name, 'w8')} · ${blank(m.pr_name, 'w10')}
                        &nbsp; 직속 ${blank(m.council_name || m.curia_name, 'w10')}
                    </div>
                </div>

                <div class="biz-scroll">
                <table class="biz-table">
                    <tr>
                        <th style="width:14%">설립일</th>
                        <td class="left">${blank(m.founded_y, 'w4')} 년 ${blank(m.founded_m, 'w3')} 월 ${blank(m.founded_d, 'w3')} 일</td>
                        <th style="width:14%">승인일</th>
                        <td class="left">${blank(m.approved_y, 'w4')} 년 ${blank(m.approved_m, 'w3')} 월 ${blank(m.approved_d, 'w3')} 일</td>
                    </tr>
                    <tr>
                        <th>보고 기간</th>
                        <td colspan="3" class="left">
                            ${blank(start?.y, 'w4')} 년 ${blank(start?.m, 'w3')} 월 ${blank(start?.d, 'w3')} 일 ~
                            ${blank(end?.y, 'w4')} 년 ${blank(end?.m, 'w3')} 월 ${blank(end?.d, 'w3')} 일
                            (${blank(m.meeting_from, 'w3')}차) ~ (${blank(m.meeting_to, 'w3')}차)
                            ${blank(m.weeks, 'w3')} 주간
                        </td>
                    </tr>
                    <tr>
                        <th>주회</th>
                        <td colspan="3" class="left">
                            매주 ${blank(meeting.weekday, 'w4')}
                            ${blank(meeting.hour, 'w3')} 시 ${blank(meeting.minute, 'w3')} 분
                            &nbsp; 회의실 ${blank(meeting.place, 'w12')}
                        </td>
                    </tr>
                </table>
                </div>

                <div class="biz-sec-title">간부</div>
                <div class="biz-scroll">
                <table class="biz-table">
                    <thead>
                        <tr>
                            <th>구분</th>
                            ${officerRoles.map((r) => `<th>${escapeHtml(r.label)}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="row-label">성명</td>
                            ${officerRoles.map((r) => `<td>${officerCol(r, 'name')}</td>`).join('')}
                        </tr>
                        <tr>
                            <td class="row-label">세례명</td>
                            ${officerRoles.map((r) => `<td>${officerCol(r, 'baptism_name')}</td>`).join('')}
                        </tr>
                        <tr>
                            <td class="row-label">간부 임명일</td>
                            ${officerRoles.map((r) => `<td>${officerCol(r, 'appointed_on')}</td>`).join('')}
                        </tr>
                        <tr>
                            <td class="row-label">평의회 출석률</td>
                            ${officerRoles.map(() => `<td>${blank('', 'w4')} %</td>`).join('')}
                        </tr>
                    </tbody>
                </table>
                </div>

                <div class="biz-sec-title">단원 수</div>
                <div class="biz-scroll">
                <table class="biz-table">
                    <thead>
                        <tr>
                            <th colspan="3">행동단원</th>
                            <th rowspan="2">구분</th>
                            <th rowspan="2">인원</th>
                            <th colspan="3">협조단원</th>
                        </tr>
                        <tr>
                            <th>남</th><th>여</th><th>계</th>
                            <th>남</th><th>여</th><th>계</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${mf(curr, 'active_m')}</td>
                            <td>${mf(curr, 'active_f')}</td>
                            <td>${mf(curr, 'active_t')}</td>
                            <td class="left">전차단원</td>
                            <td>${mf(prev, 'active_t')} 명</td>
                            <td>${mf(curr, 'aux_m')}</td>
                            <td>${mf(curr, 'aux_f')}</td>
                            <td>${mf(curr, 'aux_t')}</td>
                        </tr>
                        <tr>
                            <td colspan="3"></td>
                            <td class="left">정단원</td>
                            <td>${mf(curr, 'active_t')} 명</td>
                            <td colspan="3"></td>
                        </tr>
                        <tr>
                            <td colspan="3"></td>
                            <td class="left">예비단원</td>
                            <td>${blank('', 'w3')} 명</td>
                            <td colspan="3"></td>
                        </tr>
                        <tr>
                            <td colspan="3"></td>
                            <td class="left">장기유고</td>
                            <td>${blank('', 'w3')} 명</td>
                            <td colspan="3"></td>
                        </tr>
                        <tr>
                            <td colspan="3"></td>
                            <td class="left">입단/전입</td>
                            <td>${blank('', 'w3')} 명</td>
                            <td colspan="3"></td>
                        </tr>
                        <tr>
                            <td colspan="3"></td>
                            <td class="left">퇴단/전출</td>
                            <td>${blank('', 'w3')} 명</td>
                            <td colspan="3"></td>
                        </tr>
                        <tr>
                            <td colspan="3"></td>
                            <td class="left">제명</td>
                            <td>${blank('', 'w3')} 명</td>
                            <td colspan="3"></td>
                        </tr>
                    </tbody>
                </table>
                </div>
                <div style="margin:4px 0 10px;">
                    쁘레또리움 단원 ${mf(curr, 'praetorian')} 명
                    &nbsp; 아쥬또리움 단원 ${mf(curr, 'adjutorian')} 명
                </div>

                <div class="biz-scroll">
                <table class="biz-table">
                    <tr>
                        <th style="width:12%">출석률</th>
                        <td class="left">
                            간부 ${blank(officerPct, 'w4')} %
                            &nbsp; 단원 ${blank(memberPct, 'w4')} %
                            &nbsp; 전체 ${blank(overallPct, 'w4')} %
                        </td>
                        <th style="width:18%">단원 구성의 특성</th>
                        <td class="left">${blank('', 'w12')}</td>
                    </tr>
                    <tr>
                        <th>통신교환</th>
                        <td colspan="3" class="left">
                            수신 ${blank('', 'w4')} 건
                            &nbsp; 발신 ${blank('', 'w4')} 건
                        </td>
                    </tr>
                </table>
                </div>

                <div class="biz-sec-title">회계 보고 (단위: 원)</div>
                <div class="finance-grid">
                    <div>
                        <h4>수입</h4>
                        <table>
                            <tr><td class="left">이월금</td><td>${blank(fin.brought_forward || fin.carry_in, 'w6')}</td></tr>
                            <tr><td class="left">비밀헌금</td><td>${blank(fin.secret_bag || fin.income, 'w6')}</td></tr>
                            <tr><td class="left">이자</td><td>${blank(fin.interest, 'w6')}</td></tr>
                            <tr><td class="left"><strong>수입계</strong></td><td>${blank(fin.income_total || fin.income, 'w6')}</td></tr>
                        </table>
                    </div>
                    <div>
                        <h4>지출</h4>
                        <table>
                            <tr><td class="left">의연금</td><td>${blank(exp.levy || exp.contribution, 'w6')}</td></tr>
                            <tr><td class="left">인쇄비</td><td>${blank(exp.print, 'w6')}</td></tr>
                            <tr><td class="left">위령 미사 예물</td><td>${blank(exp.mass, 'w6')}</td></tr>
                            <tr><td class="left">기타</td><td>${blank(fin.expense_other || exp.others || exp.flowers, 'w6')}</td></tr>
                            <tr><td class="left"><strong>지출계</strong></td><td>${blank(fin.expense_total || fin.expense, 'w6')}</td></tr>
                        </table>
                    </div>
                    <div class="finance-balance">
                        <div>잔액</div>
                        <div>${blank(fin.balance, 'w6')}</div>
                    </div>
                </div>

                <div class="biz-sec-title">레지오 행사 · 교육 · 피정 · 기타 행사</div>
                <div class="biz-scroll">
                <table class="biz-table">
                    <thead>
                        <tr>
                            <th>내용</th><th>주관</th><th>일시</th><th>장소</th><th>참석/대상자</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${legionRows}
                        ${padEventRows(eduList, 2, '교육')}
                        ${padEventRows(retreatList, 2, '피정')}
                        ${padEventRows(otherEvList.slice(0, 4), 2, '기타 행사')}
                    </tbody>
                </table>
                </div>

                ${activitySpiritualSectionHtml}

                ${specialSectionHtml}

                <p class="biz-note">※ 공식 양식에 DB 보유 항목만 자동 기입합니다. (대구·광주 전용 양식, 그 외 세나뚜스는 서울 양식 · 집계는 소속 세나뚜스 기준)</p>
            </div>
        `;
    }

    function buildFormHtml(model) {
        const m = model || {};
        // 서울 외 해외 세나뚜스도 서울 양식(활동 사항 포함) 사용. 소속 표기는 실제 senatus_name.
        const useSeoulForm = formTemplateSenatus(m.senatus_name) === '서울';
        const officers = m.officers || [];
        const mem = m.membership || {};
        const prev = mem.previous || {};
        const curr = mem.current || {};
        const inc = mem.increase || {};
        const dec = mem.decrease || {};
        const meeting = m.meeting || {};
        const fin = m.finance || {};
        const att = m.attendance || {};
        const start = parseYmd(m.start_date);
        const end = parseYmd(m.end_date);
        const today = parseYmd(m.submit_date) || parseYmd(new Date().toISOString().slice(0, 10));

        const president = officerName(officers, '단장');
        const vp = officerName(officers, '부단장');
        const secretary = officerName(officers, '서기');
        const treasurer = officerName(officers, '회계');
        const officerApprovedCell = (role) =>
            blank(formatAppointedOn(officerField(officers, role, 'appointed_on')), 'w6');
        // 출석상황·평의회출석: PDF 전 편집 가능 (출석 / 의무)
        const attEditCell = `<td class="slash-cell">${ratioBlank('', '')}</td>`;
        const officerAttRow = Array(6).fill(attEditCell).join('');

        const events = m.events || [];
        const fixedRows = FIXED_EVENTS.map((def) => {
            const ev = matchEvent(events, def.labels);
            const info = eventDateAtt(ev);
            return `<tr>
                <td class="left">${blank(formatEventRowLabel(def.title, ev), 'w12')}</td>
                <td>${blank(info.date, 'w6')}</td>
                <td>${blank(info.attendance, 'w4')}</td>
            </tr>`;
        }).join('');

        const otherRows = OTHER_EVENTS.map((def) => {
            const ev = matchEvent(events, def.labels);
            const info = eventDateAtt(ev);
            return `<tr>
                <td class="left">${blank(formatEventRowLabel(def.title, ev), 'w12')}</td>
                <td>${blank(info.date, 'w6')}</td>
                <td>${blank(info.attendance, 'w4')}</td>
            </tr>`;
        }).join('');

        // 교육/피정: education_events 우선, 없으면 events에서 추출 (실시·계획 모두)
        const eduSource = Array.isArray(m.education_events) && m.education_events.length
            ? m.education_events
            : events;
        const eduEvents = eduSource.filter((ev) => {
            const eventType = String(ev.event_type || '').trim();
            const title = String(ev.title || '');
            const content = String(ev.content || '');
            const organizer = String(ev.organizer || '');
            const isFixed = [...FIXED_EVENTS, ...OTHER_EVENTS].some((def) =>
                def.labels.some((lb) => title.includes(lb) || content.includes(lb))
            );
            if (isFixed) return false;
            if (eventType === '교육' || eventType === '피정및연수') return true;
            // education_events 소스면 이미 교육만 있음
            if (Array.isArray(m.education_events) && m.education_events.length) return true;
            const blob = `${eventType} ${title} ${content} ${organizer}`;
            return /교육|피정|연수/.test(blob);
        });
        const eduRows = [];
        const eduCount = Math.max(eduEvents.length, 1);
        for (let i = 0; i < Math.min(eduCount, 10); i++) {
            const ev = eduEvents[i];
            const info = eventDateAtt(ev);
            const kind = String(ev?.kind || '').trim();
            const parts = [];
            if (kind) parts.push(`[${kind}]`);
            const eduTitle = String(ev?.title || '').trim();
            const eduContent = String(ev?.content || '').trim();
            if (eduTitle) parts.push(eduTitle);
            else if (eduContent) parts.push(eduContent);
            if (eduContent && eduContent !== eduTitle) {
                parts.push(eduContent);
            }
            if (ev?.organizer && isHigherOrgLabel(ev.organizer)) {
                parts.push(`(주관:${String(ev.organizer).trim()})`);
            }
            const labelText = ev
                ? (parts.join(' ') || String(ev.event_type || ''))
                : '';
            eduRows.push(`<tr>
                <td class="left">${blank(labelText, 'w12')}</td>
                <td>${blank(info.date, 'w6')}</td>
                <td>${blank(info.attendance, 'w4')}</td>
            </tr>`);
        }
        // 빈 칸 최소 1줄 유지 (자료 없을 때)
        while (eduRows.length < 1) {
            eduRows.push(`<tr><td class="left">${blank('', 'w12')}</td><td>${blank('', 'w6')}</td><td>${blank('', 'w4')}</td></tr>`);
        }

        const activeKeys = { m: 'active_m', f: 'active_f', t: 'active_t' };
        const auxKeys = { m: 'aux_m', f: 'aux_f', t: 'aux_t' };

        return `
            <div class="pr-biz-form${useSeoulForm ? ' pr-biz-seoul' : ''}" id="prBusinessFormPrint">
                <div class="biz-head">
                    <div class="biz-logo">LEGIO<br>MARIAE</div>
                    <div class="biz-titles">
                        <div class="org">레지오 마리애</div>
                        <div class="doc-title">쁘레시디움 제 ${blank(m.report_seq, 'w4')} 차 사업 보고서</div>
                    </div>
                    <div class="biz-submit">
                        제출일: ${blank(today?.y, 'w4')} . ${blank(today?.m, 'w3')} . ${blank(today?.d, 'w3')} .
                    </div>
                </div>
                <div class="biz-affil">
                    천주교 ${blank(m.church_name, 'w8')} 성당
                    ${blank(m.council_name || m.curia_name, 'w8')} 직속
                    &nbsp; Pr: ${blank(m.pr_name, 'w12')}
                </div>

                <table class="biz-table">
                    <tr>
                        <th style="width:14%">설립일</th>
                        <td class="left">${blank(m.founded_y, 'w4')} 년 ${blank(m.founded_m, 'w3')} 월 ${blank(m.founded_d, 'w3')} 일</td>
                        <th style="width:14%">승인일</th>
                        <td class="left">${blank(m.approved_y, 'w4')} 년 ${blank(m.approved_m, 'w3')} 월 ${blank(m.approved_d, 'w3')} 일</td>
                    </tr>
                    <tr>
                        <th>보고기간</th>
                        <td colspan="3" class="left">
                            ${blank(start?.y, 'w4')} 년 ${blank(start?.m, 'w3')} 월 ~
                            ${blank(end?.y, 'w4')} 년 ${blank(end?.m, 'w3')} 월
                            (${blank(m.meeting_from, 'w3')}차 ~ ${blank(m.meeting_to, 'w3')}차)
                            (${blank(m.weeks, 'w3')}주간)
                        </td>
                    </tr>
                    <tr>
                        <th>주회합</th>
                        <td colspan="3" class="left">
                            요일 ${blank(meeting.weekday, 'w4')}
                            &nbsp; ${blank(meeting.hour, 'w3')} 시 ${blank(meeting.minute, 'w3')} 분
                            &nbsp; 장소 ${blank(meeting.place, 'w12')}
                        </td>
                    </tr>
                </table>

                <div class="biz-sec-title">간부</div>
                <div class="biz-scroll">
                <table class="biz-table seoul-officer-table">
                    <thead>
                        <tr>
                            <th class="seoul-diag"><span class="diag-tr">직책</span><span class="diag-bl">구분</span></th>
                            <th>영적지도자</th>
                            <th>대리자</th>
                            <th>단장</th>
                            <th>부단장</th>
                            <th>서기</th>
                            <th>회계</th>
                            <th class="seoul-member-att-head">단원출석</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="row-label">성명(세례명)</td>
                            <td>${blank(m.spiritual_director, 'w8')}</td>
                            <td>${blank(m.proxy_name, 'w8')}</td>
                            <td>${blank(president, 'w8')}</td>
                            <td>${blank(vp, 'w8')}</td>
                            <td>${blank(secretary, 'w8')}</td>
                            <td>${blank(treasurer, 'w8')}</td>
                            <td rowspan="4" class="seoul-member-att-cell">${blank(att.members_present, 'w3')} / ${blank(att.members_total, 'w3')}</td>
                        </tr>
                        <tr>
                            <td class="row-label">출석상황</td>
                            ${officerAttRow}
                        </tr>
                        <tr>
                            <td class="row-label">평의회출석</td>
                            ${officerAttRow}
                        </tr>
                        <tr>
                            <td class="row-label">승인일</td>
                            <td></td>
                            <td></td>
                            <td>${officerApprovedCell('단장')}</td>
                            <td>${officerApprovedCell('부단장')}</td>
                            <td>${officerApprovedCell('서기')}</td>
                            <td>${officerApprovedCell('회계')}</td>
                        </tr>
                        <tr>
                            <td class="row-label">간부이동</td>
                            <td colspan="7" class="left">${blank(m.officer_change, 'w20')}</td>
                        </tr>
                    </tbody>
                </table>
                </div>

                <div class="biz-sec-title">단원 수</div>
                <div class="biz-scroll">
                <table class="biz-table">
                    <thead>
                        <tr>
                            <th rowspan="2">구분</th>
                            <th colspan="3">전차 보고 시</th>
                            <th colspan="3">현재</th>
                            <th colspan="3">증감</th>
                        </tr>
                        <tr>
                            <th>남</th><th>여</th><th>계</th>
                            <th>남</th><th>여</th><th>계</th>
                            <th>증가</th><th>감소</th><th>계</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${membershipRowHtml('행동단원', prev, curr, inc, dec, activeKeys)}
                        ${membershipTotalOnlyRow('쁘레또리움 단원', prev, curr, inc, dec, 'praetorian')}
                        ${membershipRowHtml('협조단원', prev, curr, inc, dec, auxKeys)}
                        ${membershipTotalOnlyRow('아쥬또리움 단원', prev, curr, inc, dec, 'adjutorian')}
                    </tbody>
                </table>
                </div>

                <div class="biz-sec-title">회계보고</div>
                <div class="finance-grid">
                    <div>
                        <h4>수입</h4>
                        <table>
                            <tr><td class="left">전차이월금</td><td>${blank(fin.carry_in, 'w6')}</td></tr>
                            <tr><td class="left">비밀 헌금</td><td>${blank(fin.secret_bag, 'w6')}</td></tr>
                            <tr><td class="left">${blank(fin.income_other_label, 'w8')}</td><td>${blank(fin.income_other, 'w6')}</td></tr>
                            <tr><td class="left">${blank('', 'w8')}</td><td>${blank('', 'w6')}</td></tr>
                            <tr><td class="left"><strong>수입계</strong></td><td>${blank(fin.income_total, 'w6')}</td></tr>
                        </table>
                    </div>
                    <div>
                        <h4>지출</h4>
                        <table>
                            <tr><td class="left">의연금</td><td>${blank((fin.expense_detail || {}).levy, 'w6')}</td></tr>
                            <tr><td class="left">꽃값</td><td>${blank((fin.expense_detail || {}).flower, 'w6')}</td></tr>
                            <tr><td class="left">초값</td><td>${blank((fin.expense_detail || {}).candle, 'w6')}</td></tr>
                            <tr><td class="left">위령미사예물</td><td>${blank((fin.expense_detail || {}).mass, 'w6')}</td></tr>
                            <tr><td class="left">인쇄비</td><td>${blank((fin.expense_detail || {}).print, 'w6')}</td></tr>
                            <tr><td class="left">${blank(fin.expense_other_label, 'w8')}</td><td>${blank(fin.expense_other, 'w6')}</td></tr>
                            <tr><td class="left"><strong>지출계</strong></td><td>${blank(fin.expense_total, 'w6')}</td></tr>
                        </table>
                    </div>
                    <div class="finance-balance">
                        <div>잔액</div>
                        <div>${blank(fin.balance, 'w6')}</div>
                    </div>
                </div>

                <div class="biz-two-col">
                    <div>
                        <table class="biz-table">
                            <thead>
                                <tr><th>행사</th><th>일자</th><th>참석</th></tr>
                            </thead>
                            <tbody>${fixedRows}</tbody>
                        </table>
                        <table class="biz-table">
                            <thead>
                                <tr><th>기타(행사)</th><th>일자</th><th>참석</th></tr>
                            </thead>
                            <tbody>${otherRows}</tbody>
                        </table>
                    </div>
                    <div>
                        <table class="biz-table">
                            <thead>
                                <tr><th>교육 및 피정</th><th>일자</th><th>참석</th></tr>
                            </thead>
                            <tbody>${eduRows.join('')}</tbody>
                        </table>
                    </div>
                </div>
                ${useSeoulForm ? buildSeoulActivitySectionHtml(m.activity_totals) : ''}
                <p class="biz-note">※ 공식 양식에 DB 보유 항목만 자동 기입합니다. (대구·광주 전용 양식, 그 외 세나뚜스는 서울 양식 · 집계는 소속 세나뚜스 기준)</p>
            </div>
        `;
    }

    async function fetchPrMonthly(churchName, prName, year, month) {
        const qs = new URLSearchParams({
            church_name: churchName,
            pr_name: prName,
            year: String(year),
            month: String(month)
        });
        const res = await fetch(`/api/pr-monthly-report?${qs.toString()}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Pr 월례 자료 조회 실패 (${res.status})`);
        }
        return res.json();
    }

    async function fetchPrEvents(prName, startDate, endDate, churchName) {
        const qs = new URLSearchParams({
            type: 'pr',
            name: prName,
            start_date: startDate,
            end_date: endDate
        });
        if (churchName) qs.set('church_name', churchName);
        const res = await fetch(`/api/council-event-report?${qs.toString()}`);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data.events) ? data.events : [];
    }

    /**
     * @param {object} opts
     * @param {string} opts.churchName
     * @param {string} opts.prName
     * @param {string} opts.startDate YYYY-MM-DD
     * @param {string} opts.endDate YYYY-MM-DD
     * @param {HTMLElement} opts.container
     */
    async function render(opts) {
        ensureStyles();
        const container = opts.container;
        if (!container) return;

        const churchName = String(opts.churchName || '').trim();
        const prName = String(opts.prName || '').trim();
        const startDate = String(opts.startDate || '').trim();
        const endDate = String(opts.endDate || '').trim();

        if (!churchName || !prName || !startDate || !endDate) {
            container.innerHTML = '<div class="no-data">성당·Pr·기간을 선택한 뒤 일년 집계를 조회하세요.</div>';
            return;
        }

        container.innerHTML = '<div class="no-data">사업 보고서 양식을 불러오는 중…</div>';

        const end = parseYmd(endDate);
        let monthly = null;
        let events = [];
        let educationEvents = [];
        let activityTotals = [];
        try {
            monthly = await fetchPrMonthly(churchName, prName, end?.year || new Date().getFullYear(), end?.month || (new Date().getMonth() + 1));
        } catch (error) {
            console.warn('Pr 사업보고 월례 API 실패:', error);
        }
        try {
            events = await fetchPrEvents(prName, startDate, endDate, churchName);
        } catch (error) {
            console.warn('Pr 사업보고 행사 API 실패:', error);
        }
        try {
            educationEvents = await fetchPrEducationFromSummary(churchName, prName, startDate, endDate);
        } catch (error) {
            console.warn('Pr 사업보고 교육·피정 조회 실패:', error);
        }

        const user = await refreshLoggedInUser() || getLoggedInUser();
        // DB 갱신 로그인 소속 우선, 이어서 Pr 월례(산하 다수) — 세션에 남은 옛 서울 값이 대구를 가리지 않도록
        const senatusName = resolveSenatusName(
            user?.senatus_name,
            monthly?.senatus_name,
            opts.senatusName
        );
        const formSenatus = formTemplateSenatus(senatusName);
        const isDaegu = formSenatus === '대구';
        const isGwangju = formSenatus === '광주';
        const useSeoulForm = formSenatus === '서울';
        const reportDiocese = resolveReportDiocese(opts);
        console.info('[Pr사업보고] senatus=', senatusName, {
            user: user?.senatus_name,
            monthly: monthly?.senatus_name,
            opts: opts.senatusName,
            form: formSenatus,
            diocese: reportDiocese || '(none)',
            formDiocese: resolveFormReportDiocese({ report_diocese: reportDiocese }),
            jejuForm: resolveFormReportDiocese({ report_diocese: reportDiocese }) === '제주',
            busanForm: resolveFormReportDiocese({ report_diocese: reportDiocese }) === '부산',
            masanForm: resolveFormReportDiocese({ report_diocese: reportDiocese }) === '마산'
        });

        if (isDaegu || isGwangju || useSeoulForm) {
            try {
                activityTotals = await fetchActivityTotals(churchName, prName, startDate, endDate);
            } catch (error) {
                console.warn('Pr 사업보고 활동합계 조회 실패:', error);
            }
        }

        // 교육·피정은 활동요약(회원소속) 기준으로 우선 수집하고, 행사 API 결과와 병합
        const councilEdu = (events || []).filter((ev) => {
            const t = String(ev.event_type || '');
            return t === '교육' || t === '피정및연수' || /교육|피정|연수/.test(`${t} ${ev.title || ''} ${ev.content || ''}`);
        });
        const mergedEducation = mergeEducationEvents(educationEvents, councilEdu);
        const otherEvents = (events || []).filter((ev) => {
            const t = String(ev.event_type || '');
            return !(t === '교육' || t === '피정및연수');
        });
        events = [...otherEvents, ...mergedEducation];

        const model = {
            church_name: churchName,
            pr_name: prName,
            start_date: startDate,
            end_date: endDate,
            submit_date: new Date().toISOString().slice(0, 10),
            council_name: monthly?.council_name || '',
            curia_name: monthly?.council_name || '',
            senatus_name: senatusName,
            report_diocese: reportDiocese,
            officers: monthly?.officers || [],
            membership: monthly?.membership || {},
            attendance: monthly?.attendance || {},
            meeting: monthly?.meeting || {},
            finance: monthly?.finance || {},
            spiritual_director: monthly?.spiritual_director || '',
            events,
            education_events: mergedEducation,
            activity_totals: activityTotals,
            meeting_from: monthly?.meeting_from || '',
            meeting_to: monthly?.meeting_to || '',
            weeks: '',
            report_seq: '',
            founded_y: '', founded_m: '', founded_d: '',
            approved_y: '', approved_m: '', approved_d: '',
            proxy_name: '',
            officer_change: ''
        };

        function splitYmd(raw) {
            if (raw == null || raw === '') return { y: '', m: '', d: '' };
            // API는 YYYY-MM-DD 문자열. ISO(UTC)면 로컬 일자로 보정
            if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
                return {
                    y: String(raw.getFullYear()),
                    m: String(raw.getMonth() + 1),
                    d: String(raw.getDate())
                };
            }
            const s = String(raw).trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
                const [y, m, d] = s.split('-');
                return { y, m: String(Number(m)), d: String(Number(d)) };
            }
            const iso = s.match(/^(\d{4}-\d{2}-\d{2})T/);
            if (iso) {
                const dt = new Date(s);
                if (!Number.isNaN(dt.getTime())) {
                    return {
                        y: String(dt.getFullYear()),
                        m: String(dt.getMonth() + 1),
                        d: String(dt.getDate())
                    };
                }
                const [y, m, d] = iso[1].split('-');
                return { y, m: String(Number(m)), d: String(Number(d)) };
            }
            return { y: '', m: '', d: '' };
        }
        let foundedParts = splitYmd(monthly?.pr_founded_on);
        let approvedParts = splitYmd(monthly?.pr_approved_on);
        // 월례 API에 날짜가 없으면 회원 목록에서 Pr 공통 값 보완
        if (!foundedParts.y && !approvedParts.y) {
            try {
                const qs = new URLSearchParams({
                    church_name: churchName,
                    pr_name: prName
                });
                const memRes = await fetch(`/api/members?${qs.toString()}`);
                if (memRes.ok) {
                    const memData = await memRes.json();
                    const list = Array.isArray(memData) ? memData : (memData.members || memData.data || []);
                    for (const row of list) {
                        const f = splitYmd(row.pr_founded_on);
                        const a = splitYmd(row.pr_approved_on);
                        if (f.y || a.y) {
                            foundedParts = f;
                            approvedParts = a;
                            break;
                        }
                    }
                }
            } catch (e) {
                console.warn('Pr 설립·승인일 보완 조회 실패:', e);
            }
        }
        model.founded_y = foundedParts.y;
        model.founded_m = foundedParts.m;
        model.founded_d = foundedParts.d;
        model.approved_y = approvedParts.y;
        model.approved_m = approvedParts.m;
        model.approved_d = approvedParts.d;

        // 주간 수 추정
        try {
            const s = new Date(startDate);
            const e = new Date(endDate);
            const days = Math.max(0, Math.round((e - s) / 86400000) + 1);
            model.weeks = String(Math.round(days / 7));
        } catch (e) { /* ignore */ }

        container.innerHTML = isDaegu
            ? buildDaeguBusinessFormHtml(model)
            : (isGwangju ? buildGwangjuBusinessFormHtml(model) : buildFormHtml(model));
        wireBlankEditables(container);
    }

    function hide(container) {
        if (container) {
            container.innerHTML = '';
        }
    }

    function safeFilePart(value) {
        return String(value || '')
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\s+/g, '_')
            .slice(0, 40) || 'report';
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`스크립트 로드 실패: ${src}`));
            document.head.appendChild(script);
        });
    }

    async function ensurePdfLibraries() {
        if (!global.html2canvas) {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
        }
        if (!global.jspdf) {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        }
        if (!global.html2canvas || !global.jspdf) {
            throw new Error('PDF 라이브러리를 불러오지 못했습니다.');
        }
    }

    async function exportToPdf(formEl, meta) {
        if (!formEl) {
            throw new Error('출력할 사업 보고서 양식이 없습니다. 먼저 일년 집계를 조회해주세요.');
        }
        await ensurePdfLibraries();
        ensureStyles();

        formEl.classList.add('pr-biz-pdf-export');
        try {
            await withFrozenBlanks(formEl, async () => {
                const canvas = global.RegioPdfShare && typeof global.RegioPdfShare.captureFormToCanvas === 'function'
                    ? await global.RegioPdfShare.captureFormToCanvas(formEl)
                    : await global.html2canvas(formEl, {
                        scale: 2,
                        useCORS: true,
                        backgroundColor: '#ffffff',
                        logging: false
                    });

                const { jsPDF } = global.jspdf;
                const pdf = new jsPDF('portrait', 'mm', 'a4');
                const pageWidth = 210;
                const pageHeight = 297;
                const margin = 8;
                const usableWidth = pageWidth - margin * 2;
                const usableHeight = pageHeight - margin * 2;
                const imgData = canvas.toDataURL('image/jpeg', 0.95);
                const imgWidth = usableWidth;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;
                let heightLeft = imgHeight;
                let position = margin;

                pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
                heightLeft -= usableHeight;

                while (heightLeft > 0) {
                    position = margin - (imgHeight - heightLeft);
                    pdf.addPage();
                    pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
                    heightLeft -= usableHeight;
                }

                const stamp = new Date().toISOString().slice(0, 10);
                const prName = meta?.prName || '';
                const startDate = meta?.startDate || '';
                const endDate = meta?.endDate || '';
                const range = startDate && endDate ? `${startDate}_${endDate}` : stamp;
                const fileName = `Regio_Pr사업보고_${safeFilePart(prName)}_${safeFilePart(range)}.pdf`;
                if (global.RegioPdfShare && typeof global.RegioPdfShare.deliverJsPdf === 'function') {
                    await global.RegioPdfShare.deliverJsPdf(pdf, fileName, {
                        title: 'Pr 사업보고',
                        text: prName || fileName
                    });
                } else {
                    pdf.save(fileName);
                }
            });
        } finally {
            formEl.classList.remove('pr-biz-pdf-export');
        }
    }

    function downloadBlob(content, mime, filename) {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function buildPrBizExportBase(meta) {
        const stamp = new Date().toISOString().slice(0, 10);
        const prName = meta?.prName || '';
        const startDate = meta?.startDate || '';
        const endDate = meta?.endDate || '';
        const range = startDate && endDate ? `${startDate}_${endDate}` : stamp;
        return `Regio_Pr사업보고_${safeFilePart(prName)}_${safeFilePart(range)}`;
    }

    async function ensureXlsxLibrary() {
        if (global.XLSX) return;
        await loadScript('https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js');
        if (!global.XLSX) throw new Error('Excel 라이브러리를 불러오지 못했습니다.');
    }

    async function exportToExcel(formEl, meta) {
        if (!formEl) {
            throw new Error('출력할 사업 보고서 양식이 없습니다. 먼저 일년 집계를 조회해주세요.');
        }
        await ensureXlsxLibrary();
        ensureStyles();
        formEl.classList.add('pr-biz-pdf-export');
        try {
            await withFrozenBlanks(formEl, async () => {
                const rows = [];
                rows.push(['쁘레시디움 사업 보고서']);
                rows.push(['Pr', meta?.prName || '']);
                rows.push(['기간', `${meta?.startDate || ''} ~ ${meta?.endDate || ''}`]);
                rows.push([]);

                formEl.querySelectorAll('table').forEach((table, idx) => {
                    rows.push([`표 ${idx + 1}`]);
                    table.querySelectorAll('tr').forEach((tr) => {
                        const cells = [...tr.querySelectorAll('th,td')].map((td) =>
                            String(td.innerText || '').replace(/\s+/g, ' ').trim()
                        );
                        if (cells.some((c) => c)) rows.push(cells);
                    });
                    rows.push([]);
                });

                const worksheet = global.XLSX.utils.aoa_to_sheet(rows);
                worksheet['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
                const workbook = global.XLSX.utils.book_new();
                global.XLSX.utils.book_append_sheet(workbook, worksheet, 'Pr사업보고');
                global.XLSX.writeFile(workbook, `${buildPrBizExportBase(meta)}.xlsx`);
            });
        } finally {
            formEl.classList.remove('pr-biz-pdf-export');
        }
    }

    function exportToHangul(formEl, meta) {
        if (!formEl) {
            throw new Error('출력할 사업 보고서 양식이 없습니다. 먼저 일년 집계를 조회해주세요.');
        }
        ensureStyles();
        formEl.classList.add('pr-biz-pdf-export');
        const restore = freezeBlankInputsForExport(formEl);
        try {
            const html = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="utf-8">
    <meta name="Generator" content="Regio">
    <title>쁘레시디움 사업 보고서</title>
    <style>
        body { font-family: '맑은 고딕', 'Malgun Gothic', sans-serif; padding: 20px; color: #111; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11px; }
        th, td { border: 1px solid #333; padding: 4px; text-align: center; vertical-align: middle; }
        .left { text-align: left; }
        .blank, .blank-print { display: inline; border-bottom: none; }
        input { display: none !important; }
        .biz-note { display: none !important; }
    </style>
</head>
<body>
    <h1>쁘레시디움 사업 보고서</h1>
    <p>Pr: ${escapeHtml(meta?.prName || '')}</p>
    <p>기간: ${escapeHtml(meta?.startDate || '')} ~ ${escapeHtml(meta?.endDate || '')}</p>
    ${formEl.innerHTML}
</body>
</html>`;
            downloadBlob('\ufeff' + html, 'text/html;charset=utf-8', `${buildPrBizExportBase(meta)}.html`);
            alert('한글(아래한글)에서 "파일 > 열기"로 저장된 HTML 파일을 열 수 있습니다.');
        } finally {
            restore();
            formEl.classList.remove('pr-biz-pdf-export');
        }
    }

    global.RegioPrBusinessReportForm = {
        render,
        hide,
        buildFormHtml,
        buildDaeguBusinessFormHtml,
        buildGwangjuBusinessFormHtml,
        ensureStyles,
        exportToPdf,
        exportToExcel,
        exportToHangul
    };
})(typeof window !== 'undefined' ? window : global);
