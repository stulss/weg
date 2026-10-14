/* v1(plen-workbench-v1) 자료를 v2 저장소로 한 번 옮깁니다. 원본 v1 키는 지우지 않습니다. */
(() => {
  'use strict';

  const V1_KEY = 'plen-workbench-v1';
  const KEYS = {
    experiences: 'plen-v2-experiences',
    applications: 'plen-v2-applications',
    job: 'plen-v2-job',
    draft: 'plen-v2-draft',
    rituals: 'plen-ritual-records-v1',
    links: 'plen-ritual-links-v1'
  };
  const VALID_STATUSES = ['작성 중', '제출 완료', '면접 진행', '마감'];

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_error) { return null; }
  }
  function text(value, limit) { return typeof value === 'string' ? value.trim().slice(0, limit) : ''; }
  function emptyDraft() {
    return { question: '지원동기 및 직무 역량을 본인의 실제 경험을 바탕으로 서술해 주세요.', limit: 700, usedExpIds: [], factSheet: [], factSheetConfirmed: false, aiDraft: '', finalText: '', userFinished: false, drafts: [] };
  }

  // v1 경험 카드 → v2 카드. 같은 id를 유지해 리추얼 연결과 이력서 연결이 그대로 이어집니다.
  function toV2Card(item) {
    const keywords = Array.isArray(item.keywords) ? item.keywords : (typeof item.keywords === 'string' ? item.keywords.split(',') : []);
    return {
      id: item.id, title: text(item.name, 100), dateFrom: '', dateTo: '',
      situation: text(item.context, 2400), task: '', action: text(item.actions, 3000), result: text(item.outcome, 2400),
      repeatDays: 0, evidence: [], tags: keywords.map((word) => text(word, 32)).filter(Boolean).slice(0, 10),
      createdAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString()
    };
  }

  function toV2Application(item, extractKeywords) {
    const job = text(item.job, 12000);
    return {
      id: item.id, company: text(item.company, 80), role: text(item.role, 80), text: job,
      keywords: job && extractKeywords ? extractKeywords(job, 5) : [],
      status: VALID_STATUSES.includes(item.status) ? item.status : '작성 중',
      deadline: typeof item.deadline === 'string' ? item.deadline.slice(0, 10) : '',
      draft: emptyDraft(),
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString()
    };
  }

  function migrate() {
    let applicationsState = read(KEYS.applications);
    if (applicationsState && applicationsState.migratedV1) return;
    const core = window.plenCareerCore;
    const extractKeywords = core && typeof core.extractJobKeywords === 'function' ? core.extractJobKeywords : null;
    const v1 = read(V1_KEY);
    const items = applicationsState && Array.isArray(applicationsState.items) ? applicationsState.items : [];

    // 1) v2 단일 공고·초안(plen-v2-job/plen-v2-draft)을 첫 지원 건으로 옮깁니다.
    if (!items.length) {
      const job = read(KEYS.job), draft = read(KEYS.draft);
      if ((job && (job.text || job.company)) || (draft && (draft.finalText || (draft.drafts || []).length))) {
        items.push({
          id: `app_${Date.now().toString(36)}`, company: text(job?.company, 80), role: text(job?.role, 80), text: text(job?.text, 12000),
          keywords: Array.isArray(job?.keywords) ? job.keywords : [], status: '작성 중', deadline: '',
          draft: { ...emptyDraft(), ...(draft && typeof draft === 'object' ? draft : {}) }, updatedAt: new Date().toISOString()
        });
      }
    }

    if (v1 && v1.version === 1) {
      // 2) v1 지원 건
      const ids = new Set(items.map((item) => item.id));
      (Array.isArray(v1.applications) ? v1.applications : [])
        .filter((item) => item && typeof item === 'object' && typeof item.id === 'string' && !ids.has(item.id) && (item.company || item.job))
        .forEach((item) => items.push(toV2Application(item, extractKeywords)));

      // 3) v1 경험 카드
      const cards = read(KEYS.experiences);
      const cardList = Array.isArray(cards) ? cards : [];
      const cardIds = new Set(cardList.map((card) => card && card.id));
      const imported = (Array.isArray(v1.experiences) ? v1.experiences : [])
        .filter((item) => item && typeof item === 'object' && typeof item.id === 'string' && item.name && !cardIds.has(item.id))
        .map(toV2Card);
      if (imported.length) localStorage.setItem(KEYS.experiences, JSON.stringify([...cardList, ...imported]));

      // 4) v1 리추얼 기록·연결 (전용 키가 비어 있을 때만)
      if (Array.isArray(v1.rituals) && v1.rituals.length && !Array.isArray(read(KEYS.rituals))) {
        localStorage.setItem(KEYS.rituals, JSON.stringify(v1.rituals));
        if (v1.ritualLinks && typeof v1.ritualLinks === 'object') localStorage.setItem(KEYS.links, JSON.stringify(v1.ritualLinks));
      }
    }

    applicationsState = { version: 1, migratedV1: true, activeId: applicationsState?.activeId || items[0]?.id || '', items };
    localStorage.setItem(KEYS.applications, JSON.stringify(applicationsState));
  }

  try { migrate(); } catch (error) { console.warn('v1 자료 이전 실패:', error); }
  window.plenV1Migration = { migrate, emptyDraft };
})();
