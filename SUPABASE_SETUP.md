# plen Google 로그인·Supabase 전체 데이터 동기화 설정

현재 Supabase 연동 범위는 **Google OAuth 로그인/회원가입**, 로그인 사용자의 **이력서 단독 저장**, 그리고 **전체 작업공간(경험 카드, 채용공고 분석, 자기소개서 팩트시트/초안 히스토리, 리추얼 기록·연결) 실시간 자동 동기화**입니다. Google OAuth는 Supabase Auth가 계정을 관리하며, 처음 Google 계정으로 로그인할 때 Supabase Auth 사용자 계정이 만들어집니다.

브라우저의 `localStorage` 변경 사항이 감지되면 자동으로 Supabase `user_workspaces` 테이블에 실시간 동기화되며, 로그인 시 원격 클라우드 자료와 로컬 자료가 자동 병합되어 기기 간 연속 작업이 가능합니다.

## 1. Supabase 테이블 및 접근 정책 만들기

Supabase 대시보드에서 프로젝트를 열고 **SQL Editor → New query**에서 다음 마이그레이션 파일들을 실행합니다.

1. `supabase/migrations/202609220001_resume_profiles.sql` (이력서 단독 저장 테이블)
2. `supabase/migrations/202609220002_user_workspaces.sql` (전체 작업공간 실시간 동기화 테이블)

두 테이블 모두 RLS(Row Level Security)가 활성화되어 `auth.uid() = user_id` 정책으로 로그인한 사용자 본인의 데이터만 접근할 수 있어야 합니다. SQL을 실행하기 전후로 대시보드에서 정책 적용 여부를 확인하세요.

## 2. Google 로그인만 허용하도록 설정

Supabase 대시보드에서 **Authentication → Providers**를 엽니다.

1. Google Provider를 활성화하고 OAuth 자격 증명을 설정합니다.
2. 사용하지 않는 Email, Phone 등 다른 로그인 Provider는 비활성화 상태로 유지합니다.
3. Google 첫 로그인으로 새 계정을 만들 수 있도록 신규 사용자 가입은 허용합니다. Email Provider를 끄는 것과 전체 신규 가입을 끄는 것은 다릅니다. 전체 가입을 끄면 처음 방문한 Google 사용자가 계정을 만들지 못할 수 있습니다.
4. Authentication의 URL 설정에는 실제 배포 도메인만 필요한 범위로 등록하고, 더 이상 쓰지 않는 미리보기·개발 URL은 제거합니다.

Google Cloud Console에서 OAuth 2.0 클라이언트(웹 애플리케이션)를 만든 다음:

- **Authorized JavaScript origins**에 배포 도메인을 추가합니다: `https://weg-lime.vercel.app`
- **Authorized redirect URIs**에 Supabase가 안내하는 callback URL을 추가합니다. 아래는 현재 프로젝트 주소 형식입니다.

```text
https://tbumlutxmehsmdodwira.supabase.co/auth/v1/callback
```

Google Cloud에서 발급된 OAuth Client ID와 Client Secret을 Supabase의 Google Provider 설정에 입력하고 저장합니다. Client Secret은 Google Cloud와 Supabase 대시보드에만 두며 프런트엔드 파일, 채팅, Git 저장소에 넣지 마세요. Google OAuth 동의 화면이 테스트 상태라면 테스트 사용자도 등록해야 합니다.

## 3. 로그인 후 돌아올 주소 허용

Supabase **Authentication → URL Configuration**에서 Site URL과 Redirect URLs를 설정합니다.

```text
Site URL:      https://weg-lime.vercel.app
Redirect URLs: https://weg-lime.vercel.app/**
```

로컬 개발이나 Vercel 미리보기 주소를 사용할 경우 그 주소도 필요한 범위만 별도로 허용 목록에 등록합니다. OAuth 흐름은 프런트엔드 주소로 돌아오므로 허용 주소와 실제 접속 주소의 프로토콜·도메인이 맞아야 합니다.

## 4. 세션 만료와 Refresh Token Rotation

Supabase 대시보드의 **Authentication → Settings**에서 세션/JWT 설정을 점검합니다.

- 별도 요구가 없다면 JWT 만료 시간을 기본값인 **3600초(1시간)**로 유지합니다. 장시간으로 늘리는 것은 피하고, 서비스의 보안 요구와 사용자 경험을 검토한 뒤에만 변경합니다.
- Refresh Token Rotation(및 관련 재사용 감지/보호 설정)은 활성화된 기본 상태를 유지하고 끄지 않습니다. Supabase가 기본값으로 회전과 재사용 방지를 적용하는 경우 임의 변경하지 마세요.
- 별도의 최대 세션 수명 또는 비활성 세션 만료 설정을 변경했다면 장기간 미사용 세션이 불필요하게 유지되지 않는지 확인합니다.
- 대시보드의 항목 이름과 위치는 Supabase 버전에 따라 다를 수 있으니, JWT 만료 시간과 Refresh Token Rotation 설정이 실제 프로젝트에서 어떤 값인지 저장 전에 확인합니다.

## 5. 공개 브라우저 설정 입력

`frontend/assets/js/supabase-config.js`에 설정된 값:

```js
window.PLEN_SUPABASE_CONFIG = {
  url: 'https://tbumlutxmehsmdodwira.supabase.co',
  anonKey: 'sb_publishable_yYUGgf5zpE1HLIgL2FUEMA_shkBJCEw'
};
```

값은 Supabase 프로젝트의 **Project Settings → API**에서 확인합니다. 브라우저 코드에는 `anon`/`publishable` 공개 키만 사용할 수 있습니다. `service_role`, secret key, DB 비밀번호, Google OAuth Client Secret은 절대로 입력하지 마세요. 데이터 접근은 사용자별 RLS 정책으로 제한되어야 합니다.

## 6. Vercel 보안 헤더 적용

프로젝트 루트의 `vercel.json`에 `X-Frame-Options: DENY`와 CSP 등 기본 보안 응답 헤더를 설정했습니다. 자세한 내용 및 현재 CSP의 인라인 코드 호환성 제약은 [`SECURITY_SETUP.md`](SECURITY_SETUP.md)를 확인하세요. 설정 적용에는 Vercel 재배포가 필요합니다.

## 7. 배포 후 확인

1. 변경된 코드를 Vercel에 배포하고 `https://weg-lime.vercel.app/`에서 엽니다.
2. 개발자 도구의 Network에서 문서 응답의 `X-Frame-Options`와 `Content-Security-Policy` 헤더가 설정됐는지 확인합니다.
3. 헤더의 **Google 로그인 / 회원가입** 또는 이력서 화면의 Google 로그인 버튼을 누릅니다.
4. 처음 이용하는 Google 계정은 로그인 성공 후 Supabase Auth에 계정이 생성됩니다. 인증을 마치고 사이트로 돌아오는지 확인합니다.
5. 이력서에 이름을 입력하고 클라우드 저장을 누른 다음 같은 계정으로 다른 브라우저/기기에서 로그인해 불러오기를 확인합니다. 다른 계정이 해당 행을 읽을 수 없는지 RLS를 점검합니다.
6. 로그아웃 후 세션이 종료되는지 확인합니다.

클라우드 불러오기는 현재 이력서 입력과 `plen-resume-v1` 로컬 저장본을 교체한 뒤 페이지를 새로고침합니다. 실행 전에 로컬 자료를 별도 보관하세요. 로그아웃은 브라우저의 로컬 이력서 복사본을 삭제하지 않습니다.

## 주의 및 현재 범위

- Supabase JS v2 SDK를 CDN에서 불러옵니다. CDN 네트워크가 차단되면 클라우드 기능은 동작하지 않습니다.
- 브라우저 SDK를 직접 사용하는 방식이며 별도 MVC 백엔드 프록시는 없습니다. 공개 키를 숨기는 설계가 아니라 RLS로 행 접근을 통제합니다.
- 인증 공급자는 Google만 UI에서 사용합니다. 실제로 Google만 허용하려면 Supabase Dashboard에서 다른 Auth providers도 비활성화해야 합니다. 처음 Google OAuth 인증을 완료하면 신규 Supabase Auth 계정이 만들어져 로그인과 가입 절차가 하나로 처리됩니다.
- 이력서에는 이름·이메일·전화번호 등 개인정보를 저장할 수 있습니다. 실제 자료 입력 전 Google OAuth 설정과 RLS를 확인하세요.
- Supabase migration, OAuth Provider 자격 증명, URL 허용 목록, 세션 설정, 설정 파일 및 Vercel 배포는 사용자가 대시보드와 프로젝트에서 직접 완료해야 합니다. 이 작업 환경에서는 실제 Supabase/Vercel 설정이나 브라우저 확인을 수행하지 않았습니다.
- 브라우저에서 실행하거나 자동 테스트를 수행하지 않았습니다.
- 프로젝트의 관련 보안 변경 및 배포 전 확인 사항은 [`SECURITY_SETUP.md`](SECURITY_SETUP.md)에도 정리했습니다.
