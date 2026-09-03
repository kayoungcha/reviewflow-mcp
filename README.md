# ReviewFlow MCP

GitHub Pull Request의 변경사항과 선택적으로 연결된 Jira 요구사항을 수집하고, OpenAI를 통해 자동 코드 리뷰를 수행하는 self-hosted ReviewFlow 서버입니다.
다른 GitHub 저장소에 Actions 워크플로 하나를 설치하면 PR 생성과 새로운 커밋 push를 감지하여 리뷰를 실행합니다.

## 주요 기능

- GitHub Pull Request 정보와 diff 수집
- Jira 요구사항과 코드 변경사항 비교
- OpenAI 기반 자동 코드 리뷰
- `통과` / `수정 권장` / `수정 필요` 판정
- PR 리뷰 댓글 자동 작성 및 갱신
- 판정에 따른 GitHub Actions 성공 또는 실패 처리
- PR 생명주기에 따른 Jira 상태 이동 및 댓글 작성
- GitHub Actions OIDC 기반 인증
- 허용된 GitHub 저장소만 리뷰 실행
- 선택적인 Jira 연동

## 동작 구조

```text
Pull Request 생성 / push / 종료
        ↓
GitHub Actions
        ↓ GitHub OIDC 인증
ReviewFlow HTTP Server
        │
        ├─ /reviews/github
        │      ↓
        │   MCP Client
        │      ↓ MCP_API_TOKEN
        │   MCP Server
        │      ├─ GitHub PR / diff 조회
        │      └─ Jira 요구사항 조회 (선택)
        │      ↓
        │   OpenAI Code Review
        │      ↓
        │   ReviewResult
        │      ↓
        │   PR 댓글 작성 / 갱신
        │   GitHub Actions 작업 성공 또는 실패 처리
        │
        └─ /jira/github-pull-request (선택)
               ↓
            Jira 상태 이동 / 댓글 작성
```

GitHub Actions는 PR 이벤트를 감지하고 GitHub가 발급한 임시 OIDC 토큰으로 ReviewFlow 서버에 자신을 인증합니다.
AI 리뷰 요청에서는 ReviewFlow 서버 내부의 MCP 클라이언트가 GitHub와 선택적인 Jira 정보를 수집하고, 이를 하나의 리뷰 컨텍스트로 조합해 OpenAI에 전달합니다.
Jira를 연결한 저장소에서는 별도의 Jira 생명주기 요청도 실행하여 PR 생성·업데이트 시 티켓을 검토 중으로 이동하고, PR 병합 시 완료로 이동합니다.

## 환경변수 설정

ReviewFlow 서버를 로컬에서 실행할 때는 `.env`를 사용하고, 서버에 배포할 때는 같은 이름의 값을 호스팅 서비스의 환경변수에 등록합니다.

| 환경변수                          | 필수 여부 | 역할                                        |
| --------------------------------- | --------- | ------------------------------------------- |
| `OPENAI_API_KEY`                  | 필수      | OpenAI 코드 리뷰 실행                       |
| `GITHUB_TOKEN`                    | 필수      | GitHub PR 및 변경 파일 조회                 |
| `MCP_API_TOKEN`                   | 필수      | ReviewFlow 내부 `/mcp` 엔드포인트 보호      |
| `REVIEWFLOW_ALLOWED_REPOSITORIES` | 필수      | ReviewFlow 사용을 허용할 GitHub 저장소 목록 |
| `JIRA_BASE_URL`                   | 선택      | Jira 사이트 주소                            |
| `JIRA_EMAIL`                      | 선택      | Jira API 토큰을 발급한 계정 이메일          |
| `JIRA_API_TOKEN`                  | 선택      | Jira API 인증                               |
| `JIRA_REVIEW_STATUS_ID`           | 선택      | Jira의 검토 중 상태 ID                      |

Jira를 사용하지 않는다면 Jira 관련 환경변수는 등록하지 않아도 됩니다.

여러 GitHub 저장소를 허용할 때는 쉼표로 구분합니다.

```text
REVIEWFLOW_ALLOWED_REPOSITORIES=owner/project-a,owner/project-b
```

로컬 실행에 필요한 전체 예시는 [`.env.example`](./.env.example)에서 확인할 수 있습니다.

### 설정 위치

| 실행 환경                         | 설정 위치                     |
| --------------------------------- | ----------------------------- |
| 로컬 ReviewFlow 서버              | `.env`                        |
| 배포된 ReviewFlow 서버            | 호스팅 서비스의 환경변수 설정 |
| ReviewFlow를 연결할 GitHub 저장소 | Repository Variable           |
| GitHub Repository Secrets         | 사용하지 않음                 |

GitHub Actions는 장기 Secret 대신 GitHub가 실행 시점에 발급하는 임시 OIDC 토큰으로 ReviewFlow API를 호출합니다.

## GitHub 저장소 연결

ReviewFlow를 사용할 저장소에 Actions 호출 워크플로를 설치합니다.

```text
templates/github-actions/reviewflow-review.yml
→ .github/workflows/reviewflow-review.yml
```

호출 워크플로는 reviewflow-mcp 저장소의 v1 재사용 워크플로를 실행합니다.
실제 리뷰와 Jira 생명주기 로직은 중앙 재사용 워크플로에서 관리되므로, 연결 저장소마다 전체 워크플로를 복사해 유지할 필요가 없습니다.

그다음 ReviewFlow 서버의 `REVIEWFLOW_ALLOWED_REPOSITORIES`에 대상 저장소를 추가합니다.
Jira를 함께 사용한다면 대상 GitHub 저장소에 다음 Repository Variable을 등록합니다.

```text
Name: REVIEWFLOW_JIRA_PROJECT_KEY
Value: MCPTEST
```

Jira를 사용하지 않는 저장소에는 이 변수를 등록하지 않아도 됩니다.
이 경우 GitHub Pull Request만 수집하여 리뷰합니다.

설치 방법과 필요한 GitHub 권한, 문제 해결 방법은 [`templates/github-actions/README.md`](./templates/github-actions/README.md)에서 확인할 수 있습니다.

## 실행 방법

### 로컬 실행

의존성을 설치하고 환경변수 예시 파일을 복사합니다.

```bash
pnpm install
cp .env.example .env
```

`.env`에 실제 값을 입력한 뒤 ReviewFlow HTTP 서버를 실행합니다.

```bash
pnpm mcp:http
```

기본 주소는 다음과 같습니다.

```text
Health Check: http://127.0.0.1:5200/health
MCP Endpoint: http://127.0.0.1:5200/mcp
Review API: http://127.0.0.1:5200/reviews/github
Jira Lifecycle API: http://127.0.0.1:5200/jira/github-pull-request
```

### 배포 예시: Render

Render Web Service에 이 저장소를 연결하고 다음 명령을 설정합니다.

```text
Build Command: pnpm install --frozen-lockfile
Start Command: pnpm start
Health Check Path: /health
```

필요한 서버 환경변수는 Render Dashboard의 Environment에 등록합니다.

## 리뷰 결과

ReviewFlow API는 다음 형식으로 리뷰 결과를 반환합니다.

```json
{
  "reviewer": "OpenAI",
  "jiraSummary": "Jira 티켓 요약 또는 null",
  "summary": "전체 코드 리뷰 요약",
  "positives": ["잘된 점"],
  "issues": ["개선할 점"],
  "verdict": "통과"
}
```

GitHub Actions는 이 결과를 PR 댓글로 작성합니다. 같은 PR에서 리뷰가 다시 실행되면 새 댓글을 추가하지 않고 기존 ReviewFlow 댓글을 갱신합니다.

| 판정        | PR 댓글      | GitHub Actions 결과 |
| ----------- | ------------ | ------------------- |
| `통과`      | ✅ 통과      | 성공                |
| `수정 권장` | 🟡 수정 권장 | 성공                |
| `수정 필요` | ❌ 수정 필요 | 실패                |

## Jira 생명주기 자동화

`REVIEWFLOW_JIRA_PROJECT_KEY`가 설정된 저장소에서는 PR 이벤트에 따라 Jira 티켓을 자동으로 처리합니다.

| Pull Request 이벤트               | Jira 처리                           |
| --------------------------------- | ----------------------------------- |
| PR 생성                           | 검토 중으로 이동                    |
| 새로운 커밋 push                  | 검토 중 상태 확인                   |
| Draft에서 Ready for review로 변경 | 검토 중으로 이동                    |
| 종료된 PR 다시 열기               | 검토 중으로 이동하고 Jira 댓글 작성 |
| PR 병합                           | 완료로 이동                         |
| 병합하지 않고 PR 종료             | 상태는 유지하고 Jira 댓글 작성      |

다음 경우에는 Jira 처리를 생략하고 GitHub 코드 리뷰만 계속합니다.

- `REVIEWFLOW_JIRA_PROJECT_KEY`가 설정되지 않은 경우
- 작업 브랜치에 Jira 티켓 키가 없는 경우
- 작업 브랜치의 Jira 프로젝트 키가 설정값과 다른 경우
- Jira 티켓이 이미 완료 상태인 경우

완료된 Jira 티켓은 검토 중으로 되돌리지 않으며, GitHub Actions에 실패 대신 warning을 표시합니다.

## MCP 도구

ReviewFlow 서버는 코드 리뷰에 필요한 외부 정보를 MCP 도구로 제공합니다.

| 도구                       | 역할                                          |
| -------------------------- | --------------------------------------------- |
| `githubPullRequestContext` | GitHub PR 정보, 변경 파일 및 diff 조회        |
| `getJiraIssue`             | Jira 티켓의 제목, 설명, 상태 및 요구사항 조회 |

ReviewFlow의 MCP 클라이언트는 리뷰 요청마다 필요한 도구를 호출하고, GitHub와 Jira 결과를 하나의 리뷰 컨텍스트로 조합합니다.

GitHub 변경 파일은 페이지 단위로 최대 3,000개까지 조회합니다. MCP 응답에 포함되는 patch는 최대 60,000자로 제한하며, 일부 파일이나 patch가 제외된 경우 실제 검토 범위를 리뷰 컨텍스트에 함께 표시합니다.

## 프로젝트 구조

| 경로                                        | 역할                                          |
| ------------------------------------------- | --------------------------------------------- |
| `.github/workflows/reusable-reviewflow.yml` | 다른 저장소에서 호출하는 중앙 재사용 워크플로 |
| `src/server/server-http.ts`                 | ReviewFlow HTTP 서버와 API 엔드포인트 실행    |
| `src/auth/github-oidc.ts`                   | GitHub Actions OIDC 토큰 검증                 |
| `src/review/review-api.ts`                  | 코드 리뷰 API 요청 형식 검증                  |
| `src/review/github-review-service.ts`       | GitHub·Jira 정보 수집과 리뷰 흐름 조율        |
| `src/review/codex.ts`                       | OpenAI 코드 리뷰 실행                         |
| `src/mcp/mcp-server.ts`                     | MCP 서버 생성 및 도구 등록                    |
| `src/mcp/tools/github-tools.ts`             | GitHub PR 조회 MCP 도구 등록                  |
| `src/github/github.ts`                      | GitHub API 요청과 PR 컨텍스트 생성            |
| `src/jira/jira-client.ts`                   | Jira API 요청                                 |
| `src/jira/jira-lifecycle-service.ts`        | PR 이벤트에 따른 Jira 상태와 댓글 처리        |
| `src/cli/github-review.ts`                  | 원격 GitHub PR을 수동으로 리뷰하는 CLI        |
| `templates/github-actions/`                 | 연결 저장소에 설치할 호출 워크플로와 설명서   |

## 수동 리뷰 및 검증

저장소 주소와 PR 번호를 직접 입력해 리뷰할 수도 있습니다.

```bash
pnpm review:github -- \
  https://github.com/owner/repository \
  12
```

테스트와 타입 검사는 다음 명령으로 실행합니다.

```bash
pnpm test
pnpm typecheck
pnpm exec prettier --check .
```

## 현재 범위

ReviewFlow는 한 사용자 또는 한 팀이 자신의 환경에 배포하여 사용하는 self-hosted 도구를 기준으로 합니다.

현재 지원하는 범위:

- 하나의 ReviewFlow 서버에서 여러 GitHub 저장소 사용
- 공개 저장소 및 권한이 부여된 비공개 저장소 리뷰
- Jira를 사용하지 않는 GitHub PR 리뷰
- 하나의 Jira 사이트 내 여러 프로젝트 연결
- GitHub Actions OIDC 인증
- 중앙 ReviewFlow API 기반 AI 리뷰와 Jira 생명주기 자동화
