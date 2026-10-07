# plen 보안 설정

## 1. Vercel 보안 헤더

프로젝트 루트의 `vercel.json`에 다음 응답 헤더를 설정했습니다.

- `X-Frame-Options: DENY` — 다른 사이트가 plen을 iframe으로 삽입하는 것을 차단합니다.
- `Content-Security-Policy` — 기본 리소스는 같은 출처로 제한하고, 스크립트는 앱과 Supabase JS CDN만 허용합니다. Google Fonts의 스타일·폰트 연결은 필요한 도메인으로 한정했습니다. 프레임·플러그인 객체를 막고, Supabase 프로젝트에만 연결을 허용합니다.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`도 함께 설정했습니다.

CSP의 `script-src` 및 `script-src-attr`는 인라인 `<script>`와 인라인 이벤트 핸들러를 허용하지 않습니다. JavaScript는 허용된 앱 파일과 Supabase JS CDN에서만 불러옵니다. 마크업의 `style="..."` 속성 및 JS에서 요소의 `.style` 속성을 변경하는 기존 코드를 위해 `style-src-attr 'unsafe-inline'`은 허용했습니다. 그러므로 인라인 스크립트 삽입 방어는 적용되지만, 스타일 속성 삽입까지 막는 완전한 strict CSP는 아닙니다. 더 강하게 하려면 인라인 스타일 속성을 외부 CSS/class로 옮긴 뒤 `style-src-attr` 허용을 제거해야 합니다. `unsafe-eval`은 허용하지 않습니다.

설정은 **Vercel에 다음 배포를 해야 응답 헤더에 적용**됩니다. 이 환경에서는 Vercel 프로젝트를 배포하거나 응답 헤더를 확인하지 않았습니다. 배포 후 개발자 도구의 Network에서 문서 응답 헤더를 보고, Console에서 CSP 위반 여부도 확인하세요. `X-Frame-Options: DENY` 때문에 다른 사이트 안에 앱을 임베드하는 사용 방식은 지원하지 않습니다.

## 2. Supabase Auth 대시보드 점검

대시보드 설정은 코드에서 변경할 수 없으므로, Supabase 프로젝트에서 직접 확인하세요.

### 로그인 방식

1. **Authentication → Providers**에서 Google만 활성화되어 있는지 확인합니다.
2. 사용하지 않는 Email, Phone 등 다른 로그인 Provider는 비활성화 상태로 유지합니다.
3. Google 첫 로그인으로 새 계정을 만들 수 있도록 신규 사용자 가입 허용은 켜 둡니다. Email Provider를 끄는 것과 전체 신규 가입을 끄는 것은 다릅니다. 전체 가입을 끄면 처음 방문한 Google 사용자가 계정을 만들지 못할 수 있습니다.
4. Authentication의 URL 설정에는 실제 배포 도메인만 필요한 범위로 등록하고, 더 이상 쓰지 않는 미리보기·개발 URL은 제거합니다.

### 세션과 토큰

- JWT 만료 시간은 별도 요구가 없다면 Supabase 기본값인 **3600초(1시간)**로 유지합니다. 더 길게 늘리지 말고, 서비스를 실제 사용하는 방식과 위험에 따라 조정해야 한다면 먼저 영향과 보안 요구를 검토하세요.
- Refresh Token Rotation은 켜진 상태(기본 동작)로 유지합니다. 대시보드에 회전 또는 재사용 방지 설정이 표시되면 비활성화하지 말고 기본값을 유지하세요.
- 세션 만료/비활성 시간 설정을 변경한 적이 있다면 예상하지 않은 장기 세션이 허용되지 않는지 확인합니다.

## 3. 확인 결과 기록

현재 작업은 `vercel.json`과 이 안내 문서를 추가·갱신한 것입니다. Supabase 대시보드 설정, Vercel 배포, 배포 응답 헤더, Google 로그인 및 세션 동작은 이 환경에서 확인하지 않았습니다. 위 대시보드 점검은 사용자가 직접 완료한 뒤 결과를 확인해야 합니다.
