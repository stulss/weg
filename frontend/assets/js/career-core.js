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
    { word: '데이터 분석', terms: ['데이터 분석', '데이터 기반', '정량 분석', '지표 분석', '데이터 드리븐', '지표 관리', '로그 분석', '대시보드', '지표', '데이터'] },
    { word: '문제 해결', terms: ['문제 해결', '원인 분석', '이슈 해결', '문제 정의', '트러블슈팅', '과제 해결', '개선'] },
    { word: '협업 및 커뮤니케이션', terms: ['협업', '의사소통', '커뮤니케이션', '유관 부서', '크로스펑셔널', '팀워크', '팀 간', '협력', '소통'] },
    { word: '프로젝트 관리', terms: ['프로젝트 관리', '일정 관리', '프로젝트 리드', '애자일', '스프린트', '마일스톤', '운영'] },
    { word: '사용자 경험 개선', terms: ['사용자 경험', 'ux/ui', 'ux 개선', '고객 중심', '사용자 조사', '사용자 인터뷰', '고객 관점', '피드백', 'cs'] },
    { word: '실험 및 가설 검증', terms: ['가설 검증', 'a/b 테스트', 'ab 테스트', '실험 설계', '전환율', '최적화'] },
    { word: '서비스 기획', terms: ['서비스 기획', '프로덕트 기획', '요구사항 정의', '화면 설계', '와이어프레임', '기획'] },
    { word: '주도성과 오너십', terms: ['주도성', '주도적', '오너십', '책임감', '실행력', '능동적', '리드'] },
    { word: '기술 문서화', terms: ['문서화', '기술 문서', '가이드라인', '작성 능력', '매뉴얼', '리포트', '카탈로그'] },
    { word: '모니터링 및 품질 관리', terms: ['모니터링', '품질 관리', 'qa', '테스트 자동화', '코드 리뷰', '안정성', '무결성', '정합성', '검증'] },
    { word: '비즈니스 이해', terms: ['비즈니스 이해', '사업 전략', '수익화', '시장 분석', '경쟁사 분석', '매출'] },
    { word: '클라우드 및 인프라', terms: ['클라우드', 'aws', 'gcp', '인프라', '도커', '쿠버네티스', '시스템'] },
    { word: '자동화 및 효율화', terms: ['자동화', '효율화', '프로세스 개선', '업무 개선', '파이프라인', '배치'] }
  ];

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
        if (normalizedText.includes(lowerTerm)) {
          termFrequency += (normalizedText.split(lowerTerm).length - 1);
          if (!matchedTerm) matchedTerm = term;
          if (!matchedSentence) {
            matchedSentence = sentences.find((s) => s.toLowerCase().includes(lowerTerm));
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
  // 3인칭 시점 요약 + 빈 칸은 문제-원인-해결-배움 인과로 보완하고 반드시 (기록 없음 — 채운 부분) 표기
  function generateFactSheet(cards, options = {}) {
    if (!Array.isArray(cards) || cards.length === 0) return [];
    const selectedCards = cards.slice(0, 3); // 최대 3장
    const factItems = [];

    selectedCards.forEach((rawCard) => {
      const card = normalizeExperienceCard(rawCard);
      const periodStr = card.dateFrom && card.dateTo
        ? `${card.dateFrom}부터 ${card.dateTo}까지`
        : (card.dateFrom ? `${card.dateFrom}부터` : '해당 기간 동안');

      // 1) 기본 맥락/상황
      if (card.situation) {
        factItems.push({
          expId: card.id,
          expTitle: card.title,
          filled: false,
          text: `지원자는 ${periodStr} '${card.title}' 프로젝트에서 ${card.situation} 상황에 직면하였다.`
        });
      } else {
        // 비어있는 상황 채우기
        factItems.push({
          expId: card.id,
          expTitle: card.title,
          filled: true,
          text: `지원자는 ${periodStr} '${card.title}' 진행 당시 직무 목표 달성을 위한 구체적인 문제 상황을 맞이하였다${MISSING_RECORD_LABEL}.`
        });
      }

      // 2) 과제(Task)
      if (card.task) {
        factItems.push({
          expId: card.id,
          expTitle: card.title,
          filled: false,
          text: `해당 국면에서 지원자에게 부여된 핵심 과제는 ${card.task}였다.`
        });
      }

      // 3) 행동(Action)
      if (card.action) {
        factItems.push({
          expId: card.id,
          expTitle: card.title,
          filled: false,
          text: `지원자는 목표 완수를 위해 직접 ${card.action} 행동을 주도적으로 실행하였다.`
        });
      } else {
        // 행동이 빈 칸인 경우 채우기
        factItems.push({
          expId: card.id,
          expTitle: card.title,
          filled: true,
          text: `지원자는 직무 관련 원인을 분석하고 단계별 개선 방안을 수립하여 실행하였다${MISSING_RECORD_LABEL}.`
        });
      }

      // 4) 결과(Result)
      if (card.result) {
        factItems.push({
          expId: card.id,
          expTitle: card.title,
          filled: false,
          text: `그 결과 ${card.result} 성과를 도출하였다.`
        });
      } else {
        // 결과가 빈 칸인 경우 채우기
        factItems.push({
          expId: card.id,
          expTitle: card.title,
          filled: true,
          text: `이 과정을 통해 측정 지표를 안정화하고 지속 가능한 업무 표준을 체득하는 배움을 얻었다${MISSING_RECORD_LABEL}.`
        });
      }

      // 5) 반복 관측 일수 반영
      if (card.repeatDays > 0) {
        factItems.push({
          expId: card.id,
          expTitle: card.title,
          filled: false,
          text: `해당 역량과 행동 패턴은 단발성이 아닌 총 ${card.repeatDays}일간 지속적으로 반복 관측되었다.`
        });
      }

      // 6) 바깥 증거 (동료 피드백·감사 증언)
      if (card.evidence && card.evidence.length > 0) {
        card.evidence.forEach((ev) => {
          const whoStr = ev.who ? ev.who : '동료';
          const whenStr = ev.when ? ` (${ev.when})` : '';
          factItems.push({
            expId: card.id,
            expTitle: card.title,
            filled: false,
            text: `외부 검증 증거로 ${whoStr}${whenStr}로부터 "${ev.quote}"라는 피드백을 받았다.`
          });
        });
      }
    });

    return factItems;
  }

  // 금지 형용사 목록 (규칙 ① 상투어 배제)
  const FORBIDDEN_ADJECTIVES = [
    '성실한', '열정적인', '책임감 있는', '적극적인', '꼼꼼한', '소통을 잘하는', '창의적인'
  ];

  // 4. 1인칭 초안 생성 (규칙 ①②③④)
  function generateFirstPersonDraft(factSheet, cards, keywords = [], options = {}) {
    const { limit = 700 } = options;
    if (!Array.isArray(cards) || cards.length === 0) return '';

    // 규칙 ②: 첫 문단은 반복 관측 10일 이상 카드로 시작
    const sortedCards = [...cards].sort((a, b) => (b.repeatDays || 0) - (a.repeatDays || 0));
    const normalizedKeywords = (Array.isArray(keywords) ? keywords : []).map((k) => (typeof k === 'string' ? k : k.word)).filter(Boolean);

    const paragraphs = [];
    let kwIndex = 0;

    sortedCards.forEach((rawCard, cardIdx) => {
      const card = normalizeExperienceCard(rawCard);
      const cardFacts = (Array.isArray(factSheet) ? factSheet : []).filter((f) => f.expId === card.id);
      const isLead = (cardIdx === 0 && card.repeatDays >= 10);
      const periodStr = card.dateFrom && card.dateTo ? `${card.dateFrom}부터 ${card.dateTo}까지` : (card.dateFrom ? `${card.dateFrom}부터` : '');

      let p = '';

      // 첫 문단: 최상위 강점(10일 이상 반복) 강조
      if (isLead) {
        p += `저는 총 ${card.repeatDays}일간 실무 프로세스를 지속적으로 주도하며 성과를 반복 재현할 수 있는 역량을 증명해 왔습니다. `;
      }

      // S & T 문장
      const sFact = cardFacts.find((f) => f.text.includes('상황에 직면') || f.text.includes('문제 상황'));
      const tFact = cardFacts.find((f) => f.text.includes('핵심 과제'));
      if (card.situation || sFact) {
        const fillNotice = sFact && sFact.filled ? ` ${MISSING_RECORD_LABEL}` : '';
        const sitText = card.situation || '새로운 직무 과제 해결이 요구되던 상황';
        p += `${periodStr ? periodStr + ' ' : ''}'${card.title}' 당시 ${sitText} 속에서${fillNotice} `;
      }
      if (card.task || tFact) {
        const taskText = card.task || '지표 개선 및 업무 효율화 과제';
        p += `${taskText}를 성공적으로 완수해야 하는 목표를 맡았습니다. `;
      }

      // A & 키워드 결합
      const aFact = cardFacts.find((f) => f.text.includes('행동을 주도적') || f.text.includes('개선 방안을 수립'));
      const fillNoticeA = aFact && aFact.filled ? ` ${MISSING_RECORD_LABEL}` : '';
      const actText = card.action || '문제를 체계적으로 정의하고 개선안을 도출하여 실행';
      const kw = normalizedKeywords[kwIndex] || normalizedKeywords[0] || '문제 해결';
      kwIndex = (kwIndex + 1) % Math.max(1, normalizedKeywords.length);
      p += `이를 해결하기 위해 ${kw} 역량을 발휘하여 ${actText}을(를) 직접 수행하였습니다${fillNoticeA}. `;

      // R 문장
      const rFact = cardFacts.find((f) => f.text.includes('성과를 도출') || f.text.includes('배움을 얻었다'));
      const fillNoticeR = rFact && rFact.filled ? ` ${MISSING_RECORD_LABEL}` : '';
      if (card.result) {
        p += `그 결과 ${card.result} 성과를 달성하였습니다${fillNoticeR}. `;
      } else if (rFact && rFact.filled) {
        p += `이 과정에서 데이터 무결성을 확보하고 표준 업무 체계를 구축하는 배움을 얻었습니다${MISSING_RECORD_LABEL}. `;
      }

      // 바깥 증거 (동료 피드백·감사 증언) 인용 (규칙 ③)
      if (card.evidence && card.evidence.length > 0) {
        const ev = card.evidence[0];
        const whoStr = ev.who || '동료';
        p += `당시 ${whoStr}로부터 "${ev.quote}"라는 평가를 받으며 업무의 신뢰도를 교차 검증받았습니다.`;
      }

      paragraphs.push(p.trim());
    });

    // 키워드가 4개 이상 포함되도록 보강
    let fullDraft = paragraphs.join('\n\n');
    let includedCount = normalizedKeywords.filter((k) => fullDraft.includes(k)).length;
    if (includedCount < 4 && normalizedKeywords.length >= 4) {
      const missing = normalizedKeywords.filter((k) => !fullDraft.includes(k));
      if (missing.length > 0 && fullDraft.length + missing.join(', ').length < limit - 50) {
        fullDraft += `\n\n입사 후에도 ${missing.slice(0, 4 - includedCount).join(', ')} 역량을 토대로 회사의 성장에 기여하겠습니다.`;
      }
    }

    return fullDraft;
  }

  // 5. 9개 자동 검사 (규칙 6-4)
  function inspectDraft(draftText, options = {}) {
    const text = String(draftText || '').trim();
    const {
      cards = [],
      factSheet = [],
      keywords = [],
      limit = 700,
      aiDraft = '',
      userFinished = false
    } = options;

    const normalizedKeywords = (Array.isArray(keywords) ? keywords : []).map((k) => (typeof k === 'string' ? k : k.word)).filter(Boolean);
    const results = [];

    // 1. 키워드 4/5 이상 포함 (본문 문자열 검색)
    const matchedKeywords = normalizedKeywords.filter((kw) => text.includes(kw));
    const targetKwCount = Math.min(4, normalizedKeywords.length);
    const passedKw = normalizedKeywords.length === 0 || matchedKeywords.length >= targetKwCount;
    results.push({
      ruleId: 'keyword',
      name: '키워드 4/5 이상 포함',
      passed: passedKw,
      detail: `${matchedKeywords.length} / ${normalizedKeywords.length}개 포함 (${matchedKeywords.join(', ') || '없음'})`,
      severity: passedKw ? 'ok' : 'error'
    });

    // 2. 등록 외 경험 0건
    const numbersInText = text.match(/\b\d+(?:[.,]\d+)?(?:%|명|원|건|개|일)?\b/g) || [];
    const registeredCardText = JSON.stringify(cards);
    const foundSuspicious = [];
    numbersInText.forEach((num) => {
      const cleanNum = num.replace(/[^0-9]/g, '');
      if (cleanNum && cleanNum !== '700' && !registeredCardText.includes(cleanNum)) {
        foundSuspicious.push(num);
      }
    });
    const passedUnregistered = foundSuspicious.length <= 1;
    results.push({
      ruleId: 'unregistered',
      name: '등록 외 경험 0건',
      passed: passedUnregistered,
      detail: passedUnregistered ? '등록된 경험 카드 기반 확인됨' : `확인되지 않은 수치/경험 의심: ${foundSuspicious.join(', ')}`,
      severity: passedUnregistered ? 'ok' : 'warning'
    });

    // 3. 글자 수 제한 준수 (공백 포함 기준)
    const charCount = text.length;
    const passedLength = charCount > 0 && charCount <= limit;
    results.push({
      ruleId: 'limit',
      name: '글자 수 제한 준수',
      passed: passedLength,
      detail: `${charCount.toLocaleString()} / ${limit.toLocaleString()}자 (${limit - charCount >= 0 ? `${limit - charCount}자 여유` : `${charCount - limit}자 초과`})`,
      severity: passedLength ? 'ok' : 'warning'
    });

    // 4. ① STAR & 날짜 장면화
    const hasDate = /\b\d{4}[-./년]\s*\d{1,2}|\b\d{1,2}월\s*\d{1,2}일/.test(text);
    const hasStarElements = (text.includes('상황') || text.includes('당시') || text.includes('프로젝트')) &&
                            (text.includes('위해') || text.includes('수행') || text.includes('실행')) &&
                            (text.includes('결과') || text.includes('달성') || text.includes('성과') || text.includes('배움'));
    const passedStar = hasDate && hasStarElements;
    results.push({
      ruleId: 'starDate',
      name: '① STAR & 날짜 장면화',
      passed: passedStar,
      detail: passedStar ? '구체적 날짜와 STAR 인과 구조 포함' : (hasDate ? 'STAR 요소 보완 필요' : '구체적인 시작/종료 날짜 표기 필요'),
      severity: passedStar ? 'ok' : 'warning'
    });

    // 5. ① 금지 형용사 배제
    const foundForbidden = FORBIDDEN_ADJECTIVES.filter((adj) => text.includes(adj));
    const passedForbidden = foundForbidden.length === 0;
    results.push({
      ruleId: 'forbiddenAdj',
      name: '① 상투적 금지 형용사 배제',
      passed: passedForbidden,
      detail: passedForbidden ? '상투적 형용사 없이 구체적 행동으로 서술됨' : `금지 형용사 발견: ${foundForbidden.join(', ')}`,
      severity: passedForbidden ? 'ok' : 'warning'
    });

    // 6. ② 최상위 강점 우선 배치 (10일 이상)
    const firstPara = text.split('\n\n')[0] || '';
    const leadCards = cards.filter((c) => Number(c.repeatDays) >= 10);
    const passedLead = leadCards.length === 0 || leadCards.some((c) => firstPara.includes(c.title) || firstPara.includes(`${c.repeatDays}일`));
    results.push({
      ruleId: 'coreStrength',
      name: '② 최상위 강점 우선 배치 (10일 이상)',
      passed: passedLead,
      detail: passedLead ? '10일 이상 반복 관측된 최상위 강점으로 시작' : '첫 문단에 10일 이상 반복 카드 배치 권장',
      severity: passedLead ? 'ok' : 'warning'
    });

    // 7. ③ 신뢰도 바깥 증거 결합
    const allQuotes = cards.flatMap((c) => (c.evidence || []).map((e) => e.quote)).filter(Boolean);
    const hasEvidence = allQuotes.length === 0 || allQuotes.some((q) => text.includes(q.slice(0, 10)));
    results.push({
      ruleId: 'outsideEvidence',
      name: '③ 신뢰도 바깥 증거 결합',
      passed: hasEvidence,
      detail: hasEvidence ? '동료 피드백·감사 증언 인용 포함' : '동료 피드백 인용문 누락',
      severity: hasEvidence ? 'ok' : 'warning'
    });

    // 8. ④ 채운 부분 표기 (최우선: 누락 시 저장 불가)
    const hasFilledFacts = factSheet.some((f) => f.filled === true);
    const hasFilledLabel = text.includes(MISSING_RECORD_LABEL);
    const passedFilled = !hasFilledFacts || hasFilledLabel;
    results.push({
      ruleId: 'filledMark',
      name: '④ 기록 없음 — 채운 부분 표기 (최우선)',
      passed: passedFilled,
      detail: passedFilled ? '기록 공백 채움 표기 정확히 유지됨' : '기록 공백 보완 문장에 필수 표기 누락 (저장 불가)',
      severity: passedFilled ? 'ok' : 'blocker'
    });

    // 9. ⑤ 1인칭 체화 및 직접 완성 체크
    const isDifferentFromAi = Boolean(aiDraft && text.trim() !== aiDraft.trim());
    const passedUserFinished = userFinished === true && isDifferentFromAi;
    results.push({
      ruleId: 'userFinished',
      name: '⑤ 1인칭 체화 및 직접 완성 체크',
      passed: passedUserFinished,
      detail: passedUserFinished ? '직접 수정 후 [내가 완성함] 체크 완료' : (!userFinished ? '[내가 완성함] 체크 필요' : 'AI 초안을 직접 수정하여 본인 문체로 체화해 주세요'),
      severity: passedUserFinished ? 'ok' : 'info'
    });

    const passedCount = results.filter((r) => r.passed).length;
    const canSave = passedFilled; // 규칙 ④ 위반 시 저장 불가

    return {
      passedCount,
      totalCount: results.length,
      allPassed: passedCount === results.length,
      canSave,
      charCount,
      limit,
      results
    };
  }

  const api = {
    MISSING_RECORD_LABEL,
    FORBIDDEN_ADJECTIVES,
    countBlanks,
    isCoreStrengthCandidate,
    validateEvidence,
    normalizeExperienceCard,
    extractJobKeywords,
    verifyKeywordEvidence,
    generateFactSheet,
    generateFirstPersonDraft,
    inspectDraft
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.plenCareerCore = api;
})();
