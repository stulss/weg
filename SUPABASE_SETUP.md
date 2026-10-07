# plen Google 로그인·Supabase 전체 데이터 동기화 설정

현재 Supabase 연동 범위는 **Google OAuth 로그인/회원가입**, 로그인 사용자의 **이력서 단독 저장**, 그리고 **전체 작업공간(경험 카드, 채용공고 분석, 자기소개서 팩트시트/초안 히스토리, 리추얼 기록·연결) 실시간 자동 동기화**입니다. Google OAuth는 Supabase Auth가 계정을 관리하며, 처음 Google 계정으로 로그인할 때 Supabase Auth 사용자 계정이 만들어집니다.

브라우저의 `localStorage` 변경 사항이 감지되면 자동으로 Supabase `user_workspaces` 테이블에 실시간 동기화되며, 로그인 시 원격 클라우드 자료와 로컬 자료가 자동 병합되어 기기 간 연속 작업이 가능합니다.

## 1. Supabase 테이블 및 접근 정책 만들기

Supabase 대시보드에서 프로젝트를 열고 **SQL Editor → New query**에서 다음 마이그레이션 파일들을 차례로 실행합니다 (이미 자동 실행 완료됨).

1. `supabase/migrations/202609220001_resume_profiles.sql` (이력서 단독 저장 테이블)
2. `supabase/migrations/202609220002_user_workspaces.sql` (전체 작업공간 실시간 동기화 테이블)

두 테이블 모두 RLS(Row Level Security)가 활성화되어 `auth.uid() = user_id` 정책으로 로그인한 사용자 본인의 데이터만 접근할 수 있습니다.

## 2. Google 로그인만 허용하도록 설정

Supabase 대시보드에서 **Authentication → Providers → Google**을 열고 Google Provider를 활성화합니다. Google 이외의 Email·Phone 등 사용하지 않을 로그인 공급자는 비활성화하고, 프로젝트의 가입 허용 설정에서 신규 사용자 가입이 막혀 있지 않은지 확인합니다. 앱 UI에서도 Google 로그인만 제공합니다.

Google Cloud Console에서 OAuth 2.0 클라이언트(웹 애플리케이션)를 만든 다음:

- **Authorized JavaScript origins**에 배포 도메인을 추가합니다: `https://weg-lime.vercel.app`
- **Authorized redirect URIs**에 Supabase가 안내하는 callback URL을 추가합니다. 보통 아래 형식입니다. `<project-ref>`는 실제 Supabase 프로젝트 참조값으로 바꿉니다.

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

## 4. 공개 브라우저 설정 입력

`frontend/assets/js/supabase-config.js`에 설정된 값:

```js
window.PLEN_SUPABASE_CONFIG = {
  url: 'https://tbumlutxmehsmdodwira.supabase.co',
  anonKey: 'sb_publishable_yYUGgf5zpE1HLIgL2FUEMA_shkBJCEw'
};
```

값은 Supabase 프로젝트의 **Project Settings → API**에서 확인합니다. 브라우저 코드에는 `anon`/`publishable` 공개 키만 사용할 수 있습니다. `service_role`, secret key, DB 비밀번호, Google OAuth Client Secret은 절대로 입력하지 마세요. 이 앱의 이력서 행 접근은 RLS 정책으로 제한합니다.

## 5. 배포 후 확인

1. 변경된 코드를 Vercel에 배포하고 `https://weg-lime.vercel.app/`에서 엽니다.
2. 헤더의 **Google 로그인 / 회원가입** 또는 이력서 화면의 Google 로그인 버튼을 누릅니다.
3. 처음 이용하는 Google 계정은 로그인 성공 후 Supabase Auth에 계정이 생성됩니다. 인증을 마치고 사이트로 돌아오는지 확인합니다.
4. 이력서에 이름을 입력하고 **현재 이력서를 클라우드에 저장**을 누릅니다.
5. 같은 계정으로 다른 브라우저/기기에서 로그인해 **클라우드에서 불러오기**를 확인합니다. Supabase Table Editor에서 사용자 행을 확인하고, 다른 계정으로는 해당 행을 읽을 수 없는지 RLS를 점검합니다.
6. 헤더 또는 이력서 패널의 로그아웃을 확인합니다.

클라우드 불러오기는 현재 이력서 입력과 `plen-resume-v1` 로컬 저장본을 교체한 뒤 페이지를 새로고침합니다. 실행 전에 로컬 자료를 별도 보관하세요. 로그아웃은 브라우저의 로컬 이력서 복사본을 삭제하지 않습니다.

## 주의 및 현재 범위

- Supabase JS v2 SDK를 CDN에서 불러옵니다. CDN 네트워크가 차단되면 클라우드 기능은 동작하지 않습니다.
- 브라우저 SDK를 직접 사용하는 방식이며 별도 MVC 백엔드 프록시는 없습니다. 공개 키를 숨기는 설계가 아니라 RLS로 행 접근을 통제합니다.
- 인증 공급자는 Google만 UI에서 사용합니다. 실제로 Google만 허용하려면 Supabase Dashboard에서 다른 Auth providers도 비활성화해야 합니다. 처음 Google OAuth 인증을 완료하면 신규 Supabase Auth 계정이 만들어져 로그인과 가입 절차가 하나로 처리됩니다.
- 이력서에는 이름·이메일·전화번호 등 개인정보를 저장할 수 있습니다. 실제 자료 입력 전 Google OAuth 설정과 RLS를 확인하세요.
- Supabase migration, OAuth Provider 자격 증명, URL 허용 목록, 설정 파일 및 Vercel 배포는 사용자가 대시보드와 프로젝트에서 직접 완료해야 합니다. 이 작업 환경에서는 실제 Supabase/Vercel 설정이나 브라우저 확인을 수행하지 않았습니다.
- 브라우저에서 실행하거나 자동 테스트를 수행하지 않았습니다.
