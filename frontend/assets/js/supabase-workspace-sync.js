/* 로그인 사용자의 plen 자료를 Supabase user_workspaces 테이블과 동기화합니다. */
(() => {
  'use strict';
  const store = () => window.plenSupabaseResumeStore;
  const META_KEY = 'plen-sync-meta-v1';
  const keys = ['plen-workbench-v1', 'plen-resume-v1', 'plen-v2-experiences', 'plen-v2-job', 'plen-v2-draft', 'plen-ritual-records-v1', 'plen-ritual-links-v1', META_KEY];
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
  // 동기화 메타데이터: 키별 수정 시각, id가 있는 배열 항목별 수정 시각과 삭제 기록(tombstone).
  // 병합할 때 더 최근 쪽을 고르고, 삭제가 더 최근이면 다른 기기에 남은 옛 항목을 되살리지 않습니다.
  const TOMBSTONE_TTL = 180 * 24 * 60 * 60 * 1000;
  function emptyMeta() { return { keys: {}, items: {}, deleted: {} }; }
  function readMeta(text) {
    const meta = parse(text);
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return emptyMeta();
    return { keys: meta.keys && typeof meta.keys === 'object' ? meta.keys : {}, items: meta.items && typeof meta.items === 'object' ? meta.items : {}, deleted: meta.deleted && typeof meta.deleted === 'object' ? meta.deleted : {} };
  }
  function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
  function isIdArray(value) { return Array.isArray(value) && value.every((item) => isPlainObject(item) && typeof item.id === 'string' && item.id); }
  function stampOf(table, path, id) { return Number(table[path]?.[id]) || 0; }
  function setStamp(table, path, id, time) { (table[path] = table[path] || {})[id] = time; }

  // localStorage 값이 바뀔 때 이전 값과 비교해 바뀐 항목·삭제된 항목에 시각을 남깁니다.
  function recordChange(meta, key, oldText, newText, now = Date.now()) {
    meta.keys[key] = now;
    const walk = (before, after, path) => {
      if (isIdArray(after) && (isIdArray(before) || before === undefined || before === null)) {
        const previous = new Map((before || []).map((item) => [item.id, JSON.stringify(item)]));
        after.forEach((item) => {
          if (previous.get(item.id) !== JSON.stringify(item)) setStamp(meta.items, path, item.id, now);
          if (meta.deleted[path]) delete meta.deleted[path][item.id];
          previous.delete(item.id);
        });
        previous.forEach((_value, id) => setStamp(meta.deleted, path, id, now));
        return;
      }
      if (isPlainObject(before) && isPlainObject(after)) Object.keys(after).forEach((prop) => walk(before[prop], after[prop], `${path}.${prop}`));
      else if (isPlainObject(after)) Object.keys(after).forEach((prop) => walk(undefined, after[prop], `${path}.${prop}`));
    };
    walk(parse(oldText), parse(newText), key);
    return meta;
  }

  function mergeValue(remote, local, path, key, rMeta, lMeta) {
    if (isIdArray(remote) && isIdArray(local)) {
      const remoteById = new Map(remote.map((item) => [item.id, item])), localById = new Map(local.map((item) => [item.id, item]));
      const order = [...local.map((item) => item.id), ...remote.map((item) => item.id).filter((id) => !localById.has(id))];
      const deletedAt = (id) => Math.max(stampOf(rMeta.deleted, path, id), stampOf(lMeta.deleted, path, id));
      return order.flatMap((id) => {
        const r = remoteById.get(id), l = localById.get(id);
        const rTime = r ? stampOf(rMeta.items, path, id) : -1, lTime = l ? stampOf(lMeta.items, path, id) : -1;
        const [item, time] = l && lTime >= rTime ? [l, lTime] : [r, rTime];
        const removed = deletedAt(id);
        return removed > 0 && removed >= time ? [] : [item];
      });
    }
    if (isPlainObject(remote) && isPlainObject(local)) {
      const result = { ...remote };
      Object.entries(local).forEach(([prop, value]) => { result[prop] = Object.prototype.hasOwnProperty.call(remote, prop) ? mergeValue(remote[prop], value, `${path}.${prop}`, key, rMeta, lMeta) : value; });
      return result;
    }
    const rTime = Number(rMeta.keys[key]) || 0, lTime = Number(lMeta.keys[key]) || 0;
    if (lTime !== rTime) return lTime > rTime ? local : remote;
    return local === '' || local === null || local === undefined ? remote : local;
  }

  function mergeMeta(a, b, now = Date.now()) {
    const result = emptyMeta();
    [a, b].forEach((meta) => {
      Object.entries(meta.keys).forEach(([key, time]) => { result.keys[key] = Math.max(Number(result.keys[key]) || 0, Number(time) || 0); });
      ['items', 'deleted'].forEach((table) => Object.entries(meta[table]).forEach(([path, ids]) => {
        if (!isPlainObject(ids)) return;
        Object.entries(ids).forEach(([id, time]) => { if (Number(time) > stampOf(result[table], path, id)) setStamp(result[table], path, id, Number(time)); });
      }));
    });
    Object.entries(result.deleted).forEach(([path, ids]) => Object.keys(ids).forEach((id) => { if (now - ids[id] > TOMBSTONE_TTL) delete ids[id]; }));
    return result;
  }

  function mergeSnapshots(remote = {}, local = {}) {
    const rMeta = readMeta(remote[META_KEY]), lMeta = readMeta(local[META_KEY]);
    const result = {};
    keys.filter((key) => key !== META_KEY).forEach((key) => {
      const inRemote = Object.prototype.hasOwnProperty.call(remote, key), inLocal = Object.prototype.hasOwnProperty.call(local, key);
      const rTime = Number(rMeta.keys[key]) || 0, lTime = Number(lMeta.keys[key]) || 0;
      if (!inRemote && !inLocal) return;
      if (!inLocal) { if (!(lTime > rTime)) result[key] = remote[key]; return; } // 로컬에서 키를 지운 시각이 더 최근이면 삭제 유지
      if (!inRemote) { if (!(rTime > lTime)) result[key] = local[key]; return; }
      const a = parse(remote[key]), b = parse(local[key]);
      result[key] = a === undefined || b === undefined ? (lTime >= rTime ? local[key] : remote[key]) : JSON.stringify(mergeValue(a, b, key, key, rMeta, lMeta));
    });
    result[META_KEY] = JSON.stringify(mergeMeta(rMeta, lMeta));
    return result;
  }
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
    const proto = Storage.prototype, originalGet = proto.getItem, originalSet = proto.setItem, originalRemove = proto.removeItem, originalClear = proto.clear;
    const tracked = (storage, key) => storage === localStorage && keySet.has(String(key)) && String(key) !== META_KEY;
    // 사용자가 바꾼 값만 시각을 남깁니다. 계정 자료를 내려받아 쓰는 중(hydrating)에는 기록하지 않습니다.
    const record = (key, oldText, newText) => {
      if (hydrating) return;
      try { originalSet.call(localStorage, META_KEY, JSON.stringify(recordChange(readMeta(originalGet.call(localStorage, META_KEY)), key, oldText, newText))); } catch (_) { /* 메타 저장 실패는 동기화 정확도만 낮춥니다. */ }
    };
    proto.setItem = function(key, value) { const oldText = tracked(this, key) ? originalGet.call(this, key) : null; const result = originalSet.call(this, key, value); if (tracked(this, key)) { record(String(key), oldText, String(value)); schedule(); } return result; };
    proto.removeItem = function(key) { const oldText = tracked(this, key) ? originalGet.call(this, key) : null; const result = originalRemove.call(this, key); if (tracked(this, key)) { if (oldText !== null) record(String(key), oldText, null); schedule(); } return result; };
    proto.clear = function() {
      const before = this === localStorage ? keys.filter((key) => key !== META_KEY).map((key) => [key, originalGet.call(this, key)]).filter(([, value]) => value !== null) : [];
      const result = originalClear.call(this);
      before.forEach(([key, value]) => record(key, value, null)); if (before.length) schedule(); return result;
    };
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
  window.plenSupabaseWorkspaceSync = { initialize, syncNow, connect, mergeSnapshots, recordChange, readMeta, META_KEY };
})();
