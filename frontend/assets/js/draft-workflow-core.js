(() => {
  'use strict';

  const career = typeof module !== 'undefined' && module.exports
    ? require('./career-core.js')
    : (typeof window !== 'undefined' ? window.plenCareerCore : null);

  const MISSING_RECORD_LABEL = career ? career.MISSING_RECORD_LABEL : '(기록 없음 — 채운 부분)';
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  function isRealDate(value) {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function validateFactSheet(factSheet, selectedIds) {
    const allowedIds = new Set(Array.isArray(selectedIds) ? selectedIds : []);
    const errors = [];
    if (!Array.isArray(factSheet) || factSheet.length === 0) {
      return { ok: false, errors: ['확인할 팩트 시트 문장이 없습니다.'] };
    }

    factSheet.forEach((item, index) => {
      if (!item || typeof item !== 'object' || typeof item.text !== 'string' || !item.text.trim()) {
        errors.push(`${index + 1}번 팩트 문장이 비어 있습니다.`);
        return;
      }
      if (!item.expId || !allowedIds.has(item.expId)) {
        errors.push(`${index + 1}번 팩트 문장의 출처가 선택한 경험 카드에 없습니다.`);
      }
      if (item.filled && !item.text.includes(MISSING_RECORD_LABEL)) {
        errors.push(`${index + 1}번 기록 보완 문장에 필수 표기가 없습니다.`);
      }
    });
    return { ok: errors.length === 0, errors };
  }

  function toFirstPerson(text) {
    return String(text || '')
      .replace(/해당 국면에서 지원자에게 부여된 핵심 과제는/g, '제가 맡은 핵심 과제는')
      .replace(/지원자에게 부여된 핵심 과제는/g, '제가 맡은 핵심 과제는')
      .replace(/지원자는/g, '저는')
      .replace(/행동을 주도적으로 실행하였다\./g, '실행했습니다.')
      .replace(/직접 (.+?) 행동을 주도적으로 실행하였다\./g, '직접 $1 실행했습니다.')
      .replace(/상황에 직면하였다\./g, '상황이었습니다.')
      .replace(/성과를 도출하였다\./g, '성과가 있었습니다.')
      .replace(/피드백을 받았다\./g, '피드백을 받았습니다.')
      .replace(/반복 관측되었다\./g, '반복 관측되었습니다.')
      .replace(/배움을 얻었다\./g, '배웠습니다.')
      .replace(/였다\./g, '였습니다.')
      .replace(/하였다\./g, '했습니다.')
      .replace(/한다\./g, '합니다.');
  }

  function formatPeriod(card) {
    const from = isRealDate(card.dateFrom) ? card.dateFrom : '';
    const to = isRealDate(card.dateTo) ? card.dateTo : '';
    if (from && to) return from === to ? from : `${from} ~ ${to}`;
    return from || to;
  }

  function generateFirstPersonDraft(factSheet, cards, options = {}) {
    if (!career) throw new Error('경험 카드 로직을 불러오지 못했습니다.');
    if (!Array.isArray(cards) || cards.length === 0 || cards.length > 3) {
      throw new Error('선택한 경험 카드는 1~3장이어야 합니다.');
    }

    const normalizedCards = cards.map(career.normalizeExperienceCard);
    const selectedIds = normalizedCards.map((card) => card.id);
    const validation = validateFactSheet(factSheet, selectedIds);
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    const leadCard = normalizedCards
      .filter((card) => career.isCoreStrengthCandidate(card))
      .sort((a, b) => b.repeatDays - a.repeatDays)[0];
    if (!leadCard) {
      throw new Error('반복 관측 10일 이상인 경험 카드가 없습니다. 행동을 실제로 기록한 뒤 초안을 만들어 주세요.');
    }
    if (!formatPeriod(leadCard)) {
      throw new Error('첫 문단에 넣을 반복 관측 10일 이상 카드의 시작일 또는 종료일을 YYYY-MM-DD 형식으로 입력해 주세요.');
    }

    const orderedCards = [leadCard, ...normalizedCards.filter((card) => card.id !== leadCard.id)];
    const paragraphs = [];
    orderedCards.forEach((card) => {
      const lines = factSheet
        .filter((item) => item.expId === card.id)
        .map((item) => toFirstPerson(item.text.trim()))
        .filter(Boolean);
      if (!lines.length) return;
      const period = formatPeriod(card);
      const heading = `저는 ${period} '${card.title}' 경험을 바탕으로 다음 사실을 정리했습니다. (${card.repeatDays}일 반복 관측)`;
      paragraphs.push([heading, ...lines].join('\n'));
    });

    if (!paragraphs.length || !paragraphs[0].includes(leadCard.id) && !paragraphs[0].includes(leadCard.title)) {
      throw new Error('첫 강점 카드에 연결된 확인 팩트가 없습니다. 팩트 시트를 확인해 주세요.');
    }

    const question = typeof options.question === 'string' ? options.question.trim() : '';
    const questionHeading = question ? `[문항: ${question}]` : '';
    return [questionHeading, ...paragraphs].filter(Boolean).join('\n\n');
  }

  const api = { MISSING_RECORD_LABEL, isRealDate, validateFactSheet, toFirstPerson, generateFirstPersonDraft };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.plenDraftWorkflowCore = api;
})();
