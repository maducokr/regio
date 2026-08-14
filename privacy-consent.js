(function (global) {
    'use strict';

    const STORAGE_KEY = 'regioPrivacyConsentGranted';

    function isGranted() {
        return sessionStorage.getItem(STORAGE_KEY) === 'true';
    }

    function setJoinButtonLocked(locked) {
        const joinBtn = document.querySelector('.bottom-actions .join-button');
        if (!joinBtn) return;
        if (locked) {
            if (joinBtn.dataset.privacyPrevDisabled === undefined) {
                joinBtn.dataset.privacyPrevDisabled = joinBtn.disabled ? '1' : '0';
            }
            joinBtn.disabled = true;
        } else if (joinBtn.dataset.privacyPrevDisabled !== undefined) {
            joinBtn.disabled = joinBtn.dataset.privacyPrevDisabled === '1';
            delete joinBtn.dataset.privacyPrevDisabled;
        }
    }

    function setLocked(locked) {
        const gated = document.getElementById('authGatedArea');
        if (gated) {
            gated.classList.toggle('is-locked', locked);
            gated.querySelectorAll('input, button, select, textarea').forEach(function (el) {
                if (locked) {
                    if (el.dataset.privacyPrevDisabled === undefined) {
                        el.dataset.privacyPrevDisabled = el.disabled ? '1' : '0';
                    }
                    el.disabled = true;
                } else if (el.dataset.privacyPrevDisabled !== undefined) {
                    el.disabled = el.dataset.privacyPrevDisabled === '1';
                    delete el.dataset.privacyPrevDisabled;
                }
            });
        }

        setJoinButtonLocked(locked);

        const googleWrap = document.getElementById('googleSignInWrap');
        if (googleWrap) {
            googleWrap.classList.toggle('is-privacy-locked', locked);
        }

        if (!locked && typeof global.checkInputs === 'function') {
            global.checkInputs();
        }

        global.dispatchEvent(new CustomEvent('privacy-consent-changed', {
            detail: { granted: !locked }
        }));
    }

    function applyConsent(granted) {
        sessionStorage.setItem(STORAGE_KEY, granted ? 'true' : 'false');
        setLocked(!granted);
    }

    function bindMutuallyExclusiveCheckboxes(agreeBox, disagreeBox) {
        agreeBox.addEventListener('click', function (e) {
            e.stopPropagation();
            const willCheck = !agreeBox.classList.contains('checked');
            agreeBox.classList.toggle('checked', willCheck);
            if (willCheck) {
                disagreeBox.classList.remove('checked');
                applyConsent(true);
            } else {
                applyConsent(false);
            }
        });

        disagreeBox.addEventListener('click', function (e) {
            e.stopPropagation();
            const willCheck = !disagreeBox.classList.contains('checked');
            disagreeBox.classList.toggle('checked', willCheck);
            if (willCheck) {
                agreeBox.classList.remove('checked');
                applyConsent(false);
            } else {
                applyConsent(false);
            }
        });
    }

    function init() {
        const agreeBox = document.getElementById('privacyAgree');
        const disagreeBox = document.getElementById('privacyDisagree');
        if (!agreeBox || !disagreeBox) return;

        bindMutuallyExclusiveCheckboxes(agreeBox, disagreeBox);

        if (isGranted()) {
            agreeBox.classList.add('checked');
            disagreeBox.classList.remove('checked');
            applyConsent(true);
        } else {
            agreeBox.classList.remove('checked');
            disagreeBox.classList.remove('checked');
            applyConsent(false);
        }
    }

    function requireConsent(message) {
        if (isGranted()) return true;
        alert(message || '개인정보 수집 및 이용에 동의해 주세요. 동의문을 확인한 후 「동의함」을 선택해 주세요.');
        const agreeItem = document.getElementById('privacyAgree')?.closest('.checkbox-item')
            || document.getElementById('privacyAgree');
        if (agreeItem) {
            agreeItem.classList.remove('ui-blink-hint');
            void agreeItem.offsetWidth;
            agreeItem.classList.add('ui-blink-hint');
            window.setTimeout(() => agreeItem.classList.remove('ui-blink-hint'), 2800);
            agreeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            const section = document.querySelector('.privacy-consent-section');
            if (section) {
                section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
        return false;
    }

    global.RegioPrivacyConsent = {
        init: init,
        isGranted: isGranted,
        requireConsent: requireConsent
    };
})(window);
