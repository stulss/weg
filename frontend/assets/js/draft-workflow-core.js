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
      .replace(/시작되었다\./g, '시작되었습니다.')
      .replace(/않았다/g, '않았습니다')
      .replace(/하였다\./g, '했습니다.')
      .replace(/이었다\./g, '이었습니다.')
      .replace(/였다\./g, '였습니다.')
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
    let lines = orderedCards.flatMap((card) => factSheet
      .filter((item) => item.expId === card.id)
      .map((item) => ({ cardId: card.id, kind: item.kind || '', filled: item.filled === true, text: toFirstPerson(item.text.trim()) }))
      .filter((line) => line.text));

    const keywords = (Array.isArray(options.keywords) ? options.keywords : [])
      .map((item) => typeof item === 'string' ? item : item && item.word)
      .filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());

    // 공고 키워드 중 실제로 남아 있는 카드 내용에서 근거를 찾을 수 있는 것만 마지막 문단에 연결합니다.
    function keywordParagraph(currentLines) {
      const usedIds = new Set(currentLines.map((line) => line.cardId));
      const source = orderedCards.filter((card) => usedIds.has(card.id))
        .map((card) => [card.title, card.situation, card.task, card.action, card.result, ...(card.tags || [])].join(' '))
        .join(' ').toLowerCase();
      const covered = keywords.filter((word) => career.keywordTerms(word).some((term) => career.countTerm(source, term.toLowerCase()) > 0));
      return covered.length ? `이 경험들에는 공고가 요구하는 ${covered.join(', ')} 역량이 드러납니다.` : '';
    }

    function render(currentLines) {
      const paragraphs = orderedCards.map((card) => currentLines.filter((line) => line.cardId === card.id).map((line) => line.text).join(' ')).filter(Boolean);
      if (!paragraphs.length) return '';
      const lead = paragraphs[0];
      if (!lead.includes(leadCard.title) || !lead.includes(`${leadCard.repeatDays}일`)) {
        paragraphs[0] = `'${leadCard.title}'(${formatPeriod(leadCard)})에서 ${leadCard.repeatDays}일간 반복한 행동을 소개합니다. ${lead}`;
      }
      return [...paragraphs, keywordParagraph(currentLines)].filter(Boolean).join('\n\n');
    }

    // 글자 수 제한을 넘으면 뒤쪽 카드의 덜 중요한 문장부터 뺍니다.
    // 첫 강점 카드 문장, 기록 없음 표기 문장, 유일한 바깥 증거 문장은 검사 규칙에 필요하므로 남깁니다.
    const limit = Number(options.limit);
    if (Number.isFinite(limit) && limit > 0) {
      const trimOrder = ['repeat', 'evidence', 'situation', 'task', 'result', 'action', ''];
      const removable = (line) => {
        if (line.cardId === leadCard.id || line.filled) return false;
        if (line.kind === 'evidence') return lines.filter((item) => item.kind === 'evidence').length > 1;
        return true;
      };
      while (render(lines).length > limit) {
        let target = null;
        for (const kind of trimOrder) {
          for (const card of orderedCards.slice(1).reverse()) {
            target = lines.find((line) => line.cardId === card.id && line.kind === kind && removable(line));
            if (target) break;
          }
          if (target) break;
        }
        if (!target) break;
        lines = lines.filter((line) => line !== target);
      }
    }

    const draft = render(lines);
    if (!draft || !draft.split('\n\n')[0].includes(leadCard.title)) {
      throw new Error('첫 강점 카드에 연결된 확인 팩트가 없습니다. 팩트 시트를 확인해 주세요.');
    }
    return draft;
  }

  const api = { MISSING_RECORD_LABEL, isRealDate, validateFactSheet, toFirstPerson, generateFirstPersonDraft };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.plenDraftWorkflowCore = api;
})();
