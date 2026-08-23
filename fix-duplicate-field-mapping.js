/**
 * activity_field_mapping 중복 필드 정리
 * - 같은 의미(교리반 인도 / 교리반인도)가 둘 다 있으면 '교리반 인도' 행 삭제
 *
 * node fix-duplicate-field-mapping.js
 * node fix-duplicate-field-mapping.js --render
 */
require('dotenv').config();
const { Pool } = require('pg');

const useRender = process.argv.includes('--render');
if (useRender) {
    require('dotenv').config({ path: require('path').join(__dirname, '.env.render'), override: true });
}

const pool = new Pool(
    useRender && process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
        : {
            user: process.env.DB_USER || 'postgres',
            host: process.env.DB_HOST || 'localhost',
            database: process.env.DB_NAME || 'regio',
            password: String(process.env.DB_PASSWORD || '5854'),
            port: parseInt(process.env.DB_PORT || '5432', 10)
        }
);

const KOREAN_TO_ENGLISH = {
    '횟수': 'count',
    '교리반인도': 'catechism_guide',
    '교리반 인도': 'catechism_guide',
    '세례자': 'baptism',
    '세례': 'baptism',
    '자기 소개서': 'establishment'
};

function normalizeFieldKey(fieldName) {
    const key = String(fieldName || '').trim();
    return KOREAN_TO_ENGLISH[key] || key;
}

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            `SELECT id, category_name, field_name, field_display_name
             FROM activity_field_mapping
             ORDER BY category_name, field_name`
        );

        const byCategory = new Map();
        for (const row of rows) {
            if (!byCategory.has(row.category_name)) byCategory.set(row.category_name, []);
            byCategory.get(row.category_name).push(row);
        }

        const idsToDelete = [];
        for (const [category, fields] of byCategory.entries()) {
            const seen = new Map();
            for (const field of fields) {
                const norm = normalizeFieldKey(field.field_name);
                if (seen.has(norm)) {
                    const prev = seen.get(norm);
                    const dropCurrent = field.field_name === '교리반 인도' && prev.field_name === '교리반인도';
                    const dropPrev = prev.field_name === '교리반 인도' && field.field_name === '교리반인도';
                    if (dropCurrent) {
                        idsToDelete.push(field.id);
                        console.log(`[delete] ${category}: "${field.field_name}" (keep "${prev.field_name}")`);
                        continue;
                    }
                    if (dropPrev) {
                        idsToDelete.push(prev.id);
                        seen.set(norm, field);
                        console.log(`[delete] ${category}: "${prev.field_name}" (keep "${field.field_name}")`);
                        continue;
                    }
                    idsToDelete.push(field.id);
                    console.log(`[delete] ${category}: "${field.field_name}" (duplicate of "${prev.field_name}")`);
                    continue;
                }
                seen.set(norm, field);
            }
        }

        if (idsToDelete.length) {
            await client.query('DELETE FROM activity_field_mapping WHERE id = ANY($1::int[])', [idsToDelete]);
        }

        await client.query('COMMIT');
        console.log(`\n✅ ${idsToDelete.length}개 중복 필드 매핑 삭제${useRender ? ' (Render)' : ''}.`);

        const check = await pool.query(
            `SELECT field_name, field_display_name FROM activity_field_mapping
             WHERE category_name = '복음선교-가두선교' ORDER BY field_name`
        );
        console.log('\n복음선교-가두선교:', check.rows);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
