/**
 * 활동 DB 필드명 → 한글 표시명 (활동요약·집계 화면 공통)
 */
(function (global) {
    const ACTIVITY_FIELD_LABELS = {
        count: '횟수(회,단,시간,명)',
        catechism_guide: '교리반인도',
        group_join: '단체가입',
        meeting_head: '회두',
        resolution: '해소',
        sacrament: '성사',
        confirmation: '견진',
        baptism: '세례',
        first_communion: '첫영성체',
        year_count: '연도',
        funeral_mass: '장례미사',
        memorial_mass: '추모미사',
        funeral_attendance: '장지참석',
        inout_count: '입출관',
        conditional_baptism: '대세',
        conditional_communion: '보례',
        membership: '입단',
        establishment: '설립',
        target: '대상'
    };

    /** DB·입력폼 한글 필드명 → activity_records 영문 컬럼 */
    const KOREAN_FIELD_TO_ENGLISH = {
        '횟수': 'count',
        '활동횟수': 'count',
        '활동 회수': 'count',
        '연도': 'year_count',
        '면담': 'year_count',
        '위령기도': 'year_count',
        '성경 통독': 'year_count',
        '장지참석': 'funeral_attendance',
        '장례미사': 'funeral_mass',
        '장례미사(고별식)': 'funeral_mass',
        '기타 상가 활동': 'funeral_attendance',
        '상가방문': 'funeral_attendance',
        '추모미사': 'memorial_mass',
        '입출관': 'inout_count',
        '교리반인도': 'catechism_guide',
        '교리반 인도': 'catechism_guide',
        '첫 영성체 교리반 인도': 'catechism_guide',
        '단체가입': 'group_join',
        '단체 가입': 'group_join',
        '기타': 'group_join',
        '회두': 'meeting_head',
        '쉬는 교우 회두': 'meeting_head',
        '해소': 'resolution',
        '혼인장애 해소': 'resolution',
        '혼인 장애 해소': 'resolution',
        '성사': 'sacrament',
        '판공': 'sacrament',
        '판공 성사': 'sacrament',
        '병자성사': 'sacrament',
        '견진': 'confirmation',
        '견진 성사': 'confirmation',
        '세례': 'baptism',
        '세례자': 'baptism',
        '영세자': 'baptism',
        '유아 세례': 'baptism',
        '유아세례': 'baptism',
        '첫영성체': 'first_communion',
        '병자영성체': 'first_communion',
        '봉성체': 'first_communion',
        '대세': 'conditional_baptism',
        '대세자': 'conditional_baptism',
        '보례': 'conditional_communion',
        '보례자': 'conditional_communion',
        '입단': 'membership',
        '행동단원 모집': 'membership',
        '행동단원 입단': 'membership',
        '협조단원 모집': 'group_join',
        '설립': 'establishment',
        '자기 소개서': 'establishment',
        '묵주 기도': 'establishment',
        '묵주기도': 'establishment'
    };

    const ENGLISH_FIELD_NAMES = new Set(Object.keys(ACTIVITY_FIELD_LABELS));

    function normalizeFieldName(fieldName) {
        const key = String(fieldName || '').trim();
        if (!key) return key;
        if (ENGLISH_FIELD_NAMES.has(key)) return key;
        return KOREAN_FIELD_TO_ENGLISH[key] || key;
    }

    function findMappingLabel(mappings, fieldName) {
        if (!mappings || !mappings.length) return '';
        const englishField = normalizeFieldName(fieldName);
        const found = mappings.find(
            (f) => f.field_name === englishField || f.field_name === fieldName
        );
        return found ? found.field_display_name : '';
    }

    function getFieldDisplayName(categoryName, fieldName, fieldMappingByCategory) {
        const englishField = normalizeFieldName(fieldName);
        const label = findMappingLabel(fieldMappingByCategory?.[categoryName], fieldName);
        if (label) return label;
        return ACTIVITY_FIELD_LABELS[englishField] || ACTIVITY_FIELD_LABELS[fieldName] || fieldName;
    }

    function mergeApiFieldMappings(fieldMappingByCategory, mappings) {
        (mappings || []).forEach((mapping) => {
            const category = mapping.category_name;
            if (!category) return;
            if (!fieldMappingByCategory[category]) {
                fieldMappingByCategory[category] = [];
            }
            const englishField = normalizeFieldName(mapping.field_name);
            const entry = {
                field_name: englishField,
                field_display_name: mapping.field_display_name,
                is_required: mapping.is_required
            };
            const idx = fieldMappingByCategory[category].findIndex(
                (f) => normalizeFieldName(f.field_name) === englishField
            );
            if (idx >= 0) fieldMappingByCategory[category][idx] = entry;
            else fieldMappingByCategory[category].push(entry);
        });
        return fieldMappingByCategory;
    }

    async function loadFieldMappingByCategory(baseMapping) {
        const fieldMappingByCategory = baseMapping || {};
        try {
            const response = await fetch('/api/activity-field-mapping');
            if (response.ok) {
                const data = await response.json();
                mergeApiFieldMappings(fieldMappingByCategory, data.mappings || []);
            }
        } catch (error) {
            console.warn('필드 매핑 API 로드 실패, 정적 매핑 사용:', error);
        }
        return fieldMappingByCategory;
    }

    global.RegioActivityFieldLabels = {
        ACTIVITY_FIELD_LABELS,
        KOREAN_FIELD_TO_ENGLISH,
        ENGLISH_FIELD_NAMES,
        normalizeFieldName,
        getFieldDisplayName,
        mergeApiFieldMappings,
        loadFieldMappingByCategory
    };
})(typeof window !== 'undefined' ? window : globalThis);
