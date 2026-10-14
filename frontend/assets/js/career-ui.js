(() => {
  'use strict';

  const KEYS = { experiences: 'plen-v2-experiences', applications: 'plen-v2-applications' };
  const STATUSES = ['작성 중', '제출 완료', '면접 진행', '마감'];
  const core = window.plenCareerCore;
  const workflow = window.plenDraftWorkflowCore;
  if (!core || !workflow || typeof core.inspectDraft !== 'function') {
    console.error('career-core.js, draft-inspection-core.js, and draft-workflow-core.js are required.');
    return;
  }

  const SAMPLE_CARDS = [
    { id: 'exp_sample_1', title: '가입 플로우 이탈률 개선 및 전환 최적화', dateFrom: '2026-03-02', dateTo: '2026-03-20', situation: '가입 전환율이 15%로 저조하여 신규 사용자 유입에 장애가 발생하는 상황', task: '가입 단계별 이탈 지점을 찾아내고 전환율을 25% 이상으로 개선하는 과제', action: '사용자 행동 로그 분석 및 5단계 가입 폼을 2단계 간소화 프로세스로 재설계', result: '가입 완료율 28% 달성 (전월 대비 13%p 증가)', repeatDays: 14, evidence: [{ who: '팀장 김OO', when: '2026-03-21', quote: '복잡했던 단계를 명쾌하게 줄여서 팀 목표를 조기 달성했습니다.' }], tags: ['데이터 분석', 'UX 개선', '전환 최적화'] },
    { id: 'exp_sample_2', title: '데이터 파이프라인 자동화 및 대시보드 구축', dateFrom: '2026-04-05', dateTo: '2026-04-28', situation: '수동 스프레드시트 집계로 인해 일일 지표 확인이 반나절 이상 지연되던 상황', task: '일일 지표 집계 자동화 및 전사 공유용 대시보드 구축', action: 'SQL 스크립트 작성 및 자동화 배치 스케줄러 설정, 핵심 KPI 대시보드 시각화', result: '지표 확인 시간 4시간에서 5분으로 98% 단축', repeatDays: 12, evidence: [{ who: '동료 박OO', when: '2026-04-30', quote: '매일 아침 지표를 바로 확인할 수 있어 의사결정이 빨라졌습니다.' }], tags: ['데이터 분석', '자동화', '지표 관리'] },
    { id: 'exp_sample_3', title: '고객 피드백 기반 온보딩 가이드 제작', dateFrom: '2026-05-10', dateTo: '2026-05-16', situation: '신규 기능 릴리즈 후 고객 문의(CS) 인입량이 40% 급증한 상황', task: '', action: '반복 문의 유형 상위 5개를 분석하고 튜토리얼 툴팁과 안내 가이드 배포', result: '', repeatDays: 7, evidence: [], tags: ['고객 지원', '문제 해결', '문서화'] }
  ];
  const SAMPLE_JOB = {
    company: '원티드랩', role: '서비스 기획자 (Product Manager)',
    text: `[담당 업무]\n- 데이터 분석을 기반으로 프로덕트 주요 지표를 지속적으로 개선하고 사용자 행동 로그를 분석합니다.\n- 복잡한 비즈니스 문제 정의 및 근본적인 문제 해결 방안을 도출합니다.\n- 개발자, 디자이너와의 원활한 협업 및 커뮤니케이션을 리드합니다.\n- 사용자 경험 개선을 위해 정기적인 사용자 인터뷰와 사용성 조사를 주도합니다.\n- 성과 측정을 위한 가설 검증과 실험 설계, A/B 테스트를 실행합니다.\n\n[자격 요건]\n- 2년 이상의 프로덕트 기획 또는 데이터 기반 서비스 개선 경험이 있으신 분\n- 정량적 지표와 정성적 사용자 피드백을 모두 활용하여 의사결정을 내릴 수 있는 분\n- 프로젝트 일정 관리 및 스프린트 운영에 능숙하신 분`
  };
  const DEFAULT_DRAFT = { question: '지원동기 및 직무 역량을 본인의 실제 경험을 바탕으로 서술해 주세요.', limit: 700, usedExpIds: [], factSheet: [], factSheetConfirmed: false, aiDraft: '', finalText: '', userFinished: false, drafts: [] };
  const MAX_QUESTIONS = 10;
  const freshDraft = () => JSON.parse(JSON.stringify(DEFAULT_DRAFT));
  const newId = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const freshQuestion = (source = {}) => ({ ...freshDraft(), ...source, id: newId('q') });
  let experiences = [], job = { company: '', role: '', text: '', keywords: [] }, state = freshQuestion(), editingId = null;
  // 지원 건: 공고(job)와 문항 목록(questions)을 회사별로 따로 보관합니다. state는 지금 편집 중인 문항입니다.
  // 경험 카드는 모든 지원 건이 함께 씁니다.
  let applications = { version: 1, migratedV1: true, activeId: '', items: [] };

  function read(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value === null ? fallback : value; } catch (_error) { return fallback; } }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (error) { console.warn('저장 실패:', error); return false; } }
  function newApplication(source = {}) {
    const question = freshQuestion();
    return { id: newId('app'), company: '', role: '', text: '', keywords: [], status: '작성 중', deadline: '', questions: [question], activeQuestionId: question.id, updatedAt: new Date().toISOString(), ...source };
  }
  // 예전 형식(지원 건마다 draft 하나)을 문항 목록으로 바꿉니다. 바뀌었으면 true를 돌려줍니다.
  function normalizeApplication(app) {
    let changed = false;
    if (!Array.isArray(app.questions) || !app.questions.some((item) => item && typeof item.id === 'string')) {
      app.questions = [freshQuestion(app.draft && typeof app.draft === 'object' ? JSON.parse(JSON.stringify(app.draft)) : {})]; changed = true;
    }
    app.questions = app.questions.filter((item) => item && typeof item.id === 'string');
    if ('draft' in app) { delete app.draft; changed = true; }
    if (!app.questions.some((item) => item.id === app.activeQuestionId)) { app.activeQuestionId = app.questions[0].id; changed = true; }
    return changed;
  }
  function activeApplication() { return applications.items.find((item) => item.id === applications.activeId) || null; }
  function useQuestion(app, questionId) {
    const source = app ? (app.questions.find((item) => item.id === questionId) || app.questions[0]) : null;
    if (app) app.activeQuestionId = source.id;
    state = source ? { ...freshDraft(), ...JSON.parse(JSON.stringify(source)) } : freshQuestion();
    state.usedExpIds = Array.isArray(state.usedExpIds) ? state.usedExpIds.filter((id) => experiences.some((card) => card.id === id)) : [];
    state.factSheet = Array.isArray(state.factSheet) ? state.factSheet : [];
    state.drafts = Array.isArray(state.drafts) ? state.drafts : [];
  }
  function useApplication(app) {
    applications.activeId = app ? app.id : '';
    job = app ? { company: app.company || '', role: app.role || '', text: app.text || '', keywords: Array.isArray(app.keywords) ? app.keywords : [] } : { ...SAMPLE_JOB, keywords: core.extractJobKeywords(SAMPLE_JOB.text, 5) };
    useQuestion(app, app && app.activeQuestionId);
  }
  // 지원 건의 문항 목록. 지금 편집 중인 문항은 state의 최신 내용으로 바꿔 돌려줍니다.
  function currentQuestions() {
    const app = activeApplication();
    if (!app) return [state];
    return app.questions.some((item) => item.id === state.id) ? app.questions.map((item) => item.id === state.id ? state : item) : [...app.questions, state];
  }
  // 현재 공고·문항을 활성 지원 건에 기록합니다. 내용이 바뀔 때만 수정 시각을 갱신합니다.
  function persistApplication() {
    let app = activeApplication();
    if (!app) { app = newApplication({ questions: [], activeQuestionId: '' }); applications.items.unshift(app); applications.activeId = app.id; }
    const next = { company: job.company, role: job.role, text: job.text, keywords: job.keywords, questions: currentQuestions(), activeQuestionId: state.id };
    const before = JSON.stringify({ company: app.company, role: app.role, text: app.text, keywords: app.keywords, questions: app.questions, activeQuestionId: app.activeQuestionId });
    if (before === JSON.stringify(next)) return;
    Object.assign(app, JSON.parse(JSON.stringify(next)), { updatedAt: new Date().toISOString() });
    save(KEYS.applications, applications); renderApplicationBar();
  }
  function saveJob() { persistApplication(); }
  function saveDraft() { persistApplication(); }
  function saveExperiences() { save(KEYS.experiences, experiences); document.dispatchEvent(new CustomEvent('plen:experience-cards-updated')); }
  function chosenCards() { return experiences.filter((card) => state.usedExpIds.includes(card.id)); }
  function el(id) { return document.getElementById(id); }
  function make(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }

  function load() {
    const savedCards = read(KEYS.experiences, null);
    experiences = Array.isArray(savedCards) ? savedCards.map((item) => { try { return core.normalizeExperienceCard(item); } catch (_error) { return null; } }).filter(Boolean) : SAMPLE_CARDS.map(core.normalizeExperienceCard);
    const savedApps = read(KEYS.applications, null);
    if (savedApps && Array.isArray(savedApps.items)) {
      applications = { version: 1, migratedV1: true, ...savedApps, items: savedApps.items.filter((item) => item && typeof item.id === 'string') };
      const changed = applications.items.map(normalizeApplication).some(Boolean);
      if (changed) save(KEYS.applications, applications);
    }
    useApplication(activeApplication() || applications.items[0] || null);
  }

  function renderExperienceList() {
    const list = el('v2ExperienceList'); if (!list) return;
    if (el('v2ExperienceCount')) el('v2ExperienceCount').textContent = `${experiences.length}개`;
    list.replaceChildren();
    if (!experiences.length) { list.append(make('p', 'empty-hint', '등록된 경험 카드가 없습니다.')); return; }
    experiences.forEach((card) => {
      const article = make('article', 'v2-experience-card'); const top = make('div', 'v2-card-top'); const heading = document.createElement('div');
      heading.append(make('h4', 'v2-card-title', card.title), make('span', 'v2-card-dates', `${card.dateFrom || ''}${card.dateTo ? ` ~ ${card.dateTo}` : ''}` || '기간 미지정'));
      const badges = document.createElement('div');
      if (card.repeatDays >= 10) badges.append(make('span', 'badge-core-strength', `⭐ 핵심 강점 후보 (${card.repeatDays}일)`));
      badges.append(make('span', card.blanks ? 'badge-blank-count has-blanks' : 'badge-blank-count', card.blanks ? `빈 칸 ${card.blanks}개` : 'STAR 완결'));
      top.append(heading, badges); article.append(top);
      const star = make('div', 'v2-card-star');
      [['S 상황', card.situation], ['T 과제', card.task], ['A 행동', card.action], ['R 결과', card.result]].forEach(([label, value]) => { const row = document.createElement('div'); row.append(make('strong', '', label), document.createTextNode(` ${value || '(비어 있음)'}`)); star.append(row); });
      article.append(star);
      (card.evidence || []).forEach((item) => { const box = make('div', 'evidence-box'); box.append(make('div', 'evidence-quote', `“${item.quote}”`), make('div', 'evidence-meta', `${item.who || '동료'}${item.when ? ` (${item.when})` : ''}`)); article.append(box); });
      const actions = make('div', 'v2-card-actions'); const edit = make('button', 'button button-outline', '수정'); edit.type = 'button'; edit.addEventListener('click', () => fillCardForm(card));
      const remove = make('button', 'button button-quiet', '삭제'); remove.type = 'button'; remove.addEventListener('click', () => {
        if (!confirm(`'${card.title}' 경험 카드를 삭제하시겠습니까?`)) return;
        experiences = experiences.filter((item) => item.id !== card.id); state.usedExpIds = state.usedExpIds.filter((id) => id !== card.id); state.factSheet = state.factSheet.filter((fact) => fact.expId !== card.id); state.factSheetConfirmed = false;
        saveExperiences(); saveDraft(); renderExperienceList(); renderDraftTab();
      });
      actions.append(edit, remove); article.append(actions); list.append(article);
    });
  }
  function fillCardForm(card) {
    editingId = card.id;
    const values = { cardTitle: card.title, cardDateFrom: card.dateFrom, cardDateTo: card.dateTo, cardSituation: card.situation, cardTask: card.task, cardAction: card.action, cardResult: card.result, cardRepeatDays: card.repeatDays, cardTags: (card.tags || []).join(', '), cardEvidenceWho: card.evidence?.[0]?.who, cardEvidenceWhen: card.evidence?.[0]?.when, cardEvidenceQuote: card.evidence?.[0]?.quote };
    Object.entries(values).forEach(([id, value]) => { if (el(id)) el(id).value = value ?? ''; });
    if (el('cardFormSubmitBtn')) el('cardFormSubmitBtn').textContent = '경험 카드 수정 완료'; if (el('cardFormCancelBtn')) el('cardFormCancelBtn').hidden = false;
    el('cardFormSection')?.scrollIntoView({ behavior: 'smooth' });
  }
  function resetCardForm() { editingId = null; el('experienceCardFormV2')?.reset(); if (el('cardFormSubmitBtn')) el('cardFormSubmitBtn').textContent = '경험 카드 등록'; if (el('cardFormCancelBtn')) el('cardFormCancelBtn').hidden = true; }
  function initExperience() {
    el('experienceCardFormV2')?.addEventListener('submit', (event) => {
      event.preventDefault(); const quoteText = el('cardEvidenceQuote').value.trim();
      const raw = { id: editingId || undefined, title: el('cardTitle').value, dateFrom: el('cardDateFrom').value, dateTo: el('cardDateTo').value, situation: el('cardSituation').value, task: el('cardTask').value, action: el('cardAction').value, result: el('cardResult').value, repeatDays: el('cardRepeatDays').value, evidence: quoteText ? [{ who: el('cardEvidenceWho').value, when: el('cardEvidenceWhen').value, quote: quoteText }] : [], tags: el('cardTags').value };
      let card; try { card = core.normalizeExperienceCard(raw); } catch (error) { alert(error.message); return; }
      experiences = editingId ? experiences.map((item) => item.id === editingId ? card : item) : [card, ...experiences];
      state.factSheetConfirmed = false; saveExperiences(); saveDraft(); resetCardForm(); renderExperienceList(); renderDraftTab();
    });
    el('cardFormCancelBtn')?.addEventListener('click', resetCardForm);
    el('btnLoadSampleCards')?.addEventListener('click', () => { experiences = SAMPLE_CARDS.map(core.normalizeExperienceCard); state.usedExpIds = []; state.factSheet = []; state.factSheetConfirmed = false; saveExperiences(); saveDraft(); renderExperienceList(); renderDraftTab(); alert('가상 예시 경험 카드 3개를 불러왔습니다. 실제 자료와 혼동하지 마세요.'); });
  }
  function renderKeywords() {
    const grid = el('v2KeywordGrid'); if (!grid) return; grid.replaceChildren();
    if (el('v2KeywordCountBadge')) el('v2KeywordCountBadge').textContent = `${job.keywords.length}개`;
    if (!job.keywords.length) { grid.append(make('p', '', '공고를 입력하고 키워드를 추출하세요.')); return; }
    job.keywords.forEach((kw, index) => {
      const card = make('div', 'keyword-5-card'); const word = document.createElement('input'); word.value = kw.word; word.setAttribute('aria-label', `키워드 ${index + 1}`);
      const evidence = document.createElement('textarea'); evidence.value = kw.evidence; evidence.rows = 2; evidence.setAttribute('aria-label', `키워드 ${index + 1} 근거 문장`);
      const status = make('small'); const check = () => { const valid = Boolean(evidence.value) && job.text.includes(evidence.value); status.textContent = valid ? '공고 원문 확인됨' : '근거 문장이 공고 원문과 다릅니다'; status.style.color = valid ? '#15803d' : '#b45309'; if (kw.word !== word.value.trim() || kw.evidence !== evidence.value) { kw.word = word.value.trim(); kw.evidence = evidence.value; saveJob(); } };
      word.addEventListener('input', check); evidence.addEventListener('input', check); check(); card.append(word, evidence, status); grid.append(card);
    });
  }
  function renderJob() {
    if (!el('v2CompanyName')) return;
    el('v2CompanyName').value = job.company || ''; el('v2TargetRole').value = job.role || ''; el('v2JobPostingText').value = job.text || ''; renderKeywords();
  }
  function initJob() {
    el('btnExtractKeywords')?.addEventListener('click', () => {
      const text = el('v2JobPostingText').value.trim(); if (!text) return alert('채용공고 본문을 입력해 주세요.');
      job = { company: el('v2CompanyName').value.trim(), role: el('v2TargetRole').value.trim(), text, keywords: core.extractJobKeywords(text, 5) };
      state.factSheetConfirmed = false; saveJob(); saveDraft(); renderKeywords(); renderDraftTab();
      if (job.keywords.length < 5) alert(`공고 원문에서 ${job.keywords.length}개 키워드를 추출했습니다. 원문을 확인해 주세요.`);
    });
    el('btnLoadSampleJob')?.addEventListener('click', () => { job = { ...SAMPLE_JOB, keywords: core.extractJobKeywords(SAMPLE_JOB.text, 5) }; state.factSheetConfirmed = false; saveJob(); saveDraft(); renderJob(); renderDraftTab(); alert('가상 예시 채용공고를 불러왔습니다.'); });
  }
  function renderDraftTab() {
    const selector = el('v2DraftCardSelector'); if (!selector) return; selector.replaceChildren();
    experiences.forEach((card) => {
      const label = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox'; input.name = 'draftExpCard'; input.value = card.id; input.checked = state.usedExpIds.includes(card.id);
      input.addEventListener('change', () => {
        const ids = Array.from(selector.querySelectorAll('input:checked')).map((item) => item.value);
        if (ids.length > 3) { input.checked = false; alert('최대 3개 카드까지 선택할 수 있습니다.'); return; }
        state.usedExpIds = ids; state.factSheet = []; state.factSheetConfirmed = false; state.aiDraft = ''; state.finalText = ''; state.userFinished = false; saveDraft(); renderFactSheet(); renderWorkspace();
      });
      label.append(input, make('span', '', `${card.title} (${card.repeatDays}일${card.blanks ? ` · 빈 칸 ${card.blanks}` : ''})`)); selector.append(label);
    });
    if (!experiences.length) selector.append(make('p', '', '먼저 경험 카드를 등록하세요.'));
    if (el('v2DraftQuestion')) el('v2DraftQuestion').value = state.question || '';
    if (el('v2DraftLimit')) el('v2DraftLimit').value = state.limit || 700;
    renderQuestionTabs(); renderFactSheet(); renderWorkspace(); renderHistory();
  }
  function questionStatus(question) {
    const length = String(question.finalText || '').length, limit = Number(question.limit) || 700;
    if (question.drafts && question.drafts.length) return `저장 ${question.drafts.length}회 · ${length}/${limit}자`;
    if (length) return `작성 중 · ${length}/${limit}자`;
    if (question.factSheet && question.factSheet.length) return '팩트 시트 단계';
    return '시작 전';
  }
  function renderQuestionTabs() {
    const box = el('v2QuestionTabs'); if (!box) return; box.replaceChildren();
    const questions = currentQuestions();
    questions.forEach((question, index) => {
      const active = question.id === state.id;
      const button = make('button', `question-tab${active ? ' is-active' : ''}${question.drafts && question.drafts.length ? ' is-saved' : ''}`); button.type = 'button'; button.setAttribute('aria-pressed', String(active));
      button.append(make('strong', '', `문항 ${index + 1}`), make('span', 'question-tab-text', (question.question || '').trim() || '문항을 입력하세요'), make('small', '', questionStatus(question)));
      button.addEventListener('click', () => { if (active) return; persistApplication(); useQuestion(activeApplication(), question.id); save(KEYS.applications, applications); renderDraftTab(); });
      box.append(button);
    });
    if (el('v2QuestionCountBadge')) el('v2QuestionCountBadge').textContent = `문항 ${questions.length}개`;
    if (el('btnAddQuestion')) el('btnAddQuestion').disabled = questions.length >= MAX_QUESTIONS;
    if (el('btnDeleteQuestion')) el('btnDeleteQuestion').disabled = questions.length <= 1;
  }
  function initQuestions() {
    el('btnAddQuestion')?.addEventListener('click', () => {
      persistApplication(); const app = activeApplication();
      if (app.questions.length >= MAX_QUESTIONS) return alert(`문항은 지원 건마다 최대 ${MAX_QUESTIONS}개까지 추가할 수 있습니다.`);
      const question = freshQuestion({ question: '' }); app.questions.push(question);
      useQuestion(app, question.id); persistApplication(); save(KEYS.applications, applications); renderDraftTab(); el('v2DraftQuestion')?.focus();
    });
    el('btnDeleteQuestion')?.addEventListener('click', () => {
      const app = activeApplication(); if (!app || app.questions.length <= 1) return;
      const index = app.questions.findIndex((item) => item.id === state.id);
      if (!confirm(`문항 ${index + 1}과 이 문항의 저장 기록을 삭제할까요?`)) return;
      app.questions = app.questions.filter((item) => item.id !== state.id);
      useQuestion(app, app.questions[Math.max(0, index - 1)].id); app.updatedAt = new Date().toISOString(); save(KEYS.applications, applications); renderDraftTab();
    });
    el('btnCopyAllQuestions')?.addEventListener('click', async () => {
      const text = currentQuestions().map((item, index) => `[문항 ${index + 1}] ${(item.question || '').trim()}\n\n${(item.finalText || '').trim() || '(아직 작성하지 않음)'}`).join('\n\n\n');
      try { await navigator.clipboard.writeText(text); if (el('v2QuestionMessage')) el('v2QuestionMessage').textContent = '전체 문항을 복사했습니다.'; } catch (_error) { alert('자동 복사를 사용할 수 없습니다. 문항별로 편집창에서 복사해 주세요.'); }
    });
    el('v2DraftQuestion')?.addEventListener('input', (event) => { state.question = event.target.value; saveDraft(); renderQuestionTabs(); });
  }
  function renderFactSheet() {
    const container = el('v2FactSheetContainer'), list = el('v2FactSheetList'); if (!container || !list) return;
    const facts = state.factSheet || []; container.hidden = !facts.length; list.replaceChildren();
    facts.forEach((fact, index) => {
      const row = make('div', `fact-sheet-item${fact.filled ? ' is-filled' : ''}`); row.append(make('span', fact.filled ? 'fact-badge-filled' : 'fact-badge-verified', fact.filled ? '기록 없음 — 채운 부분' : '확인됨'), make('small', '', fact.expTitle || fact.expId || '출처 없음'));
      const textarea = document.createElement('textarea'); textarea.className = 'fact-text-edit'; textarea.rows = 2; textarea.value = fact.text || '';
      textarea.addEventListener('input', () => { state.factSheet[index].text = textarea.value; state.factSheetConfirmed = false; saveDraft(); });
      const remove = make('button', '', '삭제'); remove.type = 'button'; remove.addEventListener('click', () => { state.factSheet.splice(index, 1); state.factSheetConfirmed = false; saveDraft(); renderFactSheet(); });
      row.append(textarea, remove); list.append(row);
    });
  }
  function updateInspection() {
    const text = el('v2FinalText')?.value || state.finalText || '';
    const report = core.inspectDraft(text, { cards: chosenCards(), factSheet: state.factSheet, keywords: job.keywords || [], limit: Number(state.limit) || 700, aiDraft: state.aiDraft || '', userFinished: el('v2UserFinishedCheckbox')?.checked === true });
    if (el('v2CharCounter')) { el('v2CharCounter').textContent = `${report.charCount} / ${report.limit}자`; el('v2CharCounter').classList.toggle('is-over', report.charCount > report.limit); }
    if (el('v2InspectionBadge')) { el('v2InspectionBadge').textContent = `${report.passedCount} / 9 통과`; el('v2InspectionBadge').className = report.allPassed ? 'inspection-badge-pass' : 'inspection-badge-partial'; }
    if (el('v2BlockerBanner')) el('v2BlockerBanner').hidden = report.canSave;
    if (el('btnSaveFinalDraft')) el('btnSaveFinalDraft').disabled = !report.canSave;
    const list = el('v2InspectionList'); if (list) { list.replaceChildren(); report.results.forEach((item) => { const row = make('div', `inspection-item sev-${item.severity}`); row.append(make('strong', '', `${item.passed ? '✅' : '⚠️'} ${item.name}`), make('span', '', item.detail)); list.append(row); }); }
    return report;
  }
  function renderWorkspace() {
    const workspace = el('v2DraftWorkspace'), textarea = el('v2FinalText'); if (!workspace || !textarea) return;
    workspace.hidden = !Boolean(state.aiDraft || state.finalText); if (workspace.hidden) return;
    textarea.value = state.finalText || state.aiDraft || ''; if (el('v2UserFinishedCheckbox')) el('v2UserFinishedCheckbox').checked = Boolean(state.userFinished); updateInspection();
  }
  function renderHistory() {
    const panel = el('v2DraftHistoryPanel'), list = el('v2DraftHistoryList'); if (!panel || !list) return; list.replaceChildren();
    const records = state.drafts.slice().reverse();
    if (!records.length) { list.append(make('p', '', '저장된 최종본이 없습니다.')); return; }
    records.forEach((record) => { const article = document.createElement('article'), title = make('strong', '', `${record.question || '문항'} · ${new Date(record.createdAt).toLocaleString('ko-KR')}`), details = document.createElement('details'), summary = make('summary', '', '저장된 내용 보기'), pre = document.createElement('pre'); pre.textContent = record.finalText; details.append(summary, pre); article.append(title, details); list.append(article); });
  }
  function initDraft() {
    el('btnGenerateFactSheet')?.addEventListener('click', () => {
      const ids = state.usedExpIds, cards = chosenCards(); if (!ids.length || cards.length !== ids.length) return alert('사용할 경험 카드를 1~3장 선택하세요.');
      state.question = el('v2DraftQuestion').value.trim(); state.limit = Number(el('v2DraftLimit').value) || 700;
      state.factSheet = core.generateFactSheet(cards); state.factSheetConfirmed = false; state.aiDraft = ''; state.finalText = ''; state.userFinished = false; saveDraft(); renderFactSheet();
      alert('팩트 시트를 만들었습니다. 기록 공백 문장은 사실과 대조해 주세요.');
    });
    el('btnConfirmFactSheet')?.addEventListener('click', () => {
      const validation = workflow.validateFactSheet(state.factSheet, state.usedExpIds);
      const covered = state.usedExpIds.length > 0 && state.usedExpIds.every((id) => state.factSheet.some((fact) => fact.expId === id));
      if (!validation.ok || !covered) return alert(`확인 실패: ${validation.errors.join(' ') || '선택한 모든 카드의 팩트가 필요합니다.'}`);
      state.factSheetConfirmed = true; state.question = el('v2DraftQuestion').value.trim(); state.limit = Number(el('v2DraftLimit').value) || 700; saveDraft(); alert('팩트 시트를 확인했습니다.');
    });
    el('btnGenerateDraft')?.addEventListener('click', () => {
      if (!state.factSheetConfirmed) return alert('팩트 시트를 확인 완료해 주세요.');
      try { state.aiDraft = workflow.generateFirstPersonDraft(state.factSheet, chosenCards(), { question: state.question, keywords: job.keywords || [], limit: Number(el('v2DraftLimit').value) || state.limit }); state.finalText = state.aiDraft; state.userFinished = false; saveDraft(); renderWorkspace(); el('v2DraftWorkspace')?.scrollIntoView({ behavior: 'smooth' }); }
      catch (error) { alert(error.message); }
    });
    el('v2FinalText')?.addEventListener('input', (event) => { state.finalText = event.target.value; state.userFinished = false; if (el('v2UserFinishedCheckbox')) el('v2UserFinishedCheckbox').checked = false; saveDraft(); updateInspection(); renderQuestionTabs(); });
    el('v2UserFinishedCheckbox')?.addEventListener('change', (event) => { state.userFinished = event.target.checked; saveDraft(); updateInspection(); });
    el('v2DraftLimit')?.addEventListener('input', (event) => { state.limit = Number(event.target.value) || 700; saveDraft(); updateInspection(); renderQuestionTabs(); });
    el('btnSaveFinalDraft')?.addEventListener('click', () => {
      const report = updateInspection();
      if (!report.canSave) return alert('기록 공백 표기가 빠져 저장할 수 없습니다.');
      if (!state.factSheetConfirmed || !state.userFinished || !state.aiDraft || state.finalText.trim() === state.aiDraft.trim()) return alert('팩트 시트를 확인하고 초안을 직접 수정한 뒤 완료 체크를 해 주세요.');
      const now = new Date().toISOString(); state.drafts.push({ id: `draft_${Date.now()}`, jobId: job.id || '', question: state.question, limit: state.limit, usedExpIds: state.usedExpIds.slice(), factSheet: state.factSheet.map((item) => ({ ...item })), aiDraft: state.aiDraft, finalText: state.finalText, userFinished: true, createdAt: now });
      saveDraft(); renderHistory(); renderQuestionTabs(); if (el('v2DraftMessage')) el('v2DraftMessage').textContent = '최종본을 새 기록으로 저장했습니다.';
    });
    el('btnCopyDraft')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(el('v2FinalText').value); } catch (_error) { alert('자동 복사를 사용할 수 없습니다. 편집창에서 직접 복사해 주세요.'); } });
    el('btnResetToAiDraft')?.addEventListener('click', () => { if (!state.aiDraft || !confirm('현재 내용을 자동 초안으로 되돌릴까요?')) return; state.finalText = state.aiDraft; state.userFinished = false; saveDraft(); renderWorkspace(); });
  }
  function initTabs() {
    const buttons = document.querySelectorAll('.v2-tab-btn'); const panels = { experiences: el('tabPanelExperiences'), job: el('tabPanelJob'), draft: el('tabPanelDraft') };
    buttons.forEach((button) => button.addEventListener('click', () => {
      const tab = button.getAttribute('data-tab'); buttons.forEach((item) => item.classList.toggle('is-active', item === button));
      Object.entries(panels).forEach(([key, panel]) => { if (panel) panel.hidden = key !== tab; });
      if (tab === 'experiences') renderExperienceList(); if (tab === 'job') renderJob(); if (tab === 'draft') renderDraftTab();
    }));
  }
  function applicationLabel(app) {
    const name = [app.company, app.role].filter(Boolean).join(' · ') || '이름 없는 지원 건';
    return `${name} — ${app.status || '작성 중'}${app.deadline ? ` · 마감 ${app.deadline}` : ''}`;
  }
  function renderApplicationBar() {
    const select = el('v2ApplicationSelect'); if (!select) return;
    select.replaceChildren();
    if (!applications.items.length) { const option = make('option', '', '가상 예시 공고 (아직 저장 안 됨)'); option.value = ''; select.append(option); }
    applications.items.forEach((app) => { const option = make('option', '', applicationLabel(app)); option.value = app.id; select.append(option); });
    select.value = applications.activeId || '';
    const app = activeApplication();
    el('v2ApplicationStatus').value = app?.status || '작성 중'; el('v2ApplicationDeadline').value = app?.deadline || '';
    el('v2ApplicationStatus').disabled = !app; el('v2ApplicationDeadline').disabled = !app; el('btnDeleteApplication').disabled = !app;
  }
  function renderAll() { renderApplicationBar(); renderExperienceList(); renderJob(); renderDraftTab(); }
  function updateApplicationMeta(patch) {
    const app = activeApplication(); if (!app) return;
    Object.assign(app, patch, { updatedAt: new Date().toISOString() }); save(KEYS.applications, applications); renderApplicationBar();
  }
  function initApplications() {
    if (!el('v2ApplicationSelect')) return;
    el('v2ApplicationSelect').addEventListener('change', (event) => {
      const app = applications.items.find((item) => item.id === event.target.value); if (!app) return;
      useApplication(app); save(KEYS.applications, applications); renderAll();
    });
    el('v2ApplicationStatus').addEventListener('change', (event) => { if (STATUSES.includes(event.target.value)) updateApplicationMeta({ status: event.target.value }); });
    el('v2ApplicationDeadline').addEventListener('change', (event) => updateApplicationMeta({ deadline: event.target.value }));
    el('btnNewApplication').addEventListener('click', () => {
      if (applications.items.length >= 30) return alert('지원 건은 최대 30개까지 보관할 수 있습니다.');
      const app = newApplication(); applications.items.unshift(app); useApplication(app); save(KEYS.applications, applications); renderAll();
      document.querySelector('.v2-tab-btn[data-tab="job"]')?.click(); el('v2CompanyName')?.focus();
    });
    el('btnDeleteApplication').addEventListener('click', () => {
      const app = activeApplication(); if (!app) return;
      if (!confirm(`'${applicationLabel(app)}' 지원 건과 그 초안 기록을 삭제할까요?`)) return;
      applications.items = applications.items.filter((item) => item.id !== app.id);
      useApplication(applications.items[0] || null); save(KEYS.applications, applications); renderAll();
    });
    window.addEventListener('storage', (event) => {
      if (event.key !== KEYS.applications && event.key !== KEYS.experiences) return;
      load(); renderAll();
    });
    // 로그인 직후 계정 자료가 이 탭의 localStorage에 병합되면 화면을 다시 그립니다.
    window.addEventListener('plen:workspace-hydrated', () => { load(); renderAll(); });
  }
  document.addEventListener('DOMContentLoaded', () => {
    load(); initTabs(); initExperience(); initJob(); initDraft(); initQuestions(); initApplications();
    renderAll();
  });
})();
