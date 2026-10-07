/* 이력서 화면에 Google OAuth 로그인·회원가입 및 Supabase 동기화 UI를 추가합니다. */
(() => {
  'use strict';

  const resumeKey = 'plen-resume-v1';
  const maximumPayloadCharacters = 500_000;

  function waitForStore() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', waitForStore, { once: true });
      return;
    }
    const editor = document.querySelector('#resumeBuilder .resume-editor');
    if (!editor) return;
    if (!window.plenSupabaseResumeStore) {
      window.setTimeout(waitForStore, 100);
      return;
    }
    mount(editor, window.plenSupabaseResumeStore);
  }

  function mount(editor, store) {
    if (document.getElementById('resumeCloudPanel')) return;

    const panel = document.createElement('section');
    panel.id = 'resumeCloudPanel';
    panel.setAttribute('aria-labelledby', 'resumeCloudTitle');
    panel.innerHTML = `
      <div class="resume-cloud-copy">
        <h4 id="resumeCloudTitle">Google 로그인 · 클라우드 저장</h4>
        <p>Google 계정으로 로그인하거나 처음 가입할 수 있습니다. 이력서만 로그인한 계정의 Supabase에 저장합니다. 경험 카드·리추얼·지원 자료는 현재처럼 이 브라우저에 저장됩니다.</p>
      </div>
      <div class="resume-cloud-controls" id="resumeCloudSignInControls">
        <button class="button button-secondary" id="resumeCloudGoogleSignIn" type="button">
          <span aria-hidden="true">G</span> Google 계정으로 로그인 / 회원가입
        </button>
      </div>
      <div class="resume-cloud-controls" id="resumeCloudAccountControls" hidden>
        <span id="resumeCloudUser"></span>
        <button class="button button-secondary" id="resumeCloudLoad" type="button">클라우드에서 불러오기</button>
        <button class="button button-primary" id="resumeCloudSave" type="button">현재 이력서를 클라우드에 저장</button>
        <button class="button button-outline" id="resumeCloudSignOut" type="button">로그아웃</button>
      </div>
      <p id="resumeCloudStatus" role="status" aria-live="polite"></p>`;
    const heading = editor.querySelector('.resume-editor-heading');
    if (heading) heading.insertAdjacentElement('afterend', panel);
    else editor.prepend(panel);

    const status = panel.querySelector('#resumeCloudStatus');
    const signInControls = panel.querySelector('#resumeCloudSignInControls');
    const accountControls = panel.querySelector('#resumeCloudAccountControls');
    const signInButton = panel.querySelector('#resumeCloudGoogleSignIn');
    const loadButton = panel.querySelector('#resumeCloudLoad');
    const saveButton = panel.querySelector('#resumeCloudSave');
    const signOutButton = panel.querySelector('#resumeCloudSignOut');

    function setStatus(message, kind = '') {
      status.textContent = message;
      status.classList.toggle('is-error', kind === 'error');
      status.classList.toggle('is-success', kind === 'success');
    }

    function setBusy(busy) {
      [signInButton, loadButton, saveButton, signOutButton].forEach((button) => { button.disabled = busy; });
    }

    function showAccount(user) {
      const signedIn = Boolean(user);
      signInControls.hidden = signedIn;
      accountControls.hidden = !signedIn;
      panel.querySelector('#resumeCloudUser').textContent = signedIn
        ? `Google 로그인됨: ${user.email || '계정'}`
        : '';
      if (!signedIn && store.configured) {
        setStatus('Google 계정으로 로그인하면 이력서를 계정에 저장하고 다른 기기에서 불러올 수 있습니다.');
      }
    }

    async function refreshAccount() {
      if (!store.configured) {
        showAccount(null);
        signInButton.disabled = true;
        setStatus('Supabase 설정이 아직 비어 있습니다. 설정 문서대로 Project URL과 anon/publishable key를 입력해 주세요.', 'error');
        return;
      }
      try {
        const user = await store.getUser();
        showAccount(user);
      } catch (_error) {
        showAccount(null);
        setStatus('Supabase 로그인 상태를 확인하지 못했습니다. 네트워크와 프로젝트 설정을 확인해 주세요.', 'error');
      }
    }

    signInButton.addEventListener('click', async () => {
      setBusy(true);
      setStatus('Google 로그인 페이지로 이동합니다. 처음 이용하는 계정은 로그인 후 자동으로 가입됩니다.');
      try {
        await store.signInWithGoogle();
      } catch (_error) {
        setStatus('Google 로그인을 시작하지 못했습니다. Supabase Google Provider와 허용 URL 설정을 확인해 주세요.', 'error');
        setBusy(false);
      }
    });

    saveButton.addEventListener('click', async () => {
      const name = document.getElementById('resumeName');
      const email = document.getElementById('resumeEmail');
      const nativeSave = document.getElementById('saveResumeButton');
      if (!name || !name.value.trim()) {
        setStatus('이력서 이름을 입력한 뒤 저장해 주세요.', 'error');
        name?.focus();
        return;
      }
      if (email && email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        setStatus('이력서 이메일 주소를 확인해 주세요.', 'error');
        email.focus();
        return;
      }
      if (!nativeSave || nativeSave.disabled) {
        setStatus('브라우저 저장소를 사용할 수 없어 현재 작성기에서 이력서를 검증·저장할 수 없습니다.', 'error');
        return;
      }
      setBusy(true);
      try {
        // 기존 작성기 검증이 먼저 통과해야만, 정리된 이력서 JSON을 원격으로 저장합니다.
        nativeSave.click();
        const raw = localStorage.getItem(resumeKey);
        if (!raw || raw.length > maximumPayloadCharacters) throw new Error('local-resume-unavailable');
        const resume = JSON.parse(raw);
        if (!resume || resume.version !== 1 || !resume.profile || resume.profile.name !== name.value.trim()) {
          throw new Error('resume-validation-failed');
        }
        const result = await store.saveResume(resume);
        if (!result || !result.saved) throw new Error('not-saved');
        setStatus('이력서를 Supabase에 저장했습니다. RLS 정책에 따라 본인 계정에서만 접근할 수 있습니다.', 'success');
      } catch (_error) {
        setStatus('클라우드 저장에 실패했습니다. 로그인, 테이블 migration, RLS 정책과 네트워크를 확인해 주세요.', 'error');
      } finally {
        setBusy(false);
      }
    });

    loadButton.addEventListener('click', async () => {
      if (!window.confirm('현재 이력서 입력을 클라우드 저장본으로 바꾸고 페이지를 새로고침할까요?')) return;
      setBusy(true);
      try {
        const result = await store.loadResume();
        if (!result.user) {
          showAccount(null);
          setStatus('먼저 Google 계정으로 로그인해 주세요.', 'error');
          return;
        }
        if (!result.resume) {
          setStatus('계정에 저장된 이력서가 없습니다. 현재 이력서를 클라우드에 저장해 주세요.');
          return;
        }
        const serialized = JSON.stringify(result.resume);
        if (serialized.length > maximumPayloadCharacters || result.resume.version !== 1) {
          throw new Error('invalid-resume-payload');
        }
        localStorage.setItem(resumeKey, serialized);
        setStatus('클라우드 이력서를 불러왔습니다. 화면을 갱신합니다.', 'success');
        window.location.reload();
      } catch (_error) {
        setStatus('클라우드 이력서를 불러오지 못했습니다. 로그인, 테이블 migration, RLS 정책을 확인해 주세요.', 'error');
      } finally {
        setBusy(false);
      }
    });

    signOutButton.addEventListener('click', async () => {
      setBusy(true);
      try {
        await store.signOut();
        showAccount(null);
        setStatus('로그아웃했습니다. 브라우저에 저장된 로컬 이력서는 유지됩니다.');
      } catch (_error) {
        setStatus('로그아웃하지 못했습니다. 네트워크 상태를 확인해 주세요.', 'error');
      } finally {
        setBusy(false);
      }
    });

    window.addEventListener('plen:supabase-auth-change', (event) => showAccount(event.detail?.user || null));
    const resumeBadge = document.querySelector('#resumeBuilder .resume-local-badge');
    if (resumeBadge) resumeBadge.textContent = 'LOCAL + SUPABASE';
    refreshAccount();
  }

  waitForStore();
})();
