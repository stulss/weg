/* 작업공간 클라우드 동기화 상태를 화면 배너에 표시합니다. */
(() => {
  'use strict';

  window.addEventListener('plen:workspace-sync-status', (event) => {
    const detail = event.detail || {};
    const banner = document.getElementById('plenWorkspaceSyncBanner');
    if (!banner) return;

    banner.dataset.kind = detail.kind || 'info';
    const text = banner.querySelector('.sync-text') || banner;
    text.textContent = detail.message || '';
  });
})();
