(() => {
  'use strict';

  const form = document.getElementById('writerForm');
  const resultContent = document.getElementById('resultContent');
  const resultPanel = document.getElementById('resultPanel');
  const draftOutput = document.getElementById('draftOutput');
  const copyButton = document.getElementById('copyDraftButton');
  const downloadButton = document.getElementById('downloadDraftButton');
  const feedback = document.getElementById('draftFeedback');
  const sampleBanner = document.getElementById('sampleBanner');

  if (!form || !resultContent || !resultPanel || !draftOutput || !copyButton || !downloadButton || !feedback) return;

  let lastGeneratedDraft = '';

  function fieldValue(id) {
    const field = document.getElementById(id);
    return field ? field.value.trim() : '';
  }

  function makeDraft() {
    const company = fieldValue('companyName');
    const role = fieldValue('targetRole');
    const context = fieldValue('experienceContext');
    const actions = fieldValue('experienceActions');
    const outcome = fieldValue('experienceOutcome');
    const keywords = Array.from(document.querySelectorAll('#keywordChips .keyword-label'))
      .map((element) => element.textContent.trim())
      .filter(Boolean)
      .slice(0, 4);
    const companyText = company || '[지원 회사명]';
    const roleText = role || '[지원 직무]';
    const keywordText = keywords.length ? keywords.join(' · ') : '[공고에서 중요하다고 판단한 키워드]';

    return [
      `${companyText} ${roleText} 지원 자기소개서 초안`,
      '',
      '[지원 동기]',
      `[${companyText}의 제품·서비스 또는 사업에 관심을 갖게 된 구체적인 계기와 이유를 본인의 사실로 작성하세요.]`,
      `공고에서 확인한 키워드(${keywordText}) 중 실제로 연결할 수 있는 경험을 골라, 그 이유를 설명하세요.`,
      '',
      '[관련 경험]',
      `상황과 목표: ${context || '[어떤 상황에서 무엇을 해결하려 했는지 실제 사실을 입력하세요.]'}`,
      `내가 한 행동: ${actions || '[팀의 성과와 구분해 본인이 맡고 실행한 행동을 입력하세요.]'}`,
      `결과 또는 배운 점: ${outcome || '[확인 가능한 결과나 배운 점을 입력하세요. 확인되지 않은 수치나 성과는 만들지 마세요.]'}`,
      '',
      '[직무와의 연결]',
      `위 경험에서 얻은 배움이 ${roleText}의 어떤 업무와 연결되는지, 입사 후 어떻게 적용할지 구체적으로 작성하세요.`,
      '[공고 원문과 본인의 실제 경험을 대조하고, 근거가 부족한 문장은 수정하거나 삭제하세요.]'
    ].join('\n');
  }

  function update({ force = false } = {}) {
    if (resultContent.hidden || resultPanel.dataset.stale === 'true') return;
    const nextDraft = makeDraft();
    if (!force && draftOutput.value !== lastGeneratedDraft) {
      feedback.textContent = '직접 수정한 초안을 유지했어요. 새 입력으로 바꾸려면 초안을 먼저 지우거나 초기화해 주세요.';
      return;
    }
    lastGeneratedDraft = nextDraft;
    draftOutput.value = nextDraft;
    copyButton.disabled = false;
    downloadButton.disabled = false;
    feedback.textContent = '기본 초안입니다. 직접 수정하고 사실과 근거를 확인해 주세요.';
  }

  function clear() {
    lastGeneratedDraft = '';
    draftOutput.value = '';
    copyButton.disabled = true;
    downloadButton.disabled = true;
    feedback.textContent = '';
  }

  function exportDraft() {
    const draft = draftOutput.value.trim();
    if (!draft) return '';
    if (resultPanel.dataset.stale === 'true') {
      feedback.textContent = '입력 내용이 바뀌어 초안이 최신 상태가 아니에요. 채용공고 키워드를 다시 추출해 주세요.';
      return '';
    }
    return sampleBanner && !sampleBanner.hidden
      ? `[가상 예시 — 실제 지원 자료로 사용하지 마세요.]\n\n${draft}`
      : draft;
  }

  async function copy() {
    const text = exportDraft();
    if (!text) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const temporaryField = document.createElement('textarea');
        temporaryField.value = text;
        temporaryField.setAttribute('readonly', '');
        temporaryField.style.position = 'fixed';
        temporaryField.style.opacity = '0';
        temporaryField.style.pointerEvents = 'none';
        document.body.append(temporaryField);
        temporaryField.select();
        const copied = document.execCommand('copy');
        temporaryField.remove();
        if (!copied) throw new Error('copy-not-available');
      }
      feedback.textContent = sampleBanner && !sampleBanner.hidden
        ? '가상 예시라는 경고를 포함해 초안을 복사했어요.'
        : '현재 초안을 복사했어요.';
    } catch (_error) {
      feedback.textContent = '자동 복사를 사용할 수 없어요. 초안 텍스트를 직접 선택하거나 TXT 저장을 이용해 주세요.';
    }
  }

  function download() {
    const text = exportDraft();
    if (!text) return;
    const names = [fieldValue('companyName'), fieldValue('targetRole')].filter(Boolean).join('_') || 'plen_자기소개서_초안';
    const safeName = names.replace(/[\\/:*?"<>|%]+/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 70) || 'plen_자기소개서_초안';
    const file = new Blob([`\uFEFF${text}`], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${safeName}_초안.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    feedback.textContent = sampleBanner && !sampleBanner.hidden
      ? '가상 예시라는 경고를 포함해 초안을 TXT 파일로 저장했어요.'
      : '초안을 TXT 파일로 저장했어요.';
  }

  window.plenDraft = { update, clear };
  copyButton.addEventListener('click', copy);
  downloadButton.addEventListener('click', download);
})();
