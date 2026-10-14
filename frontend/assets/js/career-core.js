(() => {
  'use strict';

  const MISSING_RECORD_LABEL = '(기록 없음 — 채운 부분)';

  // 1. 경험 카드 관련 로직 (규칙 ①②③④)
  function countBlanks(card) {
    if (!card || typeof card !== 'object') return 4;
    const starFields = ['situation', 'task', 'action', 'result'];
    return starFields.reduce((count, field) => {
      const value = card[field];
      return count + (!value || typeof value !== 'string' || !value.trim() ? 1 : 0);
    }, 0);
  }

  function isCoreStrengthCandidate(card) {
    if (!card || typeof card !== 'object') return false;
    const repeatDays = Number(card.repeatDays);
    return Number.isFinite(repeatDays) && repeatDays >= 10;
  }

  function validateEvidence(evidenceList) {
    if (!Array.isArray(evidenceList)) return [];
    return evidenceList
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        who: String(item.who || '').trim().slice(0, 80),
        when: String(item.when || '').trim().slice(0, 40),
        quote: String(item.quote || '').trim().slice(0, 500)
      }))
      .filter((item) => item.quote.length > 0);
  }

  function normalizeExperienceCard(data) {
    if (!data || typeof data !== 'object') throw new TypeError('경험 카드 데이터가 올바르지 않습니다.');
    const title = String(data.title || '').trim().slice(0, 100);
    if (!title) throw new Error('경험 카드 제목은 필수입니다.');

    const id = typeof data.id === 'string' && data.id ? data.id : `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const dateFrom = String(data.dateFrom || '').trim().slice(0, 20);
    const dateTo = String(data.dateTo || '').trim().slice(0, 20);
    const situation = String(data.situation || '').trim().slice(0, 2000);
    const task = String(data.task || '').trim().slice(0, 2000);
    const action = String(data.action || '').trim().slice(0, 3000);
    const result = String(data.result || '').trim().slice(0, 2000);
    const repeatDays = Math.max(0, parseInt(data.repeatDays, 10) || 0);
    const evidence = validateEvidence(data.evidence);
    const tags = Array.isArray(data.tags)
      ? data.tags.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 10)
      : String(data.tags || '').split(/[,;\n]+/).map((t) => t.trim()).filter(Boolean).slice(0, 10);

    const blanks = countBlanks({ situation, task, action, result });
    const isCoreStrength = repeatDays >= 10;

    return {
      id,
      title,
      dateFrom,
      dateTo,
      situation,
      task,
      action,
      result,
      repeatDays,
      evidence,
      tags,
      blanks,
      isCoreStrength,
      createdAt: data.createdAt || new Date().toISOString()
    };
  }

  // 2. 채용공고 분석 및 키워드 추출 (규칙 6-1)
  const PREDEFINED_DICTIONARY = [
    { word: '데이터 분석', terms: ['데이터 분석', '데이터 기반', '정량 분석', '지표 분석', '데이터 드리븐', '지표 관리', '로그 분석', '대시보드', '지표', '통계'] },
    { word: '문제 해결', terms: ['문제 해결', '원인 분석', '이슈 해결', '문제 정의', '트러블슈팅', '과제 해결', '개선'] },
    { word: '협업 및 커뮤니케이션', terms: ['협업', '의사소통', '커뮤니케이션', '유관 부서', '크로스펑셔널', '팀워크', '팀 간', '협력', '소통'] },
    { word: '프로젝트 관리', terms: ['프로젝트 관리', '일정 관리', '프로젝트 리드', '애자일', '스프린트', '마일스톤', '운영'] },
    { word: '사용자 경험 개선', terms: ['사용자 경험', 'ux/ui', 'ux 개선', '고객 중심', '사용자 조사', '사용자 인터뷰', '고객 관점', '피드백', 'cs'] },
    { word: '실험 및 가설 검증', terms: ['가설 검증', 'a/b 테스트', 'ab 테스트', '실험 설계', '전환율', '최적화'] },
    { word: '서비스 기획', terms: ['서비스 기획', '프로덕트 기획', '요구사항 정의', '화면 설계', '와이어프레임', '기획을', '기획합니다'] },
    { word: '백엔드 개발', terms: ['백엔드', 'backend', 'back-end', '서버 개발', 'api'] },
    { word: '프론트엔드 개발', terms: ['프론트엔드', 'frontend', 'front-end', 'react', '웹 화면'] },
    { word: '데이터베이스', terms: ['데이터베이스', 'db', 'sql', '쿼리', '모델링'] },
    { word: '주도성과 오너십', terms: ['주도성', '주도적', '오너십', '책임감', '실행력', '능동적', '리드'] },
    { word: '기술 문서화', terms: ['문서화', '기술 문서', '가이드라인', '작성 능력', '매뉴얼', '리포트', '카탈로그'] },
    { word: '모니터링 및 품질 관리', terms: ['모니터링', '품질 관리', 'qa', '테스트 자동화', '코드 리뷰', '안정성', '무결성', '정합성', '검증'] },
    { word: '비즈니스 이해', terms: ['비즈니스 이해', '사업 전략', '수익화', '시장 분석', '경쟁사 분석', '매출'] },
    { word: '클라우드 및 인프라', terms: ['클라우드', 'aws', 'gcp', '인프라', '도커', '쿠버네티스', '배포'] },
    { word: '자동화 및 효율화', terms: ['자동화', '효율화', '프로세스 개선', '업무 개선', '파이프라인', '배치'] }
  ];

  // 영문 약어(api, db, qa 등)는 다른 단어 속에 섞여 잘못 잡히지 않도록 단어 경계로만 셉니다.
  function countTerm(lowerText, lowerTerm) {
    if (/^[a-z0-9/+-]+$/.test(lowerTerm)) {
      const escaped = lowerTerm.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
      return (lowerText.match(new RegExp(`(^|[^a-z0-9])${escaped}(?![a-z0-9])`, 'g')) || []).length;
    }
    return lowerText.split(lowerTerm).length - 1;
  }

  function keywordTerms(word) {
    const entry = PREDEFINED_DICTIONARY.find((item) => item.word === word);
    return entry ? [entry.word, ...entry.terms] : [word];
  }

  function splitIntoSentences(text) {
    if (!text || typeof text !== 'string') return [];
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= 6);
    const sentences = [];
    for (const line of lines) {
      const parts = line.split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter((p) => p.length >= 6);
      if (parts.length > 0) sentences.push(...parts);
      else sentences.push(line);
    }
    return Array.from(new Set(sentences.filter((s) => text.includes(s))));
  }

  function extractJobKeywords(jobPostingText, maxCount = 5) {
    if (!jobPostingText || typeof jobPostingText !== 'string' || !jobPostingText.trim()) {
      return [];
    }

    const sentences = splitIntoSentences(jobPostingText);
    const normalizedText = jobPostingText.toLowerCase();
    const scoredKeywords = [];

    PREDEFINED_DICTIONARY.forEach((dictItem) => {
      let matchedTerm = null;
      let matchedSentence = null;
      let termFrequency = 0;

      for (const term of dictItem.terms) {
        const lowerTerm = term.toLowerCase();
        const count = countTerm(normalizedText, lowerTerm);
        if (count > 0) {
          termFrequency += count;
          if (!matchedTerm) matchedTerm = term;
          if (!matchedSentence) {
            matchedSentence = sentences.find((s) => countTerm(s.toLowerCase(), lowerTerm) > 0);
          }
        }
      }

      if (matchedTerm && matchedSentence && jobPostingText.includes(matchedSentence)) {
        scoredKeywords.push({
          word: dictItem.word,
          evidence: matchedSentence,
          frequency: termFrequency
        });
      }
    });

    // 빈도순 정렬
    scoredKeywords.sort((a, b) => b.frequency - a.frequency);

    // 중복 및 최대 개수 제한
    const result = [];
    const seenWords = new Set();
    for (const item of scoredKeywords) {
      if (!seenWords.has(item.word)) {
        seenWords.add(item.word);
        result.push({
          word: item.word,
          evidence: item.evidence
        });
        if (result.length >= maxCount) break;
      }
    }

    // 만약 사전에 걸리지 않는 경우, 공고의 핵심 긴 문장들로부터 일반 키워드 보충
    if (result.length < maxCount && sentences.length > 0) {
      const fallbackCandidates = [
        { word: '직무 역량', pattern: /자격\s*요건|우대\s*사항|담당\s*업무|경험/ },
        { word: '성장과 학습', pattern: /성장|학습|지속적|도전|공유/ },
        { word: '책임감과 완결', pattern: /책임|완결|오너|마무리|달성/ }
      ];

      for (const candidate of fallbackCandidates) {
        if (result.length >= maxCount) break;
        if (seenWords.has(candidate.word)) continue;
        const sentence = sentences.find((s) => candidate.pattern.test(s));
        if (sentence && jobPostingText.includes(sentence)) {
          seenWords.add(candidate.word);
          result.push({
            word: candidate.word,
            evidence: sentence
          });
        }
      }

      // 문장에서 직접 키워드 추출하여 maxCount 채우기
      if (result.length < maxCount) {
        for (const sent of sentences) {
          if (result.length >= maxCount) break;
          if (result.some((r) => r.evidence === sent)) continue;
          const cleanKw = sent
            .replace(/^[-*•\d.)\s]+/, '')
            .replace(/(합니다|수행합니다|구축합니다|개선합니다|운영합니다|리드합니다|실행합니다|관리합니다|분석합니다)\.?$/g, '')
            .trim()
            .slice(0, 16);
          if (cleanKw && !seenWords.has(cleanKw)) {
            seenWords.add(cleanKw);
            result.push({
              word: cleanKw,
              evidence: sent
            });
          }
        }
      }
    }

    // 규칙 6-1: 근거 문장이 공고 원문에 실제로 있는지 코드로 확인 (없으면 제거)
    return result.filter((item) => jobPostingText.includes(item.evidence));
  }

  function verifyKeywordEvidence(keywords, jobPostingText) {
    if (!Array.isArray(keywords) || !jobPostingText) return false;
    return keywords.every((kw) => (
      kw &&
      typeof kw.word === 'string' &&
      kw.word.trim().length > 0 &&
      typeof kw.evidence === 'string' &&
      jobPostingText.includes(kw.evidence)
    ));
  }

  // 3. 팩트 시트 생성 (규칙 ④⑤)
  // 3인칭 시점 요약. 빈 칸은 내용을 지어내지 않고 "아직 기록하지 않았다"로 남기며 반드시 (기록 없음 — 채운 부분) 표기
  // 카드 입력은 "~던 상황", "~다듬음", "~줄어듦"처럼 명사형으로 끝나는 경우가 많아 문장에 맞게 어미를 바꿉니다.
  const HANGUL_BASE = 0xac00;
  function jongIndex(char) {
    const code = char ? char.charCodeAt(0) - HANGUL_BASE : -1;
    return code >= 0 && code < 11172 ? code % 28 : -1;
  }
  function hasBatchim(word) {
    return jongIndex(String(word || '').trim().slice(-1)) > 0;
  }
  function withJong(char, index) {
    const code = char.charCodeAt(0) - HANGUL_BASE;
    return String.fromCharCode(HANGUL_BASE + code - (code % 28) + index);
  }
  function trimEnding(text) {
    return String(text || '').trim().replace(/[.。]+$/, '').trim();
  }
  const NOMINALIZED_M = ['함', '됨', '냄', '남', '짐', '옴', '봄', '줌', '킴', '침', '김', '씀', '켬'];
  const NOUNS_ENDING_EUM = ['녹음', '발음', '소음', '웃음', '울음', '믿음', '걸음', '얼음', '죽음', '묶음', '젊음'];
  // "다듬음" → "다듬는", "보냄" → "보내는", "줄어듦" → "줄어드는". 명사형이 아니면 null.
  function toAdnominal(phrase) {
    const text = trimEnding(phrase);
    const last = text.slice(-1);
    if (text.length > 1 && last === '음' && hasBatchim(text.slice(-2, -1)) && !NOUNS_ENDING_EUM.some((noun) => text.endsWith(noun))) {
      const stem = text.slice(0, -1);
      return jongIndex(stem.slice(-1)) === 8 ? `${stem.slice(0, -1)}${withJong(stem.slice(-1), 0)}는` : `${stem}는`;
    }
    const jong = jongIndex(last);
    if (jong === 16 && NOMINALIZED_M.includes(last)) return `${text.slice(0, -1)}${withJong(last, 0)}는`; // ㅁ
    if (jong === 10) return `${text.slice(0, -1)}${withJong(last, 0)}는`; // ㄻ → ㄹ 탈락
    return null;
  }
  function isSentence(phrase) {
    return /(다|요)$/.test(trimEnding(phrase));
  }
  function objectParticle(word) { return hasBatchim(word) ? '을' : '를'; }
  function copula(word) { return hasBatchim(word) ? '이었다' : '였다'; }

  function topicParticle(word) { return hasBatchim(word) ? '은' : '는'; }

  function situationText(periodStr, title, situation) {
    const text = trimEnding(situation);
    const project = `${periodStr} 진행한 '${title}'`;
    if (isSentence(text)) return `${project} 당시 ${text}.`;
    const base = text.replace(/\s*상황$/, '');
    const adnominal = toAdnominal(base);
    return `${project}${topicParticle(title)} ${adnominal || base} 상황에서 시작되었다.`;
  }
  function taskText(task) {
    const text = trimEnding(task);
    if (isSentence(text)) return `핵심 과제로 ${text}.`;
    const adnominal = toAdnominal(text);
    if (adnominal) return `지원자에게 부여된 핵심 과제는 ${adnominal} 것이었다.`;
    if (/[는은을할]\s*과제$/.test(text)) return `지원자에게 부여된 핵심 과제는 ${text.replace(/\s*과제$/, '')} 것이었다.`;
    return `지원자에게 부여된 핵심 과제는 ${text}${copula(text)}.`;
  }
  function actionText(action) {
    const text = trimEnding(action);
    if (isSentence(text)) return `지원자는 목표를 위해 ${text}.`;
    const adnominal = toAdnominal(text);
    if (adnominal) return `지원자는 ${adnominal} 행동을 직접 실행하였다.`;
    return `지원자는 ${text}${objectParticle(text)} 직접 실행하였다.`;
  }
  function resultText(result) {
    const text = trimEnding(result);
    if (isSentence(text)) return `그 결과 ${text}.`;
    const adnominal = toAdnominal(text);
    if (adnominal) return `그 결과 ${adnominal} 성과를 도출하였다.`;
    return `그 결과 ${text}${hasBatchim(text) ? '이라는' : '라는'} 성과를 도출하였다.`;
  }

  function generateFactSheet(cards, options = {}) {
    if (!Array.isArray(cards) || cards.length === 0) return [];
    const selectedCards = cards.slice(0, 3); // 최대 3장
    const factItems = [];

    selectedCards.forEach((rawCard) => {
      const card = normalizeExperienceCard(rawCard);
      const periodStr = card.dateFrom && card.dateTo
        ? `${card.dateFrom}부터 ${card.dateTo}까지`
        : (card.dateFrom ? `${card.dateFrom}부터` : '해당 기간 동안');
      const push = (kind, text, filled = false) => factItems.push({ expId: card.id, expTitle: card.title, kind, filled, text });

      // 1) 기본 맥락/상황
      if (card.situation) {
        push('situation', situationText(periodStr, card.title, card.situation));
      } else {
        push('situation', `지원자는 ${periodStr} '${card.title}'${objectParticle(card.title)} 진행했으나 당시 문제 상황은 아직 기록하지 않았다${MISSING_RECORD_LABEL}.`, true);
      }

      // 2) 과제(Task)
      if (card.task) push('task', taskText(card.task));

      // 3) 행동(Action)
      if (card.action) {
        push('action', actionText(card.action));
      } else {
        push('action', `지원자가 실제로 한 행동은 아직 기록하지 않았다${MISSING_RECORD_LABEL}.`, true);
      }

      // 4) 결과(Result)
      if (card.result) {
        push('result', resultText(card.result));
      } else {
        push('result', `이 경험의 결과는 아직 기록하지 않았다${MISSING_RECORD_LABEL}.`, true);
      }

      // 5) 반복 관측 일수 반영
      if (card.repeatDays > 0) {
        push('repeat', `이 행동은 단발성이 아니라 총 ${card.repeatDays}일간 반복 관측되었다.`);
      }

      // 6) 바깥 증거 (동료 피드백·감사 증언)
      (card.evidence || []).forEach((ev) => {
        const whoStr = ev.who ? ev.who : '동료';
        const whenStr = ev.when ? `(${ev.when})` : '';
        push('evidence', `${whoStr}${whenStr}에게서 "${ev.quote}"라는 피드백을 받았다.`);
      });
    });

    return factItems;
  }

  // 금지 형용사 목록 (규칙 ① 상투어 배제)
  const FORBIDDEN_ADJECTIVES = [
    '성실한', '열정적인', '책임감 있는', '적극적인', '꼼꼼한', '소통을 잘하는', '창의적인'
  ];

  // 1인칭 초안 생성은 draft-workflow-core.js, 9개 검사는 draft-inspection-core.js가 담당합니다.

  const api = {
    MISSING_RECORD_LABEL,
    FORBIDDEN_ADJECTIVES,
    countBlanks,
    isCoreStrengthCandidate,
    validateEvidence,
    normalizeExperienceCard,
    extractJobKeywords,
    keywordTerms,
    countTerm,
    verifyKeywordEvidence,
    generateFactSheet
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.plenCareerCore = api;
})();
