/* Supabase Google OAuth + RLS로 사용자 본인의 이력서와 작업공간을 저장합니다. */
(() => {
  'use strict';
  const config = window.PLEN_SUPABASE_CONFIG || {};
  const sdk = window.supabase;
  const configured = Boolean(sdk && typeof sdk.createClient === 'function' && typeof config.url === 'string' && /^https:\/\//i.test(config.url) && typeof config.anonKey === 'string' && config.anonKey.trim());
  const client = configured ? sdk.createClient(config.url.trim(), config.anonKey.trim(), { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
  let saveQueue = Promise.resolve();
  let loaderStarted = false;
  const scriptUrl = document.currentScript?.src || new URL('frontend/assets/js/supabase-resume-store.js', location.href).href;
  function dispatchAuth(event, session) {
    window.dispatchEvent(new CustomEvent('plen:supabase-auth-change', { detail: { event, user: session?.user ? { id: session.user.id, email: session.user.email || '' } : null } }));
  }
  if (client) client.auth.onAuthStateChange((event, session) => dispatchAuth(event, session));
  function requireClient() { if (!client) throw new Error('Supabase 설정이 없습니다. Project URL, 공개 키와 Supabase JS SDK를 확인해 주세요.'); return client; }
  async function getUser() { const { data, error } = await requireClient().auth.getUser(); if (error) throw error; return data.user || null; }
  async function signInWithGoogle() {
    const redirectTo = /^https?:$/.test(location.protocol) ? location.href : undefined;
    const { error } = await requireClient().auth.signInWithOAuth({ provider: 'google', options: redirectTo ? { redirectTo } : {} });
    if (error) throw error;
  }
  async function signOut() { const { error } = await requireClient().auth.signOut(); if (error) throw error; }
  async function loadResume() {
    const active = requireClient(), user = await getUser();
    if (!user) return { user: null, resume: null };
    const { data, error } = await active.from('resume_profiles').select('resume, updated_at').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return { user, resume: data?.resume && typeof data.resume === 'object' ? data.resume : null };
  }
  async function saveResume(resume) {
    if (!resume || typeof resume !== 'object' || Array.isArray(resume) || resume.version !== 1) throw new Error('저장할 이력서 데이터 형식이 올바르지 않습니다.');
    const task = saveQueue.catch(() => undefined).then(async () => {
      const active = requireClient(), user = await getUser();
      if (!user) return { skipped: true };
      const { error } = await active.from('resume_profiles').upsert({ user_id: user.id, resume, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
      return { saved: true };
    });
    saveQueue = task; return task;
  }
  async function deleteResume() {
    const active = requireClient(), user = await getUser();
    if (!user) return { skipped: true };
    const { error } = await active.from('resume_profiles').delete().eq('user_id', user.id);
    if (error) throw error;
    return { deleted: true };
  }
  async function loadWorkspace() {
    const active = requireClient(), user = await getUser();
    if (!user) return { user: null, data: null };
    const { data, error } = await active.from('user_workspaces').select('data, updated_at').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return { user, data: data?.data && typeof data.data === 'object' ? data.data : null };
  }
  async function saveWorkspace(workspace) {
    if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace) || workspace.version !== 1 || !workspace.items || typeof workspace.items !== 'object' || Array.isArray(workspace.items)) throw new Error('저장할 plen 자료 형식이 올바르지 않습니다.');
    const task = saveQueue.catch(() => undefined).then(async () => {
      const active = requireClient(), user = await getUser();
      if (!user) return { skipped: true };
      const { error } = await active.from('user_workspaces').upsert({ user_id: user.id, data: workspace, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
      return { saved: true };
    });
    saveQueue = task; return task;
  }
  window.plenSupabaseResumeStore = { configured, getUser, signInWithGoogle, signOut, loadResume, saveResume, deleteResume, loadWorkspace, saveWorkspace };
  function startWorkspaceSync() {
    if (loaderStarted) return;
    loaderStarted = true;
    const script = document.createElement('script');
    script.src = new URL('supabase-workspace-sync.js', scriptUrl).href;
    script.onload = () => window.plenSupabaseWorkspaceSync?.initialize();
    script.onerror = () => window.dispatchEvent(new CustomEvent('plen:workspace-sync-status', { detail: { message: '전체 자료 동기화 코드를 불러오지 못했습니다.', kind: 'error' } }));
    document.head.append(script);
  }
  startWorkspaceSync();
})();
