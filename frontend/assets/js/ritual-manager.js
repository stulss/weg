'use strict';

(() => {
  const root = document.getElementById('ritualManager');
  if (!root) return;

  const core = window.plenRitualCore;
  if (!core) return;

  const storageKey = 'plen-workbench-v1';
  const maxStoredRecords = 2000;
  const maxPayloadCharacters = 1_500_000;
  const maxLinksPerRecord = 12;
  const maxImportPreviewRows = 200;

  const elements = {
    input: document.getElementById('ritualCsvFile'),
    readButton: document.getElementById('readRitualCsvButton'),
    clearInputButton: document.getElementById('clearRitualFileButton'),
    dateOrder: document.getElementById('ritualDateOrder'),
    status: document.getElementById('ritualImportStatus'),
    preview: document.getElementById('ritualImportPreview'),
    previewBody: document.getElementById('ritualImportPreviewBody'),
    previewSummary: document.getElementById('ritualImportPreviewSummary'),
    confirmButton: document.getElementById('confirmRitualImportButton'),
    discardButton: document.getElementById('discardRitualImportButton'),
    records: document.getElementById('ritualRecordList'),
    filterType: document.getElementById('ritualTypeFilter'),
    sortOrder: document.getElementById('ritualSortOrder'),
    count: document.getElementById('ritualRecordCount'),
    cardCount: document.getElementById('ritualCardCount'),
    streak: document.getElementById('ritualStreak'),
    morningDays: document.getElementById('ritualMorningDays'),
    closingDays: document.getElementById('ritualClosingDays'),
    earliest: document.getElementById('ritualEarliestDate'),
    latest: document.getElementById('ritualLatestDate'),
    clearButton: document.getElementById('clearRitualRecordsButton'),
    cardSelect: document.getElementById('ritualExperienceCardSelect'),
    linkButton: document.getElementById('linkRitualExperienceButton'),
    linkStatus: document.getElementById('ritualLinkStatus'),
    linkedCount: document.getElementById('ritualLinkedCount'),
    dateFilter: document.getElementById('ritualDateFilter'),
    dateFilterCount: document.getElementById('ritualDateFilterCount')
  };

  if (Object.values(elements).some((element) => !element)) return;

  const nativeStorage = (() => {
    try {
      const probe = `${storageKey}-ritual-probe`;
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch (_error) {
      return false;
    }
  })();

  let records = [];
  let links = {};
  let latestImport = null;
  let selectedDates = new Set();
  let datePicker = null;
  let generatedId = 0;

  function makeId(prefix = 'ritual') {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return `${prefix}-${window.crypto.randomUUID()}`;
    generatedId += 1;
    return `${prefix}-${Date.now().toString(36)}-${generatedId.toString(36)}`;
  }

  function setStatus(text, isError = false) {
    elements.status.textContent = text;
    elements.status.classList.toggle('is-error', Boolean(isError));
  }

  function setLinkStatus(text, isError = false) {
    elements.linkStatus.textContent = text;
    elements.linkStatus.classList.toggle('is-error', Boolean(isError));
  }

  function cleanString(value, limit = core.MAX_FIELD_CHARACTERS) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\u0000/g, '').slice(0, limit);
  }

  function validateLinkedTo(source) {
    if (!Array.isArray(source)) return [];
    const ids = [];
    source.forEach((id) => {
      if (typeof id === 'string' && id.length <= 120 && !ids.includes(id) && ids.length < maxLinksPerRecord) ids.push(id);
    });
    return ids;
  }

  function normalizeStoredRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return {
      id: typeof value.id === 'string' && value.id.length <= 140 ? value.id : makeId('ritual'),
      date: core.normalizeDate(cleanString(value.date, 80)),
      type: core.normalizeType(cleanString(value.type, 40)),
      prompt: cleanString(value.prompt, 5000),
      content: cleanString(value.content),
      linkedTo: validateLinkedTo(value.linkedTo),
      importedAt: typeof value.importedAt === 'string' && !Number.isNaN(Date.parse(value.importedAt))
        ? value.importedAt
        : new Date().toISOString()
    };
  }

  function readState() {
    if (!nativeStorage) return { experiences: [], applications: [], rituals: [], ritualLinks: {} };
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!parsed || parsed.version !== 1) return { experiences: [], applications: [], rituals: [], ritualLinks: {} };

      const experiences = Array.isArray(parsed.experiences)
        ? parsed.experiences.slice(0, 12)
          .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
          .map((item) => ({
            id: typeof item.id === 'string' && item.id.length <= 100 ? item.id : '',
            name: cleanString(item.name, 60).trim()
          }))
          .filter((item) => item.id && item.name)
        : [];
      const rituals = Array.isArray(parsed.rituals)
        ? parsed.rituals.slice(0, maxStoredRecords).map(normalizeStoredRecord).filter(Boolean)
        : [];
      const rawLinks = parsed.ritualLinks && typeof parsed.ritualLinks === 'object' && !Array.isArray(parsed.ritualLinks)
        ? parsed.ritualLinks
        : {};
      const ritualLinks = {};
      const recordIds = new Set(rituals.map((record) => record.id));
      Object.entries(rawLinks).slice(0, maxStoredRecords).forEach(([recordId, ids]) => {
        if (recordIds.has(recordId)) ritualLinks[recordId] = validateLinkedTo(ids);
      });
      rituals.forEach((record) => {
        if (ritualLinks[record.id]) record.linkedTo = ritualLinks[record.id];
        else if (record.linkedTo.length) ritualLinks[record.id] = record.linkedTo;
      });
      return {
        version: 1,
        experiences,
        applications: Array.isArray(parsed.applications) ? parsed.applications : [],
        rituals,
        ritualLinks
      };
    } catch (_error) {
      return { experiences: [], applications: [], rituals: [], ritualLinks: {} };
    }
  }

  function makeSafePayload(nextRecords, nextLinks, existingState) {
    const safeRecords = nextRecords.map(normalizeStoredRecord).filter(Boolean).slice(0, maxStoredRecords);
    const recordIds = new Set(safeRecords.map((record) => record.id));
    const experienceIds = new Set((existingState.experiences || []).map((experience) => experience.id));
    const safeLinks = {};
    Object.entries(nextLinks || {}).forEach(([id, linkedTo]) => {
      if (!recordIds.has(id)) return;
      const validIds = validateLinkedTo(linkedTo).filter((experienceId) => experienceIds.has(experienceId));
      if (validIds.length) safeLinks[id] = validIds;
    });
    safeRecords.forEach((record) => { record.linkedTo = safeLinks[record.id] || []; });
    return { ...existingState, version: 1, rituals: safeRecords, ritualLinks: safeLinks };
  }

  function persist(nextRecords = records, nextLinks = links) {
    if (!nativeStorage) {
      setStatus('브라우저 저장소를 사용할 수 없어 리추얼 기록을 보관할 수 없습니다.', true);
      return false;
    }
    try {
      // 최신 저장본에 병합해 경험 카드·지원 건의 동시 수정 사항을 덮어쓰지 않습니다.
      const current = readState();
      const payload = makeSafePayload(nextRecords, nextLinks, current);
      const serialized = JSON.stringify(payload);
      if (serialized.length > maxPayloadCharacters) {
        setStatus('저장 공간이 부족해 리추얼 기록을 저장하지 못했습니다. 오래된 기록이나 다른 저장 자료를 정리해 주세요.', true);
        return false;
      }
      localStorage.setItem(storageKey, serialized);
      records = payload.rituals;
      links = payload.ritualLinks;
      return true;
    } catch (_error) {
      setStatus('브라우저 저장 공간이 부족하거나 저장이 차단되어 있습니다.', true);
      return false;
    }
  }

  function safeDateLabel(value) {
    const normalized = core.normalizeDate(value);
    return normalized ? normalized.replace(/-/g, '.') : '날짜 미확인';
  }

  function getDuplicateSummary() {
    return latestImport ? latestImport.duplicateInFileCount + latestImport.duplicateExistingCount : 0;
  }

  function getExperienceName(id) {
    return readState().experiences.find((experience) => experience.id === id)?.name || '';
  }

  function filteredRecords() {
    const type = elements.filterType.value;
    const direction = elements.sortOrder.value;
    return records
      .filter((record) => type === 'all' || record.type === type)
      .filter((record) => !selectedDates.size || selectedDates.has(record.date))
      .slice()
      .sort((a, b) => {
        const order = (a.date || '0000-00-00').localeCompare(b.date || '0000-00-00') * (direction === 'asc' ? 1 : -1);
        return order || a.type.localeCompare(b.type, 'ko') || Date.parse(a.importedAt) - Date.parse(b.importedAt);
      });
  }

  function populateExperienceSelect() {
    const experiences = readState().experiences || [];
    const previous = elements.cardSelect.value;
    elements.cardSelect.replaceChildren();
    const prompt = document.createElement('option');
    prompt.value = '';
    prompt.textContent = experiences.length ? '연결할 경험 카드를 선택하세요' : '등록된 경험 카드가 없습니다';
    elements.cardSelect.append(prompt);
    experiences.forEach((experience) => {
      const option = document.createElement('option');
      option.value = experience.id;
      option.textContent = experience.name;
      elements.cardSelect.append(option);
    });
    elements.cardSelect.value = experiences.some((experience) => experience.id === previous) ? previous : '';
    elements.linkButton.disabled = !nativeStorage || !filteredRecords().length || experiences.length === 0;
  }

  function updateDateFilterLabel() {
    const dates = Array.from(selectedDates).sort();
    elements.dateFilter.querySelector('span').textContent = dates.length ? dates.map((date) => date.replace(/-/g, '.')).join(', ') : '전체 기간';
    elements.dateFilterCount.textContent = dates.length ? `${dates.length}일 선택` : '전체 기간';
  }

  function appendRecordField(parent, labelText, value) {
    if (!value) return;
    const row = document.createElement('div');
    row.className = 'ritual-record-field';
    const label = document.createElement('strong');
    label.textContent = labelText;
    const content = document.createElement('p');
    content.textContent = value;
    row.append(label, content);
    parent.append(row);
  }

  function renderStats() {
    const stats = core.calculateStats(records);
    const dates = records.map((record) => record.date).filter(Boolean).sort();
    elements.cardCount.textContent = `${records.length.toLocaleString('ko-KR')}건`;
    elements.streak.textContent = `${stats.longestStreak}일`;
    elements.morningDays.textContent = `${stats.morningDays}일`;
    elements.closingDays.textContent = `${stats.closingDays}일`;
    elements.earliest.textContent = dates.length ? safeDateLabel(dates[0]) : '—';
    elements.latest.textContent = dates.length ? safeDateLabel(dates[dates.length - 1]) : '—';
    elements.linkedCount.textContent = `${Object.values(links).reduce((sum, ids) => sum + ids.length, 0).toLocaleString('ko-KR')}개 연결`;
    const note = root.querySelector('#ritualStreakNote');
    if (note) note.textContent = stats.activeDays
      ? `날짜가 확인된 기록의 최장 연속 일수이며, 최근 기록까지는 ${stats.recentStreak}일입니다.`
      : '날짜가 확인된 기록만 반복 일수 계산에 포함합니다.';
    populateExperienceSelect();
    updateDateFilterLabel();
    if (datePicker && !datePicker.hidden) renderDatePicker(Number(datePicker.dataset.year), Number(datePicker.dataset.month) - 1);
  }

  function renderRecords() {
    const visible = filteredRecords();
    elements.records.replaceChildren();
    elements.count.textContent = records.length ? `${visible.length.toLocaleString('ko-KR')} / ${records.length.toLocaleString('ko-KR')}건 표시` : '0개 기록';

    if (!records.length || !visible.length) {
      const empty = document.createElement('p');
      empty.className = 'ritual-empty-state';
      empty.textContent = !records.length
        ? '아직 가져온 리추얼 기록이 없습니다. CSV를 읽고 미리보기에서 가져올 항목을 확인해 주세요.'
        : '선택한 날짜와 유형에 해당하는 기록이 없습니다. 필터를 바꿔 보세요.';
      elements.records.append(empty);
      renderStats();
      return;
    }

    visible.forEach((record) => {
      const article = document.createElement('article');
      article.className = 'ritual-record-card';
      const header = document.createElement('div');
      header.className = 'ritual-record-header';
      const title = document.createElement('h4');
      title.textContent = `${record.type} 리추얼`;
      const meta = document.createElement('div');
      meta.className = 'ritual-record-meta';
      const date = document.createElement('time');
      if (record.date) date.dateTime = record.date;
      date.textContent = safeDateLabel(record.date);
      meta.append(date);
      header.append(title, meta);
      article.append(header);
      appendRecordField(article, '문항', record.prompt);
      appendRecordField(article, '기록', record.content);

      const linked = validateLinkedTo(links[record.id] || record.linkedTo);
      const linkSummary = document.createElement('div');
      linkSummary.className = 'ritual-record-links';
      const linkLabel = document.createElement('span');
      linkLabel.textContent = linked.length ? `${linked.length}개 경험 카드 연결` : '연결된 경험 카드 없음';
      linkSummary.append(linkLabel);
      linked.forEach((id) => {
        const chip = document.createElement('span');
        chip.className = 'ritual-link-chip';
        chip.textContent = getExperienceName(id) || '삭제된 경험 카드';
        linkSummary.append(chip);
      });
      article.append(linkSummary);
      elements.records.append(article);
    });
    renderStats();
  }

  function updateImportPreviewSummary() {
    if (!latestImport) return;
    latestImport.selectedCount = latestImport.candidates.filter((candidate) => candidate.selected).length;
    latestImport.invalidDateCount = latestImport.candidates.filter((candidate) => candidate.invalidDate).length;
    latestImport.emptyCount = latestImport.candidates.filter((candidate) => !candidate.content.trim()).length;
    const previewCount = Math.min(latestImport.candidates.length, maxImportPreviewRows);
    const prefix = latestImport.candidates.length > previewCount ? `미리보기 ${previewCount} / ${latestImport.candidates.length}행 · ` : '';
    elements.previewSummary.textContent = `${prefix}${latestImport.selectedCount}건 선택 · 중복 ${getDuplicateSummary()}건 제외 · 날짜 확인 ${latestImport.invalidDateCount}건`;
    elements.confirmButton.disabled = !nativeStorage || latestImport.selectedCount === 0;
  }

  function renderImportPreview() {
    if (!latestImport) {
      elements.preview.hidden = true;
      elements.previewBody.replaceChildren();
      elements.previewSummary.textContent = '';
      elements.confirmButton.disabled = true;
      return;
    }
    elements.preview.hidden = false;
    elements.previewBody.replaceChildren();
    latestImport.candidates.slice(0, maxImportPreviewRows).forEach((candidate) => {
      const row = document.createElement('tr');
      row.className = candidate.invalidDate ? 'has-date-warning' : '';

      const selectCell = document.createElement('td');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = candidate.selected;
      checkbox.disabled = candidate.duplicateInFile || candidate.duplicateExisting || !candidate.content.trim();
      checkbox.setAttribute('aria-label', `${candidate.sourceRow}행 가져오기`);
      checkbox.addEventListener('change', () => {
        candidate.selected = checkbox.checked;
        updateImportPreviewSummary();
      });
      selectCell.append(checkbox);

      const dateCell = document.createElement('td');
      const dateInput = document.createElement('input');
      dateInput.type = 'date';
      dateInput.value = candidate.date;
      dateInput.className = 'ritual-preview-date';
      dateInput.setAttribute('aria-label', `${candidate.sourceRow}행 날짜 확인`);
      dateInput.addEventListener('change', () => {
        candidate.date = core.normalizeDate(dateInput.value);
        candidate.invalidDate = !candidate.date;
        candidate.warning = candidate.invalidDate ? '날짜를 확인하거나 미리보기에서 입력해 주세요' : '';
        row.classList.toggle('has-date-warning', candidate.invalidDate);
        warningCell.textContent = candidate.warning;
        updateImportPreviewSummary();
      });
      dateCell.append(dateInput);

      const typeCell = document.createElement('td');
      typeCell.textContent = candidate.type;
      const contentCell = document.createElement('td');
      const heading = candidate.prompt ? `${candidate.prompt}\n` : '';
      contentCell.textContent = `${heading}${candidate.content}`.slice(0, 1200) || candidate.warning || '내용 없음';
      contentCell.title = `${heading}${candidate.content}`;
      const warningCell = document.createElement('td');
      warningCell.textContent = candidate.warning || '';
      row.append(selectCell, dateCell, typeCell, contentCell, warningCell);
      elements.previewBody.append(row);
    });
    updateImportPreviewSummary();
  }

  function renderDatePicker(year, monthIndex) {
    const picker = datePicker || buildDatePicker();
    picker.dataset.year = String(year);
    picker.dataset.month = String(monthIndex + 1);
    picker.querySelector('.ritual-picker-title').textContent = `${year}년 ${monthIndex + 1}월`;
    const grid = picker.querySelector('.ritual-calendar-grid');
    grid.replaceChildren();
    ['일', '월', '화', '수', '목', '금', '토'].forEach((label) => {
      const heading = document.createElement('span');
      heading.className = 'ritual-calendar-weekday';
      heading.textContent = label;
      heading.setAttribute('role', 'columnheader');
      grid.append(heading);
    });
    const first = new Date(year, monthIndex, 1);
    const start = new Date(year, monthIndex, 1 - first.getDay());
    for (let index = 0; index < 42; index += 1) {
      const current = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const iso = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
      const hasRecords = records.some((record) => record.date === iso);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `ritual-calendar-day${current.getMonth() === monthIndex ? '' : ' is-outside'}${selectedDates.has(iso) ? ' is-selected' : ''}${hasRecords ? ' has-records' : ''}`;
      button.textContent = String(current.getDate());
      button.dataset.date = iso;
      button.setAttribute('role', 'gridcell');
      button.setAttribute('aria-pressed', selectedDates.has(iso) ? 'true' : 'false');
      button.setAttribute('aria-label', `${iso}${hasRecords ? ' 기록 있음' : ''}`);
      grid.append(button);
    }
    picker.hidden = false;
  }

  function buildDatePicker() {
    if (datePicker) return datePicker;
    datePicker = document.createElement('div');
    datePicker.className = 'ritual-date-picker';
    datePicker.id = 'ritualDatePicker';
    datePicker.setAttribute('role', 'dialog');
    datePicker.setAttribute('aria-label', '리추얼 날짜 선택');
    datePicker.hidden = true;
    datePicker.innerHTML = `
      <div class="ritual-picker-header">
        <button type="button" class="ritual-picker-nav" data-month-step="-1" aria-label="이전 달">‹</button>
        <strong class="ritual-picker-title"></strong>
        <button type="button" class="ritual-picker-nav" data-month-step="1" aria-label="다음 달">›</button>
      </div>
      <div class="ritual-calendar-grid" role="grid" aria-label="날짜 목록"></div>
      <div class="ritual-picker-footer"><button type="button" class="ritual-picker-clear">필터 해제</button><button type="button" class="ritual-picker-done">닫기</button></div>`;
    root.append(datePicker);
    datePicker.addEventListener('click', (event) => {
      const stepButton = event.target.closest('[data-month-step]');
      if (stepButton) {
        const next = new Date(Number(datePicker.dataset.year), Number(datePicker.dataset.month) - 1 + Number(stepButton.dataset.monthStep), 1);
        renderDatePicker(next.getFullYear(), next.getMonth());
        return;
      }
      const dayButton = event.target.closest('[data-date]');
      if (dayButton) {
        const iso = dayButton.dataset.date;
        if (selectedDates.has(iso)) selectedDates.delete(iso);
        else selectedDates.add(iso);
        renderDatePicker(Number(datePicker.dataset.year), Number(datePicker.dataset.month) - 1);
        renderRecords();
        return;
      }
      if (event.target.closest('.ritual-picker-clear')) {
        selectedDates.clear();
        renderDatePicker(Number(datePicker.dataset.year), Number(datePicker.dataset.month) - 1);
        renderRecords();
        return;
      }
      if (event.target.closest('.ritual-picker-done')) closeDatePicker();
    });
    document.addEventListener('pointerdown', (event) => {
      if (!datePicker || datePicker.hidden) return;
      if (!datePicker.contains(event.target) && !elements.dateFilter.contains(event.target)) closeDatePicker();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && datePicker && !datePicker.hidden) closeDatePicker();
    });
    return datePicker;
  }

  function openDatePicker() {
    const selected = Array.from(selectedDates).sort().at(-1);
    const current = selected ? new Date(`${selected}T00:00:00`) : new Date();
    renderDatePicker(current.getFullYear(), current.getMonth());
  }

  function closeDatePicker() {
    if (datePicker) datePicker.hidden = true;
  }

  function resetImport() {
    latestImport = null;
    elements.input.value = '';
    elements.preview.hidden = true;
    elements.previewBody.replaceChildren();
    elements.previewSummary.textContent = '';
    elements.confirmButton.disabled = true;
    elements.clearInputButton.disabled = true;
  }

  function readCsvFile() {
    const file = elements.input.files && elements.input.files[0];
    if (!file) {
      setStatus('먼저 CSV 파일을 선택해 주세요.', true);
      return;
    }
    if (file.size > core.MAX_CSV_CHARACTERS) {
      setStatus('CSV 파일은 5MB 이하만 가져올 수 있습니다.', true);
      return;
    }
    if (file.size === 0) {
      setStatus('선택한 파일이 비어 있습니다.', true);
      return;
    }
    if (!/\.csv$/i.test(file.name) && file.type && !/csv|plain|excel/i.test(file.type)) {
      setStatus('CSV 형식의 파일을 선택해 주세요.', true);
      return;
    }

    const reader = new FileReader();
    elements.readButton.disabled = true;
    setStatus(`${file.name}을(를) 브라우저 안에서 읽는 중…`);
    reader.onload = () => {
      try {
        const parsed = core.parseCsv(typeof reader.result === 'string' ? reader.result : '');
        const mapped = core.mapCsvRows(parsed, { slashOrder: elements.dateOrder.value || 'MDY' });
        const deduplicated = core.deduplicateRecords(mapped, records);
        latestImport = {
          candidates: deduplicated.candidates.map((candidate, index) => ({
            ...candidate,
            id: makeId('ritual-preview'),
            sourceRow: candidate.sourceRow || index + 2
          })),
          duplicateInFileCount: deduplicated.duplicateInFileCount,
          duplicateExistingCount: deduplicated.duplicateExistingCount
        };
        renderImportPreview();
        elements.clearInputButton.disabled = false;
        setStatus(`${file.name}: ${latestImport.candidates.length}행을 읽었습니다. 날짜와 가져올 기록을 확인해 주세요.`);
      } catch (error) {
        latestImport = null;
        renderImportPreview();
        setStatus(error instanceof Error ? error.message : 'CSV를 읽지 못했습니다. 파일 형식을 확인해 주세요.', true);
      } finally {
        elements.readButton.disabled = false;
      }
    };
    reader.onerror = () => {
      elements.readButton.disabled = false;
      setStatus('파일을 읽지 못했습니다. 다시 선택해 주세요.', true);
    };
    reader.readAsText(file, 'UTF-8');
  }

  function confirmImport() {
    if (!latestImport) return;
    const chosen = latestImport.candidates.filter((candidate) => candidate.selected && candidate.content.trim());
    if (!chosen.length) {
      setStatus('가져올 기록을 하나 이상 선택해 주세요.', true);
      return;
    }
    if (records.length + chosen.length > maxStoredRecords) {
      setStatus(`리추얼 기록은 최대 ${maxStoredRecords.toLocaleString('ko-KR')}건까지 보관할 수 있습니다. 오래된 기록을 정리해 주세요.`, true);
      return;
    }
    const fingerprints = new Set(records.filter((record) => record.content.trim()).map(core.fingerprintRecord));
    const accepted = [];
    let duplicateDuringConfirm = 0;
    chosen.forEach((candidate) => {
      const record = normalizeStoredRecord({
        id: makeId('ritual'), date: candidate.date, type: candidate.type, prompt: candidate.prompt,
        content: candidate.content, linkedTo: [], importedAt: new Date().toISOString()
      });
      const fingerprint = core.fingerprintRecord(record);
      if (fingerprints.has(fingerprint)) {
        duplicateDuringConfirm += 1;
        return;
      }
      fingerprints.add(fingerprint);
      accepted.push(record);
    });
    if (!accepted.length) {
      setStatus('새로 가져올 고유 기록이 없습니다. 기존 기록과 중복됩니다.');
      return;
    }
    const duplicateCount = getDuplicateSummary() + duplicateDuringConfirm;
    if (!persist([...records, ...accepted], links)) return;
    const importedCount = accepted.length;
    resetImport();
    renderRecords();
    setStatus(`${importedCount}건을 가져와 이 브라우저에 저장했습니다.${duplicateCount ? ` 중복 ${duplicateCount}건은 제외했습니다.` : ''}`);
  }

  function discardImport() {
    resetImport();
    setStatus('가져오기를 취소했습니다. 기존 기록은 그대로 보관되어 있습니다.');
  }

  function linkFilteredRecords() {
    const experienceId = elements.cardSelect.value;
    if (!experienceId) {
      setLinkStatus('먼저 연결할 경험 카드를 선택해 주세요.', true);
      return;
    }
    const experienceExists = readState().experiences.some((experience) => experience.id === experienceId);
    if (!experienceExists) {
      setLinkStatus('선택한 경험 카드를 찾지 못했습니다. 목록을 새로 확인해 주세요.', true);
      renderStats();
      return;
    }
    const selected = filteredRecords();
    if (!selected.length) {
      setLinkStatus('현재 필터에 해당하는 리추얼 기록이 없습니다.', true);
      return;
    }

    const nextLinks = { ...links };
    let added = 0;
    selected.forEach((record) => {
      const current = validateLinkedTo(nextLinks[record.id] || record.linkedTo);
      if (current.includes(experienceId) || current.length >= maxLinksPerRecord) return;
      nextLinks[record.id] = [...current, experienceId];
      added += 1;
    });
    if (!added) {
      setLinkStatus(`새로 연결할 수 있는 기록이 없습니다. 기록당 최대 ${maxLinksPerRecord}개 카드까지 연결할 수 있습니다.`, true);
      return;
    }
    if (!persist(records, nextLinks)) return;
    renderRecords();
    const name = elements.cardSelect.options[elements.cardSelect.selectedIndex]?.textContent || '경험 카드';
    setLinkStatus(`${selected.length}개 기록에 “${name}” 경험 카드를 연결했습니다. (새 연결 ${added}건)`);
  }

  function clearAllRituals() {
    if (!records.length) {
      setStatus('삭제할 리추얼 기록이 없습니다.');
      return;
    }
    if (!window.confirm('이 브라우저에 저장된 모든 리추얼 기록과 연결 정보를 삭제할까요? 경험 카드와 지원 건은 유지됩니다. 이 작업은 되돌릴 수 없습니다.')) return;
    if (!persist([], {})) return;
    selectedDates.clear();
    renderRecords();
    setStatus('리추얼 기록과 연결 정보를 삭제했습니다. 경험 카드와 지원 건은 유지됩니다.');
    setLinkStatus('리추얼 기록이 삭제되어 경험 카드 연결도 해제되었습니다.');
  }

  function quoteCsvField(value) {
    const text = cleanString(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function exportCsv() {
    const visible = filteredRecords();
    if (!visible.length) {
      setStatus('내보낼 리추얼 기록이 없습니다.');
      return;
    }
    const rows = [
      ['날짜', '리추얼 유형', '문항', '기록', '연결 경험 카드'],
      ...visible.map((record) => [
        record.date,
        record.type,
        record.prompt,
        record.content,
        validateLinkedTo(links[record.id] || record.linkedTo).map(getExperienceName).filter(Boolean).join(' | ')
      ])
    ];
    const blob = new Blob([`\uFEFF${rows.map((row) => row.map(quoteCsvField).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'plen_리추얼_기록.csv';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`${visible.length}건을 CSV로 내보냈습니다.`);
  }

  function buildDatePicker() {
    if (datePicker) return datePicker;
    datePicker = document.createElement('div');
    datePicker.className = 'ritual-date-picker';
    datePicker.id = 'ritualDatePicker';
    datePicker.setAttribute('role', 'dialog');
    datePicker.setAttribute('aria-label', '리추얼 날짜 선택');
    datePicker.hidden = true;
    datePicker.innerHTML = `
      <div class="ritual-picker-header">
        <button type="button" class="ritual-picker-nav" data-month-step="-1" aria-label="이전 달">‹</button>
        <strong class="ritual-picker-title"></strong>
        <button type="button" class="ritual-picker-nav" data-month-step="1" aria-label="다음 달">›</button>
      </div>
      <div class="ritual-calendar-grid" role="grid" aria-label="날짜 목록"></div>
      <div class="ritual-picker-footer"><button type="button" class="ritual-picker-clear">필터 해제</button><button type="button" class="ritual-picker-done">닫기</button></div>`;
    root.append(datePicker);
    datePicker.addEventListener('click', (event) => {
      const stepButton = event.target.closest('[data-month-step]');
      if (stepButton) {
        const next = new Date(Number(datePicker.dataset.year), Number(datePicker.dataset.month) - 1 + Number(stepButton.dataset.monthStep), 1);
        renderDatePicker(next.getFullYear(), next.getMonth());
        return;
      }
      const dayButton = event.target.closest('[data-date]');
      if (dayButton) {
        const iso = dayButton.dataset.date;
        if (selectedDates.has(iso)) selectedDates.delete(iso);
        else selectedDates.add(iso);
        renderDatePicker(Number(datePicker.dataset.year), Number(datePicker.dataset.month) - 1);
        renderRecords();
        return;
      }
      if (event.target.closest('.ritual-picker-clear')) {
        selectedDates.clear();
        renderDatePicker(Number(datePicker.dataset.year), Number(datePicker.dataset.month) - 1);
        renderRecords();
        return;
      }
      if (event.target.closest('.ritual-picker-done')) closeDatePicker();
    });
    document.addEventListener('pointerdown', (event) => {
      if (!datePicker || datePicker.hidden) return;
      if (!datePicker.contains(event.target) && !elements.dateFilter.contains(event.target)) closeDatePicker();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && datePicker && !datePicker.hidden) closeDatePicker();
    });
    return datePicker;
  }

  function renderDatePicker(year, monthIndex) {
    const picker = datePicker || buildDatePicker();
    picker.dataset.year = String(year);
    picker.dataset.month = String(monthIndex + 1);
    picker.querySelector('.ritual-picker-title').textContent = `${year}년 ${monthIndex + 1}월`;
    const grid = picker.querySelector('.ritual-calendar-grid');
    grid.replaceChildren();
    ['일', '월', '화', '수', '목', '금', '토'].forEach((label) => {
      const heading = document.createElement('span');
      heading.className = 'ritual-calendar-weekday';
      heading.textContent = label;
      heading.setAttribute('role', 'columnheader');
      grid.append(heading);
    });
    const first = new Date(year, monthIndex, 1);
    const start = new Date(year, monthIndex, 1 - first.getDay());
    for (let index = 0; index < 42; index += 1) {
      const current = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const iso = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
      const hasRecords = records.some((record) => record.date === iso);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `ritual-calendar-day${current.getMonth() === monthIndex ? '' : ' is-outside'}${selectedDates.has(iso) ? ' is-selected' : ''}${hasRecords ? ' has-records' : ''}`;
      button.textContent = String(current.getDate());
      button.dataset.date = iso;
      button.setAttribute('role', 'gridcell');
      button.setAttribute('aria-pressed', selectedDates.has(iso) ? 'true' : 'false');
      button.setAttribute('aria-label', `${iso}${hasRecords ? ' 기록 있음' : ''}`);
      grid.append(button);
    }
    picker.hidden = false;
  }

  function openDatePicker() {
    const selected = Array.from(selectedDates).sort().at(-1);
    const current = selected ? new Date(`${selected}T00:00:00`) : new Date();
    renderDatePicker(current.getFullYear(), current.getMonth());
  }

  function closeDatePicker() {
    if (datePicker) datePicker.hidden = true;
  }

  function refreshExperienceLinks() {
    const current = readState();
    const availableIds = new Set(current.experiences.map((experience) => experience.id));
    const nextLinks = {};
    let changed = false;
    Object.entries(links).forEach(([recordId, ids]) => {
      const validIds = ids.filter((id) => availableIds.has(id));
      if (validIds.length !== ids.length) changed = true;
      if (validIds.length) nextLinks[recordId] = validIds;
    });
    if (changed && persist(records, nextLinks)) links = nextLinks;
    else populateExperienceSelect();
    renderRecords();
  }

  function handleStorageChange(event) {
    if (event.key !== storageKey) return;
    const saved = readState();
    records = saved.rituals;
    links = saved.ritualLinks;
    renderRecords();
  }

  elements.readButton.addEventListener('click', readCsvFile);
  elements.clearInputButton.addEventListener('click', discardImport);
  elements.confirmButton.addEventListener('click', confirmImport);
  elements.discardButton.addEventListener('click', discardImport);
  elements.clearButton.addEventListener('click', clearAllRituals);
  elements.linkButton.addEventListener('click', linkFilteredRecords);
  elements.filterType.addEventListener('change', renderRecords);
  elements.sortOrder.addEventListener('change', renderRecords);
  elements.dateFilter.addEventListener('click', openDatePicker);
  elements.dateFilter.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openDatePicker();
    }
  });
  const exportButton = document.getElementById('exportRitualCsvButton');
  if (exportButton) exportButton.addEventListener('click', exportCsv);
  document.addEventListener('plen:experience-cards-updated', refreshExperienceLinks);
  window.addEventListener('storage', handleStorageChange);

  const saved = readState();
  records = saved.rituals;
  links = saved.ritualLinks;
  if (!nativeStorage) setStatus('브라우저 저장소를 사용할 수 없어 CSV 기록을 보관할 수 없습니다.', true);
  renderRecords();
  setLinkStatus(records.length ? '유형·날짜 필터에 표시된 기록을 경험 카드에 연결할 수 있습니다.' : '경험 카드를 등록한 뒤 리추얼 기록을 연결할 수 있습니다.');
})();
