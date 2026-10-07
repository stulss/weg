/* 사이트 헤더에 Google OAuth 로그인/회원가입 상태와 로그아웃을 연결합니다. */
(() => {
  'use strict';

  function mount() {
    const header = document.querySelector('.site-header .header-inner');
    const nav = header && header.querySelector('.header-nav');
    const store = window.plenSupabaseResumeStore;
    if (!header || !nav || !store) return;

    // index.html의 계정 UI를 사용하고, 다른 페이지에서는 필요한 경우 생성합니다.
    let controls = document.getElementById('plenAuthControls');
    if (!controls) {
      controls = document.createElement('div');
      controls.id = 'plenAuthControls';
      controls.className = 'plen-auth-controls';
      controls.setAttribute('aria-label', '계정');
      controls.innerHTML = `
        <button class="button button-secondary" id="plenGoogleSignIn" type="button">Google 로그인 / 회원가입</button>
        <span id="plenSignedInLabel" hidden></span>
        <button class="button button-quiet" id="plenGoogleSignOut" type="button" hidden>로그아웃</button>
        <span id="plenAuthStatus" class="visually-hidden" role="status" aria-live="polite"></span>`;
      nav.insertAdjacentElement('afterend', controls);
    }

    const signIn = controls.querySelector('#plenGoogleSignIn');
    const signOut = controls.querySelector('#plenGoogleSignOut');
    const label = controls.querySelector('#plenSignedInLabel');
    const status = controls.querySelector('#plenAuthStatus');
    if (!signIn || !signOut || !label || !status || signIn.dataset.authBound === 'true') return;
    signIn.dataset.authBound = 'true';

    function showUser(user) {
      const signedIn = Boolean(user);
      signIn.hidden = signedIn;
      signOut.hidden = !signedIn;
      label.hidden = !signedIn;
      label.textContent = signedIn ? `로그인: ${user.email || 'Google 계정'}` : '';
    }

    signIn.addEventListener('click', async () => {
      signIn.disabled = true;
      status.textContent = 'Google 로그인 페이지로 이동합니다. 처음 이용하면 자동으로 가입됩니다.';
      try {
        await store.signInWithGoogle();
      } catch (_error) {
        status.textContent = 'Google 로그인을 시작하지 못했습니다. Supabase Google Provider와 URL 설정을 확인해 주세요.';
        signIn.disabled = false;
      }
    });

    signOut.addEventListener('click', async () => {
      signOut.disabled = true;
      try {
        await store.signOut();
        status.textContent = '로그아웃했습니다.';
      } catch (_error) {
        status.textContent = '로그아웃하지 못했습니다. 네트워크를 확인해 주세요.';
      } finally {
        signOut.disabled = false;
      }
    });

    window.addEventListener('plen:supabase-auth-change', (event) => showUser(event.detail?.user || null));
    if (!store.configured) {
      signIn.disabled = true;
      status.textContent = 'Supabase Project URL과 공개 키 설정이 필요합니다.';
    } else {
      store.getUser().then(showUser).catch(() => {
        showUser(null);
        status.textContent = '로그인 상태를 확인하지 못했습니다.';
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
