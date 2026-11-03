# 오토스케줄 (autoSchedule)

카페·매장 사장님용 근무표 자동 생성 서비스. 직원(유동 출퇴근)과 알바생(파트 단위)을 한 달 단위로 배치한다.
기획: `오토스케줄_기획서.md`, 요구사항·API 초안: `PRD.md`. 사용자와는 한국어로 대화한다.

## 구조
- `web/` — React 18 + Vite 6 + TypeScript + Tailwind v4 + react-query + zustand + @dnd-kit, 테스트는 vitest.
- 백엔드(Spring Boot)는 아직 없다. 기본은 브라우저 mock DB로 동작하고, `VITE_USE_MOCK=false`면 `/api`(localhost:8080)로 요청한다(`src/api/index.ts`, `src/api/auth.ts`).

## 명령 (web/ 에서)
- `npm run dev` / `npm run build` (`tsc -b && vite build`) / `npm test` (vitest)
- 검증 순서: `npx tsc -b` → `npx vitest run` → `npx vite build`

## 데이터
- mock DB: `src/api/mock.ts`, localStorage 키 `autoschedule-mock-v6`. 로드 시 `upgrade()`가 예전 형식을 고친다:
  - `availableParts`가 없는 데이터를 채운다.
  - 예전 시간대별 필요 인원(`demand`)을 지우고 파트별 `required`(기본 1)를 채운다.
  - 잠깐 썼던 평일·주말 분리의 주말 복사본(`id_WE`)은 원래 파트로 합치고 `days`를 지운다.
  - `workHours {start,end,days}` 형식을 요일별 배열로 바꾼다.
- 예시 데이터는 앱에 없다. 테스트 전용 `src/lib/__tests__/fixtures.ts`(카페 커푸치노 성수점, 2026-11-02 주).
- 매장 기본값: `src/api/defaults.ts`.
- 구성원:
  - 근무 파트: 평일·주말 구분이 없다. 저장할 때 시작 시각 순으로 정렬한다(`sortParts`).
  - 알바생: `availableParts[요일][]`(0=월)는 고정 근무 파트다. 고른 칸에는 반드시 배치한다.
  - 직원: `workHours`는 요일별 `{start,end}|null` 배열(고정 근무)이다.
- 근무표는 달력 기준 한 달(1일~말일)이다. 화면은 주(월~일) 탭으로 나눈다(`weeksOf`).

## 근무표 생성
- **AI 생성:** `POST /ai/generate`는 vite dev/preview 서버 미들웨어(`vite.config.ts`)가 로컬 Ollama `/api/chat`을 호출한다.
  - 주소·모델: `LLM_BASE_URL`(기본 `http://100.70.239.59:11434`, Proxmox VM), `LLM_MODEL`(기본 `qwen3.5:9b`). `web/.env.local`에서 바꾼다.
  - `format`에 JSON Schema(`RESPONSE_SCHEMA`)를 넘겨 JSON으로만 답하게 한다. `think: false`, `stream: true`(node fetch 300초 헤더 제한 회피), `num_ctx: 16384`, 제한 시간 600초. 응답에 `partId`는 받지 않는다(AI는 직원만 정함).
  - VM의 Ollama는 `OLLAMA_HOST=0.0.0.0`으로 띄워야 이 머신에서 닿는다.
- **프롬프트·검증:** `src/lib/ai.ts`.
  - `buildPrompt`는 구성원 이름·연락처를 빼고 `#id`로만 보낸다.
  - `toShifts`는 AI 응답을 믿지 않고 규칙에 맞지 않는 줄을 버린다.
- **규칙 기반 생성:**
  - `fixedShifts`(`src/lib/rules.ts`): 고정 근무(직원 요일별 시각, 알바생 고른 파트)를 깐다. 직접 만들기 미리 채우기, 자동 채우기, AI 생성(알바생 몫)이 모두 쓴다.
  - `autoFill`(`src/lib/autofill.ts`): 에디터의 "자동 채우기". 기존 근무는 유지하고 고정 근무만 더한다. 필요 인원으로 사람을 더 넣지 않는다.
  - AI는 직원 근무만 정한다. 필요 인원은 파트별 `required`이고, 겹치는 파트는 더한다(`requiredAt`).
- 규칙 엔진: `src/lib/rules.ts`(`validate`, `canWork`, `hoursOn`, 휴게 계산). 근무표 평가 UI(부족/충족, 규칙 위반 표시)는 의도적으로 뺐다.

## 화면 (라우트 → 파일)
- 로그인·회원가입: `/login`·`/signup` → `pages/Auth.tsx`. mock 계정은 localStorage에 있다. 로그인 가드는 `components/Layout.tsx`.
- 대시보드: `/` → `pages/Dashboard.tsx`. 오늘 근무 띠(`components/TodayStrip.tsx`), 통계 띠, 직원 근무 현황.
- 근무표 목록: `/schedules`.
- AI 생성: `/schedules/new` → `Generate.tsx`. 진행률 막대는 걸린 시간으로 추정한다.
- 직접 만들기: `/schedules/manual` → `CreateSchedule.tsx`.
- 에디터: `/schedules/:id` → `pages/schedule/ScheduleEditor.tsx`.
  - 보기: 한 달(`MonthView`), 파트별, 인원별, 일간(06–24시).
  - 기능: 전월·익월 이동, 자동 채우기, 근무 추가·수정 창(`ShiftDialog`).
- 직원·알바생 관리: `/staff` → `pages/Staff.tsx`. 알바생은 근무 파트 표(행=파트, 열=요일), 직원은 요일별 고정 근무 시각.
- 템플릿: `/templates`.
- 매장 설정: `/settings` → `pages/Settings.tsx`. 영업시간은 평일과 주말·공휴일을 따로 정한다. 근무 파트는 개수 제한 없이 추가할 수 있다.

## 디자인 시스템 (파스텔)
- Figma 파일 `H3pigmb77AZ88qmzl6PW5n`:
  - "Design System" 페이지: 변수 `DS Primitives`·`DS Semantic`, 글자 스타일 `DS/*`, 컴포넌트, Foundations 안내.
  - "디자인 시안" 페이지의 섹션 "DS 적용 화면 (파스텔)": 18개 화면의 기준 디자인.
  - 원본 페이지 "오토스케줄 Web": 예전 디자인을 웹 코드 기준으로 옮긴 화면.
- 코드 토큰: `web/src/index.css` `@theme`, Figma 변수와 1:1로 대응한다.
- 원칙:
  - 메뉴·카드·버튼 같은 틀은 무채색이다. `brand`는 검정이고, 선택 표시는 회색 알약(`brand-subtle`)이다.
  - 색은 근무 데이터에만 쓴다. 오픈=버터, 미들=민트, 마감=스카이, 직원=피치. 파스텔 바탕(`*-bg`)에 같은 계열 진한 글자를 쓴다. 미정은 점선, 연차는 회색, 경고는 연빨강이다.
  - 검정(primary) 버튼은 화면당 하나다. 버튼은 알약 모양, 카드는 둥글기 20에 1px 테두리이고 그림자가 없다. 그림자는 모달에만 쓴다.
  - 통계는 아이콘 없는 띠(`StatStrip`)로 보여준다. 아이콘 칩, 그라데이션, 보라·인디고 계열은 쓰지 않는다.
  - 화면 틀: 회색 사이드바 위에 흰 시트 본문을 둔다(8px 인셋, 둥글기 16).
- 공통 UI: `components/ui.tsx`, 아이콘·마크: `components/Icon.tsx`(lucide 경로를 코드에 직접 넣음, 의존성 없음).
- Tailwind 주의: `w-full`이 다른 너비 클래스를 이긴다. 너비를 따로 줄 때는 `inputBase`(w-full 없음)를 쓴다.

## 알려진 단순화 (`shortcut:` 주석)
- 공휴일은 2026년만 하드코딩돼 있다(`lib/time.ts`).
- 로컬 AI 호출은 vite 서버에서만 된다. 배포하려면 백엔드로 옮겨야 한다(`vite.config.ts`).
- 생성 진행률은 실제 진행이 아니라 시간 기반 추정이다(`Generate.tsx`).
- mock 계정은 브라우저에만 있고, 계정마다 데이터가 나뉘지 않는다(`api/auth.ts`).
- `web/README.md`는 예전 내용이 남아 있어 최신이 아니다.

## 작업 방식
- git: 보통 기능 브랜치(`feat/...`)에서 커밋·푸시한다. 사용자가 요청하면 main에 fast-forward 머지하고 브랜치를 지운다. 커밋 메시지는 한국어이고, 끝에 `Co-Authored-By` 줄을 붙인다.
- 커밋 전에 `.env*`가 포함되지 않았는지, 키 문자열이 없는지 확인한다.
- 이 환경에는 브라우저 도구가 없다. UI 변경은 타입 검사·테스트·빌드로만 검증한 것이며, 화면을 직접 보지 못했다고 사용자에게 알린다.
