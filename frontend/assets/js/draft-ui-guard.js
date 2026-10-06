(() => {
  'use strict';

  const KEY = 'plen-v2-draft';
  const LABEL = '(기록 없음 — 채운 부분)';
  const workflow = window.plenDraftWorkflowCore;
  const core = window.plenCareerCore;
  if (!workflow || !core) return console.error('Draft UI requires workflow and career core scripts.');
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_error) { return {}; } };
  const save = (state) => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_error) { /* UI generation reports storage limitations elsewhere. */ } };
  const selectedIds = () => Array.from(document.querySelectorAll('#v2DraftCardSelector input[name="draftExpCard"]:checked')).map((input) => input.value);
  function invalidate() { const state = read(); state.factSheetConfirmed = false; save(state); }
  function confirmSheet() {
    const state = read(), ids = selectedIds();
    const validation = workflow.validateFactSheet(state.factSheet, ids);
    const covered = ids.length > 0 && ids.every((id) => (state.factSheet || []).some((item) => item.expId === id));
    if (!validation.ok || !covered) return { ok: false, errors: [...validation.errors, ...(!covered ? ['선택한 각 경험 카드에 팩트 문장이 필요합니다.'] : [])] };
    state.factSheetConfirmed = true; save(state); return { ok: true };
  }
  document.addEventListener('DOMContentLoaded', () => {
    const spans = document.querySelectorAll('#v2MainApp .version-banner span');
    if (spans[0]) spans[0].textContent = '📌 plan.md · v2 — 초안 연결됨 · 실행 검증은 남아 있습니다';
    if (spans[1]) spans[1].textContent = '규칙 기반 초안입니다. 제출 전 선택한 경험 카드와 원문을 직접 대조하세요.';
  }, { once: true });
  document.addEventListener('change', (event) => {
    if (event.target.matches('#v2DraftCardSelector input[name="draftExpCard"]')) invalidate();
  });
  document.addEventListener('input', (event) => {
    if (event.target.matches('#v2FactSheetList .fact-text-edit')) invalidate();
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest('#btnGenerateFactSheet, #v2FactSheetList [data-delete-fact]')) setTimeout(invalidate, 0);
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest('#btnConfirmFactSheet')) {
      const result = confirmSheet();
      if (!result.ok) { event.preventDefault(); event.stopImmediatePropagation(); alert(`팩트 시트 확인 실패: ${result.errors.join(' ')}`); }
      return;
    }
    if (event.target.closest('#btnGenerateDraft')) {
      const state = read(), ids = selectedIds();
      const validation = workflow.validateFactSheet(state.factSheet, ids);
      const covered = ids.length > 0 && ids.every((id) => (state.factSheet || []).some((item) => item.expId === id));
      if (!state.factSheetConfirmed || !validation.ok || !covered) {
        event.preventDefault(); event.stopImmediatePropagation();
        alert('선택된 모든 경험 카드의 팩트 시트를 검토하고 확인 완료를 눌러 주세요.');
      }
      return;
    }
    if (!event.target.closest('#btnSaveFinalDraft')) return;
    const state = read();
    const text = document.getElementById('v2FinalText')?.value || '';
    const cards = (() => { try { const all = JSON.parse(localStorage.getItem('plen-v2-experiences') || '[]'); return Array.isArray(all) ? all.filter((item) => selectedIds().includes(item.id)) : []; } catch (_error) { return []; } })();
    const report = core.inspectDraft(text, { cards, factSheet: state.factSheet || [], keywords: state.keywords || [], limit: Number(state.limit) || 700, aiDraft: state.aiDraft || '', userFinished: document.getElementById('v2UserFinishedCheckbox')?.checked === true });
    const markResult = report.results.find((item) => item.ruleId === 'filledMark');
    if (!report.canSave) {
      event.preventDefault(); event.stopImmediatePropagation();
      alert(`저장하지 않았습니다. 채운 문장 수에 맞게 “${LABEL}” 표기를 유지해 주세요. ${markResult ? markResult.detail : ''}`);
      return;
    }
    if (!state.factSheetConfirmed) {
      event.preventDefault(); event.stopImmediatePropagation(); alert('팩트 시트를 먼저 확인해 주세요.'); return;
    }
    if (!document.getElementById('v2UserFinishedCheckbox')?.checked || !state.aiDraft || text.trim() === state.aiDraft.trim()) {
      event.preventDefault(); event.stopImmediatePropagation(); alert('자동 초안을 직접 수정하고 “내가 완성함”을 체크해 주세요.');
    }
  }, true);
})();
