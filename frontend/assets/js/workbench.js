(() => {
  'use strict';

  const form = document.getElementById('writerForm');
  const resultPanel = document.getElementById('resultPanel');
  const resultContent = document.getElementById('resultContent');
  const sampleBanner = document.getElementById('sampleBanner');
  const storageKey = 'plen-workbench-v1';
  const resumeStorageKey = 'plen-resume-v1';
  const maxApplications = 20;
  const maxExperiences = 12;
  const maxPayloadCharacters = 1_500_000;
  const maxApplicationCharacters = 48_000;
  const maxExperienceCharacters = 12_000;
  const validStatuses = ['작성 중', '제출 완료', '면접 진행', '마감'];

  if (!form || !resultPanel || !resultContent) return;

  const fields = {
    company: document.getElementById('companyName'),
    role: document.getElementById('targetRole'),
    job: document.getElementById('jobPosting'),
    context: document.getElementById('experienceContext'),
    actions: document.getElementById('experienceActions'),
    outcome: document.getElementById('experienceOutcome')
  };
  const experienceFields = {
    name: document.getElementById('experienceName'),
    context: document.getElementById('experienceCardContext'),
    actions: document.getElementById('experienceCardActions'),
    outcome: document.getElementById('experienceCardOutcome'),
    keywords: document.getElementById('experienceCardKeywords')
  };
  const managerMessage = document.getElementById('managerMessage');
  const applicationCount = document.getElementById('applicationCount');
  const applicationList = document.getElementById('applicationList');
  const applicationEmpty = document.getElementById('applicationEmpty');
  const saveApplicationButton = document.getElementById('saveApplicationButton');
  const newApplicationButton = document.getElementById('newApplicationButton');
  const clearStoredDataButton = document.getElementById('clearStoredDataButton');
  const experienceCardForm = document.getElementById('experienceCardForm');
  const experienceEditorTitle = document.getElementById('experienceEditorTitle');
  const importCurrentExperienceButton = document.getElementById('importCurrentExperienceButton');
  const cancelExperienceEditButton = document.getElementById('cancelExperienceEditButton');
  const saveExperienceButton = document.getElementById('saveExperienceButton');
  const savedExperienceSelect = document.getElementById('savedExperienceSelect');
  const loadExperienceButton = document.getElementById('loadExperienceButton');
  const experienceCount = document.getElementById('experienceCount');
  const experienceLibraryMessage = document.getElementById('experienceLibraryMessage');
  const experienceCardList = document.getElementById('experienceCardList');

  const requiredElements = [
    ...Object.values(fields), ...Object.values(experienceFields),
    managerMessage, applicationCount, applicationList, applicationEmpty,
    saveApplicationButton, newApplicationButton, clearStoredDataButton,
    experienceCardForm, experienceEditorTitle, importCurrentExperienceButton,
    cancelExperienceEditButton, saveExperienceButton, savedExperienceSelect,
    loadExperienceButton, experienceCount, experienceLibraryMessage, experienceCardList
  ];
  if (requiredElements.some((element) => !element)) return;

  const nativeStorage = (() => {
    try {
      const testKey = `${storageKey}-probe`;
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch (_error) {
      return false;
    }
  })();

  let state = { version: 1, applications: [], experiences: [] };
  let currentApplicationId = null;
  let currentEditingExperienceId = null;
  let experienceEditorBaseline = '';
  let isSampleMode = false;
  let isRestoring = false;
  let dirtyTimer = null;

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `plen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function setMessage(element, text, isError = false) {
    element.textContent = text;
    element.classList.toggle('is-error', Boolean(isError));
  }

  function measureRecord(record) {
    try { return JSON.stringify(record).length; } catch (_error) { return Infinity; }
  }

  function normalizeDate(value) {
    if (typeof value !== 'string' || value.length !== 10 || value[4] !== '-' || value[7] !== '-') return '';
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? '' : value;
  }

  function normalizeExperienceKeywords(value) {
    if (!Array.isArray(value)) return [];
    const keywords = [];
    value.forEach((entry) => {
      if (typeof entry !== 'string') return;
      const keyword = entry.trim().replace(/\s+/g, ' ').slice(0, 32);
      if (keyword && !keywords.includes(keyword) && keywords.length < 8) keywords.push(keyword);
    });
    return keywords;
  }

  function parseExperienceKeywords(value) {
    return normalizeExperienceKeywords(String(value || '').split(/[,，;；\n]+/));
  }

  function sanitizeApplication(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    const application = {
      id: typeof record.id === 'string' && record.id.length <= 100 ? record.id : makeId(),
      company: typeof record.company === 'string' ? record.company.slice(0, 80) : '',
      role: typeof record.role === 'string' ? record.role.slice(0, 80) : '',
      job: typeof record.job === 'string' ? record.job.slice(0, 12000) : '',
      context: typeof record.context === 'string' ? record.context.slice(0, 2400) : '',
      actions: typeof record.actions === 'string' ? record.actions.slice(0, 3000) : '',
      outcome: typeof record.outcome === 'string' ? record.outcome.slice(0, 2400) : '',
      status: validStatuses.includes(record.status) ? record.status : '작성 중',
      deadline: normalizeDate(record.deadline),
      updatedAt: typeof record.updatedAt === 'string' && !Number.isNaN(Date.parse(record.updatedAt))
        ? record.updatedAt
        : new Date().toISOString()
    };
    return measureRecord(application) <= maxApplicationCharacters ? application : null;
  }

  function sanitizeExperience(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    const experience = {
      id: typeof record.id === 'string' && record.id.length <= 100 ? record.id : makeId(),
      name: typeof record.name === 'string' ? record.name.trim().slice(0, 60) : '',
      context: typeof record.context === 'string' ? record.context.slice(0, 2400) : '',
      actions: typeof record.actions === 'string' ? record.actions.slice(0, 3000) : '',
      outcome: typeof record.outcome === 'string' ? record.outcome.slice(0, 2400) : '',
      keywords: normalizeExperienceKeywords(record.keywords),
      updatedAt: typeof record.updatedAt === 'string' && !Number.isNaN(Date.parse(record.updatedAt))
        ? record.updatedAt
        : new Date().toISOString()
    };
    return experience.name && measureRecord(experience) <= maxExperienceCharacters ? experience : null;
  }

  function parseStoredData(raw) {
    if (!raw || raw.length > maxPayloadCharacters) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.applications) || !Array.isArray(parsed.experiences)) return null;
      return {
        version: 1,
        applications: parsed.applications.map(sanitizeApplication).filter(Boolean).slice(0, maxApplications),
        experiences: parsed.experiences.map(sanitizeExperience).filter(Boolean).slice(0, maxExperiences)
      };
    } catch (_error) {
      return null;
    }
  }

  function readSavedState() {
    if (!nativeStorage) return { version: 1, applications: [], experiences: [] };
    try {
      return parseStoredData(localStorage.getItem(storageKey)) || { version: 1, applications: [], experiences: [] };
    } catch (_error) {
      return { version: 1, applications: [], experiences: [] };
    }
  }

  function writeSavedState(nextState, messageElement = managerMessage) {
    if (!nativeStorage) {
      setMessage(messageElement, '이 브라우저에서는 저장소를 사용할 수 없어 자료를 저장하지 못했어요.', true);
      return false;
    }
    try {
      const serialized = JSON.stringify(nextState);
      if (serialized.length > maxPayloadCharacters) {
        setMessage(messageElement, '브라우저 저장 용량에 가까워졌어요. 필요 없는 지원 건이나 경험 카드를 삭제한 뒤 다시 저장해 주세요.', true);
        return false;
      }
      localStorage.setItem(storageKey, serialized);
      state = nextState;
      return true;
    } catch (_error) {
      setMessage(messageElement, '브라우저 저장 공간이 부족하거나 저장이 차단되어 있어요. 저장 자료를 정리한 뒤 다시 시도해 주세요.', true);
      return false;
    }
  }

  function deleteExperienceFromResume(id) {
    try {
      const existing = JSON.parse(localStorage.getItem(resumeStorageKey) || 'null');
      if (!existing || !Array.isArray(existing.experience)) return;
      existing.experience = existing.experience.filter((entry) => entry && entry.libraryId !== id);
      localStorage.setItem(resumeStorageKey, JSON.stringify(existing));
      if (window.plenResume && typeof window.plenResume.removeExperienceByLibraryId === 'function') {
        window.plenResume.removeExperienceByLibraryId(id);
      }
    } catch (_error) { /* 보관함 삭제가 나머지 앱 이용을 막지 않음 */ }
  }

  function clearResumeRecord() {
    try { localStorage.removeItem(resumeStorageKey); } catch (_error) { /* 저장 삭제는 best-effort */ }
  }

  function getFormRecord() {
    return {
      company: fields.company.value.trim(),
      role: fields.role.value.trim(),
      job: fields.job.value.trim(),
      context: fields.context.value.trim(),
      actions: fields.actions.value.trim(),
      outcome: fields.outcome.value.trim(),
      status: '작성 중',
      deadline: '',
      updatedAt: new Date().toISOString()
    };
  }

  function hasWorkInProgress() {
    return Object.values(fields).some((field) => field.value.trim().length > 0);
  }

  function currentRecordWithStatus() {
    const base = getFormRecord();
    const existing = state.applications.find((item) => item.id === currentApplicationId);
    if (existing) {
      base.status = existing.status;
      base.deadline = existing.deadline;
    }
    return { ...base, id: currentApplicationId || makeId() };
  }

  function getExperienceEditorRecord() {
    return {
      name: experienceFields.name.value.trim(),
      context: experienceFields.context.value.trim(),
      actions: experienceFields.actions.value.trim(),
      outcome: experienceFields.outcome.value.trim(),
      keywords: parseExperienceKeywords(experienceFields.keywords.value)
    };
  }

  function experienceEditorSnapshot() {
    return JSON.stringify(getExperienceEditorRecord());
  }

  function experienceEditorHasContent() {
    return Object.values(experienceFields).some((field) => field.value.trim().length > 0);
  }

  function experienceEditorIsDirty() {
    return experienceEditorSnapshot() !== experienceEditorBaseline;
  }

  function isShowingSample() {
    return isSampleMode || Boolean(sampleBanner && !sampleBanner.hidden);
  }

  function formatDate(value) {
    if (!value) return '마감일 미입력';
    const [year, month, day] = value.split('-');
    return `${year}.${month}.${day}`;
  }

  function formatUpdatedDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '저장된 경험';
    return `수정 ${new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }).format(date)}`;
  }

  function renderExperienceCards() {
    experienceCardList.replaceChildren();
    if (!state.experiences.length) {
      const empty = document.createElement('p');
      empty.className = 'experience-card-empty';
      empty.textContent = '아직 경험 카드가 없어요. 실제 경험을 상황·행동·결과로 나누어 첫 카드를 등록해 보세요.';
      experienceCardList.append(empty);
      return;
    }

    state.experiences
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .forEach((experience) => {
        const card = document.createElement('article');
        card.className = `experience-card${experience.id === currentEditingExperienceId ? ' is-editing' : ''}`;

        const header = document.createElement('div');
        header.className = 'experience-card-heading';
        const name = document.createElement('h4');
        name.textContent = experience.name;
        const actions = document.createElement('div');
        actions.className = 'experience-card-actions';

        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'button button-small button-secondary';
        editButton.textContent = experience.id === currentEditingExperienceId ? '수정 중' : '수정';
        editButton.disabled = experience.id === currentEditingExperienceId;
        editButton.setAttribute('aria-label', `경험 카드 ${experience.name} 수정`);
        editButton.addEventListener('click', () => editExperience(experience.id));

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'text-button danger-text-button experience-card-delete';
        deleteButton.textContent = '삭제';
        deleteButton.setAttribute('aria-label', `경험 카드 ${experience.name} 삭제`);
        deleteButton.disabled = !nativeStorage;
        deleteButton.addEventListener('click', () => deleteExperienceById(experience.id));
        actions.append(editButton, deleteButton);
        header.append(name, actions);

        const content = document.createElement('div');
        content.className = 'experience-card-content';
        [['상황·목표', experience.context], ['내 행동', experience.actions], ['결과·배운 점', experience.outcome]]
          .forEach(([labelText, text]) => {
            if (!text) return;
            const row = document.createElement('p');
            const label = document.createElement('strong');
            label.textContent = labelText;
            const value = document.createElement('span');
            value.textContent = text;
            row.append(label, value);
            content.append(row);
          });

        card.append(header, content);
        if (experience.keywords.length) {
          const tags = document.createElement('div');
          tags.className = 'experience-card-tags';
          tags.setAttribute('aria-label', '관련 역량 키워드');
          experience.keywords.forEach((keyword) => {
            const tag = document.createElement('span');
            tag.className = 'experience-card-tag';
            tag.textContent = keyword;
            tags.append(tag);
          });
          card.append(tags);
        }
        const footer = document.createElement('div');
        footer.className = 'experience-card-footer';
        footer.textContent = formatUpdatedDate(experience.updatedAt);
        card.append(footer);
        experienceCardList.append(card);
      });
  }

  function renderApplicationList() {
    applicationList.replaceChildren();
    applicationCount.textContent = `${state.applications.length} / ${maxApplications}건`;
    applicationEmpty.hidden = state.applications.length > 0;
    applicationList.hidden = state.applications.length === 0;
    saveApplicationButton.disabled = isShowingSample() || !nativeStorage;

    state.applications
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .forEach((application) => {
        const card = document.createElement('article');
        card.className = `application-card${application.id === currentApplicationId ? ' is-current' : ''}`;
        const header = document.createElement('div');
        header.className = 'application-card-header';
        const company = document.createElement('div');
        company.className = 'application-company';
        company.textContent = application.company || '회사명 미입력';
        const status = document.createElement('span');
        status.className = 'application-status';
        status.dataset.status = application.status;
        status.textContent = application.status;
        header.append(company, status);
        const role = document.createElement('p');
        role.className = 'application-role';
        role.textContent = application.role || '직무 미입력';
        const meta = document.createElement('div');
        meta.className = 'application-meta';
        const lastEdit = new Date(application.updatedAt);
        const timestamp = Number.isNaN(lastEdit.getTime()) ? ''
          : new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(lastEdit);
        const updated = document.createElement('span');
        updated.textContent = timestamp ? `최근 수정 ${timestamp}` : '저장된 지원 건';
        const deadline = document.createElement('span');
        deadline.textContent = application.deadline ? `마감 ${formatDate(application.deadline)}` : '마감일 미입력';
        meta.append(updated, deadline);

        const controls = document.createElement('div');
        controls.className = 'application-card-controls';
        const statusSelect = document.createElement('select');
        statusSelect.className = 'application-status-select';
        statusSelect.setAttribute('aria-label', `${application.company || '회사명 미입력'} 지원 상태`);
        validStatuses.forEach((statusText) => {
          const option = document.createElement('option');
          option.value = statusText;
          option.textContent = statusText;
          option.selected = statusText === application.status;
          statusSelect.append(option);
        });
        statusSelect.addEventListener('change', () => updateApplicationMeta(application.id, { status: statusSelect.value }));

        const deadlineInput = document.createElement('input');
        deadlineInput.type = 'date';
        deadlineInput.className = 'application-deadline';
        deadlineInput.value = application.deadline;
        deadlineInput.setAttribute('aria-label', `${application.company || '회사명 미입력'} 지원 마감일`);
        deadlineInput.addEventListener('change', () => updateApplicationMeta(application.id, { deadline: deadlineInput.value }));

        const openButton = document.createElement('button');
        openButton.type = 'button';
        openButton.className = 'button button-small button-secondary';
        openButton.textContent = application.id === currentApplicationId ? '현재 열림' : '불러오기';
        openButton.disabled = application.id === currentApplicationId;
        openButton.addEventListener('click', () => openApplication(application.id));

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'button button-small button-delete';
        deleteButton.textContent = '삭제';
        deleteButton.addEventListener('click', () => deleteApplication(application.id));
        controls.append(statusSelect, deadlineInput, openButton, deleteButton);
        card.append(header, role, meta, controls);
        applicationList.append(card);
      });
  }

  function updateExperienceEditorMode() {
    const isEditing = Boolean(currentEditingExperienceId);
    experienceEditorTitle.textContent = isEditing ? '경험 카드 수정' : '새 경험 카드';
    saveExperienceButton.textContent = isEditing ? '변경 내용 저장' : '경험 카드 등록';
    cancelExperienceEditButton.hidden = !isEditing;
    saveExperienceButton.disabled = isShowingSample() || !nativeStorage;
  }

  function updateExperienceControls(preferredId = '') {
    const previousId = preferredId || savedExperienceSelect.value;
    const selectedExperience = state.experiences.find((item) => item.id === previousId);
    savedExperienceSelect.replaceChildren();
    const prompt = document.createElement('option');
    prompt.value = '';
    prompt.textContent = state.experiences.length ? '경험을 선택해 주세요' : '보관된 경험이 없습니다';
    savedExperienceSelect.append(prompt);
    state.experiences
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .forEach((experience) => {
        const option = document.createElement('option');
        option.value = experience.id;
        option.textContent = experience.name;
        savedExperienceSelect.append(option);
      });
    savedExperienceSelect.value = selectedExperience ? selectedExperience.id : '';
    experienceCount.textContent = `${state.experiences.length} / ${maxExperiences}개`;
    loadExperienceButton.disabled = !selectedExperience || isShowingSample();
    updateExperienceEditorMode();
    renderExperienceCards();

    const questionSelect = document.getElementById('questionExperienceSelect');
    if (questionSelect) {
      const selectedIds = new Set(Array.from(questionSelect.selectedOptions || [], (option) => option.value));
      questionSelect.replaceChildren();
      state.experiences.forEach((experience) => {
        const option = document.createElement('option');
        option.value = experience.id;
        option.textContent = experience.name;
        option.selected = selectedIds.has(experience.id);
        questionSelect.append(option);
      });
    }
  }

  function renderAll(preferredExperienceId = '') {
    renderApplicationList();
    updateExperienceControls(preferredExperienceId);
  }

  function updateApplicationMeta(id, patch) {
    const updated = state.applications.map((application) => {
      if (application.id !== id) return application;
      const safePatch = {};
      if (validStatuses.includes(patch.status)) safePatch.status = patch.status;
      if (typeof patch.deadline === 'string') safePatch.deadline = normalizeDate(patch.deadline);
      return { ...application, ...safePatch, updatedAt: new Date().toISOString() };
    });
    if (!writeSavedState({ ...state, applications: updated })) return;
    renderApplicationList();
    setMessage(managerMessage, '지원 상태와 마감 정보를 저장했어요.');
  }

  function clearFormAndResults() {
    isRestoring = true;
    form.reset();
    Object.values(fields).forEach((field) => { field.value = ''; });
    const status = document.getElementById('resultStatus');
    if (status) {
      status.textContent = '분석 대기 중';
      status.classList.remove('ready');
    }
    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.hidden = false;
    resultContent.hidden = true;
    if (sampleBanner) sampleBanner.hidden = true;
    resultPanel.dataset.stale = 'false';
    resultPanel.setAttribute('aria-busy', 'false');
    const keywordChips = document.getElementById('keywordChips');
    if (keywordChips) keywordChips.replaceChildren();
    const keywordCount = document.getElementById('keywordCount');
    if (keywordCount) keywordCount.textContent = '0개';
    const keywordEmpty = document.getElementById('keywordEmpty');
    if (keywordEmpty) keywordEmpty.hidden = true;
    const keywordLimitNote = document.getElementById('keywordLimitNote');
    if (keywordLimitNote) keywordLimitNote.hidden = true;
    const copyKeywordsButton = document.getElementById('copyKeywordsButton');
    if (copyKeywordsButton) copyKeywordsButton.disabled = true;
    const downloadKeywordsButton = document.getElementById('downloadKeywordsButton');
    if (downloadKeywordsButton) downloadKeywordsButton.disabled = true;
    const keywordFeedback = document.getElementById('keywordFeedback');
    if (keywordFeedback) keywordFeedback.textContent = '';
    const matchSummary = document.getElementById('matchSummary');
    if (matchSummary) matchSummary.hidden = true;
    const coverageLabel = document.getElementById('coverageLabel');
    if (coverageLabel) coverageLabel.textContent = '—';
    const coverageText = document.getElementById('coverageText');
    if (coverageText) coverageText.textContent = '경험 메모를 입력하면 키워드와 같은 표현이 있는지 비교합니다.';
    const coverageBar = document.getElementById('coverageBar');
    if (coverageBar) coverageBar.style.width = '0%';
    const coverageMeter = document.getElementById('coverageMeter');
    if (coverageMeter) coverageMeter.setAttribute('aria-valuenow', '0');
    const formMessage = document.getElementById('formMessage');
    if (formMessage) {
      formMessage.textContent = '';
      formMessage.classList.remove('error');
    }
    const jobCount = document.getElementById('jobCount');
    if (jobCount) jobCount.textContent = '0 / 12,000자';
    if (typeof window.plenClearSamplePreview === 'function') window.plenClearSamplePreview();
    isRestoring = false;
  }

  function fillForm(record) {
    isRestoring = true;
    fields.company.value = record.company || '';
    fields.role.value = record.role || '';
    fields.job.value = record.job || '';
    fields.context.value = record.context || '';
    fields.actions.value = record.actions || '';
    fields.outcome.value = record.outcome || '';
    const emptyState = document.getElementById('emptyState');
    const status = document.getElementById('resultStatus');
    const keywordChips = document.getElementById('keywordChips');
    const keywordCount = document.getElementById('keywordCount');
    const keywordEmpty = document.getElementById('keywordEmpty');
    const keywordLimitNote = document.getElementById('keywordLimitNote');
    const copyKeywordsButton = document.getElementById('copyKeywordsButton');
    const downloadKeywordsButton = document.getElementById('downloadKeywordsButton');
    const keywordFeedback = document.getElementById('keywordFeedback');
    const matchSummary = document.getElementById('matchSummary');
    const coverageLabel = document.getElementById('coverageLabel');
    const coverageText = document.getElementById('coverageText');
    const coverageBar = document.getElementById('coverageBar');
    const coverageMeter = document.getElementById('coverageMeter');

    resultContent.hidden = true;
    if (emptyState) emptyState.hidden = false;
    if (status) {
      status.textContent = '키워드 재추출 필요';
      status.classList.remove('ready');
    }
    if (sampleBanner) sampleBanner.hidden = true;
    if (keywordChips) keywordChips.replaceChildren();
    if (keywordCount) keywordCount.textContent = '다시 추출';
    if (keywordEmpty) keywordEmpty.hidden = true;
    if (keywordLimitNote) keywordLimitNote.hidden = true;
    if (copyKeywordsButton) copyKeywordsButton.disabled = true;
    if (downloadKeywordsButton) downloadKeywordsButton.disabled = true;
    if (keywordFeedback) keywordFeedback.textContent = '';
    if (matchSummary) matchSummary.hidden = true;
    if (coverageLabel) coverageLabel.textContent = '—';
    if (coverageText) coverageText.textContent = '지원 건을 열었어요. 공고 키워드를 다시 추출해 주세요.';
    if (coverageBar) coverageBar.style.width = '0%';
    if (coverageMeter) coverageMeter.setAttribute('aria-valuenow', '0');
    resultPanel.dataset.stale = 'true';
    resultPanel.setAttribute('aria-busy', 'false');
    const jobCount = document.getElementById('jobCount');
    if (jobCount) jobCount.textContent = `${fields.job.value.length.toLocaleString('ko-KR')} / 12,000자`;
    isRestoring = false;
    setMessage(managerMessage, '저장된 지원 건을 불러왔어요. 공고 키워드를 다시 추출해 주세요.');
    document.getElementById('workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function persistCurrentForm() {
    if (!currentApplicationId || isRestoring || isShowingSample()) return false;
    const existing = state.applications.find((item) => item.id === currentApplicationId);
    if (!existing) return false;
    const record = { ...existing, ...getFormRecord(), id: existing.id, status: existing.status, deadline: existing.deadline };
    if (measureRecord(record) > maxApplicationCharacters) {
      setMessage(managerMessage, '수정 내용이 너무 길어 저장하지 못했어요. 입력 분량을 줄인 뒤 다시 시도해 주세요.', true);
      return false;
    }
    const applications = state.applications.map((item) => item.id === currentApplicationId ? record : item);
    if (!writeSavedState({ ...state, applications })) return false;
    renderApplicationList();
    return true;
  }

  function scheduleCurrentSave() {
    if (!currentApplicationId || isRestoring || isShowingSample()) return;
    window.clearTimeout(dirtyTimer);
    dirtyTimer = window.setTimeout(persistCurrentForm, 650);
  }

  function saveCurrentApplication() {
    if (isShowingSample()) {
      setMessage(managerMessage, '가상 예시는 저장할 수 없어요. 본인의 실제 회사·공고·경험을 입력해 주세요.', true);
      return;
    }
    if (!nativeStorage) {
      setMessage(managerMessage, '브라우저 저장소를 사용할 수 없어 지원 건을 보관할 수 없어요.', true);
      return;
    }
    const record = currentRecordWithStatus();
    if (!record.company && !record.role && !record.job && !record.context && !record.actions && !record.outcome) {
      setMessage(managerMessage, '저장할 내용이 없어요. 회사명, 공고 또는 경험을 먼저 입력해 주세요.', true);
      return;
    }
    if (measureRecord(record) > maxApplicationCharacters) {
      setMessage(managerMessage, '현재 입력이 너무 길어 저장할 수 없어요. 입력 분량을 줄인 뒤 다시 시도해 주세요.', true);
      return;
    }
    const existingIndex = state.applications.findIndex((item) => item.id === currentApplicationId);
    if (existingIndex < 0 && state.applications.length >= maxApplications) {
      setMessage(managerMessage, `지원 건은 최대 ${maxApplications}개까지 저장할 수 있어요. 필요 없는 지원 건을 삭제해 주세요.`, true);
      return;
    }
    window.clearTimeout(dirtyTimer);
    const applications = existingIndex >= 0
      ? state.applications.map((item) => item.id === currentApplicationId ? record : item)
      : [record, ...state.applications];
    if (!writeSavedState({ ...state, applications })) return;
    currentApplicationId = record.id;
    renderAll();
    setMessage(managerMessage, `${record.company || '현재 지원 건'}${record.role ? ` · ${record.role}` : ''}을(를) 이 브라우저에 저장했어요. 저장된 내용의 수정 사항은 자동 저장됩니다.`);
  }

  function openApplication(id) {
    const target = state.applications.find((item) => item.id === id);
    if (!target) return;
    if (hasWorkInProgress() && currentApplicationId !== id && !window.confirm('현재 입력 내용이 저장되지 않았을 수 있어요. 저장된 지원 건을 열까요?')) return;
    window.clearTimeout(dirtyTimer);
    currentApplicationId = target.id;
    isSampleMode = false;
    if (typeof window.plenClearSamplePreview === 'function') window.plenClearSamplePreview();
    fillForm(target);
    renderAll();
  }

  function deleteApplication(id) {
    const target = state.applications.find((item) => item.id === id);
    if (!target) return;
    const label = [target.company || '회사명 미입력', target.role].filter(Boolean).join(' · ');
    if (!window.confirm(`“${label}” 지원 건을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    const applications = state.applications.filter((item) => item.id !== id);
    if (!writeSavedState({ ...state, applications })) return;
    if (currentApplicationId === id) {
      window.clearTimeout(dirtyTimer);
      currentApplicationId = null;
      clearFormAndResults();
    }
    renderAll();
    setMessage(managerMessage, '지원 건을 삭제했어요.');
  }

  function startNewApplication() {
    if (hasWorkInProgress() && !window.confirm('현재 입력 내용은 별도 지원 건으로 저장되지 않았을 수 있어요. 새 지원 건을 시작할까요?')) return;
    window.clearTimeout(dirtyTimer);
    currentApplicationId = null;
    isSampleMode = false;
    clearFormAndResults();
    renderAll();
    setMessage(managerMessage, '새 지원 건을 시작합니다. 회사와 채용공고를 입력해 주세요.');
    fields.company.focus();
  }

  function clearExperienceEditor() {
    experienceCardForm.reset();
    Object.values(experienceFields).forEach((field) => { field.value = ''; });
    currentEditingExperienceId = null;
    experienceEditorBaseline = experienceEditorSnapshot();
    updateExperienceEditorMode();
  }

  function updateExperienceEditor(record) {
    experienceFields.name.value = record.name || '';
    experienceFields.context.value = record.context || '';
    experienceFields.actions.value = record.actions || '';
    experienceFields.outcome.value = record.outcome || '';
    experienceFields.keywords.value = (record.keywords || []).join(', ');
  }

  function editExperience(id) {
    const experience = state.experiences.find((item) => item.id === id);
    if (!experience || id === currentEditingExperienceId) return;
    if (experienceEditorIsDirty() && !window.confirm('작성 중인 경험 카드 내용이 사라질 수 있어요. 선택한 카드를 수정할까요?')) return;
    currentEditingExperienceId = id;
    updateExperienceEditor(experience);
    experienceEditorBaseline = experienceEditorSnapshot();
    updateExperienceEditorMode();
    renderExperienceCards();
    setMessage(experienceLibraryMessage, `“${experience.name}” 카드를 수정하고 있어요. 변경 내용은 저장 버튼을 눌러야 반영됩니다.`);
    experienceCardForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    experienceFields.name.focus({ preventScroll: true });
  }

  function cancelExperienceEdit() {
    if (experienceEditorIsDirty() && !window.confirm('작성 중인 경험 카드 내용을 지우고 수정 모드를 종료할까요?')) return;
    clearExperienceEditor();
    renderExperienceCards();
    setMessage(experienceLibraryMessage, '수정을 취소했어요. 저장된 경험 카드는 변경되지 않았습니다.');
  }

  function saveExperience() {
    if (isShowingSample()) {
      setMessage(experienceLibraryMessage, '가상 예시는 경험 카드로 등록할 수 없어요. 본인의 실제 경험으로 작성해 주세요.', true);
      return;
    }
    if (!nativeStorage) {
      setMessage(experienceLibraryMessage, '브라우저 저장소를 사용할 수 없어 경험 카드를 보관하지 못했어요.', true);
      return;
    }

    const draft = getExperienceEditorRecord();
    if (!draft.name) {
      setMessage(experienceLibraryMessage, '경험 카드 이름을 입력해 주세요.', true);
      experienceFields.name.focus();
      return;
    }
    if (!draft.context && !draft.actions && !draft.outcome) {
      setMessage(experienceLibraryMessage, '상황·행동·결과 중 실제 경험 내용을 하나 이상 입력해 주세요. 키워드만으로는 카드를 등록할 수 없어요.', true);
      experienceFields.context.focus();
      return;
    }

    const existing = currentEditingExperienceId
      ? state.experiences.find((item) => item.id === currentEditingExperienceId)
      : null;
    if (currentEditingExperienceId && !existing) {
      clearExperienceEditor();
      setMessage(experienceLibraryMessage, '수정하려는 카드를 찾을 수 없어요. 목록을 새로 확인한 뒤 다시 시도해 주세요.', true);
      renderAll();
      return;
    }
    if (!existing && state.experiences.length >= maxExperiences) {
      setMessage(experienceLibraryMessage, `경험 카드는 최대 ${maxExperiences}개까지 등록할 수 있어요. 사용하지 않는 카드를 삭제한 뒤 다시 시도해 주세요.`, true);
      return;
    }

    const record = {
      id: existing ? existing.id : makeId(),
      ...draft,
      updatedAt: new Date().toISOString()
    };
    if (measureRecord(record) > maxExperienceCharacters) {
      setMessage(experienceLibraryMessage, '카드 내용이 너무 길어 저장할 수 없어요. 입력 분량을 줄여 주세요.', true);
      return;
    }
    const experiences = existing
      ? state.experiences.map((item) => item.id === existing.id ? record : item)
      : [record, ...state.experiences];
    if (!writeSavedState({ ...state, experiences }, experienceLibraryMessage)) return;

    clearExperienceEditor();
    renderAll(record.id);
    setMessage(experienceLibraryMessage, `“${record.name}” 경험 카드를 ${existing ? '수정' : '등록'}했어요. 이 브라우저에 저장했습니다.`);
  }

  function deleteExperienceById(id) {
    const experience = state.experiences.find((item) => item.id === id);
    if (!experience) return;
    if (!window.confirm(`“${experience.name}” 경험 카드를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    const experiences = state.experiences.filter((item) => item.id !== id);
    if (!writeSavedState({ ...state, experiences }, experienceLibraryMessage)) return;
    deleteExperienceFromResume(id);
    if (currentEditingExperienceId === id) clearExperienceEditor();
    renderAll();
    setMessage(experienceLibraryMessage, `“${experience.name}” 경험 카드를 삭제했어요.`);
  }

  function importCurrentExperience() {
    if (isShowingSample()) {
      setMessage(experienceLibraryMessage, '가상 예시 내용은 경험 카드로 가져올 수 없어요. 본인의 실제 경험을 입력해 주세요.', true);
      return;
    }
    const source = {
      context: fields.context.value.trim(),
      actions: fields.actions.value.trim(),
      outcome: fields.outcome.value.trim()
    };
    if (!source.context && !source.actions && !source.outcome) {
      setMessage(experienceLibraryMessage, '지원서의 경험 메모가 비어 있어요. 먼저 아래 지원서 입력란에 실제 경험을 적어 주세요.', true);
      fields.context.focus();
      return;
    }
    if (experienceEditorIsDirty() && !window.confirm('현재 카드 작성 내용이 지원서 경험 메모로 바뀝니다. 계속할까요?')) return;
    currentEditingExperienceId = null;
    experienceFields.context.value = source.context;
    experienceFields.actions.value = source.actions;
    experienceFields.outcome.value = source.outcome;
    experienceFields.keywords.value = '';
    if (!experienceFields.name.value.trim()) {
      experienceFields.name.value = fields.role.value.trim()
        ? `${fields.role.value.trim()} 경험 메모`.slice(0, 60)
        : '지원서 경험 메모';
    }
    experienceEditorBaseline = JSON.stringify({ name: '', context: '', actions: '', outcome: '', keywords: [] });
    updateExperienceEditorMode();
    setMessage(experienceLibraryMessage, '지원서의 상황·행동·결과를 카드 초안으로 가져왔어요. 이름과 내용을 확인한 뒤 등록해 주세요.');
    experienceCardForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    experienceFields.name.focus({ preventScroll: true });
  }

  function loadExperience() {
    if (isShowingSample()) {
      setMessage(experienceLibraryMessage, '가상 예시 화면에서는 저장한 경험을 지원서로 불러올 수 없어요. 예시를 닫고 본인 자료를 사용해 주세요.', true);
      return;
    }
    const experience = state.experiences.find((item) => item.id === savedExperienceSelect.value);
    if (!experience) return;
    const currentExperience = fields.context.value.trim() || fields.actions.value.trim() || fields.outcome.value.trim();
    if (currentExperience && !window.confirm('현재 지원서에 입력한 경험 메모를 보관된 카드의 내용으로 바꿀까요?')) return;
    fields.context.value = experience.context;
    fields.actions.value = experience.actions;
    fields.outcome.value = experience.outcome;
    if (!resultContent.hidden) {
      resultPanel.dataset.stale = 'true';
      const status = document.getElementById('resultStatus');
      if (status) {
        status.textContent = '입력 변경 — 재추출 필요';
        status.classList.remove('ready');
      }
    }
    scheduleCurrentSave();
    setMessage(experienceLibraryMessage, `“${experience.name}” 카드의 상황·행동·결과를 지원서에 불러왔어요. 공고 키워드를 다시 추출해 주세요.`);
  }

  function clearAllSavedData() {
    if (!state.applications.length && !state.experiences.length) {
      setMessage(managerMessage, '삭제할 저장 자료가 없습니다.');
      return;
    }
    if (!window.confirm('저장된 모든 지원 건과 경험 카드를 이 브라우저에서 삭제할까요? 되돌릴 수 없습니다.')) return;
    window.clearTimeout(dirtyTimer);
    try {
      localStorage.removeItem(storageKey);
      clearResumeRecord();
    } catch (_error) {
      setMessage(managerMessage, '브라우저 저장 자료를 삭제하지 못했어요. 브라우저 설정에서 직접 삭제해 주세요.', true);
      return;
    }
    state = { version: 1, applications: [], experiences: [] };
    currentApplicationId = null;
    isSampleMode = false;
    clearFormAndResults();
    clearExperienceEditor();
    if (window.plenResume && typeof window.plenResume.clearForm === 'function') window.plenResume.clearForm();
    renderAll();
    setMessage(managerMessage, '이 브라우저에 저장된 지원 건과 경험 카드를 모두 삭제했어요.');
    setMessage(experienceLibraryMessage, '등록한 경험 카드를 모두 삭제했어요.');
  }

  function syncSampleMode() {
    isSampleMode = Boolean(sampleBanner && !sampleBanner.hidden);
    saveApplicationButton.disabled = isShowingSample() || !nativeStorage;
    importCurrentExperienceButton.disabled = isShowingSample();
    updateExperienceEditorMode();
    if (isShowingSample()) {
      setMessage(managerMessage, '가상 예시를 보고 있어요. 이 자료는 저장되지 않으며, 본인 자료로 바꾼 뒤 저장해 주세요.');
      setMessage(experienceLibraryMessage, '가상 예시는 경험 카드로 등록하거나 불러올 수 없습니다.');
    }
  }

  saveApplicationButton.addEventListener('click', saveCurrentApplication);
  newApplicationButton.addEventListener('click', startNewApplication);
  clearStoredDataButton.addEventListener('click', clearAllSavedData);
  experienceCardForm.addEventListener('submit', (event) => {
    event.preventDefault();
    saveExperience();
  });
  importCurrentExperienceButton.addEventListener('click', importCurrentExperience);
  cancelExperienceEditButton.addEventListener('click', cancelExperienceEdit);
  loadExperienceButton.addEventListener('click', loadExperience);
  savedExperienceSelect.addEventListener('change', () => {
    loadExperienceButton.disabled = !savedExperienceSelect.value || isShowingSample();
  });
  experienceCardForm.addEventListener('input', () => {
    if (experienceLibraryMessage.classList.contains('is-error')) {
      setMessage(experienceLibraryMessage, currentEditingExperienceId
        ? '수정 내용을 확인한 뒤 ‘변경 내용 저장’을 눌러 반영해 주세요.'
        : '카드 내용을 입력한 뒤 ‘경험 카드 등록’을 눌러 보관해 주세요.');
    }
  });

  form.addEventListener('input', () => {
    if (isRestoring) return;
    if (isSampleMode) {
      isSampleMode = false;
      if (typeof window.plenClearSamplePreview === 'function') window.plenClearSamplePreview();
      setMessage(managerMessage, '예시 입력을 수정했어요. 남은 가상 정보가 없는지 확인한 뒤에만 저장해 주세요.');
      setMessage(experienceLibraryMessage, '가상 예시에서 벗어났어요. 실제 경험인지 확인한 뒤 카드로 등록할 수 있습니다.');
      renderApplicationList();
      updateExperienceControls();
    }
    if (currentApplicationId) scheduleCurrentSave();
  });

  form.addEventListener('submit', () => {
    window.setTimeout(() => {
      if (resultContent.hidden) return;
      syncSampleMode();
      if (currentApplicationId && !isShowingSample()) persistCurrentForm();
    }, 0);
  });

  form.addEventListener('reset', () => {
    window.setTimeout(() => {
      if (isRestoring) return;
      window.clearTimeout(dirtyTimer);
      const hadCurrentApplication = Boolean(currentApplicationId);
      currentApplicationId = null;
      isSampleMode = false;
      if (typeof window.plenClearSamplePreview === 'function') window.plenClearSamplePreview();
      renderAll();
      if (hadCurrentApplication) setMessage(managerMessage, '현재 입력을 지웠어요. 저장된 지원 건은 보관함에 그대로 남아 있습니다.');
    }, 0);
  });

  const sampleButton = document.getElementById('sampleButton');
  if (sampleButton) sampleButton.addEventListener('click', () => {
    window.setTimeout(() => {
      if (!sampleBanner || sampleBanner.hidden) return;
      window.clearTimeout(dirtyTimer);
      currentApplicationId = null;
      syncSampleMode();
      renderAll();
    }, 0);
  });

  state = readSavedState();
  experienceEditorBaseline = experienceEditorSnapshot();
  if (!nativeStorage) {
    setMessage(managerMessage, '브라우저 저장소를 사용할 수 없는 환경입니다. 분석은 가능하지만 자료를 보관할 수 없습니다.', true);
    setMessage(experienceLibraryMessage, '브라우저 저장소를 사용할 수 없어 경험 카드 보관함을 사용할 수 없습니다.', true);
  }
  renderAll();
})();
