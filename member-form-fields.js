/**
 * 회원가입 · 프로필수정 공통 항목 정의
 * 항목 추가/변경 시 이 파일만 수정하면 양쪽 폼에 동일 반영됩니다.
 */
(function (global) {
    'use strict';

    const POSITION_ITEMS = [
        { code: '1', label: '단장', tprefix: 'G1' },
        { code: '2', label: '부단장', tprefix: 'G2' },
        { code: '3', label: '서기', tprefix: 'G3' },
        { code: '4', label: '회계', tprefix: 'G4' },
        { code: '5', label: '행동단원', tprefix: 'G5' },
        { code: '6', label: '협조단원', tprefix: 'G6' },
        { code: '7', label: '쁘레또리운', tprefix: 'G7' },
        { code: '8', label: '아듀또리움', tprefix: 'G8' },
        { code: '9', label: '예비단원', tprefix: 'G9' },
        { code: '10', label: '휴가', tprefix: 'G10' }
    ];

    const POSITION_LABELS = POSITION_ITEMS.reduce((acc, item) => {
        acc[item.code] = item.label;
        acc[Number(item.code)] = item.label;
        return acc;
    }, {});

    const GENDER_OPTIONS = ['남', '여'];
    const PR_TYPE_OPTIONS = ['성인', '직속', '청년', '소년'];
    const SENATUS_OPTIONS = ['서울', '광주', '대구'];
    const WEEKDAY_OPTIONS = ['월', '화', '수', '목', '금', '토', '일'];
    const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i));
    const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

    /** 프로필 수정에서 확인/저장 단위로 다루는 항목 키 (스키마 순서) */
    const PROFILE_EDITABLE_KEYS = [
        'id', 'officerAppointed', 'baptism', 'church', 'curia', 'password', 'prDates', 'pr', 'prMeeting'
    ];

    const FIELD_LABELS = {
        id: 'ID',
        officerAppointed: '간부임명일',
        email: '이메일',
        baptism: '세례명/성별',
        church: '성당',
        curia: '꾸리아',
        password: '비밀번호',
        prDates: 'Pr 설립일·승인일',
        pr: 'Pr/구분',
        prMeeting: '주회합'
    };

    function escapeAttr(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
    }

    // G10 우선 (한 자리 1~9보다 먼저)
    const POSITION_CODE_RE = '(?:10|[1-9])';

    function sanitizeIdBody(value) {
        return String(value || '').trim()
            .replace(new RegExp(`^(?:10|[1-9])(?=[TG]${POSITION_CODE_RE})`, 'i'), '')
            .replace(/^(?:10|[1-9])/, '')
            .replace(new RegExp(`^[TG]${POSITION_CODE_RE}`, 'i'), '');
    }

    function parseLoginStyleId(loginId) {
        const trimmed = String(loginId || '').trim();
        const withoutLeadingCode = trimmed.replace(new RegExp(`^(?:10|[1-9])(?=[TG]${POSITION_CODE_RE})`, 'i'), '');
        const match = withoutLeadingCode.match(new RegExp(`^([TG])(${POSITION_CODE_RE})(.+?)(\\d{4})$`, 'i'));
        if (!match) return null;
        const code = parseInt(match[2], 10);
        const letter = match[1].toUpperCase();
        return {
            positionCode: code,
            name: `${letter}${match[2]}${match[3]}`,
            phone_last4: match[4],
            position: POSITION_LABELS[code] || null
        };
    }

    function buildPositionPickerHtml() {
        return POSITION_ITEMS.map((p) =>
            `<li data-code="${p.code}" data-label="${escapeAttr(p.label)}" data-tprefix="${p.tprefix}"><span class="pos-code">${p.tprefix}</span>${escapeAttr(p.label)}</li>`
        ).join('');
    }

    function buildChoiceTabsHtml(name, options, ariaLabel) {
        const tabs = options.map((value) => `
            <label class="reg-choice-tab">
                <input type="radio" name="${escapeAttr(name)}" value="${escapeAttr(value)}">
                <span>${escapeAttr(value)}</span>
            </label>
        `).join('');
        return `<div class="reg-choice-tabs" role="group" aria-label="${escapeAttr(ariaLabel)}">${tabs}</div>`;
    }

    function buildIdSectionHtml(options) {
        const opts = options || {};
        const showReset = opts.showResetBtn === true;
        const isProfile = opts.mode === 'profile';
        const resetBtn = showReset
            ? '<button type="button" class="id-reset-btn" id="resetRegIdBtn" title="처음부터 다시 입력">수정</button>'
            : '';
        // 프로필: G1~G10 접두사 + 바로 뒤 빨간 직책변경 클릭
        const prefixHtml = isProfile
            ? `<button type="button" class="id-g-prefix-btn" id="regIdPrefixBtn" title="직책(G1~G10) 변경">G?</button>
               <button type="button" class="id-position-change-btn" id="regPositionChangeBtn" title="직책 선택">직책</button>`
            : `<span class="id-prefix-label">ID</span>`;
        const positionHint = isProfile
            ? '<span class="selected-position-text empty" id="regSelectedPositionText" hidden>직책을 선택하세요</span>'
            : '<span class="selected-position-text empty" id="regSelectedPositionText">직책을 선택하세요</span>';
        return `
            <div class="reg-id-field-wrap id-field-wrap${isProfile ? ' profile-id-wrap' : ''}">
                ${positionHint}
                <div class="id-input-box${showReset ? ' has-id-reset' : ''}${isProfile ? ' has-g-prefix' : ''}">
                    ${prefixHtml}
                    <input type="text" class="input-field" placeholder="성명+숫자4자리" id="regUsername" required>
                    ${resetBtn}
                </div>
                <ul class="position-picker" id="regPositionPicker">${buildPositionPickerHtml()}</ul>
            </div>
            <p class="id-hint">${isProfile
                ? '이름 앞 <strong>G1~G10</strong> 뒤의 <strong style="color:#dc3545;">빨간 변경</strong>을 눌러 직책을 바꿉니다.'
                : '직책 선택 후 <strong>성명+숫자4자리</strong> 입력 (G는 자동 적용)'}</p>
            <p class="id-hint" id="regCuriaHint" style="display:none;">협조단원은 <strong>Pr만</strong> 입력하면 되며, 꾸리아 명칭은 나중에 기록할 수 있습니다.</p>
        `;
    }

    function buildEmailSectionHtml(mode) {
        if (mode === 'profile') {
            return `
                <input type="email" id="regEmail" readonly placeholder="Gmail 주소">
                <p class="profile-email-note">가입 시 인증한 이메일은 표시만 됩니다.</p>
            `;
        }
        return `
            <div class="email-verify-row">
                <input type="email" placeholder="Gmail 주소" id="regEmail" autocomplete="email">
                <button type="button" class="email-verify-btn" id="regEmailSendBtn">인증발송</button>
            </div>
            <div class="email-verify-row">
                <input type="text" placeholder="인증코드 6자리" id="regEmailCode" maxlength="6" inputmode="numeric">
                <button type="button" class="email-verify-btn" id="regEmailVerifyBtn">인증확인</button>
            </div>
            <p class="email-verify-status" id="regEmailStatus">회원가입 전 Gmail 인증이 필요합니다.</p>
        `;
    }

    function buildBaptismGenderHtml() {
        return `
            <div class="reg-baptism-gender-row">
                <input type="text" placeholder="세례명" id="regBaptismName">
                ${buildChoiceTabsHtml('regGender', GENDER_OPTIONS, '성별')}
            </div>
        `;
    }

    function buildChurchHtml() {
        return `<input type="text" placeholder="[  ]성당" id="regChurchName" required>`;
    }

    function buildCuriaHtml() {
        return `
            <div id="regCuriaNameWrap" class="reg-curia-comitia-row">
                <input type="text" placeholder="[  ]꾸리아 (정식명칭 숫자X)" id="regCuriaName">
            </div>
            <div id="regSenatusWrap" class="reg-senatus-row">
                <span class="reg-senatus-label">세나뚜스</span>
                ${buildChoiceTabsHtml('regSenatus', SENATUS_OPTIONS, '세나뚜스')}
            </div>
        `;
    }

    function buildPrTypeHtml() {
        return `
            <div class="reg-pr-type-row">
                <input type="text" placeholder="[  ]Pr" id="regPrName" required>
                ${buildChoiceTabsHtml('regPrType', PR_TYPE_OPTIONS, 'Pr 구분')}
            </div>
        `;
    }

    function buildPasswordHtml(options) {
        const opts = options || {};
        const required = opts.required === true;
        const placeholder = opts.placeholder
            || (required ? '비밀번호 (특수문자+영문3자+숫자4자)' : '변경 시 입력 (특수문자+영문3자+숫자4자)');
        return `<input type="text" placeholder="${escapeAttr(placeholder)}" id="regPassword" maxlength="8"${required ? ' required' : ''}>`;
    }

    function buildOfficerAppointedHtml() {
        return `
            <div id="regOfficerAppointedWrap" class="reg-officer-appointed-wrap" style="display:none;">
                <label class="reg-officer-appointed-label" for="regOfficerAppointedOn">간부임명일</label>
                <input type="date" id="regOfficerAppointedOn" placeholder="간부임명일 선택">
            </div>
        `;
    }

    function buildSelectOptions(options, placeholder) {
        const opts = options.map((value) =>
            `<option value="${escapeAttr(value)}">${escapeAttr(value)}</option>`
        ).join('');
        return `<option value="">${escapeAttr(placeholder)}</option>${opts}`;
    }

    function buildPrMeetingHtml() {
        const hourOpts = HOUR_OPTIONS.map((h) =>
            `<option value="${h}">${h}시</option>`
        ).join('');
        const minuteOpts = MINUTE_OPTIONS.map((m) =>
            `<option value="${Number(m)}">${m}분</option>`
        ).join('');
        const weekdayOpts = buildSelectOptions(WEEKDAY_OPTIONS, '요일');
        return `
            <div class="reg-pr-meeting-wrap" id="regPrMeetingWrap">
                <div class="reg-pr-meeting-label">소속 Pr 주회합</div>
                <div class="reg-pr-meeting-row">
                    <select id="regPrMeetingWeekday" aria-label="주회합 요일">${weekdayOpts}</select>
                    <select id="regPrMeetingHour" aria-label="주회합 시">
                        <option value="">시</option>${hourOpts}
                    </select>
                    <select id="regPrMeetingMinute" aria-label="주회합 분">
                        <option value="">분</option>${minuteOpts}
                    </select>
                </div>
                <input type="text" id="regPrMeetingPlace" class="reg-pr-meeting-place"
                       placeholder="장소 (예: 교육관 101호)" maxlength="100" aria-label="주회합 장소">
            </div>
        `;
    }

    function buildPrDatesHtml() {
        return `
            <div id="regPrDatesWrap" class="reg-pr-dates-wrap" style="display:none;">
                <div class="reg-pr-dates-label">Pr 설립일 · 승인일 (G1~G4)</div>
                <div class="reg-pr-dates-row">
                    <label class="reg-pr-date-item" for="regPrFoundedOn">
                        <span>Pr 설립일</span>
                        <input type="date" id="regPrFoundedOn" aria-label="Pr 설립일">
                    </label>
                    <label class="reg-pr-date-item" for="regPrApprovedOn">
                        <span>Pr 승인일</span>
                        <input type="date" id="regPrApprovedOn" aria-label="Pr 승인일">
                    </label>
                </div>
            </div>
        `;
    }

    /**
     * 가입/프로필 공통 섹션 스키마.
     * 새 항목 추가 시 여기에 push하고 build*Html / validate / snapshot 키를 맞추면 됩니다.
     */
    const FORM_SECTIONS = [
        {
            key: 'id',
            label: FIELD_LABELS.id,
            profileEditable: true,
            buildRegister: () => buildIdSectionHtml({ showResetBtn: true }),
            buildProfile: () => buildIdSectionHtml({ showResetBtn: false, mode: 'profile' })
        },
        {
            key: 'officerAppointed',
            label: '간부임명일',
            profileEditable: true,
            buildRegister: buildOfficerAppointedHtml,
            buildProfile: buildOfficerAppointedHtml
        },
        {
            key: 'email',
            label: FIELD_LABELS.email,
            profileEditable: false,
            buildRegister: () => buildEmailSectionHtml('register'),
            buildProfile: () => buildEmailSectionHtml('profile')
        },
        {
            key: 'baptism',
            label: FIELD_LABELS.baptism,
            profileEditable: true,
            buildRegister: buildBaptismGenderHtml,
            buildProfile: buildBaptismGenderHtml
        },
        {
            key: 'church',
            label: FIELD_LABELS.church,
            profileEditable: true,
            buildRegister: buildChurchHtml,
            buildProfile: buildChurchHtml
        },
        {
            key: 'curia',
            label: FIELD_LABELS.curia,
            profileEditable: true,
            buildRegister: buildCuriaHtml,
            buildProfile: buildCuriaHtml
        },
        {
            key: 'password',
            label: FIELD_LABELS.password,
            profileEditable: true,
            buildRegister: () => buildPasswordHtml({ required: true }),
            buildProfile: () => buildPasswordHtml({ required: false })
        },
        {
            key: 'prDates',
            label: FIELD_LABELS.prDates,
            profileEditable: true,
            buildRegister: buildPrDatesHtml,
            buildProfile: buildPrDatesHtml
        },
        {
            key: 'pr',
            label: FIELD_LABELS.pr,
            profileEditable: true,
            buildRegister: buildPrTypeHtml,
            buildProfile: buildPrTypeHtml
        },
        {
            key: 'prMeeting',
            label: FIELD_LABELS.prMeeting,
            profileEditable: true,
            buildRegister: () => '',
            buildProfile: buildPrMeetingHtml
        }
    ];

    function fieldActionButtons(fieldKey) {
        return `
            <div class="profile-field-actions">
                <button type="button" class="field-confirm-btn" data-field="${fieldKey}">확인</button>
                <button type="button" class="field-save-btn" data-field="${fieldKey}" disabled>저장</button>
            </div>
        `;
    }

    function wrapProfileSection(section) {
        const content = typeof section.buildProfile === 'function' ? section.buildProfile() : '';
        if (!section.profileEditable) {
            return `<div class="profile-field-row" data-field="${section.key}"><div class="profile-field-main">${content}</div></div>`;
        }
        return `
            <div class="profile-field-row" data-field="${section.key}">
                <div class="profile-field-main">${content}</div>
                ${fieldActionButtons(section.key)}
            </div>
        `;
    }

    function buildRegisterFormBodyHtml() {
        return FORM_SECTIONS.map((section) =>
            typeof section.buildRegister === 'function' ? section.buildRegister() : ''
        ).join('\n');
    }

    function buildRegisterModalHtml() {
        return `
            <div class="modal-content">
                <span class="close">&times;</span>
                <h2>등록신청</h2>
                <form id="registrationForm">
                    ${buildRegisterFormBodyHtml()}
                    <button type="submit">등록신청</button>
                </form>
            </div>
        `;
    }

    function buildProfileModalHtml(options) {
        const title = (options && options.title) || '프로필 수정';
        const sectionsHtml = FORM_SECTIONS.map(wrapProfileSection).join('\n');
        return `
            <div class="modal-content">
                <span class="close">&times;</span>
                <h2>${escapeAttr(title)}</h2>
                <form id="memberProfileForm">
                    ${sectionsHtml}
                    <div class="profile-cancel-wrap">
                        <button type="button" id="profileCancelBtn" class="profile-cancel-btn">수정취소</button>
                    </div>
                </form>
            </div>
        `;
    }

    function updateFormForPosition(modal, code) {
        const curiaWrap = modal.querySelector('#regCuriaNameWrap');
        const curiaInput = modal.querySelector('#regCuriaName');
        const curiaHint = modal.querySelector('#regCuriaHint');
        const officerWrap = modal.querySelector('#regOfficerAppointedWrap');
        const officerInput = modal.querySelector('#regOfficerAppointedOn');
        const prDatesWrap = modal.querySelector('#regPrDatesWrap');
        const prFoundedInput = modal.querySelector('#regPrFoundedOn');
        const prApprovedInput = modal.querySelector('#regPrApprovedOn');
        const isCooperator = String(code) === '6';
        const showOfficer = ['1', '2', '3', '4'].includes(String(code));

        if (curiaWrap) curiaWrap.style.display = isCooperator ? 'none' : '';
        if (curiaInput) {
            if (isCooperator) curiaInput.value = '';
            curiaInput.required = false;
        }
        if (curiaHint) curiaHint.style.display = isCooperator ? 'block' : 'none';
        if (officerWrap) officerWrap.style.display = showOfficer ? '' : 'none';
        if (officerInput && !showOfficer) officerInput.value = '';
        if (prDatesWrap) prDatesWrap.style.display = showOfficer ? '' : 'none';
        if (!showOfficer) {
            if (prFoundedInput) prFoundedInput.value = '';
            if (prApprovedInput) prApprovedInput.value = '';
        }
        if (prFoundedInput) prFoundedInput.disabled = !showOfficer;
        if (prApprovedInput) prApprovedInput.disabled = !showOfficer;
        const officerRow = modal.querySelector('.profile-field-row[data-field="officerAppointed"]');
        if (officerRow) {
            officerRow.classList.toggle('is-visible', showOfficer);
            if (!showOfficer) officerRow.style.display = 'none';
            else officerRow.style.display = '';
        }
        const prDatesRow = modal.querySelector('.profile-field-row[data-field="prDates"]');
        if (prDatesRow) {
            prDatesRow.classList.toggle('is-visible', showOfficer);
            if (!showOfficer) prDatesRow.style.display = 'none';
            else prDatesRow.style.display = '';
        }
    }

    function setupMemberIdField(modal, options) {
        const opts = options || {};
        const isProfile = opts.mode === 'profile';
        const regUsernameInput = modal.querySelector('#regUsername');
        const regPositionPicker = modal.querySelector('#regPositionPicker');
        const regSelectedPositionText = modal.querySelector('#regSelectedPositionText');
        const resetBtn = modal.querySelector('#resetRegIdBtn');
        const prefixBtn = modal.querySelector('#regIdPrefixBtn');
        const positionChangeBtn = modal.querySelector('#regPositionChangeBtn');
        let regSelectedPositionCode = '';
        let regSelectedPositionTPrefix = '';

        function showRegPositionPicker() {
            if (regPositionPicker) regPositionPicker.classList.add('open');
        }

        function hideRegPositionPicker() {
            if (regPositionPicker) regPositionPicker.classList.remove('open');
        }

        function updateRegSelectedPositionDisplay(code, label, tPrefix) {
            if (prefixBtn) {
                prefixBtn.textContent = tPrefix || 'G?';
                prefixBtn.classList.toggle('is-empty', !tPrefix);
                prefixBtn.setAttribute('aria-label', tPrefix ? `직책 ${tPrefix}` : '직책 미선택');
            }
            if (positionChangeBtn) {
                positionChangeBtn.textContent = tPrefix ? '변경' : '선택';
                positionChangeBtn.title = tPrefix
                    ? `직책 변경 (현재 ${tPrefix}${label ? ' ' + label : ''})`
                    : '직책(G1~G10) 선택';
            }
            if (!regSelectedPositionText) return;
            if (code && label && tPrefix) {
                regSelectedPositionText.textContent = `${label} ${tPrefix}`;
                regSelectedPositionText.classList.remove('empty');
            } else {
                regSelectedPositionText.textContent = '직책을 선택하세요';
                regSelectedPositionText.classList.add('empty');
            }
        }

        function applyRegPositionCode(code, label, tPrefix) {
            regSelectedPositionCode = code;
            regSelectedPositionTPrefix = tPrefix || '';
            updateRegSelectedPositionDisplay(code, label, tPrefix);
            updateFormForPosition(modal, code);
            if (regPositionPicker) {
                regPositionPicker.querySelectorAll('li').forEach((item) => {
                    item.classList.toggle('selected', item.dataset.code === code);
                });
            }
            if (regUsernameInput) regUsernameInput.focus();
            hideRegPositionPicker();
        }

        function buildRegId() {
            const body = sanitizeIdBody(regUsernameInput ? regUsernameInput.value : '');
            if (!regSelectedPositionTPrefix) return body;
            return `${regSelectedPositionTPrefix}${body}`;
        }

        function resetRegistrationId() {
            regSelectedPositionCode = '';
            regSelectedPositionTPrefix = '';
            updateRegSelectedPositionDisplay('', '', '');
            updateFormForPosition(modal, '');
            if (regPositionPicker) {
                regPositionPicker.querySelectorAll('li').forEach((item) => item.classList.remove('selected'));
            }
            if (regUsernameInput) {
                regUsernameInput.value = '';
                regUsernameInput.focus();
            }
            hideRegPositionPicker();
            showRegPositionPicker();
        }

        if (regUsernameInput) {
            // 프로필: 이름 입력 시 피커가 뜨지 않도록 — G1 뒤 빨간 '변경'으로만 직책 변경
            if (!isProfile) {
                regUsernameInput.addEventListener('focus', showRegPositionPicker);
                regUsernameInput.addEventListener('click', showRegPositionPicker);
            }
            regUsernameInput.addEventListener('input', function () {
                const sanitized = sanitizeIdBody(regUsernameInput.value);
                if (regUsernameInput.value !== sanitized) {
                    regUsernameInput.value = sanitized;
                }
            });
        }
        if (regSelectedPositionText && !isProfile) {
            regSelectedPositionText.addEventListener('click', showRegPositionPicker);
        }
        if (prefixBtn) {
            prefixBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showRegPositionPicker();
            });
        }
        if (positionChangeBtn) {
            positionChangeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showRegPositionPicker();
            });
        }
        if (regPositionPicker) {
            regPositionPicker.querySelectorAll('li').forEach((item) => {
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    applyRegPositionCode(item.dataset.code, item.dataset.label, item.dataset.tprefix);
                });
            });
        }
        if (resetBtn && opts.bindResetBtn === true) {
            resetBtn.addEventListener('click', (e) => {
                e.preventDefault();
                resetRegistrationId();
            });
        }
        modal.addEventListener('click', (e) => {
            if (!e.target.closest('.reg-id-field-wrap')) {
                hideRegPositionPicker();
            }
        });

        return {
            mode: opts.mode || 'register',
            buildRegId,
            getSelectedPositionCode: () => regSelectedPositionCode,
            getSelectedPositionTPrefix: () => regSelectedPositionTPrefix,
            hasPosition: () => !!regSelectedPositionTPrefix,
            applyPosition: applyRegPositionCode,
            setIdBody: (body) => {
                if (regUsernameInput) regUsernameInput.value = body;
            },
            updateFormForPosition: (code) => updateFormForPosition(modal, code),
            resetRegistrationId
        };
    }

    function validateField(fieldKey, modal, idField, mode) {
        const isProfile = mode === 'profile';
        switch (fieldKey) {
            case 'id': {
                if (idField.hasPosition()) {
                    const parsedId = parseLoginStyleId(idField.buildRegId());
                    if (!parsedId) {
                        return { ok: false, message: '성명+숫자4자리 형식으로 ID를 입력해주세요.' };
                    }
                    if (String(parsedId.positionCode) !== String(idField.getSelectedPositionCode())) {
                        return { ok: false, message: '선택한 직책과 ID가 일치하지 않습니다.' };
                    }
                    return { ok: true };
                }
                if (isProfile) {
                    const legacyName = sanitizeIdBody(modal.querySelector('#regUsername').value).trim();
                    if (!legacyName) return { ok: false, message: '성명을 입력해주세요.' };
                    return { ok: true };
                }
                return { ok: false, message: '직책을 선택하고 ID를 입력해주세요.' };
            }
            case 'baptism': {
                const selectedGender = modal.querySelector('input[name="regGender"]:checked');
                if (!selectedGender || !GENDER_OPTIONS.includes(selectedGender.value)) {
                    return { ok: false, message: '성별(남/여)을 선택해주세요.' };
                }
                return { ok: true };
            }
            case 'church': {
                const church = modal.querySelector('#regChurchName').value.trim();
                if (!church) return { ok: false, message: '성당명을 입력해주세요.' };
                return { ok: true };
            }
            case 'curia': {
                const code = String(idField.getSelectedPositionCode() || '');
                if (code === '6') {
                    // 협조단원도 세나뚜스는 선택
                }
                const curia = modal.querySelector('#regCuriaName')?.value.trim() || '';
                if (code !== '6' && curia && /\d/.test(curia)) {
                    return { ok: false, message: '꾸리아 정식명칭에는 숫자를 입력할 수 없습니다.' };
                }
                const senatusEl = modal.querySelector('input[name="regSenatus"]:checked');
                const senatus = senatusEl ? String(senatusEl.value || '').trim() : '';
                if (!SENATUS_OPTIONS.includes(senatus)) {
                    return { ok: false, message: '세나뚜스(서울·광주·대구)를 선택해주세요.' };
                }
                return { ok: true };
            }
            case 'officerAppointed': {
                const code = String(idField.getSelectedPositionCode() || '');
                if (!['1', '2', '3', '4'].includes(code)) return { ok: true };
                const appointed = modal.querySelector('#regOfficerAppointedOn');
                const value = appointed ? String(appointed.value || '').trim() : '';
                if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                    return { ok: false, message: '간부임명일을 선택해주세요.' };
                }
                return { ok: true };
            }
            case 'pr': {
                const pr = modal.querySelector('#regPrName').value.trim();
                if (!pr) return { ok: false, message: 'Pr 호도를 입력해주세요.' };
                const selectedPrType = modal.querySelector('input[name="regPrType"]:checked');
                if (!selectedPrType || !PR_TYPE_OPTIONS.includes(selectedPrType.value)) {
                    return { ok: false, message: 'Pr 구분(성인/직속/청년/소년)을 선택해주세요.' };
                }
                return { ok: true };
            }
            case 'prMeeting': {
                const weekday = modal.querySelector('#regPrMeetingWeekday')?.value.trim() || '';
                const hour = modal.querySelector('#regPrMeetingHour')?.value.trim() || '';
                const minute = modal.querySelector('#regPrMeetingMinute')?.value.trim() || '';
                const place = modal.querySelector('#regPrMeetingPlace')?.value.trim() || '';
                if (!WEEKDAY_OPTIONS.includes(weekday)) {
                    return { ok: false, message: '주회합 요일을 선택해주세요.' };
                }
                if (hour === '' || !HOUR_OPTIONS.includes(hour)) {
                    return { ok: false, message: '주회합 시를 선택해주세요.' };
                }
                const minuteNum = String(Number(minute));
                const allowedMinutes = MINUTE_OPTIONS.map((m) => String(Number(m)));
                if (minute === '' || !allowedMinutes.includes(minuteNum)) {
                    return { ok: false, message: '주회합 분을 선택해주세요.' };
                }
                if (!place) {
                    return { ok: false, message: '주회합 장소를 입력해주세요.' };
                }
                return { ok: true };
            }
            case 'password': {
                const password = modal.querySelector('#regPassword').value.trim();
                if (isProfile && !password) {
                    return { ok: false, message: '변경할 비밀번호를 입력해주세요.' };
                }
                if (!password || !/^[!@#$%^&*][a-zA-Z]{3}\d{4}$/.test(password)) {
                    return { ok: false, message: '비밀번호는 특수문자+영문3자+숫자4자 형식이어야 합니다. (예: @abc1234)' };
                }
                return { ok: true };
            }
            case 'prDates': {
                const founded = modal.querySelector('#regPrFoundedOn')?.value.trim() || '';
                const approved = modal.querySelector('#regPrApprovedOn')?.value.trim() || '';
                if (founded && !/^\d{4}-\d{2}-\d{2}$/.test(founded)) {
                    return { ok: false, message: 'Pr 설립일 형식이 올바르지 않습니다.' };
                }
                if (approved && !/^\d{4}-\d{2}-\d{2}$/.test(approved)) {
                    return { ok: false, message: 'Pr 승인일 형식이 올바르지 않습니다.' };
                }
                if (founded && approved && founded > approved) {
                    return { ok: false, message: 'Pr 승인일은 설립일 이후여야 합니다.' };
                }
                return { ok: true };
            }
            default:
                return { ok: true };
        }
    }

    function memberToRegFields(user) {
        const name = String((user && user.name) || '');
        const phone4 = String((user && user.phone_last4) || '').replace(/\D/g, '').slice(-4);
        const prefixMatch = name.match(/^([TG])((?:10|[1-9]))(.+)$/i);
        if (prefixMatch) {
            const code = prefixMatch[2];
            const pos = POSITION_ITEMS.find((p) => p.code === code);
            const idBody = phone4 ? `${prefixMatch[3]}${phone4}` : prefixMatch[3];
            return {
                isLegacy: false,
                positionCode: code,
                label: pos ? pos.label : '',
                tprefix: pos ? pos.tprefix : `${prefixMatch[1].toUpperCase()}${code}`,
                idBody
            };
        }
        return { isLegacy: true, idBody: name };
    }

    function fillMemberForm(modal, user, idField, sessionUser) {
        const u = user || {};
        const regFields = memberToRegFields(u);
        if (!regFields.isLegacy && idField) {
            idField.applyPosition(regFields.positionCode, regFields.label, regFields.tprefix);
        } else if (idField) {
            idField.updateFormForPosition('');
        }
        if (idField) idField.setIdBody(regFields.idBody);

        const emailEl = modal.querySelector('#regEmail');
        if (emailEl) emailEl.value = u.email || (sessionUser && sessionUser.email) || '';

        const baptismEl = modal.querySelector('#regBaptismName');
        if (baptismEl) baptismEl.value = u.baptism_name || '';

        if (u.gender && GENDER_OPTIONS.includes(u.gender)) {
            const genderRadio = modal.querySelector(`input[name="regGender"][value="${u.gender}"]`);
            if (genderRadio) genderRadio.checked = true;
        }

        const setVal = (id, value) => {
            const el = modal.querySelector(`#${id}`);
            if (el) el.value = value || '';
        };
        setVal('regChurchName', u.church_name);
        setVal('regCuriaName', u.curia_name);
        setVal('regPrName', u.pr_name);

        if (u.senatus_name && SENATUS_OPTIONS.includes(u.senatus_name)) {
            const senatusRadio = modal.querySelector(`input[name="regSenatus"][value="${u.senatus_name}"]`);
            if (senatusRadio) senatusRadio.checked = true;
        }

        let appointed = u.officer_appointed_on || '';
        if (appointed && typeof appointed === 'string' && appointed.includes('T')) {
            appointed = appointed.slice(0, 10);
        } else if (appointed instanceof Date && !Number.isNaN(appointed.getTime())) {
            appointed = appointed.toISOString().slice(0, 10);
        }
        setVal('regOfficerAppointedOn', appointed);

        function toDateInput(value) {
            if (!value) return '';
            if (typeof value === 'string' && value.includes('T')) return value.slice(0, 10);
            if (value instanceof Date && !Number.isNaN(value.getTime())) {
                return value.toISOString().slice(0, 10);
            }
            const s = String(value).trim();
            return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
        }
        setVal('regPrFoundedOn', toDateInput(u.pr_founded_on));
        setVal('regPrApprovedOn', toDateInput(u.pr_approved_on));

        const setSelect = (id, value) => {
            const el = modal.querySelector(`#${id}`);
            if (!el || value == null || value === '') return;
            el.value = String(value);
        };
        setSelect('regPrMeetingWeekday', u.pr_meeting_weekday);
        if (u.pr_meeting_hour != null && u.pr_meeting_hour !== '') {
            setSelect('regPrMeetingHour', String(Number(u.pr_meeting_hour)));
        }
        if (u.pr_meeting_minute != null && u.pr_meeting_minute !== '') {
            setSelect('regPrMeetingMinute', String(Number(u.pr_meeting_minute)));
        }
        setVal('regPrMeetingPlace', u.pr_meeting_place);
        const meetingLabel = modal.querySelector('.reg-pr-meeting-label');
        if (meetingLabel) {
            const prName = String(u.pr_name || '').trim();
            meetingLabel.textContent = prName ? `소속 Pr 주회합 (${prName})` : '소속 Pr 주회합';
        }

        if (u.pr_type && PR_TYPE_OPTIONS.includes(u.pr_type)) {
            const prTypeRadio = modal.querySelector(`input[name="regPrType"][value="${u.pr_type}"]`);
            if (prTypeRadio) prTypeRadio.checked = true;
        }
    }

    function resolveIdentityFromProfile(profileUser) {
        const regFields = memberToRegFields(profileUser);
        if (!regFields.isLegacy) {
            const loginId = `${regFields.tprefix}${regFields.idBody}`;
            const parsedId = parseLoginStyleId(loginId);
            if (parsedId) {
                return {
                    name: parsedId.name,
                    phone_last4: parsedId.phone_last4,
                    position: parsedId.position,
                    positionCode: String(parsedId.positionCode)
                };
            }
        }
        const codeMatch = String((profileUser && profileUser.name) || '').match(/^[TG]((?:10|[1-9]))/i);
        return {
            name: profileUser.name,
            phone_last4: profileUser.phone_last4,
            position: profileUser.position,
            positionCode: codeMatch ? codeMatch[1] : ''
        };
    }

    function collectMemberFormData(modal, idField, profileUser, onlyFieldKey) {
        const identity = resolveIdentityFromProfile(profileUser || {});
        let name = identity.name;
        let phone_last4 = identity.phone_last4;
        let position = identity.position;
        let positionCode = identity.positionCode;

        if (!onlyFieldKey || onlyFieldKey === 'id') {
            if (idField.hasPosition()) {
                const parsedId = parseLoginStyleId(idField.buildRegId());
                if (parsedId) {
                    name = parsedId.name;
                    phone_last4 = parsedId.phone_last4;
                    position = parsedId.position;
                    positionCode = String(parsedId.positionCode);
                }
            } else if (!onlyFieldKey) {
                name = sanitizeIdBody(modal.querySelector('#regUsername').value).trim();
                phone_last4 = (profileUser && profileUser.phone_last4) || phone_last4;
                position = (profileUser && profileUser.position) || position;
            } else if (onlyFieldKey === 'id') {
                name = sanitizeIdBody(modal.querySelector('#regUsername').value).trim();
                phone_last4 = profileUser.phone_last4;
                position = profileUser.position;
            }
        }

        const isCooperator = positionCode === '6';
        const isG1toG4 = ['1', '2', '3', '4'].includes(positionCode);
        const selectedGender = modal.querySelector('input[name="regGender"]:checked');
        const selectedPrType = modal.querySelector('input[name="regPrType"]:checked');
        const selectedSenatus = modal.querySelector('input[name="regSenatus"]:checked');

        const formData = {
            name,
            baptism_name: (profileUser && profileUser.baptism_name) || null,
            gender: (profileUser && profileUser.gender) || null,
            church_name: (profileUser && profileUser.church_name) || '',
            curia_name: isCooperator ? null : ((profileUser && profileUser.curia_name) || null),
            // 꼬미시움·레지아는 입력란 제거 — 기존 값 유지. 세나뚜스는 등록/수정 시 선택
            comitia_name: (profileUser && profileUser.comitia_name) || null,
            regia_name: (profileUser && profileUser.regia_name) || null,
            senatus_name: (profileUser && profileUser.senatus_name) || null,
            officer_appointed_on: isG1toG4
                ? ((profileUser && profileUser.officer_appointed_on) || null)
                : null,
            pr_founded_on: isG1toG4
                ? ((profileUser && profileUser.pr_founded_on) || null)
                : null,
            pr_approved_on: isG1toG4
                ? ((profileUser && profileUser.pr_approved_on) || null)
                : null,
            pr_meeting_weekday: (profileUser && profileUser.pr_meeting_weekday) || null,
            pr_meeting_hour: (profileUser && profileUser.pr_meeting_hour != null)
                ? profileUser.pr_meeting_hour
                : null,
            pr_meeting_minute: (profileUser && profileUser.pr_meeting_minute != null)
                ? profileUser.pr_meeting_minute
                : null,
            pr_meeting_place: (profileUser && profileUser.pr_meeting_place) || null,
            pr_name: (profileUser && profileUser.pr_name) || '',
            pr_type: (profileUser && profileUser.pr_type) || null,
            position,
            phone_last4,
            resident_id_front6: profileUser && profileUser.resident_id_front6,
            phone_full: (profileUser && profileUser.phone_full) || null,
            resident_id_full: (profileUser && profileUser.resident_id_full) || null
        };

        function readAppointedOn() {
            const el = modal.querySelector('#regOfficerAppointedOn');
            const value = el ? String(el.value || '').trim() : '';
            return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
        }

        function readDateInput(id) {
            const el = modal.querySelector(`#${id}`);
            const value = el ? String(el.value || '').trim() : '';
            return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
        }

        function readPrDates() {
            if (!isG1toG4) {
                return { pr_founded_on: null, pr_approved_on: null };
            }
            return {
                pr_founded_on: readDateInput('regPrFoundedOn'),
                pr_approved_on: readDateInput('regPrApprovedOn')
            };
        }

        function readPrMeeting() {
            const weekdayEl = modal.querySelector('#regPrMeetingWeekday');
            const hourEl = modal.querySelector('#regPrMeetingHour');
            const minuteEl = modal.querySelector('#regPrMeetingMinute');
            const placeEl = modal.querySelector('#regPrMeetingPlace');
            if (!weekdayEl && !hourEl && !minuteEl && !placeEl) {
                return {
                    pr_meeting_weekday: formData.pr_meeting_weekday,
                    pr_meeting_hour: formData.pr_meeting_hour,
                    pr_meeting_minute: formData.pr_meeting_minute,
                    pr_meeting_place: formData.pr_meeting_place
                };
            }
            const weekday = weekdayEl ? String(weekdayEl.value || '').trim() : '';
            const hourRaw = hourEl ? String(hourEl.value || '').trim() : '';
            const minuteRaw = minuteEl ? String(minuteEl.value || '').trim() : '';
            const place = placeEl ? String(placeEl.value || '').trim().slice(0, 100) : '';
            return {
                pr_meeting_weekday: WEEKDAY_OPTIONS.includes(weekday) ? weekday : null,
                pr_meeting_hour: hourRaw === '' ? null : Number(hourRaw),
                pr_meeting_minute: minuteRaw === '' ? null : Number(minuteRaw),
                pr_meeting_place: place || null
            };
        }

        function readLive() {
            formData.baptism_name = modal.querySelector('#regBaptismName').value.trim() || null;
            formData.gender = selectedGender ? selectedGender.value : null;
            formData.church_name = modal.querySelector('#regChurchName').value.trim();
            formData.curia_name = isCooperator ? null : (modal.querySelector('#regCuriaName').value.trim() || null);
            formData.senatus_name = selectedSenatus && SENATUS_OPTIONS.includes(selectedSenatus.value)
                ? selectedSenatus.value
                : null;
            formData.officer_appointed_on = isG1toG4 ? readAppointedOn() : null;
            Object.assign(formData, readPrDates());
            Object.assign(formData, readPrMeeting());
            formData.pr_name = modal.querySelector('#regPrName').value.trim();
            formData.pr_type = selectedPrType ? selectedPrType.value : null;
            const password = modal.querySelector('#regPassword').value.trim();
            if (password) formData.password = password;
        }

        if (!onlyFieldKey) {
            readLive();
            return formData;
        }

        if (onlyFieldKey === 'baptism') {
            formData.baptism_name = modal.querySelector('#regBaptismName').value.trim() || null;
            formData.gender = selectedGender ? selectedGender.value : null;
        } else if (onlyFieldKey === 'church') {
            formData.church_name = modal.querySelector('#regChurchName').value.trim();
        } else if (onlyFieldKey === 'curia') {
            formData.curia_name = isCooperator ? null : (modal.querySelector('#regCuriaName').value.trim() || null);
            const senatusEl = modal.querySelector('input[name="regSenatus"]:checked');
            formData.senatus_name = senatusEl && SENATUS_OPTIONS.includes(senatusEl.value)
                ? senatusEl.value
                : null;
        } else if (onlyFieldKey === 'officerAppointed') {
            formData.officer_appointed_on = isG1toG4 ? readAppointedOn() : null;
        } else if (onlyFieldKey === 'prDates') {
            Object.assign(formData, readPrDates());
        } else if (onlyFieldKey === 'pr') {
            formData.pr_name = modal.querySelector('#regPrName').value.trim();
            formData.pr_type = selectedPrType ? selectedPrType.value : null;
        } else if (onlyFieldKey === 'prMeeting') {
            Object.assign(formData, readPrMeeting());
        } else if (onlyFieldKey === 'password') {
            const password = modal.querySelector('#regPassword').value.trim();
            if (password) formData.password = password;
        } else if (onlyFieldKey === 'id' && isCooperator) {
            formData.curia_name = null;
            formData.comitia_name = null;
            formData.regia_name = null;
            formData.officer_appointed_on = null;
            formData.pr_founded_on = null;
            formData.pr_approved_on = null;
        }

        return formData;
    }

    function captureFormSnapshot(modal, idField) {
        const genderEl = modal.querySelector('input[name="regGender"]:checked');
        const prTypeEl = modal.querySelector('input[name="regPrType"]:checked');
        const senatusEl = modal.querySelector('input[name="regSenatus"]:checked');
        const appointedEl = modal.querySelector('#regOfficerAppointedOn');
        const foundedEl = modal.querySelector('#regPrFoundedOn');
        const approvedEl = modal.querySelector('#regPrApprovedOn');
        const weekdayEl = modal.querySelector('#regPrMeetingWeekday');
        const hourEl = modal.querySelector('#regPrMeetingHour');
        const minuteEl = modal.querySelector('#regPrMeetingMinute');
        const placeEl = modal.querySelector('#regPrMeetingPlace');
        return {
            id: idField.hasPosition()
                ? idField.buildRegId()
                : sanitizeIdBody(modal.querySelector('#regUsername').value).trim(),
            positionCode: String(idField.getSelectedPositionCode() || ''),
            officerAppointed: appointedEl ? String(appointedEl.value || '').trim() : '',
            baptism: modal.querySelector('#regBaptismName').value.trim(),
            gender: genderEl ? genderEl.value : '',
            church: modal.querySelector('#regChurchName').value.trim(),
            curia: modal.querySelector('#regCuriaName')?.value.trim() || '',
            senatus: senatusEl ? senatusEl.value : '',
            password: modal.querySelector('#regPassword').value.trim(),
            prFounded: foundedEl ? String(foundedEl.value || '').trim() : '',
            prApproved: approvedEl ? String(approvedEl.value || '').trim() : '',
            pr: modal.querySelector('#regPrName').value.trim(),
            prType: prTypeEl ? prTypeEl.value : '',
            prMeetingWeekday: weekdayEl ? String(weekdayEl.value || '').trim() : '',
            prMeetingHour: hourEl ? String(hourEl.value || '').trim() : '',
            prMeetingMinute: minuteEl ? String(minuteEl.value || '').trim() : '',
            prMeetingPlace: placeEl ? String(placeEl.value || '').trim() : ''
        };
    }

    function isFormDirty(modal, idField, snapshot) {
        if (!snapshot) return false;
        const current = captureFormSnapshot(modal, idField);
        return Object.keys(snapshot).some((key) => String(current[key] || '') !== String(snapshot[key] || ''));
    }

    function ensureSharedFormStyles() {
        let style = document.getElementById('member-form-fields-styles');
        if (!style) {
            style = document.createElement('style');
            style.id = 'member-form-fields-styles';
            document.head.appendChild(style);
        }
        style.textContent = `
            .modal-content .reg-baptism-gender-row,
            .modal-content .reg-pr-type-row,
            .modal-content .reg-curia-comitia-row,
            .modal-content .reg-regia-senatus-row { display: flex; gap: 8px; align-items: stretch; }
            .modal-content .reg-senatus-row {
                display: flex; gap: 8px; align-items: center; margin: 0 0 14px;
                padding: 8px 10px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px;
            }
            .modal-content .reg-senatus-label {
                flex-shrink: 0; font-size: 12px; font-weight: 600; color: #334155; min-width: 52px;
            }
            .modal-content .reg-senatus-row .reg-choice-tabs { flex: 1; }
            .modal-content .reg-baptism-gender-row > input,
            .modal-content .reg-pr-type-row > input,
            .modal-content .reg-curia-comitia-row > input,
            .modal-content .reg-regia-senatus-row > input,
            .modal-content .reg-regia-senatus-row > select { flex: 1; min-width: 0; }
            .modal-content .reg-choice-tabs { display: flex; flex-shrink: 0; border: 1px solid #ddd; border-radius: 6px; overflow: hidden; }
            .modal-content .reg-choice-tab { display: flex; margin: 0; cursor: pointer; }
            .modal-content .reg-choice-tab input { position: absolute; opacity: 0; pointer-events: none; width: 0; height: 0; }
            .modal-content .reg-choice-tab span { display: flex; align-items: center; justify-content: center; padding: 0 10px; min-width: 36px; height: 100%; min-height: 42px; font-size: 12px; color: #666; background: #fff; border-right: 1px solid #ddd; }
            .modal-content .reg-choice-tab:last-child span { border-right: none; }
            .modal-content .reg-choice-tab input:checked + span { background: #4A90E2; color: #fff; font-weight: 600; }
            .modal-content .profile-email-note { margin: 0; font-size: 11px; color: #888; line-height: 1.4; }
            .modal-content .id-input-box.has-g-prefix { align-items: stretch; }
            .modal-content .id-g-prefix-btn {
                flex-shrink: 0; width: auto !important; min-width: 42px; padding: 0 10px !important; border: none; border-right: 1px solid #ddd;
                border-radius: 0 !important; background: #f8f9fa !important; color: #222 !important; font-size: 12px !important; font-weight: 700; cursor: pointer;
            }
            .modal-content .id-g-prefix-btn.is-empty { color: #999 !important; font-weight: 600; }
            .modal-content .id-g-prefix-btn:hover { background: #eef2f6 !important; }
            .modal-content .id-position-change-btn {
                flex-shrink: 0; width: auto !important; min-width: 44px; padding: 0 10px !important; border: none; border-right: 1px solid #f5c2c7;
                border-radius: 0 !important; background: #dc3545 !important; color: #fff !important; font-size: 12px !important; font-weight: 700; cursor: pointer;
            }
            .modal-content .id-position-change-btn:hover { background: #c82333 !important; }
            .modal-content .id-position-change-btn:active { background: #bd2130 !important; }
            .modal-content .reg-officer-appointed-wrap {
                margin: 0 0 14px; padding: 10px 12px;
                background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px;
            }
            .modal-content .reg-officer-appointed-label {
                display: block; margin-bottom: 6px; font-size: 12px; font-weight: 600; color: #334155;
            }
            .modal-content .reg-officer-appointed-wrap input[type="date"] {
                width: 100%; margin: 0;
            }
            .modal-content .reg-pr-meeting-wrap {
                margin: 0;
            }
            .modal-content .reg-pr-meeting-label {
                display: block; margin-bottom: 6px; font-size: 12px; font-weight: 600; color: #334155;
            }
            .modal-content .reg-pr-meeting-row {
                display: flex; gap: 8px; align-items: stretch;
            }
            .modal-content .reg-pr-meeting-row > select {
                flex: 1; min-width: 0; margin: 0;
            }
            .modal-content .reg-pr-meeting-place {
                width: 100%; margin: 8px 0 0; box-sizing: border-box;
            }
            .modal-content .reg-pr-dates-wrap { margin: 0; }
            .modal-content .reg-pr-dates-label {
                display: block; margin-bottom: 6px; font-size: 12px; font-weight: 600; color: #334155;
            }
            .modal-content .reg-pr-dates-row {
                display: flex; gap: 8px; align-items: stretch;
            }
            .modal-content .reg-pr-date-item {
                flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;
                font-size: 12px; color: #475569; font-weight: 600;
            }
            .modal-content .reg-pr-date-item input[type="date"] {
                width: 100%; margin: 0; box-sizing: border-box;
            }
            .modal-content .profile-field-row[data-field="officerAppointed"],
            .modal-content .profile-field-row[data-field="prDates"] {
                display: none;
            }
            .modal-content .profile-field-row[data-field="officerAppointed"].is-visible,
            .modal-content .profile-field-row[data-field="prDates"].is-visible {
                display: flex;
            }
        `;
    }

    global.RegioMemberForm = {
        POSITION_ITEMS,
        POSITION_LABELS,
        GENDER_OPTIONS,
        PR_TYPE_OPTIONS,
        SENATUS_OPTIONS,
        WEEKDAY_OPTIONS,
        HOUR_OPTIONS,
        MINUTE_OPTIONS,
        FORM_SECTIONS,
        PROFILE_EDITABLE_KEYS,
        FIELD_LABELS,
        sanitizeIdBody,
        parseLoginStyleId,
        buildRegisterModalHtml,
        buildRegisterFormBodyHtml,
        buildProfileModalHtml,
        setupMemberIdField,
        updateFormForPosition,
        validateField,
        memberToRegFields,
        fillMemberForm,
        collectMemberFormData,
        captureFormSnapshot,
        isFormDirty,
        ensureSharedFormStyles
    };
})(typeof window !== 'undefined' ? window : global);
