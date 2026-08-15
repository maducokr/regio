/**
 * 개인활동 입력 자료 자동 삭제
 * - 기준: activity_records.activity_date (기록일)
 * - 기본 보관기간: 30개월
 * - 세목·활동자료·내용·메모·행사(note) 모두 activity_records 행에 포함
 *
 * ENV:
 *   ACTIVITY_RETENTION_MONTHS=30
 *   ACTIVITY_AUTO_PURGE=1   (0/false/off 이면 비활성)
 */
'use strict';

const DEFAULT_MONTHS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function retentionMonths() {
    const n = parseInt(String(process.env.ACTIVITY_RETENTION_MONTHS || DEFAULT_MONTHS), 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MONTHS;
}

function isPurgeEnabled() {
    const v = String(process.env.ACTIVITY_AUTO_PURGE ?? '1').trim().toLowerCase();
    return v !== '0' && v !== 'false' && v !== 'off' && v !== 'no';
}

async function tableExists(pool, tableName) {
    const result = await pool.query(
        `SELECT to_regclass($1) IS NOT NULL AS ok`,
        [`public.${tableName}`]
    );
    return Boolean(result.rows[0] && result.rows[0].ok);
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ months?: number, memberId?: number|null }} [options]
 */
async function purgeOldActivityRecords(pool, options = {}) {
    if (!isPurgeEnabled()) {
        return { skipped: true, reason: 'disabled', deleted: 0, months: retentionMonths() };
    }

    const months = options.months != null ? Number(options.months) : retentionMonths();
    const memberId = options.memberId != null ? Number(options.memberId) : null;
    if (!Number.isFinite(months) || months <= 0) {
        return { skipped: true, reason: 'invalid_months', deleted: 0, months };
    }

    const params = [months];
    let whereMember = '';
    if (Number.isFinite(memberId) && memberId > 0) {
        whereMember = ' AND member_id = $2';
        params.push(memberId);
    }

    const deleted = {
        activity_records: 0,
        daily_activities: 0,
        prayer_activities: 0,
        community_activities: 0,
        activity_inputs: 0
    };

    if (await tableExists(pool, 'activity_records')) {
        const result = await pool.query(
            `DELETE FROM activity_records
             WHERE activity_date IS NOT NULL
               AND activity_date < (CURRENT_DATE - make_interval(months => $1::int))
               ${whereMember}
             RETURNING id`,
            params
        );
        deleted.activity_records = result.rowCount || 0;
    }

    // 레거시 테이블이 남아 있으면 동일 기준으로 정리
    if (await tableExists(pool, 'daily_activities')) {
        const result = await pool.query(
            `DELETE FROM daily_activities
             WHERE activity_date IS NOT NULL
               AND activity_date < (CURRENT_DATE - make_interval(months => $1::int))
               ${whereMember}`,
            params
        );
        deleted.daily_activities = result.rowCount || 0;
    }

    if (await tableExists(pool, 'prayer_activities')) {
        const result = await pool.query(
            `DELETE FROM prayer_activities
             WHERE week_start_date IS NOT NULL
               AND week_start_date < (CURRENT_DATE - make_interval(months => $1::int))
               ${whereMember}`,
            params
        );
        deleted.prayer_activities = result.rowCount || 0;
    }

    if (await tableExists(pool, 'community_activities')) {
        const result = await pool.query(
            `DELETE FROM community_activities
             WHERE week_start_date IS NOT NULL
               AND week_start_date < (CURRENT_DATE - make_interval(months => $1::int))
               ${whereMember}`,
            params
        );
        deleted.community_activities = result.rowCount || 0;
    }

    if (await tableExists(pool, 'activity_inputs')) {
        // activity_date 컬럼이 없을 수 있어 created_at 기준
        const cols = await pool.query(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'activity_inputs'`
        );
        const names = new Set(cols.rows.map((r) => r.column_name));
        if (names.has('activity_date')) {
            const result = await pool.query(
                `DELETE FROM activity_inputs
                 WHERE activity_date IS NOT NULL
                   AND activity_date < (CURRENT_DATE - make_interval(months => $1::int))
                   ${whereMember}`,
                params
            );
            deleted.activity_inputs = result.rowCount || 0;
        } else if (names.has('created_at')) {
            const result = await pool.query(
                `DELETE FROM activity_inputs
                 WHERE created_at IS NOT NULL
                   AND created_at::date < (CURRENT_DATE - make_interval(months => $1::int))
                   ${whereMember}`,
                params
            );
            deleted.activity_inputs = result.rowCount || 0;
        }
    }

    const total = Object.values(deleted).reduce((a, b) => a + b, 0);
    return {
        skipped: false,
        months,
        memberId: memberId || null,
        deleted: total,
        detail: deleted
    };
}

/**
 * 서버 기동 후 1회 + 매일 1회 실행
 * @param {import('pg').Pool} pool
 */
function startActivityRetentionScheduler(pool) {
    if (!isPurgeEnabled()) {
        console.log('ℹ️ 활동자료 자동삭제 비활성 (ACTIVITY_AUTO_PURGE)');
        return null;
    }

    const months = retentionMonths();
    let running = false;

    const run = async (reason) => {
        if (running) return;
        running = true;
        try {
            const result = await purgeOldActivityRecords(pool);
            if (result.skipped) {
                console.log(`🧹 활동자료 자동삭제 건너뜀 (${reason}):`, result.reason);
            } else if (result.deleted > 0) {
                console.log(
                    `🧹 활동자료 자동삭제 (${reason}): ${months}개월 경과 ${result.deleted}건`,
                    result.detail
                );
            } else {
                console.log(`🧹 활동자료 자동삭제 (${reason}): 삭제 대상 없음 (${months}개월)`);
            }
        } catch (error) {
            console.error('🧹 활동자료 자동삭제 실패:', error.message || error);
        } finally {
            running = false;
        }
    };

    // 기동 직후 DB 준비 여유
    const bootTimer = setTimeout(() => run('boot'), 20 * 1000);
    const intervalTimer = setInterval(() => run('daily'), DAY_MS);
    if (typeof bootTimer.unref === 'function') bootTimer.unref();
    if (typeof intervalTimer.unref === 'function') intervalTimer.unref();

    console.log(`✅ 활동자료 자동삭제 스케줄러 시작 (보관 ${months}개월, 매일 1회)`);
    return { bootTimer, intervalTimer, runNow: () => run('manual') };
}

module.exports = {
    purgeOldActivityRecords,
    startActivityRetentionScheduler,
    retentionMonths,
    isPurgeEnabled
};
