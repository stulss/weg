# plen

여러 회사에 지원하는 취준생을 위한 브라우저 기반 취업 준비 웹앱입니다.

## 실행 및 구조

배포 주소는 https://weg-lime.vercel.app 입니다. 로컬에서는 브라우저로 `frontend/index.html`을 열어 실행합니다. 실제 화면 코드는 `frontend/`에 있습니다. 데이터 저장은 브라우저 `localStorage`와 Supabase(로그인 시)를 사용하며, 별도로 실행하는 API 서버는 없습니다. `backend/`에는 Python 모델·컨트롤러 초안이 있지만 실행 진입점이 없고 화면에서 사용하지 않습니다.

## 주요 기능

- **경험 카드:** 경험 등록·수정·삭제 및 브라우저 저장. v2 화면에서는 STAR, 날짜, 반복 관측 일수, 바깥 증거와 태그를 기록합니다.
- **채용공고 키워드:** 규칙 기반 사전·표현 분석. 입력한 공고를 외부 전송하지 않고 브라우저에서 분석합니다.
- **팩트 시트 → 1인칭 초안:** 선택한 카드로 팩트 시트를 작성하고 사용자가 확인한 뒤 규칙 기반 초안을 편집합니다. 카드의 명사형 표현("~다듬음", "~줄어듦")은 문장 어미로 바꾸고, 빈 칸은 내용을 지어내지 않고 "아직 기록하지 않았다(기록 없음 — 채운 부분)"로 남깁니다. 초안은 글자 수 제한에 맞춰 뒤쪽 카드의 덜 중요한 문장부터 줄이고, 카드 내용에서 근거를 찾을 수 있는 공고 키워드만 마지막 문단에 연결합니다. 선택 경험 밖의 임의 서술은 자동으로 완벽히 막을 수 없으므로 사용자가 원자료를 대조해야 합니다.
- **9개 검사:** 키워드, 카드에 없는 숫자, 글자 수, 날짜·STAR, 금지 형용사, 첫 문단 강점, 바깥 증거, 기록 보완 표기, 직접 완성 상태를 점검합니다. 휴리스틱이며 사실 인증이 아닙니다.
- **리추얼 CSV:** 미리보기·날짜 변환·중복 제거·경험 카드 연결·기록 통계 기능이 있습니다.
- **이력서:** 기본 정보·프로필·경력·프로젝트·학력·기술·역량·자격·수상 항목 작성, 미리보기 및 TXT 내보내기를 지원합니다.
- **Google 로그인·회원가입(설정 후):** Google OAuth로 로그인하고, 처음 이용하는 계정은 Supabase Auth에 가입됩니다. 이메일·비밀번호 로그인은 제공하지 않습니다.
- **Supabase 전체 동기화(로그인 시):** 경험 카드, 지원 건(공고·초안·기록), 리추얼, 이력서를 `user_workspaces` 테이블에 자동 저장하고, 로그인할 때 이 브라우저 자료와 계정 자료를 병합합니다. 병합은 항목별 수정 시각과 삭제 기록(`plen-sync-meta-v1`)을 비교해 더 최근 변경을 고르므로, 한 기기에서 지운 항목이 다른 기기의 옛 자료 때문에 되살아나지 않습니다. 이력서는 `resume_profiles` 테이블에 따로 저장·불러오기도 할 수 있습니다. 두 테이블 모두 RLS로 본인 행만 접근합니다.
- **지원 건:** 회사마다 지원 건을 만들어 공고·키워드·팩트 시트·초안·저장 기록을 따로 보관하고, 진행 상태(작성 중·제출 완료·면접 진행·마감)와 마감일을 관리합니다. 경험 카드는 모든 지원 건이 함께 씁니다.
- **v1 자료 자동 이전:** 예전 화면(`plen-workbench-v1`)의 지원 건·경험 카드·리추얼 기록은 처음 열 때 v2 저장소로 한 번 옮깁니다(`v1-migration.js`). 원본 키는 지우지 않습니다.

## Google 로그인 및 Supabase 연결

초기 설정은 [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md)를 참고하세요. Google Cloud OAuth 웹 클라이언트 설정과 Supabase Google Provider 활성화, SQL migration, Redirect URL 등록, `frontend/assets/js/supabase-config.js`의 Project URL 및 anon/publishable key 설정이 필요합니다. Secret/service role 키나 Google Client Secret은 브라우저에 넣지 마세요.

로그인하지 않으면 모든 자료는 이 브라우저의 localStorage에만 남습니다. 로그인하면 위 자료 전체가 Supabase와 동기화됩니다. 브라우저에 넣는 값은 공개용 publishable key뿐이며 Supabase JS SDK는 CDN에서 로드합니다.

2026-10-14 공개 엔드포인트로 확인한 상태: 두 테이블이 존재하고 비로그인(anon) 접근은 거부되며, Google Provider가 켜져 Google 로그인 화면까지 이동합니다. Email Provider는 아직 켜져 있어 `SECURITY_SETUP.md`에 따라 대시보드에서 꺼야 합니다. JWT 만료·Refresh Token Rotation·Redirect URL 허용 목록과 실제 계정 로그인 후 동기화는 대시보드와 본인 계정으로 직접 확인해야 합니다.

## 보안 설정

프로젝트 루트의 `vercel.json`에 `X-Frame-Options: DENY`, CSP 등 응답 헤더를 설정했습니다. Supabase Auth에서 Google만 켜고 사용하지 않는 로그인 Provider를 끄는 절차, JWT 만료 시간을 기본 1시간으로 유지하고 Refresh Token Rotation 기본값을 유지하는 점검 목록은 [`SECURITY_SETUP.md`](SECURITY_SETUP.md)에 있습니다.

CSP의 `script-src`는 인라인 스크립트와 인라인 이벤트 핸들러를 허용하지 않습니다. 기존 HTML의 `style` 속성 및 JS의 요소 `.style` 조작은 `style-src-attr`에서 호환 목적으로 허용하므로, 더 엄격한 스타일 정책에는 이를 외부 CSS/class로 옮기는 후속 작업이 필요합니다. 2026-10-14 배포 주소에서 위 응답 헤더가 적용된 것을 확인했습니다.

## 자소서 작성 사용 흐름

1. 경험 카드에 실제 사실과 출처를 입력합니다.
2. "새 지원 건"을 만들고 채용공고 탭에서 공고를 붙여넣어 키워드를 검토합니다. 지원 건 선택 상자로 회사 사이를 오갈 수 있습니다.
3. 자소서 작성 탭에서 사용할 카드(최대 3개)를 선택하고 문항·글자 수 제한을 입력합니다.
4. 팩트 시트를 생성해 문장과 출처, 기록 공백 표기를 확인·수정합니다. 선택한 모든 카드가 포함되어야 하며, 수정 후 다시 확인합니다.
5. 확인된 팩트 시트에서 규칙 기반 1인칭 초안을 만들고, 직접 사실과 문장을 검토·편집합니다.
6. 오른쪽 9개 검사 결과를 확인합니다. 기록 공백 표기 검사는 실패하면 저장을 차단합니다. 사용자가 직접 수정하고 완료 체크를 해야 새 기록으로 저장할 수 있습니다.

현재 초안 기능은 AI 생성이 아니라 템플릿·규칙 기반이며, MVC 백엔드와 AI Gateway는 구현되지 않았습니다. 규칙 검사 통과만으로 경험의 진위나 글의 적합성이 보증되지는 않습니다.

## 검사와 검증 상태

Node.js가 설치된 환경에서 다음 명령으로 자동 검사를 실행할 수 있습니다.

```sh
node checks.js
```

검사는 CSV 처리, 초안 생성(어미 변환·글자 수 맞춤·키워드 연결)·정적 화면 연결 확인, 9개 검사 각각의 정상 사례와 실패 사례 ·동기화 병합·v1 자료 이전 등 28개 케이스를 포함하며, 2026-10-14 기준 모두 통과합니다.

2026-10-14 헤드리스 Chrome으로 브라우저 흐름을 자동 점검했습니다. 경험 카드 등록·삭제, 공고 키워드, 팩트 시트, 초안 생성·편집·저장, 새로고침 후 복원, 지원 건 3개 생성·전환·상태·삭제, v1 자료 이전, 리추얼 CSV 가져오기(경험 카드 보존 확인), 이력서 항목 추가·미리보기·TXT 내보내기, 390px 모바일 폭을 확인했습니다. Google 계정으로 실제 로그인한 뒤의 동기화는 확인하지 않았습니다.

**실제 공고 3건 완성 기준 검증은 미실행입니다.** 가상 회사 3곳과 가상 경험 카드로 흐름을 점검한 결과는 A·B 9/9, C 8/9(카드에 근거가 없는 키워드 2개로 키워드 3/5)였지만, 이는 합성 자료이므로 `plan_v2.md`의 테스트 표에는 통과로 적지 않습니다. 표를 채우려면 실제 채용공고 원문 3건, 본인의 실제 경험 카드, 문항과 글자 수 제한이 필요합니다.

## 저장과 개인정보

경험 카드·리추얼·공고·지원 자료·이력서는 브라우저 `localStorage`에 보관되고, Google 로그인 중에는 Supabase에도 자동 저장됩니다. 공용 기기에서는 저장을 피하고, 경험 카드 및 리추얼과 이력서에 포함된 본인·동료 개인정보를 입력하거나 공유할 때 주의하세요.

## 주요 파일

- `frontend/index.html`: 화면과 스크립트 연결
- `vercel.json`: Vercel 보안 응답 헤더
- `SECURITY_SETUP.md`: Vercel CSP와 Supabase Auth 점검 절차
- `frontend/assets/js/supabase-config.js`: Supabase Project URL 및 공개 anon/publishable key 설정 자리
- `frontend/assets/js/supabase-resume-store.js`: Supabase Google Auth 및 RLS 적용 이력서 데이터 호출
- `frontend/assets/js/supabase-auth-ui.js`: 헤더 Google 로그인·회원가입/로그아웃 UI
- `frontend/assets/js/supabase-resume-ui.js`: 이력서 화면 로그인·저장·불러오기 UI
- `frontend/assets/css/supabase-auth.css`: 계정 UI 스타일
- `supabase/migrations/202609220001_resume_profiles.sql`: 이력서 테이블과 RLS 정책
- `supabase/migrations/202609220002_user_workspaces.sql`: 전체 작업공간 동기화 테이블과 RLS 정책
- `frontend/assets/js/supabase-workspace-sync.js`: localStorage 변경 감지·로그인 시 병합·자동 저장
- `SUPABASE_SETUP.md`: Google OAuth와 Supabase 설정·배포 후 확인 절차
- `frontend/assets/js/career-core.js`: 경험·공고 키워드·팩트 시트·기본 9개 검사 로직
- `frontend/assets/js/career-ui.js`: 지원 건·경험/공고/초안 화면 이벤트 및 9개 검사 화면 갱신
- `frontend/assets/js/draft-workflow-core.js`: 팩트 시트 검증과 1인칭 규칙 변환
- `frontend/assets/js/draft-inspection-core.js`: 상세 9개 검사 로직을 `career-core.js` API에 연결
- `frontend/assets/js/v1-migration.js`: v1 자료를 v2 지원 건·경험 카드·리추얼 키로 한 번 이전
- `frontend/assets/js/ritual-manager.js`, `ritual-core.js`: 리추얼 CSV 가져오기·통계·경험 카드 연결 (`plen-ritual-records-v1`, `plen-ritual-links-v1`)
- `frontend/assets/js/resume-builder.js`: 이력서 작성, v2 경험 카드에서 경력 항목 가져오기
- `checks.js`: Node.js 자동 검사
- `plan_v2.md`: 현재 계획 및 실제 자료 완성 기준 표
- `remaining-plan.md`: 남은 단계와 확인 상태
