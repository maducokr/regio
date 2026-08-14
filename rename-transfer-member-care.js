/**
 * 교우돌봄-전입 교우 돌봄 → 교우돌봄-전입교우돌봄(방문)
 * node rename-transfer-member-care.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const FROM = '교우돌봄-전입 교우 돌봄';
const TO = '교우돌봄-전입교우돌봄(방문)';
const DESC = '전입교우돌봄(방문) 활동';

function makePool(admin) {
    return new Pool({
        user: admin
            ? (process.env.DB_ADMIN_USER || 'postgres')
            : (process.env.DB_USER || 'postgres'),
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'regio',
        password: admin
            ? (process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD || '5854')
            : (process.env.DB_PASSWORD || '5854'),
        port: parseInt(process.env.DB_PORT || '5432', 10)
    });
}

async function renameCategory(pool) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const cat = await client.query(
            `UPDATE activity_categories
             SET category_name = $1, description = $2
             WHERE category_name = $3
             RETURNING id`,
            [TO, DESC, FROM]
        );
        if (!cat.rowCount) {
            await client.query(
                `INSERT INTO activity_categories (category_name, category_group, description)
                 VALUES ($1, '교우돌봄', $2)
                 ON CONFLICT (category_name) DO NOTHING`,
                [TO, DESC]
            );
            console.log(`ℹ️ 카테고리 추가/확인: ${TO}`);
        } else {
            console.log(`✅ 카테고리 변경: ${FROM} → ${TO}`);
        }
        const map = await client.query(
            `UPDATE activity_field_mapping SET category_name = $1 WHERE category_name = $2`,
            [TO, FROM]
        );
        console.log(`✅ field_mapping ${map.rowCount}건`);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function renameMemberColumn(pool) {
    const client = await pool.connect();
    try {
        const col = await client.query(
            `SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'member' AND column_name = $1`,
            [FROM]
        );
        if (!col.rows.length) {
            console.log('ℹ️ member 집계 컬럼 없음(생략)');
            return;
        }
        const existsTo = await client.query(
            `SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'member' AND column_name = $1`,
            [TO]
        );
        if (existsTo.rows.length) {
            console.log(`ℹ️ member 컬럼 이미 존재: ${TO}`);
            return;
        }
        await client.query(`ALTER TABLE member RENAME COLUMN "${FROM}" TO "${TO}"`);
        console.log(`✅ member 컬럼 변경: ${FROM} → ${TO}`);
    } finally {
        client.release();
    }
}

async function main() {
    const appPool = makePool(false);
    try {
        await renameCategory(appPool);
    } finally {
        await appPool.end();
    }
    const adminPool = makePool(true);
    try {
        await renameMemberColumn(adminPool);
    } catch (err) {
        console.warn('member 컬럼 변경 생략:', err.message);
    } finally {
        await adminPool.end();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
