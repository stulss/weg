/* Supabase Google OAuth + RLS로 사용자 본인의 이력서 한 건만 저장하는 저장소 어댑터. */
(() => {
  'use strict';

  const config = window.PLEN_SUPABASE_CONFIG || {};
  const sdk = window.supabase;
  const configured = Boolean(
    sdk && typeof sdk.createClient === 'function' &&
    typeof config.url === 'string' && /^https:\/\//i.test(config.url) &&
    typeof config.anonKey === 'string' && config.anonKey.trim()
  );
  const client = configured ? sdk.createClient(config.url.trim(), config.anonKey.trim(), {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;
  let saveQueue = Promise.resolve();

  function dispatchAuth(event, session) {
    window.dispatchEvent(new CustomEvent('plen:supabase-auth-change', {
      detail: {
        event,
        user: session && session.user ? {
          id: session.user.id,
          email: session.user.email || ''
        } : null
      }
    }));
  }

  if (client) {
    client.auth.onAuthStateChange((event, session) => dispatchAuth(event, session));
  }

  function requireClient() {
    if (!client) {
      throw new Error('Supabase 설정이 없습니다. Project URL과 anon/publishable key를 설정하고 Supabase JS SDK를 확인해 주세요.');
    }
    return client;
  }

  async function getUser() {
    const activeClient = requireClient();
    const { data, error } = await activeClient.auth.getUser();
    if (error) throw error;
    return data.user || null;
  }

  async function signInWithGoogle() {
    const activeClient = requireClient();
    const redirectTo = /^https?:$/.test(window.location.protocol)
      ? window.location.href
      : undefined;
    const options = redirectTo ? { redirectTo } : {};
    const { error } = await activeClient.auth.signInWithOAuth({
      provider: 'google',
      options
    });
    if (error) throw error;
  }

  async function signOut() {
    const activeClient = requireClient();
    const { error } = await activeClient.auth.signOut();
    if (error) throw error;
  }

  async function loadResume() {
    const activeClient = requireClient();
    const user = await getUser();
    if (!user) return { user: null, resume: null };
    const { data, error } = await activeClient
      .from('resume_profiles')
      .select('resume, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    return { user, resume: data && data.resume && typeof data.resume === 'object' ? data.resume : null };
  }

  async function saveResume(resume) {
    if (!resume || typeof resume !== 'object' || Array.isArray(resume) || resume.version !== 1) {
      throw new Error('저장할 이력서 데이터 형식이 올바르지 않습니다.');
    }
    const queued = saveQueue.catch(() => undefined).then(async () => {
      const activeClient = requireClient();
      const user = await getUser();
      if (!user) return { skipped: true };
      const { error } = await activeClient.from('resume_profiles').upsert({
        user_id: user.id,
        resume,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      if (error) throw error;
      return { saved: true };
    });
    saveQueue = queued;
    return queued;
  }

  async function deleteResume() {
    const activeClient = requireClient();
    const user = await getUser();
    if (!user) return { skipped: true };
    const { error } = await activeClient.from('resume_profiles').delete().eq('user_id', user.id);
    if (error) throw error;
    return { deleted: true };
  }

  window.plenSupabaseResumeStore = {
    configured,
    getUser,
    signInWithGoogle,
    signOut,
    loadResume,
    saveResume,
    deleteResume
  };
})();
