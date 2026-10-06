(() => {
  'use strict';

  const STORAGE_KEY = 'plen-v2-draft';

  function init() {
    const workspace = document.getElementById('v2DraftWorkspace');
    if (!workspace || document.getElementById('v2DraftHistoryPanel')) return;
    const panel = document.createElement('section');
    panel.id = 'v2DraftHistoryPanel';
    panel.className = 'panel';
    panel.style.marginTop = '20px';
    panel.innerHTML = '<div class="panel-heading"><div><div class="panel-index"><span>HISTORY</span> SAVED DRAFTS</div><h3>저장한 초안 기록</h3><p>저장할 때마다 새 기록으로 추가되며 이전 기록은 덮어쓰지 않습니다.</p></div></div><div id="v2DraftHistoryList" style="display:grid;gap:10px"></div>';
    workspace.insertAdjacentElement('afterend', panel);
    const state = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (_error) { return {}; } })();
    const records = Array.isArray(state.drafts) ? state.drafts.slice().reverse() : [];
    const list = panel.querySelector('#v2DraftHistoryList');
    if (!records.length) {
      const empty = document.createElement('p'); empty.textContent = '저장된 자소서 초안이 없습니다.'; empty.style.color = '#64748b'; list.append(empty);
    } else {
      records.forEach((record) => {
        const article = document.createElement('article'); article.style.cssText = 'border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#fff';
        const title = document.createElement('strong'); title.textContent = `${record.question || '자기소개서 문항'} · ${record.createdAt ? new Date(record.createdAt).toLocaleString('ko-KR') : '저장 시간 미상'}`;
        const meta = document.createElement('p'); meta.textContent = `${String(record.finalText || '').length}자 · 경험 카드 ${Array.isArray(record.usedExpIds) ? record.usedExpIds.length : 0}개 · 직접 완성 ${record.userFinished ? '확인' : '미확인'}`; meta.style.cssText = 'margin:4px 0 8px;color:#64748b;font-size:12px';
        const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = '저장된 내용 보기'; const body = document.createElement('pre'); body.textContent = String(record.finalText || ''); body.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:13px'; details.append(summary, body); article.append(title, meta, details); list.append(article);
      });
    }
    window.plenDraftHistory = Object.freeze({ count: records.length });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
