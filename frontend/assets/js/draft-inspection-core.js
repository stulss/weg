(() => {
  'use strict';

  const career = typeof module !== 'undefined' && module.exports
    ? require('./career-core.js')
    : (typeof window !== 'undefined' ? window.plenCareerCore : null);
  if (!career) throw new Error('career-core.js is required for draft inspection.');

  const LABEL = career.MISSING_RECORD_LABEL || '(기록 없음 — 채운 부분)';
  const FORBIDDEN = career.FORBIDDEN_ADJECTIVES || [];
  function occurrences(text, term) { return term ? String(text).split(term).length - 1 : 0; }
  function normalizedNumber(value) {
    const number = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(number) ? String(number) : String(value);
  }
  function extractNumbers(value) { return (String(value || '').match(/\d+(?:,\d{3})*(?:\.\d+)?/g) || []).map(normalizedNumber); }
  function cardSourceText(cards) {
    const fields = ['title', 'dateFrom', 'dateTo', 'situation', 'task', 'action', 'result', 'repeatDays'];
    const parts = [];
    (Array.isArray(cards) ? cards : []).forEach((card) => {
      if (!card || typeof card !== 'object') return;
      fields.forEach((field) => parts.push(card[field]));
      (Array.isArray(card.tags) ? card.tags : []).forEach((tag) => parts.push(tag));
      (Array.isArray(card.evidence) ? card.evidence : []).forEach((item) => {
        if (item && typeof item === 'object') parts.push(item.who, item.when, item.quote);
      });
    });
    return parts.filter((value) => value !== undefined && value !== null).join(' ');
  }
  function inspectDraft(draftText, options = {}) {
    const text = String(draftText || '').trim();
    const { cards = [], factSheet = [], keywords = [], limit = 700, aiDraft = '', userFinished = false } = options;
    const words = (Array.isArray(keywords) ? keywords : [])
      .map((item) => typeof item === 'string' ? item : item && item.word)
      .filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
    const results = [];
    const add = (ruleId, name, passed, detail, severity = 'warning') => results.push({ ruleId, name, passed: Boolean(passed), detail, severity: passed ? 'ok' : severity });

    const matched = words.filter((word) => text.includes(word));
    const keywordTarget = Math.min(4, words.length);
    add('keyword', '키워드 4/5 이상 포함', words.length > 0 && matched.length >= keywordTarget,
      `${matched.length} / ${words.length}개 포함${words.length < 5 ? ' (키워드 5개 미만)' : ''}`);

    // Heuristic only: confirms numbers are present in selected card fields, not truth of the narrative.
    const body = text.replace(/^\[문항:[^\]]*\]\s*/i, '');
    const registered = new Set(extractNumbers(cardSourceText(cards)));
    const suspicious = extractNumbers(body).filter((number) => !registered.has(number));
    add('unregistered', '등록 외 경험·수치 확인', suspicious.length === 0,
      suspicious.length ? `선택 카드에서 찾을 수 없는 숫자: ${Array.from(new Set(suspicious)).join(', ')}` : '카드에 없는 숫자는 없습니다. 서술한 경험의 사실성은 직접 대조해야 합니다.');

    const safeLimit = Number(limit);
    add('limit', '글자 수 제한 준수 (공백 포함)', text.length > 0 && Number.isFinite(safeLimit) && safeLimit > 0 && text.length <= safeLimit,
      `${text.length.toLocaleString('ko-KR')} / ${Number.isFinite(safeLimit) ? safeLimit.toLocaleString('ko-KR') : 0}자`);

    const hasDate = /(?:19|20)\d{2}\s*[-./년]\s*\d{1,2}(?:\s*[-./월]\s*\d{1,2}\s*일?)?|\d{1,2}\s*월\s*\d{1,2}\s*일/.test(text);
    const hasSituation = /상황|당시|문제 상황/.test(text);
    const hasTask = /과제|목표/.test(text);
    const hasAction = /행동|실행|수행/.test(text);
    const hasResult = /결과|성과|달성|배움/.test(text);
    const missing = [!hasDate && '날짜', !hasSituation && '상황', !hasTask && '과제', !hasAction && '행동', !hasResult && '결과'].filter(Boolean);
    add('starDate', '① STAR 요소와 날짜', missing.length === 0, missing.length ? `보완 필요: ${missing.join(', ')}` : '날짜·상황·과제·행동·결과 표현 확인');

    const forbidden = FORBIDDEN.filter((word) => text.includes(word));
    add('forbiddenAdj', '① 금지 형용사 배제', forbidden.length === 0, forbidden.length ? `발견: ${forbidden.join(', ')}` : '금지 형용사가 없습니다.');

    // 문항 제목은 본문 문단으로 세지 않아, 제목 뒤 첫 본문 문단을 강점 배치 판정에 사용합니다.
    const draftBody = text.replace(/^\s*\[문항:[^\]]*\]\s*/i, '');
    const firstParagraph = draftBody.split(/\n\s*\n/)[0] || '';
    const eligible = (Array.isArray(cards) ? cards : []).filter((card) => Number(card && card.repeatDays) >= 10);
    const lead = eligible.find((card) => {
      const title = String(card.title || '').trim();
      return title && firstParagraph.includes(title) && new RegExp(`(?:총\\s*)?${Number(card.repeatDays)}일`).test(firstParagraph);
    });
    add('coreStrength', '② 10일 이상 반복 강점 첫 문단 배치', Boolean(lead),
      lead ? `${lead.title} · ${lead.repeatDays}일` : '첫 문단에 선택 카드 제목과 10일 이상 반복 일수를 함께 적어야 합니다.');

    const quotes = (Array.isArray(cards) ? cards : []).flatMap((card) => Array.isArray(card && card.evidence) ? card.evidence : [])
      .map((item) => String(item && item.quote || '').trim()).filter(Boolean);
    const cited = quotes.find((quote) => text.includes(quote));
    add('outsideEvidence', '③ 바깥 증거 인용', Boolean(cited),
      cited ? '선택 카드의 피드백 문구를 인용했습니다.' : (quotes.length ? '선택 카드의 피드백 인용이 초안에 없습니다.' : '선택 카드에 바깥 증거가 없습니다. 증거를 만들어 쓰지 마세요.'));

    const required = (Array.isArray(factSheet) ? factSheet : []).filter((item) => item && item.filled === true).length;
    const marked = occurrences(text, LABEL);
    const passedFilled = marked >= required;
    add('filledMark', '④ 기록 없음 — 채운 부분 표기 (최우선)', passedFilled,
      passedFilled ? `${marked}개 표기 / 필요한 ${required}개` : `표기 ${marked}개 / 필요한 ${required}개. 누락 시 저장할 수 없습니다.`, 'blocker');

    const different = Boolean(String(aiDraft || '').trim()) && text !== String(aiDraft || '').trim();
    const finished = userFinished === true && different;
    add('userFinished', '⑤ 직접 완성 체크 및 초안 수정', finished,
      finished ? '직접 완성 체크와 자동 초안 대비 수정이 확인되었습니다.' : (!userFinished ? '직접 완성 체크가 필요합니다.' : '자동 초안과 달라진 문장이 필요합니다.'), 'info');

    const passedCount = results.filter((item) => item.passed).length;
    return { passedCount, totalCount: 9, allPassed: passedCount === 9, canSave: passedFilled, charCount: text.length, limit: safeLimit, results };
  }
  career.inspectDraft = inspectDraft;
  const api = { inspectDraft, occurrences, extractNumbers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.plenDraftInspectionCore = api;
})();
