(() => {
  'use strict';

  const root = document.getElementById('essayQuestions');
  const form = document.getElementById('questionEditorForm');
  const promptField = document.getElementById('questionPrompt');
  const characterLimitField = document.getElementById('questionCharacterLimit');
  const editorTitle = document.getElementById('questionEditorTitle');
  const saveButton = document.getElementById('saveQuestionButton');
  const cancelButton = document.getElementById('cancelQuestionEditButton');
  const count = document.getElementById('questionCount');
  const promptCount = document.getElementById('questionPromptCount');
  const list = document.getElementById('questionList');
  const message = document.getElementById('questionManagerMessage');

  if (!root || !form || !promptField || !characterLimitField || !editorTitle || !saveButton || !cancelButton || !count || !promptCount || !list || !message) return;

  const maximumQuestions = 10;
  const maximumPromptCharacters = 2000;
  const maximumAnswerCharacters = 10000;
  let questions = [];
  let editingId = null;
  let editorBaseline = '';
  let locked = false;

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `plen-question-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeQuestion(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    const prompt = typeof record.prompt === 'string' ? record.prompt.trim().slice(0, maximumPromptCharacters) : '';
    if (!prompt) return null;
    const limit = Number.isInteger(record.maxCharacters) && record.maxCharacters >= 1 && record.maxCharacters <= maximumAnswerCharacters
      ? record.maxCharacters
      : null;
    return {
      id: typeof record.id === 'string' && record.id.length <= 100 ? record.id : makeId(),
      prompt,
      maxCharacters: limit
    };
  }

  function normalizeQuestions(records) {
    if (!Array.isArray(records)) return [];
    return records.map(normalizeQuestion).filter(Boolean).slice(0, maximumQuestions);
  }

  function editorSnapshot() {
    return JSON.stringify({
      prompt: promptField.value.trim(),
      maxCharacters: characterLimitField.value.trim()
    });
  }

  function hasUncommittedEdits() {
    return editorSnapshot() !== editorBaseline;
  }

  function setMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle('is-error', Boolean(isError));
  }

  function updatePromptCount() {
    promptCount.textContent = `${promptField.value.length.toLocaleString('ko-KR')} / ${maximumPromptCharacters.toLocaleString('ko-KR')}자`;
  }

  function updateEditorControls() {
    const isEditing = Boolean(editingId);
    editorTitle.textContent = isEditing ? '문항 수정' : '새 문항 등록';
    saveButton.textContent = isEditing ? '변경 내용 저장' : '문항 추가';
    cancelButton.hidden = !isEditing;
    saveButton.disabled = locked || (!isEditing && questions.length >= maximumQuestions);
    promptField.disabled = locked;
    characterLimitField.disabled = locked;
    cancelButton.disabled = locked;
  }

  function createActionButton(label, className, ariaLabel, callback, disabled = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.setAttribute('aria-label', ariaLabel);
    button.disabled = locked || disabled;
    button.addEventListener('click', callback);
    return button;
  }

  function renderQuestions() {
    list.replaceChildren();
    count.textContent = `${questions.length} / ${maximumQuestions}개`;

    if (!questions.length) {
      const empty = document.createElement('p');
      empty.className = 'question-list-empty';
      empty.textContent = '아직 등록한 문항이 없습니다. 지원서 문항 원문과 글자 수 제한을 입력해 보세요.';
      list.append(empty);
      updateEditorControls();
      return;
    }

    questions.forEach((question, index) => {
      const card = document.createElement('article');
      card.className = `question-card${question.id === editingId ? ' is-editing' : ''}`;
      card.setAttribute('role', 'listitem');

      const header = document.createElement('div');
      header.className = 'question-card-header';
      const label = document.createElement('h4');
      label.textContent = `문항 ${index + 1}`;
      const limit = document.createElement('span');
      limit.className = 'question-card-limit';
      limit.textContent = question.maxCharacters ? `최대 ${question.maxCharacters.toLocaleString('ko-KR')}자` : '글자 수 제한 미입력';
      header.append(label, limit);

      const body = document.createElement('p');
      body.className = 'question-card-prompt';
      body.textContent = question.prompt;

      const actions = document.createElement('div');
      actions.className = 'question-card-actions';
      const edit = createActionButton('수정', 'button button-small button-secondary', `문항 ${index + 1} 수정`, () => editQuestion(question.id));
      edit.disabled = locked || question.id === editingId;
      const moveUp = createActionButton('↑', 'button button-small button-outline question-order-button', `문항 ${index + 1} 위로 이동`, () => moveQuestion(index, -1), index === 0);
      const moveDown = createActionButton('↓', 'button button-small button-outline question-order-button', `문항 ${index + 1} 아래로 이동`, () => moveQuestion(index, 1), index === questions.length - 1);
      const remove = createActionButton('삭제', 'button button-small button-delete', `문항 ${index + 1} 삭제`, () => deleteQuestion(question.id));
      actions.append(edit, moveUp, moveDown, remove);
      card.append(header, body, actions);
      list.append(card);
    });

    updateEditorControls();
  }

  function resetEditor() {
    form.reset();
    promptField.value = '';
    characterLimitField.value = '';
    editingId = null;
    editorBaseline = editorSnapshot();
    updatePromptCount();
    updateEditorControls();
  }

  function emitChange() {
    document.dispatchEvent(new CustomEvent('plen:questions-change', {
      detail: { questions: questions.map((question) => ({ ...question })) }
    }));
  }

  function readCharacterLimit() {
    const raw = characterLimitField.value.trim();
    if (!raw) return { ok: true, value: null };
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > maximumAnswerCharacters) {
      return { ok: false, value: null };
    }
    return { ok: true, value };
  }

  function saveQuestion(event) {
    event.preventDefault();
    if (locked) return;

    const prompt = promptField.value.trim();
    if (!prompt) {
      setMessage('자기소개서 문항 원문을 입력해 주세요.', true);
      promptField.focus();
      return;
    }

    const characterLimit = readCharacterLimit();
    if (!characterLimit.ok) {
      setMessage(`글자 수 제한은 1~${maximumAnswerCharacters.toLocaleString('ko-KR')} 사이의 정수로 입력해 주세요.`, true);
      characterLimitField.focus();
      return;
    }

    const existingIndex = questions.findIndex((question) => question.id === editingId);
    if (editingId && existingIndex < 0) {
      resetEditor();
      setMessage('수정하려는 문항을 찾을 수 없습니다. 목록을 확인한 뒤 다시 시도해 주세요.', true);
      renderQuestions();
      return;
    }
    if (existingIndex < 0 && questions.length >= maximumQuestions) {
      setMessage(`문항은 지원 건마다 최대 ${maximumQuestions}개까지 등록할 수 있습니다.`, true);
      return;
    }

    const current = existingIndex >= 0 ? questions[existingIndex] : null;
    const record = {
      id: current ? current.id : makeId(),
      prompt,
      maxCharacters: characterLimit.value
    };
    questions = existingIndex >= 0
      ? questions.map((question, index) => index === existingIndex ? record : question)
      : [...questions, record];

    resetEditor();
    renderQuestions();
    setMessage(`문항을 ${current ? '수정' : '추가'}했어요. 저장된 지원 건은 변경 내용이 자동 저장됩니다.`);
    emitChange();
  }

  function editQuestion(id) {
    const question = questions.find((entry) => entry.id === id);
    if (!question || id === editingId || locked) return;
    if (hasUncommittedEdits() && !window.confirm('작성 중인 문항 내용이 사라질 수 있습니다. 선택한 문항을 수정할까요?')) return;

    editingId = id;
    promptField.value = question.prompt;
    characterLimitField.value = question.maxCharacters ? String(question.maxCharacters) : '';
    editorBaseline = editorSnapshot();
    updatePromptCount();
    renderQuestions();
    setMessage(`문항 ${questions.indexOf(question) + 1}을 수정하고 있습니다. 변경 내용은 저장 버튼을 눌러 반영해 주세요.`);
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    promptField.focus({ preventScroll: true });
  }

  function cancelEdit() {
    if (!editingId) return;
    if (hasUncommittedEdits() && !window.confirm('작성 중인 문항 변경 내용을 버릴까요?')) return;
    resetEditor();
    renderQuestions();
    setMessage('문항 수정을 취소했어요. 저장된 문항은 변경되지 않았습니다.');
  }

  function deleteQuestion(id) {
    if (locked) return;
    const index = questions.findIndex((question) => question.id === id);
    if (index < 0) return;
    if (!window.confirm(`문항 ${index + 1}을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;

    const [removed] = questions.splice(index, 1);
    if (editingId === id) resetEditor();
    renderQuestions();
    setMessage('문항을 삭제했어요. 저장된 지원 건은 변경 내용이 자동 저장됩니다.');
    emitChange();
  }

  function moveQuestion(index, offset) {
    if (locked) return;
    const target = index + offset;
    if (target < 0 || target >= questions.length) return;
    [questions[index], questions[target]] = [questions[target], questions[index]];
    renderQuestions();
    setMessage('문항 순서를 변경했어요. 저장된 지원 건은 변경 내용이 자동 저장됩니다.');
    emitChange();
  }

  form.addEventListener('submit', saveQuestion);
  cancelButton.addEventListener('click', cancelEdit);
  form.addEventListener('input', () => {
    updatePromptCount();
    if (message.classList.contains('is-error')) {
      setMessage(editingId ? '변경 내용을 확인한 뒤 ‘변경 내용 저장’을 눌러 주세요.' : '문항 원문과 글자 수 제한을 확인한 뒤 문항을 추가해 주세요.');
    }
  });

  window.plenQuestionManager = {
    getQuestions: () => questions.map((question) => ({ ...question })),
    setQuestions(records) {
      questions = normalizeQuestions(records);
      resetEditor();
      renderQuestions();
      setMessage(questions.length ? '저장된 문항을 불러왔어요.' : '현재 지원 건에 등록된 문항이 없습니다.');
    },
    setLocked(value) {
      locked = Boolean(value);
      updateEditorControls();
      renderQuestions();
      root.classList.toggle('is-locked', locked);
    },
    hasUncommittedEdits,
    hasAnyContent: () => questions.length > 0 || hasUncommittedEdits() || Boolean(editingId),
    focusPrompt: () => promptField.focus()
  };

  updatePromptCount();
  editorBaseline = editorSnapshot();
  renderQuestions();
  setMessage('문항 원문을 등록하면 현재 지원 건에 보관됩니다.');
})();
