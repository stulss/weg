(() => {
  'use strict';

  const KEYS = { experiences: 'plen-v2-experiences', job: 'plen-v2-job', draft: 'plen-v2-draft' };
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
  let experiences = [], job = { company: '', role: '', text: '', keywords: [] }, state = { question: '지원동기 및 직무 역량을 본인의 실제 경험을 바탕으로 서술해 주세요.', limit: 700, usedExpIds: [], factSheet: [], drafts: [] }, editingId = null;

  function read(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value === null ? fallback : value; } catch (_error) { return fallback; } }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (error) { console.warn('저장 실패:', error); return false; } }
  function saveDraft() { save(KEYS.draft, state); }
  function chosenCards() { return experiences.filter((card) => state.usedExpIds.includes(card.id)); }
  function el(id) { return document.getElementById(id); }
  function make(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }

  function load() {
    const savedCards = read(KEYS.experiences, null);
    experiences = Array.isArray(savedCards) ? savedCards.map((item) => { try { return core.normalizeExperienceCard(item); } catch (_error) { return null; } }).filter(Boolean) : SAMPLE_CARDS.map(core.normalizeExperienceCard);
    const savedJob = read(KEYS.job, null);
    job = savedJob && typeof savedJob === 'object' ? { company: '', role: '', text: '', keywords: [], ...savedJob } : { ...SAMPLE_JOB, keywords: core.extractJobKeywords(SAMPLE_JOB.text, 5) };
    state = { ...state, ...(read(KEYS.draft, {}) || {}) };
    state.usedExpIds = Array.isArray(state.usedExpIds) ? state.usedExpIds : [];
    state.factSheet = Array.isArray(state.factSheet) ? state.factSheet : [];
    state.drafts = Array.isArray(state.drafts) ? state.drafts : [];
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
        save(KEYS.experiences, experiences); saveDraft(); renderExperienceList(); renderDraftTab();
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
      state.factSheetConfirmed = false; save(KEYS.experiences, experiences); saveDraft(); resetCardForm(); renderExperienceList(); renderDraftTab();
    });
    el('cardFormCancelBtn')?.addEventListener('click', resetCardForm);
    el('btnLoadSampleCards')?.addEventListener('click', () => { experiences = SAMPLE_CARDS.map(core.normalizeExperienceCard); state.usedExpIds = []; state.factSheet = []; state.factSheetConfirmed = false; save(KEYS.experiences, experiences); saveDraft(); renderExperienceList(); renderDraftTab(); alert('가상 예시 경험 카드 3개를 불러왔습니다. 실제 자료와 혼동하지 마세요.'); });
  }
  function renderKeywords() {
    const grid = el('v2KeywordGrid'); if (!grid) return; grid.replaceChildren();
    if (el('v2KeywordCountBadge')) el('v2KeywordCountBadge').textContent = `${job.keywords.length}개`;
    if (!job.keywords.length) { grid.append(make('p', '', '공고를 입력하고 키워드를 추출하세요.')); return; }
    job.keywords.forEach((kw, index) => {
      const card = make('div', 'keyword-5-card'); const word = document.createElement('input'); word.value = kw.word; word.setAttribute('aria-label', `키워드 ${index + 1}`);
      const evidence = document.createElement('textarea'); evidence.value = kw.evidence; evidence.rows = 2; evidence.setAttribute('aria-label', `키워드 ${index + 1} 근거 문장`);
      const status = make('small'); const check = () => { const valid = Boolean(evidence.value) && job.text.includes(evidence.value); status.textContent = valid ? '공고 원문 확인됨' : '근거 문장이 공고 원문과 다릅니다'; status.style.color = valid ? '#15803d' : '#b45309'; kw.word = word.value.trim(); kw.evidence = evidence.value; save(KEYS.job, job); };
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
      state.factSheetConfirmed = false; save(KEYS.job, job); saveDraft(); renderKeywords(); renderDraftTab();
      if (job.keywords.length < 5) alert(`공고 원문에서 ${job.keywords.length}개 키워드를 추출했습니다. 원문을 확인해 주세요.`);
    });
    el('btnLoadSampleJob')?.addEventListener('click', () => { job = { ...SAMPLE_JOB, keywords: core.extractJobKeywords(SAMPLE_JOB.text, 5) }; state.factSheetConfirmed = false; save(KEYS.job, job); saveDraft(); renderJob(); renderDraftTab(); alert('가상 예시 채용공고를 불러왔습니다.'); });
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
    renderFactSheet(); renderWorkspace(); renderHistory();
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
      try { state.aiDraft = workflow.generateFirstPersonDraft(state.factSheet, chosenCards(), { question: state.question }); state.finalText = state.aiDraft; state.userFinished = false; saveDraft(); renderWorkspace(); el('v2DraftWorkspace')?.scrollIntoView({ behavior: 'smooth' }); }
      catch (error) { alert(error.message); }
    });
    el('v2FinalText')?.addEventListener('input', (event) => { state.finalText = event.target.value; state.userFinished = false; if (el('v2UserFinishedCheckbox')) el('v2UserFinishedCheckbox').checked = false; saveDraft(); updateInspection(); });
    el('v2UserFinishedCheckbox')?.addEventListener('change', (event) => { state.userFinished = event.target.checked; saveDraft(); updateInspection(); });
    el('v2DraftLimit')?.addEventListener('input', (event) => { state.limit = Number(event.target.value) || 700; saveDraft(); updateInspection(); });
    el('btnSaveFinalDraft')?.addEventListener('click', () => {
      const report = updateInspection();
      if (!report.canSave) return alert('기록 공백 표기가 빠져 저장할 수 없습니다.');
      if (!state.factSheetConfirmed || !state.userFinished || !state.aiDraft || state.finalText.trim() === state.aiDraft.trim()) return alert('팩트 시트를 확인하고 초안을 직접 수정한 뒤 완료 체크를 해 주세요.');
      const now = new Date().toISOString(); state.drafts.push({ id: `draft_${Date.now()}`, jobId: job.id || '', question: state.question, limit: state.limit, usedExpIds: state.usedExpIds.slice(), factSheet: state.factSheet.map((item) => ({ ...item })), aiDraft: state.aiDraft, finalText: state.finalText, userFinished: true, createdAt: now });
      saveDraft(); renderHistory(); if (el('v2DraftMessage')) el('v2DraftMessage').textContent = '최종본을 새 기록으로 저장했습니다.';
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
  document.addEventListener('DOMContentLoaded', () => {
    load(); initTabs(); initExperience(); initJob(); initDraft();
    renderExperienceList(); renderJob(); renderDraftTab();
  });
})();
