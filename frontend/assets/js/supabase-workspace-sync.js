/* 로그인 사용자의 plen 자료를 Supabase user_workspaces 테이블과 동기화합니다. */
(() => {
  'use strict';
  const store = () => window.plenSupabaseResumeStore;
  const keys = ['plen-workbench-v1', 'plen-resume-v1', 'plen-v2-experiences', 'plen-v2-job', 'plen-v2-draft', 'plen-ritual-records-v1', 'plen-ritual-links-v1'];
  const keySet = new Set(keys), maxChars = 3_500_000;
  let initialized = false, userId = '', hydrating = false, busy = false, locked = false, timer = 0, version = 0, serial = Promise.resolve();
  function status(message, kind = 'info') { window.dispatchEvent(new CustomEvent('plen:workspace-sync-status', { detail: { message, kind, configured: Boolean(store()?.configured), signedIn: Boolean(userId) } })); }
  function snapshot() { const result = {}; keys.forEach((key) => { const value = localStorage.getItem(key); if (value !== null) result[key] = value; }); return result; }
  function safeSnapshot(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('저장 데이터 형식이 올바르지 않습니다.');
    const result = {}; Object.entries(data).forEach(([key, value]) => { if (keySet.has(key) && typeof value === 'string') result[key] = value; });
    if (JSON.stringify(result).length > maxChars) throw new Error('저장 자료가 너무 커 동기화할 수 없습니다.'); return result;
  }
  function parse(text) { try { return JSON.parse(text); } catch (_) { return undefined; } }
  function merge(remote, local) {
    if (Array.isArray(remote) && Array.isArray(local)) {
      const keyed = (items) => items.every((item) => item && typeof item === 'object' && typeof item.id === 'string');
      if (keyed(remote) && keyed(local)) { const result = remote.map((item) => ({ ...item })); local.forEach((item) => { const i = result.findIndex((entry) => entry.id === item.id); if (i < 0) result.push(item); else result[i] = merge(result[i], item); }); return result; }
      return local.length ? local : remote;
    }
    if (remote && local && typeof remote === 'object' && typeof local === 'object' && !Array.isArray(remote) && !Array.isArray(local)) { const result = { ...remote }; Object.entries(local).forEach(([key, value]) => { result[key] = Object.prototype.hasOwnProperty.call(remote, key) ? merge(remote[key], value) : value; }); return result; }
    return local === '' || local === null || local === undefined ? remote : local;
  }
  function mergeSnapshots(remote = {}, local = {}) { const result = { ...remote }; Object.entries(local).forEach(([key, value]) => { if (!Object.prototype.hasOwnProperty.call(result, key)) result[key] = value; else { const a = parse(result[key]), b = parse(value); result[key] = a === undefined || b === undefined ? value : JSON.stringify(merge(a, b)); } }); return result; }
  function writeLocal(data) { hydrating = true; try { keys.forEach((key) => Object.prototype.hasOwnProperty.call(data, key) ? localStorage.setItem(key, data[key]) : localStorage.removeItem(key)); } finally { hydrating = false; } }
  function saveRemote(data, id) { const payload = safeSnapshot(data); serial = serial.catch(() => undefined).then(async () => { if (userId !== id || locked) return false; await store().saveWorkspace({ version: 1, items: payload }); return userId === id; }); return serial; }
  function schedule(delay = 650) { if (!userId || hydrating || locked) return; version += 1; clearTimeout(timer); timer = setTimeout(() => { void syncNow(); }, delay); }
  async function syncNow() {
    if (!userId || locked) return false;
    if (busy) { schedule(700); return false; }
    busy = true; const startingVersion = version, id = userId;
    try { status('plen 자료를 Supabase에 저장하는 중…', 'busy'); const ok = await saveRemote(snapshot(), id); if (ok && id === userId) status('plen 자료가 Supabase에 저장되었습니다.', 'success'); if (startingVersion !== version) schedule(); return Boolean(ok); }
    catch (error) { status(`Supabase 저장 실패: ${error instanceof Error ? error.message : '설정과 네트워크를 확인해 주세요.'}`, 'error'); return false; }
    finally { busy = false; }
  }
  async function connect(user) {
    if (!user?.id) { userId = ''; locked = false; status('로그인하지 않은 변경 사항은 이 브라우저에 남고 로그인 후 계정 자료와 병합됩니다.'); return; }
    if (userId === user.id && !locked) return;
    userId = user.id; locked = false; status('계정 자료를 불러와 현재 브라우저 자료와 병합하는 중…', 'busy');
    try { const response = await store().loadWorkspace(); if (userId !== user.id) return; const remote = response?.data?.items && typeof response.data.items === 'object' ? response.data.items : {}; const merged = safeSnapshot(mergeSnapshots(remote, snapshot())); writeLocal(merged); await saveRemote(merged, user.id); if (userId !== user.id) return; status('경험 카드, 지원 건·초안, 리추얼, 이력서 자료를 계정과 동기화했습니다.', 'success'); schedule(100); }
    catch (error) { if (userId !== user.id) return; locked = true; status(`동기화 실패: ${error instanceof Error ? error.message : '오류'}. 기존 클라우드 자료를 보호하기 위해 자동 저장을 중지했습니다.`, 'error'); }
  }
  function patchStorage() {
    if (!window.Storage || Storage.prototype.__plenWorkspaceSync) return;
    const proto = Storage.prototype, originalSet = proto.setItem, originalRemove = proto.removeItem, originalClear = proto.clear;
    proto.setItem = function(key, value) { const result = originalSet.call(this, key, value); if (this === localStorage && keySet.has(String(key))) schedule(); return result; };
    proto.removeItem = function(key) { const result = originalRemove.call(this, key); if (this === localStorage && keySet.has(String(key))) schedule(); return result; };
    proto.clear = function() { const changed = this === localStorage && keys.some((key) => localStorage.getItem(key) !== null); const result = originalClear.call(this); if (changed) schedule(); return result; };
    Object.defineProperty(proto, '__plenWorkspaceSync', { value: true });
  }
  async function initialize() {
    if (initialized) return; initialized = true; patchStorage();
    window.addEventListener('storage', (event) => { if (event.storageArea === localStorage && (!event.key || keySet.has(event.key))) schedule(); });
    window.addEventListener('plen:supabase-auth-change', (event) => { const detail = event.detail || {}; if (detail.event === 'SIGNED_OUT' || !detail.user) { userId = ''; locked = false; status('로그아웃했습니다. 브라우저 자료는 유지됩니다.'); } else if (['SIGNED_IN', 'INITIAL_SESSION', 'USER_UPDATED'].includes(detail.event)) void connect(detail.user); });
    window.addEventListener('online', () => { if (userId && !locked) void syncNow(); });
    window.addEventListener('pagehide', () => { if (userId && !locked && timer) { clearTimeout(timer); void syncNow(); } });
    try { await connect(await store().getUser()); } catch (error) { locked = true; status(`로그인 상태 확인 실패: ${error instanceof Error ? error.message : '오류'}`, 'error'); }
  }
  window.plenSupabaseWorkspaceSync = { initialize, syncNow, connect, mergeSnapshots };
})();
