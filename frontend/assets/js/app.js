(() => {
  'use strict';

  const form = document.getElementById('writerForm');
  const fields = {
    job: document.getElementById('jobPosting'),
    company: document.getElementById('companyName'),
    role: document.getElementById('targetRole'),
    context: document.getElementById('experienceContext'),
    actions: document.getElementById('experienceActions'),
    outcome: document.getElementById('experienceOutcome')
  };
  const ui = {
    jobCount: document.getElementById('jobCount'),
    formMessage: document.getElementById('formMessage'),
    resultPanel: document.getElementById('resultPanel'),
    resultStatus: document.getElementById('resultStatus'),
    emptyState: document.getElementById('emptyState'),
    resultContent: document.getElementById('resultContent'),
    sampleBanner: document.getElementById('sampleBanner'),
    keywordChips: document.getElementById('keywordChips'),
    keywordCount: document.getElementById('keywordCount'),
    keywordEmpty: document.getElementById('keywordEmpty'),
    keywordLimitNote: document.getElementById('keywordLimitNote'),
    keywordFeedback: document.getElementById('keywordFeedback'),
    copyKeywordsButton: document.getElementById('copyKeywordsButton'),
    downloadKeywordsButton: document.getElementById('downloadKeywordsButton'),
    matchSummary: document.getElementById('matchSummary'),
    coverageLabel: document.getElementById('coverageLabel'),
    coverageMeter: document.getElementById('coverageMeter'),
    coverageBar: document.getElementById('coverageBar'),
    coverageText: document.getElementById('coverageText'),
    sampleButton: document.getElementById('sampleButton')
  };

  if (!form || Object.values(fields).some((field) => !field) || Object.values(ui).some((element) => !element)) return;

  // 설명 가능한 작은 직무 표현 사전입니다. 외부 API나 생성형 모델은 사용하지 않습니다.
  const keywordGroups = [
    { label: '문제 해결', terms: ['문제 해결', '이슈 해결', '원인 파악', '원인 분석', '해결 과제'] },
    { label: '문제 정의', terms: ['문제 정의', '과제 정의', '문제 발굴'] },
    { label: '데이터 분석', terms: ['데이터 분석', '지표 분석', '정량 분석', '데이터 분석력'] },
    { label: '데이터 기반 의사결정', terms: ['데이터 기반 의사결정', '데이터 기반', '데이터 중심', '데이터 드리븐', '근거 기반'] },
    { label: '사용자 조사', terms: ['사용자 인터뷰', '유저 인터뷰', '고객 인터뷰', '사용자 조사', '사용성 조사', '사용성 테스트', '사용자 리서치', '유저 리서치', '고객 조사'] },
    { label: '사용자 중심', terms: ['사용자 중심', '고객 중심', '유저 중심', '사용자 관점', '고객 관점'] },
    { label: '서비스 기획', terms: ['서비스 기획', '프로덕트 기획', '제품 기획'] },
    { label: '서비스 개선', terms: ['서비스 개선', '제품 개선', '프로세스 개선', '개선 과제', '경험 개선'] },
    { label: '제품 관리', terms: ['프로덕트 매니저', '프로덕트 매니지먼트', '제품 관리', 'product manager', 'product management'] },
    { label: '요구사항 분석', terms: ['요구사항 분석', '요구 사항 분석', '요구사항 정의', '요구사항 도출', 'requirements'] },
    { label: '프로젝트 관리', terms: ['프로젝트 관리', '프로젝트 매니징', 'project management', '일정 관리'] },
    { label: '프로젝트 주도', terms: ['프로젝트 주도', '프로젝트 리딩', '프로젝트 리드'] },
    { label: '협업', terms: ['협업', '크로스펑셔널', '유관 부서', '여러 팀과', '팀 간 협업'] },
    { label: '커뮤니케이션', terms: ['커뮤니케이션', '의사소통', '소통 능력', '명확한 소통'] },
    { label: '주도성·오너십', terms: ['주도성', '주도적으로', '주도적', '오너십', 'ownership'] },
    { label: '실행력', terms: ['실행력', '끝까지 실행', '실행까지', '빠른 실행', 'execution'] },
    { label: '전략 기획', terms: ['전략 기획', '사업 전략', '전략 수립', '전략적 사고'] },
    { label: '비즈니스 이해', terms: ['비즈니스 이해', '사업 이해', '사업성', 'business acumen'] },
    { label: '성과 관리', terms: ['성과 관리', '성과 측정', '목표 달성', '성과 개선', 'kpi'] },
    { label: '지표 관리', terms: ['지표 관리', '핵심 지표', '서비스 지표', '성장 지표', 'metrics', 'metric'] },
    { label: '실험·가설 검증', terms: ['실험 설계', 'a/b 테스트', 'ab 테스트', '가설 검증'] },
    { label: 'UX·UI', terms: ['ux/ui', '사용자 경험', 'ux 디자인', 'ui 디자인'] },
    { label: '화면·프로토타입 설계', terms: ['와이어프레임', '화면 설계', '프로토타입', 'prototype'] },
    { label: '디자인 협업', terms: ['디자인 시스템', '디자인 협업'] },
    { label: '제품·서비스 출시', terms: ['제품 출시', '서비스 출시', '출시 경험', '런칭', 'launch'] },
    { label: '그로스·성장', terms: ['그로스', 'growth', '성장 전략', '사용자 성장'] },
    { label: '전환 최적화', terms: ['전환율', '전환 최적화', 'conversion rate', '구매 전환'] },
    { label: '마케팅', terms: ['마케팅', 'marketing'] },
    { label: '퍼포먼스 마케팅', terms: ['퍼포먼스 마케팅', 'performance marketing'] },
    { label: '콘텐츠 기획·제작', terms: ['콘텐츠 기획', '콘텐츠 제작', '콘텐츠 전략'] },
    { label: '브랜드', terms: ['브랜드 전략', '브랜딩', 'brand'] },
    { label: 'CRM·리텐션', terms: ['리텐션', '재방문', '고객 유지', 'retention', 'crm'] },
    { label: '영업·세일즈', terms: ['영업', '세일즈', 'sales', '매출'] },
    { label: '고객 관리', terms: ['고객 관리', '고객 응대', '고객 지원'] },
    { label: '시장 조사', terms: ['시장 조사', '시장 분석', '경쟁사 분석', 'market research'] },
    { label: '이해관계자 조율', terms: ['이해관계자 조율', '이해관계자 관리', 'stakeholder'] },
    { label: '데이터 시각화', terms: ['데이터 시각화', '대시보드', '시각화'] },
    { label: 'SQL·분석 도구', terms: ['sql', '엑셀', 'excel', 'tableau', '파워bi', 'power bi', '데이터 추출'] },
    { label: 'Python·파이썬', terms: ['python', '파이썬'] },
    { label: 'AI·머신러닝', terms: ['인공지능', '머신러닝', '기계학습', '생성형 ai', 'llm'] },
    { label: '프론트엔드 개발', terms: ['프론트엔드', 'frontend', 'front end'] },
    { label: '백엔드 개발', terms: ['백엔드', 'backend', 'back end'] },
    { label: '데이터 엔지니어링', terms: ['데이터 엔지니어링', '데이터 파이프라인', 'etl'] },
    { label: '클라우드·인프라', terms: ['aws', 'gcp', 'azure', '클라우드', '인프라'] },
    { label: 'QA·테스트', terms: ['품질 보증', 'qa', '테스트 자동화', '테스트 설계'] },
    { label: '보안·개인정보 보호', terms: ['정보보안', '보안', '개인정보 보호', '보안 점검'] },
    { label: '문서화', terms: ['문서화', '기술 문서', '문서 작성'] },
    { label: '애자일·스크럼', terms: ['애자일', 'agile', '스크럼', 'scrum', '스프린트'] },
    { label: '리더십', terms: ['리더십', 'leadership', '팀 리딩', '팀을 이끌'] },
    { label: '코칭·멘토링', terms: ['코칭', '멘토링', '후배 양성'] },
    { label: '협상', terms: ['협상', '협상력'] },
    { label: '지속적 개선', terms: ['지속적 개선', '반복 개선', '회고'] },
    { label: '품질 관리', terms: ['품질 관리', '품질 향상', '품질 개선'] },
    { label: '서비스 운영', terms: ['서비스 운영', '프로세스 운영', '운영 관리'] },
    { label: '리스크 관리', terms: ['리스크 관리', '위험 관리'] },
    { label: '교육 기획·운영', terms: ['교육 기획', '교육 운영', '커리큘럼 설계'] },
    { label: '글쓰기·카피라이팅', terms: ['글쓰기', '카피라이팅', '라이팅', '작문'] },
    { label: '재무·회계', terms: ['재무 분석', '회계', '예산 관리', '재무 관리'] },
    { label: '인사·채용', terms: ['채용', '인재 영입', '인사', '조직 문화'] },
    { label: '물류·공급망', terms: ['물류', '공급망', 'supply chain', 'scm'] }
  ];

  const ignoredWords = new Set([
    '담당', '업무', '담당업무', '주요', '지원', '자격', '요건', '자격요건', '우대', '사항', '우대사항',
    '필수', '경험', '경력', '보유', '역량', '능력', '가능', '관련', '경우', '이해', '통해', '위해',
    '함께', '다양', '다양한', '뛰어', '분야', '직무', '수행', '모집', '채용', '회사', '성과', '최소',
    '이상', '이하', '있으신', '있습니다', '합니다', '입니다', '있고', '하는', '할수', '필요한',
    '원하는', '좋은', '경험자', '보유자', '데이터', '서비스', '사용자', '고객', '프로젝트', '팀',
    '기반', '업무를', '책임', '담당자', '우수', '성장', '주식회사', '기업', '개선', '진행', '확인',
    'about', 'above', 'after', 'also', 'and', 'any', 'are', 'based', 'been', 'being', 'both', 'can',
    'each', 'for', 'from', 'have', 'into', 'its', 'looking', 'more', 'must', 'our', 'over', 'role',
    'team', 'that', 'the', 'their', 'this', 'through', 'with', 'will', 'you', 'your', 'years', 'year'
  ].map(normalizeText));

  const koreanEndings = [
    '으로부터', '에서부터', '에게서', '으로써', '으로서', '에 대해서', '에 대한', '에서는', '으로는',
    '에게는', '들에게', '들과의', '으로', '에서', '에게', '한테', '까지', '부터', '처럼', '보다',
    '이며', '이고', '하고', '하여', '해서', '하면', '하며', '하는', '합니다', '했습니다', '됩니다',
    '적인', '적으로', '들의', '들은', '들을', '들', '은', '는', '이', '가', '을', '를', '의', '에',
    '로', '과', '와', '도', '만', '적'
  ].sort((a, b) => b.length - a.length);

  const maximumVisibleKeywords = 20;
  let latestKeywordSet = { items: [], totalCount: 0 };
  let isSampleInput = false;

  function normalizeText(value) {
    return String(value || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
  }

  function makeSearchIndex(source) {
    let normalized = '';
    let offset = 0;
    const startOffsets = [];
    const endOffsets = [];

    for (const character of source) {
      const nextOffset = offset + character.length;
      if (!/[\s\p{P}\p{S}]/u.test(character)) {
        for (const lowerCharacter of character.toLowerCase()) {
          normalized += lowerCharacter;
          startOffsets.push(offset);
          endOffsets.push(nextOffset);
        }
      }
      offset = nextOffset;
    }
    return { source, normalized, startOffsets, endOffsets };
  }

  function findTermMatches(searchIndex, term) {
    const normalizedTerm = normalizeText(term);
    if (!normalizedTerm) return [];

    const matches = [];
    const isLatinWord = /^[a-z0-9]+$/i.test(normalizedTerm);
    let cursor = 0;
    while (cursor < searchIndex.normalized.length) {
      const position = searchIndex.normalized.indexOf(normalizedTerm, cursor);
      if (position < 0) break;
      const start = searchIndex.startOffsets[position];
      const end = searchIndex.endOffsets[position + normalizedTerm.length - 1];
      const before = searchIndex.source[start - 1] || '';
      const after = searchIndex.source[end] || '';
      const latinBoundary = !/[a-z0-9]/i.test(before) && !/[a-z0-9]/i.test(after);
      if (!isLatinWord || latinBoundary) {
        matches.push({ start, end, surface: searchIndex.source.slice(start, end).trim() });
      }
      cursor = position + Math.max(1, normalizedTerm.length);
    }
    return matches;
  }

  function findDictionaryKeywords(posting, searchIndex) {
    return keywordGroups.map((group, order) => {
      const terms = new Map();
      [...group.terms, group.label].forEach((term) => {
        const normalized = normalizeText(term);
        if (normalized.length > 1 && !terms.has(normalized)) terms.set(normalized, term);
      });

      const candidates = [];
      terms.forEach((term, normalized) => {
        findTermMatches(searchIndex, term).forEach((match) => candidates.push({ ...match, normalized }));
      });
      candidates.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

      const accepted = [];
      candidates.forEach((candidate) => {
        if (!accepted.some((match) => candidate.start < match.end && match.start < candidate.end)) accepted.push(candidate);
      });
      if (!accepted.length) return null;

      const evidence = new Map();
      accepted.forEach((match) => {
        const key = normalizeText(match.surface);
        const entry = evidence.get(key) || { text: match.surface.replace(/\s+/g, ' '), count: 0 };
        entry.count += 1;
        evidence.set(key, entry);
      });
      return {
        label: group.label,
        terms: Array.from(terms.values()),
        count: accepted.length,
        specificity: Math.max(...Array.from(terms.keys(), (term) => term.length)),
        order,
        kind: 'dictionary',
        matchedTerms: Array.from(evidence.values()).sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'ko'))
      };
    }).filter(Boolean).sort((a, b) => b.count - a.count || b.specificity - a.specificity || a.order - b.order);
  }

  function stripKoreanEnding(word) {
    for (const ending of koreanEndings) {
      if (word.length - ending.length >= 2 && word.endsWith(ending)) return word.slice(0, -ending.length);
    }
    return word;
  }

  function findRepeatedTerms(posting, dictionaryKeywords) {
    const words = posting.toLowerCase().match(/[가-힣]{2,}|[a-z][a-z0-9+.#-]{2,}/g) || [];
    const knownTerms = dictionaryKeywords.flatMap((item) => item.matchedTerms.map((match) => normalizeText(match.text)));
    const counts = new Map();

    words.forEach((word) => {
      const cleaned = /^[가-힣]+$/.test(word) ? stripKoreanEnding(word) : word.replace(/[.+#-]+$/g, '');
      const normalized = normalizeText(cleaned);
      if (normalized.length < 2 || ignoredWords.has(normalized)) return;
      if (knownTerms.some((known) => known.includes(normalized))) return;
      const entry = counts.get(normalized) || { label: cleaned, count: 0, evidence: new Map() };
      entry.count += 1;
      entry.evidence.set(cleaned, (entry.evidence.get(cleaned) || 0) + 1);
      counts.set(normalized, entry);
    });

    return Array.from(counts.values()).filter((item) => item.count >= 2).map((item, order) => ({
      label: item.label,
      terms: [item.label],
      count: item.count,
      specificity: normalizeText(item.label).length,
      order,
      kind: 'repeated',
      matchedTerms: Array.from(item.evidence, ([text, count]) => ({ text, count }))
        .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'ko'))
    })).sort((a, b) => b.count - a.count || b.specificity - a.specificity || a.label.localeCompare(b.label, 'ko'));
  }

  function extractKeywords(posting) {
    const searchIndex = makeSearchIndex(posting);
    const dictionary = findDictionaryKeywords(posting, searchIndex);
    const repeated = findRepeatedTerms(posting, dictionary);
    const all = dictionary.concat(repeated).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (a.kind !== b.kind) return a.kind === 'dictionary' ? -1 : 1;
      if (b.specificity !== a.specificity) return b.specificity - a.specificity;
      return a.label.localeCompare(b.label, 'ko');
    });
    return { items: all.slice(0, maximumVisibleKeywords), totalCount: all.length };
  }

  function experienceContainsKeyword(experience, keyword) {
    if (!experience.trim()) return false;
    const index = makeSearchIndex(experience);
    return [keyword.label, ...keyword.terms].some((term) => findTermMatches(index, term).length > 0);
  }

  function renderKeywords(keywordSet, experience) {
    ui.keywordChips.replaceChildren();
    ui.keywordEmpty.hidden = keywordSet.items.length > 0;
    ui.keywordCount.textContent = keywordSet.totalCount > keywordSet.items.length
      ? `${keywordSet.items.length} / ${keywordSet.totalCount}개`
      : `${keywordSet.totalCount}개`;

    if (ui.keywordLimitNote) {
      ui.keywordLimitNote.hidden = keywordSet.totalCount <= keywordSet.items.length;
      ui.keywordLimitNote.textContent = `결과가 많아 빈도와 사전 일치 기준 상위 ${keywordSet.items.length}개만 표시합니다. TXT 파일에도 표시된 키워드가 포함됩니다.`;
    }

    keywordSet.items.forEach((keyword) => {
      const matched = experienceContainsKeyword(experience, keyword);
      const card = document.createElement('article');
      card.className = `keyword-chip${matched ? ' is-matched' : ''}${keyword.kind === 'repeated' ? ' is-repeated' : ''}`;
      card.setAttribute('role', 'listitem');

      const top = document.createElement('div');
      top.className = 'keyword-card-top';
      const kind = document.createElement('span');
      kind.className = 'keyword-kind';
      kind.textContent = keyword.kind === 'repeated' ? '반복 표현' : '직무 키워드 사전';
      const frequency = document.createElement('span');
      frequency.className = 'chip-count';
      frequency.textContent = `${keyword.count}회`;
      top.append(kind, frequency);

      const label = document.createElement('strong');
      label.className = 'keyword-label';
      label.textContent = keyword.label;
      card.append(top, label);

      if (keyword.matchedTerms.length) {
        const evidence = document.createElement('p');
        evidence.className = 'keyword-evidence';
        const evidenceLabel = document.createElement('span');
        evidenceLabel.className = 'keyword-evidence-label';
        evidenceLabel.textContent = '공고 표현';
        const examples = keyword.matchedTerms.slice(0, 3).map((item) => item.text).join(' · ');
        const evidenceText = document.createElement('span');
        evidenceText.textContent = `${examples}${keyword.matchedTerms.length > 3 ? ' 외' : ''}`;
        evidence.append(evidenceLabel, evidenceText);
        card.append(evidence);
      }

      if (experience.trim() && matched) {
        const matchNote = document.createElement('span');
        matchNote.className = 'keyword-experience-match';
        matchNote.textContent = '경험 메모에도 표현 있음';
        card.append(matchNote);
      }
      ui.keywordChips.append(card);
    });

    if (!experience.trim()) {
      ui.matchSummary.hidden = true;
      return;
    }

    ui.matchSummary.hidden = false;
    const matchedCount = keywordSet.items.filter((item) => experienceContainsKeyword(experience, item)).length;
    const ratio = keywordSet.items.length ? Math.round((matchedCount / keywordSet.items.length) * 100) : 0;
    ui.coverageLabel.textContent = keywordSet.items.length ? `${matchedCount} / ${keywordSet.items.length}` : '—';
    ui.coverageBar.style.width = `${ratio}%`;
    ui.coverageMeter.setAttribute('aria-valuenow', String(ratio));

    if (!keywordSet.items.length) {
      ui.coverageText.textContent = '비교할 키워드를 찾지 못했어요. 공고에서 중요한 요구사항을 직접 확인해 주세요.';
    } else if (!matchedCount) {
      ui.coverageText.textContent = '같은 표현은 찾지 못했어요. 단어가 다르더라도 관련된 실제 경험이 있다면 근거를 직접 확인해 보세요.';
    } else {
      ui.coverageText.textContent = '같은 표현이 경험 메모에도 있어요. 단어가 겹친다고 적합성이 증명되는 것은 아니니 실제 행동과 근거를 확인하세요.';
    }
  }

  function getFormData() {
    return {
      company: fields.company.value.trim(),
      role: fields.role.value.trim(),
      job: fields.job.value.trim(),
      context: fields.context.value.trim(),
      actions: fields.actions.value.trim(),
      outcome: fields.outcome.value.trim()
    };
  }

  function showMessage(message, isError = false) {
    ui.formMessage.textContent = message;
    ui.formMessage.classList.toggle('error', Boolean(isError));
  }

  function updateJobCount() {
    ui.jobCount.textContent = `${fields.job.value.length.toLocaleString('ko-KR')} / 12,000자`;
  }

  function setExportButtonsDisabled(disabled) {
    ui.copyKeywordsButton.disabled = disabled;
    ui.downloadKeywordsButton.disabled = disabled;
  }

  function runAnalysis({ scrollToResult = false } = {}) {
    const data = getFormData();
    if (!data.job) {
      showMessage('채용공고 내용을 붙여넣어 주세요.', true);
      fields.job.focus();
      return false;
    }

    const hadVisibleResults = !ui.resultContent.hidden;
    latestKeywordSet = extractKeywords(data.job);
    const experience = [data.context, data.actions, data.outcome].filter(Boolean).join('\n');
    renderKeywords(latestKeywordSet, experience);
    ui.sampleBanner.hidden = !isSampleInput;
    ui.emptyState.hidden = true;
    ui.resultContent.hidden = false;
    ui.resultStatus.textContent = '키워드 추출 완료';
    ui.resultStatus.classList.add('ready');
    ui.resultPanel.setAttribute('aria-busy', 'false');
    ui.resultPanel.dataset.stale = 'false';
    setExportButtonsDisabled(latestKeywordSet.items.length === 0);
    ui.keywordFeedback.textContent = '';

    if (window.plenDraft && typeof window.plenDraft.update === 'function') {
      window.plenDraft.update({ force: !hadVisibleResults });
    }
    showMessage(
      latestKeywordSet.totalCount
        ? `공고에서 ${latestKeywordSet.totalCount}개 키워드·반복 표현을 찾았어요. 공고 표현과 빈도를 확인해 주세요.`
        : '사전 키워드나 반복 표현을 찾지 못했어요. 자동 결과는 참고용이므로 공고 원문도 확인해 주세요.',
      false
    );

    if (scrollToResult) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.setTimeout(() => ui.resultPanel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }), 60);
    }
    return true;
  }

  function clearResults() {
    latestKeywordSet = { items: [], totalCount: 0 };
    ui.emptyState.hidden = false;
    ui.resultContent.hidden = true;
    ui.resultStatus.textContent = '분석 대기 중';
    ui.resultStatus.classList.remove('ready');
    ui.resultPanel.setAttribute('aria-busy', 'false');
    ui.resultPanel.dataset.stale = 'false';
    ui.sampleBanner.hidden = true;
    ui.keywordChips.replaceChildren();
    ui.keywordCount.textContent = '0개';
    ui.keywordEmpty.hidden = true;
    if (ui.keywordLimitNote) ui.keywordLimitNote.hidden = true;
    ui.matchSummary.hidden = true;
    ui.coverageLabel.textContent = '—';
    ui.coverageText.textContent = '경험 메모를 입력하면 키워드와 같은 표현이 있는지 참고로 비교합니다.';
    ui.coverageBar.style.width = '0%';
    ui.coverageMeter.setAttribute('aria-valuenow', '0');
    setExportButtonsDisabled(true);
    ui.keywordFeedback.textContent = '';
    if (window.plenDraft && typeof window.plenDraft.clear === 'function') window.plenDraft.clear();
  }

  function isAnalysisOutOfDate() {
    if (ui.resultPanel.dataset.stale !== 'true') return false;
    ui.keywordFeedback.textContent = '입력 내용이 바뀌어 결과가 최신 상태가 아니에요. 키워드를 다시 추출해 주세요.';
    return true;
  }

  function exportText() {
    if (!latestKeywordSet.items.length) return '';
    const data = getFormData();
    const lines = [
      'plen · 채용공고 키워드 추출 결과',
      data.company ? `회사명: ${data.company}` : '',
      data.role ? `지원 직무: ${data.role}` : '',
      `추출 결과: ${latestKeywordSet.totalCount}개${latestKeywordSet.totalCount > latestKeywordSet.items.length ? ` (상위 ${latestKeywordSet.items.length}개 표시)` : ''}`,
      '분석 기준: 직무 키워드 사전 + 공고 내 반복 표현',
      ''
    ].filter((line) => line !== '');

    latestKeywordSet.items.forEach((keyword, index) => {
      const kind = keyword.kind === 'repeated' ? '반복 표현' : '직무 키워드 사전';
      lines.push(`${index + 1}. ${keyword.label} — ${keyword.count}회 (${kind})`);
      if (keyword.matchedTerms.length) {
        const examples = keyword.matchedTerms.slice(0, 3)
          .map((item) => item.count > 1 ? `${item.text} ${item.count}회` : item.text)
          .join(', ');
        lines.push(`   공고 표현: ${examples}${keyword.matchedTerms.length > 3 ? ' 외' : ''}`);
      }
    });
    lines.push('', '참고: 규칙 기반으로 찾은 결과입니다. 빈도는 직무 중요도와 같지 않으므로 공고 원문을 직접 확인하세요.');
    const text = lines.join('\n');
    return isSampleInput ? `[가상 예시 — 실제 지원 자료로 사용하지 마세요.]\n\n${text}` : text;
  }

  async function copyKeywords() {
    if (isAnalysisOutOfDate()) return;
    const text = exportText();
    if (!text) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const temporaryField = document.createElement('textarea');
        temporaryField.value = text;
        temporaryField.setAttribute('readonly', '');
        temporaryField.style.position = 'fixed';
        temporaryField.style.opacity = '0';
        temporaryField.style.pointerEvents = 'none';
        document.body.append(temporaryField);
        temporaryField.select();
        const copied = document.execCommand('copy');
        temporaryField.remove();
        if (!copied) throw new Error('copy-not-available');
      }
      ui.keywordFeedback.textContent = isSampleInput
        ? '가상 예시라는 경고를 포함해 키워드를 복사했어요.'
        : '추출 키워드와 빈도를 복사했어요.';
    } catch (_error) {
      ui.keywordFeedback.textContent = '자동 복사를 사용할 수 없어요. TXT 저장을 이용하거나 브라우저에서 직접 복사해 주세요.';
    }
  }

  function downloadKeywords() {
    if (isAnalysisOutOfDate()) return;
    const text = exportText();
    if (!text) return;
    const baseName = [fields.company.value.trim(), fields.role.value.trim()].filter(Boolean).join('_') || 'plen_채용공고_키워드';
    const safeName = baseName.replace(/[\\/:*?"<>|%]+/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 70) || 'plen_채용공고_키워드';
    const file = new Blob([`\uFEFF${text}`], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${safeName}_키워드.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    ui.keywordFeedback.textContent = isSampleInput
      ? '가상 예시라는 경고를 포함해 키워드 TXT를 저장했어요.'
      : '키워드와 빈도를 TXT 파일로 저장했어요.';
  }

  function hasFormContent() {
    return Object.values(fields).some((field) => field.value.trim().length > 0);
  }

  window.plenClearSamplePreview = () => {
    isSampleInput = false;
    ui.sampleBanner.hidden = true;
  };

  updateJobCount();
  fields.job.addEventListener('input', updateJobCount);
  form.addEventListener('input', (event) => {
    if (event.target === fields.job) updateJobCount();
    if (event.target && event.target.id === 'draftOutput') return;
    if (!ui.resultContent.hidden && ui.resultPanel.dataset.stale !== 'true') {
      ui.resultPanel.dataset.stale = 'true';
      ui.resultStatus.textContent = '입력 변경 — 재추출 필요';
      ui.resultStatus.classList.remove('ready');
      setExportButtonsDisabled(true);
      showMessage('공고 또는 입력 내용이 바뀌었어요. 최신 결과를 보려면 키워드를 다시 추출해 주세요.');
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    runAnalysis({ scrollToResult: true });
  });

  ui.sampleButton.addEventListener('click', () => {
    if (hasFormContent() && !window.confirm('현재 입력 내용을 가상의 예시로 바꿀까요? 기존에 입력한 내용은 사라집니다.')) return;
    fields.company.value = '가상 회사';
    fields.role.value = '서비스 기획자';
    fields.job.value = [
      '담당 업무',
      '· 가입·활성화 지표를 분석하고 서비스 개선 과제를 발굴합니다.',
      '· 사용자 인터뷰와 데이터 분석을 바탕으로 서비스 기획 및 A/B 테스트를 진행합니다.',
      '· 디자인·개발 등 여러 팀과 협업해 제품을 출시하고 성과를 측정합니다.',
      '',
      '자격 요건',
      '· 데이터를 근거로 문제를 정의하고 해결까지 실행한 경험이 있는 분',
      '· 다양한 이해관계자와 명확하게 소통하고 프로젝트를 주도할 수 있는 분',
      '',
      '우대 사항',
      '· SQL 또는 분석 도구로 서비스 지표를 확인한 경험'
    ].join('\n');
    fields.context.value = '교육 예약 서비스의 가입 단계에서 다음 화면으로 넘어가지 못하는 사용자가 반복된다는 문의가 들어왔습니다.';
    fields.actions.value = '사용자 문의를 유형별로 분류하고, 디자이너·개발자와 가입 흐름의 이탈 지점을 확인했습니다. 안내 문구와 화면 순서를 개선한 뒤 내부 사용성 테스트를 진행했습니다.';
    fields.outcome.value = '';
    isSampleInput = true;
    updateJobCount();
    ui.keywordFeedback.textContent = '';
    if (window.plenDraft && typeof window.plenDraft.clear === 'function') window.plenDraft.clear();
    runAnalysis({ scrollToResult: true });
  });

  form.addEventListener('reset', () => {
    isSampleInput = false;
    window.setTimeout(() => {
      updateJobCount();
      showMessage('');
      clearResults();
    }, 0);
  });

  ui.copyKeywordsButton.addEventListener('click', copyKeywords);
  ui.downloadKeywordsButton.addEventListener('click', downloadKeywords);
})();
