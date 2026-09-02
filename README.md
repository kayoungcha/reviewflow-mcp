# ReviewFlow MCP

GitHub Pull Request의 코드 변경사항과 Jira 요구사항을 수집하고, OpenAI를 통해 자동으로 코드 리뷰를 수행하는 **GitHub PR 자동 리뷰 도구**입니다.

GitHub Actions와 ReviewFlow 서버를 연결하여 PR 생성 또는 새로운 커밋 push 시 자동으로 리뷰를 실행하고, 결과를 PR 댓글과 GitHub Actions Check상태로 반영합니다.

## 주요 기능

- GitHub Pull Request 정보 및 diff 수집
- Jira 연결 시 티켓 요구사항과 코드 변경사항 비교
- OpenAI 기반 자동 코드 리뷰
- `통과` / `수정 권장` / `수정 필요` 판정
- PR 리뷰 댓글 자동 작성 및 갱신
- 판정에 따른 GitHub Check 성공 / 실패 처리
- GitHub Actions OIDC 기반 인증
- 허용된 GitHub 저장소만 리뷰 실행
- 선택적인 Jira 연동
- stdio / Streamable HTTP MCP 지원

---

## Architecture

```text
Pull Request 생성 / push
        ↓
GitHub Actions
        ↓ GitHub OIDC 인증
ReviewFlow API
        ↓ MCP_API_TOKEN
MCP Server
   ├─ GitHub PR / diff
   └─ Jira 요구사항 (선택)
        ↓
OpenAI Code Review
        ↓
ReviewResult
        ↓
GitHub Actions
   ├─ PR 댓글 작성 / 갱신
   └─ Check 성공 / 실패
```

ReviewFlow는 GitHub Actions, 리뷰 서비스, 외부 데이터 조회를 분리하여 구성했습니다.

GitHub Actions는 PR 이벤트를 감지하고 ReviewFlow API를 호출하며, ReviewFlow 서버는 MCP를 통해 GitHub와 Jira 정보를 수집한 뒤 OpenAI 리뷰를 실행합니다.

---

## MCP Tools

### GitHub / Jira

| Tool                       | 역할                                   |
| -------------------------- | -------------------------------------- |
| `githubPullRequestContext` | 원격 GitHub PR 정보와 변경사항 조회    |
| `getJiraIssue`             | Jira 티켓의 요구사항 및 수용 기준 조회 |

### Local Git

| Tool                  | 역할                           |
| --------------------- | ------------------------------ |
| `currentBranch`       | 현재 브랜치 조회               |
| `lastCommit`          | 최근 커밋 조회                 |
| `gitStatus`           | 변경 파일 상태 조회            |
| `gitDiff`             | unstaged diff 조회             |
| `stagedDiff`          | staged diff 조회               |
| `gitReviewContext`    | 현재 저장소 리뷰 컨텍스트 조회 |
| `branchReviewContext` | 두 브랜치 사이 변경사항 조회   |

`greeting`, `dice`, `coin` 등의 Tool은 MCP의 Tool 등록 및 호출 구조를 학습하는 과정에서 작성했으며 학습 기록으로 유지하고 있습니다.

---

## 인증 구조

```text
GitHub Actions
      │
      │ GitHub OIDC Token
      ▼
ReviewFlow API
      │
      │ MCP_API_TOKEN
      ▼
MCP Endpoint
   ├─ GitHub API
   └─ Jira API
```

각 인증값은 서로 다른 책임을 가집니다.

| 인증값            | 역할                                 |
| ----------------- | ------------------------------------ |
| GitHub OIDC Token | GitHub Actions → ReviewFlow API 인증 |
| `MCP_API_TOKEN`   | `/mcp` 엔드포인트 보호               |
| `GITHUB_TOKEN`    | GitHub API 접근                      |
| `JIRA_API_TOKEN`  | Jira API 접근                        |
| `OPENAI_API_KEY`  | OpenAI API 접근                      |

### OIDC를 사용한 이유

초기에는 ReviewFlow API 전용 장기 토큰을 각 GitHub 저장소의 Secret으로 등록하는 방식을 사용했습니다.

현재는 GitHub Actions가 실행될 때 GitHub가 발급하는 임시 OIDC 토큰을 사용합니다.

이를 통해:

- 저장소별 ReviewFlow API Secret 발급 불필요
- 장기 인증정보의 분산 저장 방지
- 토큰 교체 및 폐기 관리 감소
- 요청이 실제 어느 GitHub 저장소에서 발생했는지 검증

할 수 있도록 변경했습니다.

ReviewFlow 서버는 OIDC로 확인된 저장소가 `REVIEWFLOW_ALLOWED_REPOSITORIES`에 포함된 경우에만 리뷰를 실행합니다.

---

## 프로젝트 구조

### 현재 권장 구조

| 파일                                             | 역할                                  |
| ------------------------------------------------ | ------------------------------------- |
| `server-http.ts`                                 | ReviewFlow HTTP API 및 MCP 엔드포인트 |
| `github-oidc.ts`                                 | GitHub Actions OIDC 검증              |
| `review-api.ts`                                  | 리뷰 API 요청 검증                    |
| `review-orchestrator/github-review-service.ts`   | 리뷰 파이프라인 실행                  |
| `mcp-server.ts`                                  | MCP Tool 등록                         |
| `tools/github-tools.ts`                          | GitHub PR 조회 MCP Tool               |
| `templates/github-actions/reviewflow-review.yml` | 다른 저장소에 설치할 Actions 템플릿   |

### 로컬 실행 및 초기 구현

| 파일                                   | 역할                     |
| -------------------------------------- | ------------------------ |
| `server.ts`                            | stdio MCP 서버           |
| `review-orchestrator/index.ts`         | 로컬 Git 변경사항 리뷰   |
| `review-orchestrator/github-review.ts` | 원격 GitHub PR 수동 리뷰 |
| `review-orchestrator/judge.ts`         | CLI 리뷰 결과 출력       |
| `http-client-test.ts`                  | HTTP MCP 연결 테스트     |

저장소에는 MCP와 코드 리뷰 자동화의 동작을 학습하면서 작성한 초기 구현도 함께 보존하고 있습니다.

현재 다른 저장소에 ReviewFlow를 연결할 때는 중앙 ReviewFlow API 방식을 사용합니다.

---

## 리뷰 결과

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

| 판정        | GitHub Check |
| ----------- | ------------ |
| `통과`      | 성공         |
| `수정 권장` | 성공         |
| `수정 필요` | 실패         |

---

## 변경 파일 처리

GitHub API를 통해 PR 변경 파일을 페이지 단위로 조회합니다.

- 페이지당 최대 100개
- 최대 30페이지
- 최대 3,000개 파일
- MCP 응답에 포함되는 전체 patch 최대 60,000자

일부 파일이나 patch가 제한으로 제외된 경우 전체 변경사항을 검토한 것처럼 표현하지 않도록 조회 범위를 리뷰 컨텍스트에 함께 전달합니다.

---

## 로컬 실행

```bash
pnpm install
cp .env.example .env
```

HTTP MCP 서버:

```bash
pnpm mcp:http
```

stdio MCP 서버:

```bash
pnpm dev
```

현재 저장소 변경사항 리뷰:

```bash
pnpm review
```

원격 GitHub PR 수동 리뷰:

```bash
pnpm review:github -- \
  https://github.com/owner/repository \
  12
```

---

## 테스트

```bash
pnpm test
pnpm typecheck
pnpm exec prettier --check .
```

주요 테스트 범위:

- GitHub 저장소 URL 파싱
- GitHub 변경 파일 pagination
- Jira 티켓 키 추출
- 저장소별 Jira 프로젝트 제한
- 리뷰 판정
- ReviewFlow API 요청 검증
- OIDC 발급자, audience, 만료 및 서명 검증
- 허용 저장소 검사
- MCP 결과 파싱
- GitHub / Jira 리뷰 컨텍스트 조합

---

## 현재 지원 범위

ReviewFlow는 **한 사용자 또는 한 팀이 자신의 환경에 배포하여 사용하는 self-hosted 도구**를 기준으로 합니다.

현재 지원:

- 하나의 ReviewFlow 서버에서 여러 GitHub 저장소 사용
- 공개 및 권한이 부여된 비공개 저장소 리뷰
- Jira를 사용하지 않는 PR 리뷰
- 하나의 Jira 사이트 내 여러 프로젝트 사용
- GitHub Actions OIDC 인증
- 중앙 ReviewFlow API 기반 자동 리뷰

현재 범위에 포함하지 않음:

- 사용자 회원가입
- 여러 사용자의 Jira 계정 관리
- Atlassian OAuth
- 여러 Jira 사이트 연결
- 사용자별 GitHub Token 관리
- SaaS 형태의 공개 서비스

다른 사용자는 ReviewFlow를 자신의 환경에 배포하고 GitHub, OpenAI 및 선택적으로 Jira 인증정보를 설정하여 사용할 수 있습니다.

---

## GitHub Actions 설치

다른 저장소에 ReviewFlow를 연결하는 방법과 Jira 연동, GitHub 권한 및 문제 해결 방법은 다음 문서를 참고합니다.

`templates/github-actions/README.md`

---
