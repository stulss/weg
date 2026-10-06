(() => {
  'use strict';

  const builder = document.getElementById('resumeBuilder');
  if (!builder) return;

  const storageKey = 'plen-resume-v1';
  const workbenchStorageKey = 'plen-workbench-v1';
  const maximumPayloadCharacters = 500_000;
  const maximumSkills = 30;
  const maximumExperienceEntries = 12;
  const maximumEducationEntries = 8;
  const maximumCertificationEntries = 12;

  const profileFields = {
    name: document.getElementById('resumeName'),
    headline: document.getElementById('resumeHeadline'),
    email: document.getElementById('resumeEmail'),
    phone: document.getElementById('resumePhone'),
    location: document.getElementById('resumeLocation'),
    portfolio: document.getElementById('resumePortfolio'),
    summary: document.getElementById('resumeSummary'),
    skills: document.getElementById('resumeSkills')
  };
  const ui = {
    saveStatus: document.getElementById('resumeSaveStatus'),
    saveButton: document.getElementById('saveResumeButton'),
    printButton: document.getElementById('printResumeButton'),
    downloadButton: document.getElementById('downloadResumeButton'),
    clearButton: document.getElementById('clearResumeButton'),
    feedback: document.getElementById('resumeFeedback'),
    preview: document.getElementById('resumePreview'),
    librarySelect: document.getElementById('resumeExperienceLibrarySelect'),
    importButton: document.getElementById('importResumeExperienceButton')
  };
  const requiredElements = [
    ...Object.values(profileFields), ...Object.values(ui),
    document.getElementById('resumeExperienceTitle'),
    document.getElementById('resumeExperienceOrganization'),
    document.getElementById('resumeExperiencePeriod'),
    document.getElementById('resumeExperienceDescription'),
    document.getElementById('resumeExperienceKeywords'),
    document.getElementById('resumeEducationTitle'),
    document.getElementById('resumeEducationOrganization'),
    document.getElementById('resumeEducationPeriod'),
    document.getElementById('resumeEducationDescription'),
    document.getElementById('resumeCertificationTitle'),
    document.getElementById('resumeCertificationOrganization'),
    document.getElementById('resumeCertificationPeriod'),
    document.getElementById('resumeCertificationDescription')
  ];
  if (requiredElements.some((element) => !element)) return;

  const collectionConfigs = {
    experience: {
      key: 'experience',
      label: '경력·프로젝트',
      emptyMessage: '등록한 경력·프로젝트가 없습니다. 직접 추가하거나 경험 카드에서 가져올 수 있어요.',
      maxItems: maximumExperienceEntries,
      titleId: 'resumeExperienceTitle',
      organizationId: 'resumeExperienceOrganization',
      periodId: 'resumeExperiencePeriod',
      descriptionId: 'resumeExperienceDescription',
      keywordsId: 'resumeExperienceKeywords',
      listId: 'resumeExperienceList',
      editorTitleId: 'resumeExperienceEditorTitle',
      saveButtonId: 'saveResumeExperienceButton',
      cancelButtonId: 'cancelResumeExperienceButton',
      messageId: 'resumeExperienceEditorMessage',
      editorId: 'resumeExperienceEditor',
      addLabel: '경력·프로젝트 추가'
    },
    education: {
      key: 'education',
      label: '학력',
      emptyMessage: '학력 정보를 입력하면 이력서 미리보기에 표시됩니다.',
      maxItems: maximumEducationEntries,
      titleId: 'resumeEducationTitle',
      organizationId: 'resumeEducationOrganization',
      periodId: 'resumeEducationPeriod',
      descriptionId: 'resumeEducationDescription',
      listId: 'resumeEducationList',
      editorTitleId: 'resumeEducationEditorTitle',
      saveButtonId: 'saveResumeEducationButton',
      cancelButtonId: 'cancelResumeEducationButton',
      messageId: 'resumeEducationEditorMessage',
      editorId: 'resumeEducationEditor',
      addLabel: '학력 추가'
    },
    certifications: {
      key: 'certifications',
      label: '자격·수상',
      emptyMessage: '자격증이나 수상 이력을 입력하면 이력서 미리보기에 표시됩니다.',
      maxItems: maximumCertificationEntries,
      titleId: 'resumeCertificationTitle',
      organizationId: 'resumeCertificationOrganization',
      periodId: 'resumeCertificationPeriod',
      descriptionId: 'resumeCertificationDescription',
      listId: 'resumeCertificationList',
      editorTitleId: 'resumeCertificationEditorTitle',
      saveButtonId: 'saveResumeCertificationButton',
      cancelButtonId: 'cancelResumeCertificationButton',
      messageId: 'resumeCertificationEditorMessage',
      editorId: 'resumeCertificationEditor',
      addLabel: '자격·수상 추가'
    }
  };

  const editorModes = Object.fromEntries(Object.keys(collectionConfigs).map((key) => [key, {
    editingId: null,
    pendingLibraryId: '',
    baseline: ''
  }]));

  const nativeStorage = (() => {
    try {
      const probeKey = `${storageKey}-probe`;
      localStorage.setItem(probeKey, '1');
      localStorage.removeItem(probeKey);
      return true;
    } catch (_error) {
      return false;
    }
  })();

  let state = blankResume();
  let hasSavedResume = false;
  let lastPersistedFingerprint = '';
  let autosaveTimer = null;
  let experienceLibrary = [];

  function blankResume() {
    return {
      version: 1,
      profile: { name: '', headline: '', email: '', phone: '', location: '', portfolio: '' },
      summary: '',
      skills: [],
      experience: [],
      education: [],
      certifications: [],
      updatedAt: new Date().toISOString()
    };
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `plen-resume-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function cleanText(value, maximumLength) {
    return typeof value === 'string' ? value.trim().slice(0, maximumLength) : '';
  }

  function normalizeTags(value, limit = maximumSkills, length = 40) {
    const entries = Array.isArray(value)
      ? value
      : typeof value === 'string' ? value.split(/[,，;；\n]+/) : [];
    const tags = [];
    entries.forEach((entry) => {
      if (typeof entry !== 'string') return;
      const tag = entry.trim().replace(/\s+/g, ' ').slice(0, length);
      if (tag && !tags.includes(tag) && tags.length < limit) tags.push(tag);
    });
    return tags;
  }

  function sanitizeProfile(value) {
    const profile = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      name: cleanText(profile.name, 80),
      headline: cleanText(profile.headline, 120),
      email: cleanText(profile.email, 160),
      phone: cleanText(profile.phone, 60),
      location: cleanText(profile.location, 100),
      portfolio: cleanText(profile.portfolio, 240)
    };
  }

  function sanitizeEntry(key, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const common = {
      id: typeof value.id === 'string' && value.id.length <= 100 ? value.id : makeId(),
      title: cleanText(value.title, 120),
      organization: cleanText(value.organization, 120),
      period: cleanText(value.period, 100),
      description: cleanText(value.description, key === 'experience' ? 4000 : 1600)
    };
    if (!common.title) return null;
    if (key === 'experience') {
      common.keywords = normalizeTags(value.keywords, 10, 40);
      common.libraryId = typeof value.libraryId === 'string' && value.libraryId.length <= 100 ? value.libraryId : '';
    }
    return common;
  }

  function sanitizeResume(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) return null;
    const pickEntries = (key, limit) => Array.isArray(value[key])
      ? value[key].map((entry) => sanitizeEntry(key, entry)).filter(Boolean).slice(0, limit)
      : [];
    return {
      version: 1,
      profile: sanitizeProfile(value.profile),
      summary: cleanText(value.summary, 3000),
      skills: normalizeTags(value.skills, maximumSkills, 40),
      experience: pickEntries('experience', maximumExperienceEntries),
      education: pickEntries('education', maximumEducationEntries),
      certifications: pickEntries('certifications', maximumCertificationEntries),
      updatedAt: typeof value.updatedAt === 'string' && !Number.isNaN(Date.parse(value.updatedAt))
        ? value.updatedAt
        : new Date().toISOString()
    };
  }

  function readResume() {
    if (!nativeStorage) return { record: null, invalid: false };
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return { record: null, invalid: false };
      if (raw.length > maximumPayloadCharacters) return { record: null, invalid: true };
      const parsed = JSON.parse(raw);
      const record = sanitizeResume(parsed);
      return { record, invalid: !record };
    } catch (_error) {
      return { record: null, invalid: true };
    }
  }

  function getCurrentResume() {
    return {
      version: 1,
      profile: {
        name: profileFields.name.value.trim(),
        headline: profileFields.headline.value.trim(),
        email: profileFields.email.value.trim(),
        phone: profileFields.phone.value.trim(),
        location: profileFields.location.value.trim(),
        portfolio: profileFields.portfolio.value.trim()
      },
      summary: profileFields.summary.value.trim(),
      skills: normalizeTags(profileFields.skills.value, maximumSkills, 40),
      experience: state.experience.map((entry) => ({ ...entry, keywords: [...(entry.keywords || [])] })),
      education: state.education.map((entry) => ({ ...entry })),
      certifications: state.certifications.map((entry) => ({ ...entry })),
      updatedAt: state.updatedAt || new Date().toISOString()
    };
  }

  function contentFingerprint(record) {
    return JSON.stringify({
      profile: record.profile,
      summary: record.summary,
      skills: record.skills,
      experience: record.experience,
      education: record.education,
      certifications: record.certifications
    });
  }

  function setFeedback(message, isError = false) {
    ui.feedback.textContent = message;
    ui.feedback.classList.toggle('is-error', Boolean(isError));
  }

  function setSaveStatus(message, kind = '') {
    ui.saveStatus.textContent = message;
    ui.saveStatus.classList.toggle('is-dirty', kind === 'dirty');
    ui.saveStatus.classList.toggle('is-error', kind === 'error');
  }

  function setCollectionMessage(key, message, isError = false) {
    const config = collectionConfigs[key];
    const element = document.getElementById(config.messageId);
    element.textContent = message;
    element.classList.toggle('is-error', Boolean(isError));
  }

  function getCollectionFields(config) {
    const values = {
      title: document.getElementById(config.titleId).value.trim(),
      organization: document.getElementById(config.organizationId).value.trim(),
      period: document.getElementById(config.periodId).value.trim(),
      description: document.getElementById(config.descriptionId).value.trim()
    };
    if (config.key === 'experience') {
      values.keywords = normalizeTags(document.getElementById(config.keywordsId).value, 10, 40);
    }
    return values;
  }

  function editorSnapshot(key) {
    const mode = editorModes[key];
    return JSON.stringify({ ...getCollectionFields(collectionConfigs[key]), libraryId: mode.pendingLibraryId });
  }

  function editorIsDirty(key) {
    return editorSnapshot(key) !== editorModes[key].baseline;
  }

  function updateCollectionEditorMode(key) {
    const config = collectionConfigs[key];
    const mode = editorModes[key];
    const isEditing = Boolean(mode.editingId);
    const isImportedDraft = Boolean(mode.pendingLibraryId) && !isEditing;
    document.getElementById(config.editorTitleId).textContent = isEditing
      ? `${config.label} 수정`
      : isImportedDraft && key === 'experience' ? '경험 카드 검토·추가' : `${config.label} 입력`;
    document.getElementById(config.saveButtonId).textContent = isEditing ? '변경 내용 저장' : config.addLabel;
    document.getElementById(config.cancelButtonId).hidden = !isEditing && !mode.pendingLibraryId;
  }

  function resetCollectionEditor(key) {
    const config = collectionConfigs[key];
    const mode = editorModes[key];
    [config.titleId, config.organizationId, config.periodId, config.descriptionId, config.keywordsId]
      .filter(Boolean)
      .forEach((id) => { document.getElementById(id).value = ''; });
    mode.editingId = null;
    mode.pendingLibraryId = '';
    mode.baseline = editorSnapshot(key);
    updateCollectionEditorMode(key);
  }

  function fillCollectionEditor(key, entry, { editingId = null, libraryId = '' } = {}) {
    const config = collectionConfigs[key];
    const mode = editorModes[key];
    document.getElementById(config.titleId).value = entry.title || '';
    document.getElementById(config.organizationId).value = entry.organization || '';
    document.getElementById(config.periodId).value = entry.period || '';
    document.getElementById(config.descriptionId).value = entry.description || '';
    if (config.keywordsId) document.getElementById(config.keywordsId).value = (entry.keywords || []).join(', ');
    mode.editingId = editingId;
    mode.pendingLibraryId = libraryId;
    mode.baseline = editorSnapshot(key);
    updateCollectionEditorMode(key);
  }

  function renderCollection(key) {
    const config = collectionConfigs[key];
    const list = document.getElementById(config.listId);
    list.replaceChildren();
    const entries = state[key];
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'resume-entry-empty';
      empty.textContent = config.emptyMessage;
      list.append(empty);
      return;
    }

    entries.forEach((entry) => {
      const card = document.createElement('article');
      card.className = `resume-entry-card${editorModes[key].editingId === entry.id ? ' is-editing' : ''}`;
      const header = document.createElement('div');
      header.className = 'resume-item-heading';
      const main = document.createElement('div');
      main.className = 'resume-item-main';
      if (key === 'experience' && entry.libraryId) {
        const badge = document.createElement('span');
        badge.className = 'resume-item-badge';
        badge.textContent = '경험 카드에서 가져옴';
        main.append(badge);
      }
      const title = document.createElement('h6');
      title.className = 'resume-item-title';
      title.textContent = entry.title;
      main.append(title);
      const metaParts = [entry.organization, entry.period].filter(Boolean);
      if (metaParts.length) {
        const meta = document.createElement('p');
        meta.className = 'resume-item-meta';
        meta.textContent = metaParts.join(' · ');
        main.append(meta);
      }

      const controls = document.createElement('div');
      controls.className = 'resume-item-controls';
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'button button-small button-secondary';
      editButton.textContent = editorModes[key].editingId === entry.id ? '수정 중' : '수정';
      editButton.disabled = editorModes[key].editingId === entry.id;
      editButton.setAttribute('aria-label', `${config.label} ${entry.title} 수정`);
      editButton.addEventListener('click', () => editCollectionEntry(key, entry.id));
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'button button-small button-delete';
      deleteButton.textContent = '삭제';
      deleteButton.setAttribute('aria-label', `${config.label} ${entry.title} 삭제`);
      deleteButton.addEventListener('click', () => deleteCollectionEntry(key, entry.id));
      controls.append(editButton, deleteButton);
      header.append(main, controls);
      card.append(header);

      if (entry.description) {
        const description = document.createElement('p');
        description.className = 'resume-item-description';
        description.textContent = entry.description;
        card.append(description);
      }
      if (key === 'experience' && entry.keywords && entry.keywords.length) {
        const tags = document.createElement('div');
        tags.className = 'resume-item-tags';
        tags.setAttribute('aria-label', '경력 관련 키워드');
        entry.keywords.forEach((keyword) => {
          const tag = document.createElement('span');
          tag.textContent = keyword;
          tags.append(tag);
        });
        card.append(tags);
      }
      list.append(card);
    });
  }

  function renderAllCollections() {
    Object.keys(collectionConfigs).forEach((key) => renderCollection(key));
  }

  function appendPreviewSection(parent, title) {
    const section = document.createElement('section');
    section.className = 'resume-preview-section';
    const heading = document.createElement('h2');
    heading.textContent = title;
    section.append(heading);
    parent.append(section);
    return section;
  }

  function renderPreview(record = getCurrentResume()) {
    ui.preview.replaceChildren();
    const header = document.createElement('header');
    header.className = 'resume-preview-header';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'resume-preview-eyebrow';
    eyebrow.textContent = 'RESUME';
    const name = document.createElement('h1');
    name.className = 'resume-preview-name';
    name.textContent = record.profile.name || '이름';
    header.append(eyebrow, name);
    if (record.profile.headline) {
      const headline = document.createElement('p');
      headline.className = 'resume-preview-headline';
      headline.textContent = record.profile.headline;
      header.append(headline);
    }
    const contacts = [
      record.profile.email,
      record.profile.phone,
      record.profile.location,
      record.profile.portfolio
    ].filter(Boolean);
    if (contacts.length) {
      const contactLine = document.createElement('div');
      contactLine.className = 'resume-preview-contact';
      contacts.forEach((contact) => {
        const item = document.createElement('span');
        item.textContent = contact;
        contactLine.append(item);
      });
      header.append(contactLine);
    }
    ui.preview.append(header);

    let sectionCount = 0;
    if (record.summary) {
      const section = appendPreviewSection(ui.preview, '프로필');
      const summary = document.createElement('p');
      summary.className = 'resume-preview-summary';
      summary.textContent = record.summary;
      section.append(summary);
      sectionCount += 1;
    }

    if (record.experience.length) {
      const section = appendPreviewSection(ui.preview, '경력·프로젝트');
      record.experience.forEach((entry) => {
        const item = document.createElement('article');
        item.className = 'resume-preview-item';
        const itemHeader = document.createElement('div');
        itemHeader.className = 'resume-preview-item-header';
        const title = document.createElement('h3');
        title.className = 'resume-preview-item-title';
        title.textContent = entry.title;
        itemHeader.append(title);
        item.append(itemHeader);
        const meta = [entry.organization, entry.period].filter(Boolean);
        if (meta.length) {
          const metaLine = document.createElement('p');
          metaLine.className = 'resume-preview-item-meta';
          metaLine.textContent = meta.join(' · ');
          item.append(metaLine);
        }
        if (entry.description) {
          const description = document.createElement('p');
          description.className = 'resume-preview-details';
          description.textContent = entry.description;
          item.append(description);
        }
        if (entry.keywords && entry.keywords.length) {
          const tags = document.createElement('div');
          tags.className = 'resume-preview-tags';
          entry.keywords.forEach((keyword) => {
            const tag = document.createElement('span');
            tag.textContent = keyword;
            tags.append(tag);
          });
          item.append(tags);
        }
        section.append(item);
      });
      sectionCount += 1;
    }

    if (record.education.length) {
      const section = appendPreviewSection(ui.preview, '학력');
      record.education.forEach((entry) => {
        const item = document.createElement('article');
        item.className = 'resume-preview-item';
        const title = document.createElement('h3');
        title.className = 'resume-preview-item-title';
        title.textContent = entry.title;
        item.append(title);
        const meta = [entry.organization, entry.period].filter(Boolean);
        if (meta.length) {
          const metaLine = document.createElement('p');
          metaLine.className = 'resume-preview-item-meta';
          metaLine.textContent = meta.join(' · ');
          item.append(metaLine);
        }
        if (entry.description) {
          const description = document.createElement('p');
          description.className = 'resume-preview-details';
          description.textContent = entry.description;
          item.append(description);
        }
        section.append(item);
      });
      sectionCount += 1;
    }

    if (record.skills.length) {
      const section = appendPreviewSection(ui.preview, '기술·역량');
      const list = document.createElement('ul');
      list.className = 'resume-preview-list';
      record.skills.forEach((skill) => {
        const item = document.createElement('li');
        item.textContent = skill;
        list.append(item);
      });
      section.append(list);
      sectionCount += 1;
    }

    if (record.certifications.length) {
      const section = appendPreviewSection(ui.preview, '자격·수상');
      const list = document.createElement('ul');
      list.className = 'resume-preview-certifications';
      record.certifications.forEach((entry) => {
        const item = document.createElement('li');
        const parts = [entry.title, entry.organization, entry.period].filter(Boolean);
        item.textContent = parts.join(' · ');
        if (entry.description) item.textContent += ` — ${entry.description}`;
        list.append(item);
      });
      section.append(list);
      sectionCount += 1;
    }

    if (!sectionCount) {
      const empty = document.createElement('p');
      empty.className = 'resume-preview-empty';
      empty.textContent = '작성한 이력서 내용이 여기에 표시됩니다. 먼저 이름과 실제 경험을 입력해 보세요.';
      ui.preview.append(empty);
    }
  }

  function readExperienceLibrary() {
    if (!nativeStorage) return [];
    try {
      const parsed = JSON.parse(localStorage.getItem(workbenchStorageKey) || 'null');
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.experiences)) return [];
      return parsed.experiences.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
        .map((item) => ({
          id: typeof item.id === 'string' && item.id.length <= 100 ? item.id : '',
          name: cleanText(item.name, 60),
          context: cleanText(item.context, 2400),
          actions: cleanText(item.actions, 3000),
          outcome: cleanText(item.outcome, 2400),
          keywords: normalizeTags(item.keywords, 8, 32)
        }))
        .filter((item) => item.id && item.name);
    } catch (_error) {
      return [];
    }
  }

  function refreshExperienceLibrary() {
    const previousId = ui.librarySelect.value;
    experienceLibrary = readExperienceLibrary();
    ui.librarySelect.replaceChildren();
    const prompt = document.createElement('option');
    prompt.value = '';
    prompt.textContent = experienceLibrary.length ? '경험 카드를 선택해 주세요' : '등록한 경험 카드가 없습니다';
    ui.librarySelect.append(prompt);
    experienceLibrary.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      ui.librarySelect.append(option);
    });
    ui.librarySelect.value = experienceLibrary.some((item) => item.id === previousId) ? previousId : '';
    ui.importButton.disabled = experienceLibrary.length === 0;
  }

  function formatResumeDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(date);
  }

  function validateResume(record) {
    if (!record.profile.name) return { message: '이력서에 표시할 이름을 입력해 주세요.', field: profileFields.name };
    if (record.profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.profile.email)) {
      return { message: '이메일 주소를 확인해 주세요.', field: profileFields.email };
    }
    return null;
  }

  function persistResume(record, { quiet = false } = {}) {
    if (!nativeStorage) {
      setSaveStatus('브라우저 저장소를 사용할 수 없어 저장할 수 없습니다.', 'error');
      if (!quiet) setFeedback('이 브라우저에서는 저장소를 사용할 수 없어요. 브라우저 설정을 확인해 주세요.', true);
      return false;
    }
    const normalized = sanitizeResume({ ...record, version: 1, updatedAt: new Date().toISOString() });
    if (!normalized) {
      setSaveStatus('이력서 내용을 정리하지 못해 저장하지 않았습니다.', 'error');
      if (!quiet) setFeedback('이력서 내용을 확인한 뒤 다시 저장해 주세요.', true);
      return false;
    }
    try {
      const serialized = JSON.stringify(normalized);
      if (serialized.length > maximumPayloadCharacters) {
        setSaveStatus('저장 가능한 분량을 초과했습니다.', 'error');
        if (!quiet) setFeedback('입력 분량을 줄인 뒤 다시 저장해 주세요.', true);
        return false;
      }
      localStorage.setItem(storageKey, serialized);
      state = normalized;
      hasSavedResume = true;
      lastPersistedFingerprint = contentFingerprint(normalized);
      setSaveStatus(`이 브라우저에 저장됨${formatResumeDate(normalized.updatedAt) ? ` · ${formatResumeDate(normalized.updatedAt)}` : ''}`);
      if (!quiet) setFeedback('이력서를 이 브라우저에 저장했어요. 이후 수정 내용은 자동 저장됩니다.');
      return true;
    } catch (_error) {
      setSaveStatus('브라우저 저장 공간이 부족하거나 저장이 차단되어 있습니다.', 'error');
      if (!quiet) setFeedback('브라우저 저장 공간이 부족하거나 저장이 차단되어 있어요. 내용을 줄이거나 저장 자료를 정리해 주세요.', true);
      return false;
    }
  }

  function saveResume() {
    window.clearTimeout(autosaveTimer);
    const record = getCurrentResume();
    const validation = validateResume(record);
    if (validation) {
      setFeedback(validation.message, true);
      validation.field.focus();
      return;
    }
    persistResume(record);
  }

  function scheduleAutosave() {
    const current = getCurrentResume();
    renderPreview(current);
    if (!hasSavedResume) {
      setSaveStatus('아직 저장하지 않았어요. 이력서 저장 버튼을 눌러 보관하세요.', 'dirty');
      return;
    }
    if (contentFingerprint(current) === lastPersistedFingerprint) {
      window.clearTimeout(autosaveTimer);
      setSaveStatus(`저장됨${formatResumeDate(state.updatedAt) ? ` · ${formatResumeDate(state.updatedAt)}` : ''}`);
      return;
    }
    setSaveStatus('변경 사항 저장 중…', 'dirty');
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      const latest = getCurrentResume();
      const validation = validateResume(latest);
      if (validation) {
        setSaveStatus(`자동 저장 대기: ${validation.message}`, 'error');
        return;
      }
      persistResume(latest, { quiet: true });
    }, 700);
  }

  function afterCollectionChange() {
    renderPreview(getCurrentResume());
    scheduleAutosave();
  }

  function saveCollectionEntry(key) {
    const config = collectionConfigs[key];
    const mode = editorModes[key];
    const draft = getCollectionFields(config);
    if (!draft.title) {
      setCollectionMessage(key, `${key === 'education' ? '학교명' : key === 'certifications' ? '자격·수상 이름' : '직무·프로젝트 이름'}을 입력해 주세요.`, true);
      document.getElementById(config.titleId).focus();
      return;
    }
    const existing = mode.editingId ? state[key].find((entry) => entry.id === mode.editingId) : null;
    if (mode.editingId && !existing) {
      resetCollectionEditor(key);
      setCollectionMessage(key, '수정하려는 항목을 찾지 못했어요. 목록을 확인한 뒤 다시 시도해 주세요.', true);
      renderCollection(key);
      return;
    }
    if (!existing && state[key].length >= config.maxItems) {
      setCollectionMessage(key, `${config.label} 항목은 최대 ${config.maxItems}개까지 추가할 수 있어요.`, true);
      return;
    }
    if (key === 'experience' && mode.pendingLibraryId) {
      const duplicate = state.experience.find((entry) => entry.libraryId === mode.pendingLibraryId && entry.id !== mode.editingId);
      if (duplicate) {
        setCollectionMessage(key, '이 경험 카드는 이미 이력서에 추가되어 있어요. 기존 항목을 수정해 주세요.', true);
        resetCollectionEditor(key);
        document.getElementById(config.listId).scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    const record = {
      id: existing ? existing.id : makeId(),
      ...draft
    };
    if (key === 'experience') {
      record.libraryId = existing ? existing.libraryId : mode.pendingLibraryId;
    }
    const sanitized = sanitizeEntry(key, record);
    if (!sanitized) {
      setCollectionMessage(key, '항목 제목을 확인해 주세요.', true);
      return;
    }
    const nextEntries = existing
      ? state[key].map((entry) => entry.id === existing.id ? sanitized : entry)
      : [...state[key], sanitized];
    state = { ...state, [key]: nextEntries, updatedAt: new Date().toISOString() };
    resetCollectionEditor(key);
    renderCollection(key);
    setCollectionMessage(key, `“${sanitized.title}” 항목을 ${existing ? '수정' : '추가'}했어요. 이력서를 저장하면 함께 보관됩니다.`);
    afterCollectionChange();
  }

  function editCollectionEntry(key, id) {
    const config = collectionConfigs[key];
    const entry = state[key].find((item) => item.id === id);
    if (!entry) return;
    if (editorIsDirty(key) && !window.confirm('작성 중인 항목이 사라질 수 있어요. 선택한 항목을 수정할까요?')) return;
    fillCollectionEditor(key, entry, {
      editingId: id,
      libraryId: key === 'experience' ? entry.libraryId : ''
    });
    renderCollection(key);
    setCollectionMessage(key, `“${entry.title}” 항목을 수정하고 있어요. 저장 버튼을 눌러 반영해 주세요.`);
    document.getElementById(config.editorId).scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById(config.titleId).focus({ preventScroll: true });
  }

  function cancelCollectionEdit(key) {
    if (editorIsDirty(key) && !window.confirm('현재 입력하거나 수정 중인 내용을 지울까요?')) return;
    resetCollectionEditor(key);
    renderCollection(key);
    setCollectionMessage(key, '입력 내용을 취소했어요. 저장된 항목은 변경되지 않았습니다.');
  }

  function deleteCollectionEntry(key, id) {
    const entry = state[key].find((item) => item.id === id);
    if (!entry) return;
    if (!window.confirm(`“${entry.title}” 항목을 이력서에서 삭제할까요?`)) return;
    state = { ...state, [key]: state[key].filter((item) => item.id !== id), updatedAt: new Date().toISOString() };
    if (editorModes[key].editingId === id) resetCollectionEditor(key);
    renderCollection(key);
    setCollectionMessage(key, `“${entry.title}” 항목을 삭제했어요. 이력서를 저장하면 반영됩니다.`);
    afterCollectionChange();
  }

  function importExperienceCard() {
    refreshExperienceLibrary();
    const source = experienceLibrary.find((item) => item.id === ui.librarySelect.value);
    if (!source) {
      setCollectionMessage('experience', '먼저 보관된 경험 카드를 선택해 주세요.', true);
      ui.librarySelect.focus();
      return;
    }
    const duplicate = state.experience.find((entry) => entry.libraryId === source.id);
    if (duplicate) {
      setCollectionMessage('experience', `“${source.name}” 카드는 이미 이력서에 추가되어 있어요. 기존 항목을 수정해 주세요.`, true);
      const existingCard = Array.from(document.querySelectorAll('#resumeExperienceList .resume-entry-card'))
        .find((card) => card.textContent.includes(source.name));
      if (existingCard) existingCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (state.experience.length >= maximumExperienceEntries) {
      setCollectionMessage('experience', `경력·프로젝트는 최대 ${maximumExperienceEntries}개까지 추가할 수 있어요.`, true);
      return;
    }
    if (editorIsDirty('experience') && !window.confirm('현재 작성 중인 경력·프로젝트 항목을 경험 카드 내용으로 바꿀까요?')) return;

    const description = [
      source.context ? `상황과 목표: ${source.context}` : '',
      source.actions ? `내가 한 행동: ${source.actions}` : '',
      source.outcome ? `결과 또는 배운 점: ${source.outcome}` : ''
    ].filter(Boolean).join('\n');
    fillCollectionEditor('experience', {
      title: source.name,
      organization: '',
      period: '',
      description,
      keywords: source.keywords
    }, { libraryId: source.id });
    setCollectionMessage('experience', '경험 카드 내용을 가져왔어요. 회사·기간과 표현을 확인하고 이력서 항목으로 추가해 주세요.');
    document.getElementById(collectionConfigs.experience.editorId).scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById(collectionConfigs.experience.titleId).focus({ preventScroll: true });
  }

  function validateForExport() {
    const record = getCurrentResume();
    const validation = validateResume(record);
    if (validation) {
      setFeedback(validation.message, true);
      validation.field.focus();
      return null;
    }
    renderPreview(record);
    return record;
  }

  function buildPlainText(record) {
    const lines = [record.profile.name];
    if (record.profile.headline) lines.push(record.profile.headline);
    const contacts = [record.profile.email, record.profile.phone, record.profile.location, record.profile.portfolio].filter(Boolean);
    if (contacts.length) lines.push(contacts.join(' | '));
    lines.push('');

    function addSection(title, contentLines) {
      if (!contentLines.length) return;
      lines.push(title, ...contentLines, '');
    }

    if (record.summary) addSection('프로필', [record.summary]);
    addSection('경력·프로젝트', record.experience.map((entry) => {
      const header = [entry.title, entry.organization, entry.period].filter(Boolean).join(' | ');
      return [header, entry.description, entry.keywords.length ? `키워드: ${entry.keywords.join(', ')}` : '']
        .filter(Boolean).join('\n');
    }));
    addSection('학력', record.education.map((entry) => [entry.title, entry.organization, entry.period, entry.description].filter(Boolean).join(' | ')));
    addSection('기술·역량', record.skills);
    addSection('자격·수상', record.certifications.map((entry) => [entry.title, entry.organization, entry.period, entry.description].filter(Boolean).join(' | ')));
    return lines.join('\n').trim();
  }

  function safeFileName(value) {
    return value.replace(/[\\/:*?"<>|%]+/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '').slice(0, 70) || 'plen_이력서';
  }

  function downloadResume() {
    const record = validateForExport();
    if (!record) return;
    const text = buildPlainText(record);
    const blob = new Blob([`\uFEFF${text}`], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${safeFileName(record.profile.name)}_이력서.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    setFeedback('현재 이력서 내용을 TXT 파일로 저장했어요.');
  }

  function printResume() {
    if (!validateForExport()) return;
    setFeedback('인쇄 창에서 프린터를 선택하거나 PDF로 저장할 수 있어요.');
    window.print();
  }

  function clearResume() {
    const current = getCurrentResume();
    const hasContent = Boolean(
      current.profile.name || current.profile.headline || current.profile.email || current.profile.phone ||
      current.profile.location || current.profile.portfolio || current.summary || current.skills.length ||
      current.experience.length || current.education.length || current.certifications.length
    );
    if (!hasContent && !hasSavedResume) {
      setFeedback('지울 이력서 내용이 없습니다.');
      return;
    }
    if (!window.confirm('현재 이력서 입력과 이 브라우저의 이력서 저장본을 삭제할까요? 지원 건과 경험 카드는 유지됩니다.')) return;
    window.clearTimeout(autosaveTimer);
    try {
      if (nativeStorage) localStorage.removeItem(storageKey);
    } catch (_error) {
      setFeedback('브라우저 저장본을 삭제하지 못했어요. 브라우저 설정에서 직접 삭제해 주세요.', true);
      return;
    }
    resetResumeForm();
    setFeedback('이력서 입력과 이 브라우저에 저장된 이력서를 삭제했어요. 지원 건과 경험 카드는 유지됩니다.');
  }

  function resetResumeForm() {
    window.clearTimeout(autosaveTimer);
    Object.values(profileFields).forEach((field) => { field.value = ''; });
    state = blankResume();
    hasSavedResume = false;
    lastPersistedFingerprint = '';
    Object.keys(collectionConfigs).forEach((key) => resetCollectionEditor(key));
    renderAllCollections();
    renderPreview(getCurrentResume());
    setSaveStatus(nativeStorage ? '아직 저장하지 않았어요. 이력서 저장 버튼을 눌러 보관하세요.' : '브라우저 저장소를 사용할 수 없습니다.', nativeStorage ? 'dirty' : 'error');
    setFeedback('');
    refreshExperienceLibrary();
  }

  function removeExperienceByLibraryId(id) {
    const remaining = state.experience.filter((entry) => entry.libraryId !== id);
    if (remaining.length === state.experience.length) return;
    state = { ...state, experience: remaining, updatedAt: new Date().toISOString() };
    if (editorModes.experience.pendingLibraryId === id) {
      editorModes.experience.pendingLibraryId = '';
      updateCollectionEditorMode('experience');
    }
    renderCollection('experience');
    setCollectionMessage('experience', '연결된 경험 카드가 삭제되어 이력서 항목에서도 제거했어요.');
    afterCollectionChange();
  }

  function onStorageChanged(event) {
    if (event.key !== storageKey) return;
    if (hasSavedResume && contentFingerprint(getCurrentResume()) !== lastPersistedFingerprint) {
      setFeedback('다른 탭에서 이력서 저장 내용이 바뀌었어요. 현재 탭의 수정 내용을 확인한 뒤 새로고침해 주세요.', true);
      return;
    }
    const loaded = readResume();
    state = loaded.record || blankResume();
    hasSavedResume = Boolean(loaded.record);
    lastPersistedFingerprint = hasSavedResume ? contentFingerprint(state) : '';
    fillProfile(state);
    renderAllCollections();
    renderPreview(getCurrentResume());
    setSaveStatus(hasSavedResume ? '다른 탭에서 저장한 이력서를 불러왔어요.' : '이 브라우저에 저장된 이력서가 없습니다.');
  }

  function fillProfile(record) {
    profileFields.name.value = record.profile.name;
    profileFields.headline.value = record.profile.headline;
    profileFields.email.value = record.profile.email;
    profileFields.phone.value = record.profile.phone;
    profileFields.location.value = record.profile.location;
    profileFields.portfolio.value = record.profile.portfolio;
    profileFields.summary.value = record.summary;
    profileFields.skills.value = record.skills.join(', ');
  }

  function initialize() {
    const loaded = readResume();
    if (loaded.record) {
      state = loaded.record;
      hasSavedResume = true;
      lastPersistedFingerprint = contentFingerprint(state);
      fillProfile(state);
      setSaveStatus(`저장된 이력서를 불러왔어요${formatResumeDate(state.updatedAt) ? ` · ${formatResumeDate(state.updatedAt)}` : ''}`);
    } else if (!nativeStorage) {
      setSaveStatus('브라우저 저장소를 사용할 수 없습니다.', 'error');
      setFeedback('이력서 작성과 미리보기는 가능하지만 이 브라우저에서는 저장할 수 없어요.', true);
    } else if (loaded.invalid) {
      setSaveStatus('저장 자료를 읽지 못했습니다.', 'error');
      setFeedback('기존 이력서 저장 자료가 손상되었거나 형식이 달라 불러오지 못했어요. 저장하기 전에 내용을 확인해 주세요.', true);
    } else {
      setSaveStatus('아직 저장하지 않았어요. 이력서 저장 버튼을 눌러 보관하세요.', 'dirty');
    }
    ui.saveButton.disabled = !nativeStorage;
    Object.keys(collectionConfigs).forEach((key) => {
      editorModes[key].baseline = editorSnapshot(key);
      updateCollectionEditorMode(key);
    });
    renderAllCollections();
    renderPreview(getCurrentResume());
    refreshExperienceLibrary();
  }

  Object.values(profileFields).forEach((field) => {
    field.addEventListener('input', () => {
      if (ui.feedback.classList.contains('is-error')) setFeedback('');
      scheduleAutosave();
    });
  });

  Object.keys(collectionConfigs).forEach((key) => {
    const config = collectionConfigs[key];
    document.getElementById(config.saveButtonId).addEventListener('click', () => saveCollectionEntry(key));
    document.getElementById(config.cancelButtonId).addEventListener('click', () => cancelCollectionEdit(key));
    document.getElementById(config.editorId).addEventListener('input', () => {
      const message = document.getElementById(config.messageId);
      if (message.classList.contains('is-error')) {
        setCollectionMessage(key, `내용을 확인한 뒤 ‘${editorModes[key].editingId ? '변경 내용 저장' : config.addLabel}’을 눌러 주세요.`);
      }
    });
  });

  ui.saveButton.addEventListener('click', saveResume);
  ui.printButton.addEventListener('click', printResume);
  ui.downloadButton.addEventListener('click', downloadResume);
  ui.clearButton.addEventListener('click', clearResume);
  ui.importButton.addEventListener('click', importExperienceCard);
  ui.librarySelect.addEventListener('focus', refreshExperienceLibrary);
  ui.librarySelect.addEventListener('click', refreshExperienceLibrary);
  ui.librarySelect.addEventListener('change', () => {
    if (ui.librarySelect.value) setCollectionMessage('experience', '선택한 경험 카드를 불러와 내용을 검토한 뒤 이력서에 추가할 수 있어요.');
  });
  window.addEventListener('storage', onStorageChanged);

  window.plenResume = {
    clearForm: resetResumeForm,
    removeExperienceByLibraryId,
    refreshExperienceLibrary
  };

  initialize();
})();
