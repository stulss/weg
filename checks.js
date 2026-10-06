'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('./core.js');
const draftWorkflow = require('./frontend/assets/js/draft-workflow-core.js');
require('./frontend/assets/js/draft-inspection-core.js');

const completed = [];
function test(label, fn) { fn(); completed.push(label); }

// Synthetic regression fixture only. This is not the user's actual evidence.
const posting = [
  '데이터 분석으로 주요 지표를 개선합니다.',
  '비즈니스 문제 정의와 문제 해결 방안을 도출합니다.',
  '개발자와 디자이너와 협업하고 커뮤니케이션을 주도합니다.',
  '사용자 조사와 사용자 인터뷰로 경험을 개선합니다.',
  '가설 검증, 실험 설계와 A/B 테스트를 수행합니다.'
].join('\n');
const card = core.normalizeExperienceCard({
  id: 'exp_fixture', title: '가입 흐름 개선', dateFrom: '2026-03-02', dateTo: '2026-03-20',
  situation: '가입 단계에서 사용자가 이탈하는 상황', task: '이탈 원인을 확인하는 개선 과제',
  action: '사용자 문의를 분류하고 화면 흐름을 점검', result: '확인 가능한 개선 결과를 기록', repeatDays: 14,
  evidence: [{ who: '팀 동료', when: '2026-03-21', quote: '단계를 명확히 줄여 사용하기 편해졌습니다.' }], tags: ['데이터 분석', '협업']
});
// Match the real UI pipeline: the fact sheet includes the card's recorded evidence.
const factSheet = core.generateFactSheet([card]);
const keywords = ['데이터 분석', '문제 해결', '협업', '사용자 조사', '실험 설계'];
const quote = card.evidence[0].quote;
const goodDraft = [
  `[문항: 직무 역량]`,
  `저는 ${card.title}에서 총 ${card.repeatDays}일 반복 관측했습니다.`,
  `2026-03-02 상황에서 개선 과제를 맡아 행동을 실행했습니다. 그 결과 확인 가능한 성과와 배움을 정리했습니다.`,
  `동료 피드백: “${quote}”`,
  `요구 역량은 ${keywords.join(', ')}입니다.`
].join('\n\n');
const options = { cards: [card], factSheet, keywords, limit: 700, aiDraft: `${goodDraft}\n자동 초안`, userFinished: true };

// Ritual CSV and statistics checks.
test('CSV 따옴표·줄바꿈·BOM·열 수 파싱', () => {
  const parsed = core.parseCsv('\uFEFFDate,Ritual Type,Prompt,Answer\r\n2026-08-12,Morning,오늘의 계획,"첫 줄, 쉼표\n""인용"""\r\n');
  assert.deepEqual(parsed.headers, ['Date', 'Ritual Type', 'Prompt', 'Answer']);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0][3], '첫 줄, 쉼표\n"인용"');
});
test('CSV 구분자 자동 감지와 행 제한', () => {
  assert.equal(core.parseCsv('Date;Type;Answer\n2026-08-12;Morning;기록').delimiter, ';');
  assert.throws(() => core.parseCsv(`Date,Type\n${'2026-08-12,Morning\n'.repeat(core.MAX_CSV_ROWS + 1)}`), RangeError);
});
test('날짜 변환·윤년 처리·잘못된 날짜 거부', () => {
  assert.equal(core.normalizeDate('2026.8.12'), '2026-08-12');
  assert.equal(core.normalizeDate('2026년 8월 12일'), '2026-08-12');
  assert.equal(core.normalizeDate('08/12/2026', { slashOrder: 'MDY' }), '2026-08-12');
  assert.equal(core.normalizeDate('12/08/2026', { slashOrder: 'DMY' }), '2026-08-12');
  assert.equal(core.normalizeDate('20260229'), '');
  assert.equal(core.normalizeDate('2024-02-29'), '2024-02-29');
});
test('CSV 열 매핑에서 이메일 등 식별 정보 제외', () => {
  const parsed = core.parseCsv('Date,Form Name,Prompt,Answer,Email\n2026-08-12,Morning,오늘 한 일,먼저 정리하고 기록,person@example.com');
  const [record] = core.mapCsvRows(parsed);
  assert.equal(record.date, '2026-08-12'); assert.equal(record.type, '아침');
  assert.equal(record.content, '먼저 정리하고 기록'); assert.equal(record.participant, '참여자 1');
  assert.equal(JSON.stringify(record).includes('person@example.com'), false);
});
test('중복 항목은 제외하고 새 내용은 가져오기로 기본 선택', () => {
  const entry = { date: '2026-08-12', type: '아침', prompt: '오늘', content: '한 일' };
  const result = core.deduplicateRecords([entry, entry, { date: '', type: '마무리', prompt: '배움', content: '회고' }], [entry]);
  assert.equal(result.duplicateInFileCount, 1); assert.equal(result.duplicateExistingCount, 2);
  assert.deepEqual(result.candidates.map((record) => record.selected), [false, false, true]);
  assert.equal(result.candidates[2].invalidDate, undefined);
});
test('리추얼 고유 날짜와 연속 기록 통계', () => {
  const stats = core.calculateStats([
    { date: '2026-08-11', type: '아침' }, { date: '2026-08-11', type: '마무리' },
    { date: '2026-08-12', type: '아침' }, { date: '2026-08-14', type: '마무리' }, { date: '', type: '아침' }
  ]);
  assert.equal(stats.recordCount, 5); assert.equal(stats.activeDays, 3);
  assert.equal(stats.morningDays, 2); assert.equal(stats.closingDays, 2);
  assert.equal(stats.longestStreak, 2); assert.equal(stats.recentStreak, 1);
});
test('경험 카드 STAR·빈 칸·강점·바깥 증거 정규화', () => {
  const normalized = core.normalizeExperienceCard({ ...card, result: '', repeatDays: 14 });
  assert.equal(normalized.blanks, 1); assert.equal(normalized.isCoreStrength, true); assert.equal(normalized.evidence.length, 1);
  assert.equal(core.normalizeExperienceCard({ title: '빈 경험', situation: '상황만', repeatDays: 5 }).blanks, 3);
});
test('키워드 5개 추출과 근거 원문 확인', () => {
  const found = core.extractJobKeywords(posting, 5);
  assert.equal(found.length, 5); assert.equal(core.verifyKeywordEvidence(found, posting), true);
  found.forEach((item) => assert.ok(posting.includes(item.evidence)));
});
test('팩트 시트 출처 확인 및 규칙 기반 1인칭 초안 생성', () => {
  assert.equal(draftWorkflow.validateFactSheet(factSheet, [card.id]).ok, true);
  assert.equal(draftWorkflow.validateFactSheet(factSheet, ['not-selected']).ok, false);
  const draft = draftWorkflow.generateFirstPersonDraft(factSheet, [card], { question: '직무 역량' });
  assert.match(draft, /가입 흐름 개선/); assert.match(draft, /2026-03-02/); assert.match(draft, new RegExp(quote));
});
test('초안 생성·편집·검사 스크립트가 브라우저 화면에 연결됨', () => {
  const html = fs.readFileSync(path.join(__dirname, 'frontend/index.html'), 'utf8');
  const ui = fs.readFileSync(path.join(__dirname, 'frontend/assets/js/career-ui.js'), 'utf8');
  const guard = fs.readFileSync(path.join(__dirname, 'frontend/assets/js/draft-ui-guard.js'), 'utf8');
  assert.match(html, /assets\/js\/career-core\.js/); assert.match(html, /assets\/js\/draft-inspection-core\.js/);
  assert.match(html, /assets\/js\/draft-workflow-core\.js/); assert.match(html, /assets\/js\/career-ui\.js/);
  assert.match(ui, /generateFirstPersonDraft/); assert.match(ui, /inspectDraft\(/);
  assert.match(ui, /btnGenerateFactSheet/); assert.match(ui, /btnSaveFinalDraft/); assert.match(guard, /btnSaveFinalDraft/);
});

test('9개 검사 정상 사례 모두 통과', () => {
  const report = core.inspectDraft(goodDraft, options);
  assert.equal(report.totalCount, 9); assert.equal(report.passedCount, 9);
  assert.equal(report.allPassed, true); assert.equal(report.canSave, true);
  assert.deepEqual(report.results.map((item) => item.ruleId), ['keyword', 'unregistered', 'limit', 'starDate', 'forbiddenAdj', 'coreStrength', 'outsideEvidence', 'filledMark', 'userFinished']);
});
function fails(ruleId, text, override = {}) {
  const report = core.inspectDraft(text, { ...options, ...override });
  const rule = report.results.find((item) => item.ruleId === ruleId);
  assert.ok(rule, `${ruleId} 결과가 있어야 합니다.`); assert.equal(rule.passed, false, `${ruleId} 실패 사례가 잘못 통과했습니다.`);
  return report;
}
test('1/9 실패: 키워드 4/5 미만', () => fails('keyword', goodDraft.replace('사용자 조사', '사용자 인터뷰')));
test('2/9 실패: 카드에 없는 숫자 탐지', () => {
  const report = fails('unregistered', `${goodDraft}\n미확인 수치 987654321%`);
  assert.match(report.results.find((item) => item.ruleId === 'unregistered').detail, /987654321/);
});
test('3/9 실패: 제한 초과·공백 포함 글자 수 확인', () => {
  const report = fails('limit', goodDraft, { limit: goodDraft.length - 1 }); assert.equal(report.charCount, goodDraft.length);
});
test('4/9 실패: 날짜·STAR 신호 누락', () => fails('starDate', goodDraft.replace('2026-03-02', '날짜 없음').replace('개선 과제', '업무')));
test('5/9 실패: 금지 형용사', () => fails('forbiddenAdj', `${goodDraft}\n저는 성실한 사람입니다.`));
test('6/9 실패: 첫 문단 반복 강점 신호 누락', () => fails('coreStrength', goodDraft.replace(`${card.title}에서 총 ${card.repeatDays}일`, '다른 경험에서 총 3일')));
test('7/9 실패: 바깥 증거 인용 누락', () => fails('outsideEvidence', goodDraft.replace(quote, '확인되지 않은 말')));
test('8/9 실패: 보완 표기 누락은 저장 차단', () => {
  const report = fails('filledMark', goodDraft, { factSheet: [{ ...factSheet[0], filled: true }] }); assert.equal(report.canSave, false);
});
test('8/9 경계 실패: 채운 문장 2개인데 표기 1개만 있음', () => {
  const filled = [{ ...factSheet[0], filled: true }, { ...factSheet[1], filled: true }];
  const report = core.inspectDraft(`${goodDraft}\n${core.MISSING_RECORD_LABEL}`, { ...options, factSheet: filled });
  assert.equal(report.results.find((item) => item.ruleId === 'filledMark').passed, false); assert.equal(report.canSave, false);
});
test('9/9 실패: 직접 완성 미체크 또는 자동 초안과 동일', () => {
  fails('userFinished', goodDraft, { userFinished: false }); fails('userFinished', goodDraft, { aiDraft: goodDraft });
});

console.log(`${completed.length}개 테스트 케이스 정의 완료`);
completed.forEach((label, index) => console.log(`${index + 1}. ${label}`));
console.log('합성 fixture입니다. 실제 공고 3건 완성 기준 검증은 사용자의 자료가 제공되기 전까지 미실행입니다.');
