# ReviewFlow GitHub Actions 설치

이 문서는 이미 배포된 ReviewFlow 서버를 다른 GitHub 저장소에 연결하는 방법을 설명합니다.
워크플로를 설치하면 다음 Pull Request 이벤트에서 ReviewFlow가 자동으로 실행됩니다.

- Pull Request 생성
- 새로운 커밋 push
- 종료된 Pull Request 다시 열기
- Draft Pull Request를 Ready for review로 변경
- Pull Request 종료 또는 병합

ReviewFlow는 AI 코드 리뷰 결과를 PR 댓글로 작성하고, 판정에 따라 GitHub Actions 작업을 성공 또는 실패로 처리합니다.

## 설치 전 준비

먼저 사용할 ReviewFlow 서버가 배포되어 있어야 합니다.

```text
https://your-reviewflow-server.example.com
```

ReviewFlow 서버에는 다음 설정이 완료되어 있어야 합니다.

- OpenAI API 인증
- GitHub API 인증
- MCP 내부 인증
- ReviewFlow 사용을 허용할 GitHub 저장소 목록
- 선택적인 Jira 인증 및 검토 중 상태 ID

서버 설정 방법은 프로젝트 루트의 [`README.md`](../../README.md)와 [`.env.example`](../../.env.example)을 참고합니다.

## 1. 호출 워크플로 설치

`reviewflow-review.yml` 파일을 ReviewFlow를 사용할 저장소의 다음 위치에 복사합니다.

```text
.github/workflows/reviewflow-review.yml
```

`.github/workflows` 폴더가 없다면 새로 생성합니다.

이 파일은 전체 리뷰 로직을 포함하지 않고, `reviewflow-mcp` 저장소의 재사용 워크플로를 호출합니다.

```yaml
uses: kayoungcha/reviewflow-mcp/.github/workflows/reusable-reviewflow.yml@v1
```

`@v1`은 사용할 ReviewFlow 워크플로 버전을 의미합니다. 연결 저장소는 전체 워크플로를 다시 복사하지 않고, 중앙의 `v1` 워크플로를 계속 사용할 수 있습니다.

## 2. ReviewFlow 서버 주소 설정

복사한 워크플로에서 다음 값을 자신이 배포한 ReviewFlow 서버 주소로 변경합니다.

```yaml
with:
  reviewflow_server_url: https://your-reviewflow-server.example.com
```

`/reviews/github` 또는 `/jira/github-pull-request` 경로를 직접 붙이지 않습니다. 재사용 워크플로가 필요한 API 경로를 서버 기본 주소에 자동으로 추가합니다.

## 3. 허용 저장소 등록

ReviewFlow 서버의 `REVIEWFLOW_ALLOWED_REPOSITORIES` 환경변수에 연결할 GitHub 저장소를 추가합니다.

```text
REVIEWFLOW_ALLOWED_REPOSITORIES=owner/project-a,owner/project-b
```

목록에 없는 저장소가 ReviewFlow API를 호출하면 요청이 거부됩니다.

## 4. GitHub 인증과 권한

대상 저장소에는 별도의 ReviewFlow 인증 Secret을 등록하지 않습니다.
워크플로는 GitHub Actions가 실행될 때 발급되는 임시 OIDC 토큰으로 ReviewFlow 서버에 자신을 인증합니다.

```yaml
permissions:
  contents: read
  issues: write
  pull-requests: write
  id-token: write
```

각 권한은 다음 용도로 사용됩니다.

| 권한                   | 용도                  |
| ---------------------- | --------------------- |
| `contents: read`       | 저장소 정보 조회      |
| `issues: write`        | PR 댓글 작성 및 갱신  |
| `pull-requests: write` | Pull Request 접근     |
| `id-token: write`      | GitHub OIDC 토큰 발급 |

OpenAI API 키, GitHub 개인 토큰, Jira API 토큰은 대상 저장소에 등록하지 않습니다. 이러한 인증값은 ReviewFlow 서버에서만 관리합니다.

## 5. Jira 연동 — 선택 사항

Jira를 사용하지 않는 저장소는 별도 설정 없이 GitHub Pull Request만 리뷰할 수 있습니다.

Jira 요구사항 조회와 생명주기 자동화를 사용하려면 대상 저장소에 다음 Repository Variable을 등록합니다.

```text
Settings
→ Secrets and variables
→ Actions
→ Variables
→ New repository variable
```

```text
Name: REVIEWFLOW_JIRA_PROJECT_KEY
Value: MCPTEST
```

`MCPTEST` 부분에는 연결할 Jira 프로젝트 키를 입력합니다. 이 값은 인증정보가 아니므로 Secret이 아닌 Repository Variable로 등록합니다.

ReviewFlow는 작업 브랜치에서 설정한 프로젝트의 Jira 티켓 키를 찾습니다.

```text
설정값: MCPTEST

MCPTEST-20
MCPTEST-20-fix
feature/MCPTEST-20-review
```

다음 경우에는 Jira 처리를 생략하고 GitHub Pull Request 리뷰만 계속합니다.

- `REVIEWFLOW_JIRA_PROJECT_KEY`가 등록되지 않은 경우
- 작업 브랜치에 Jira 티켓 키가 없는 경우
- 작업 브랜치의 Jira 프로젝트 키가 설정값과 다른 경우

Jira가 연결되면 PR 이벤트에 따라 다음 작업도 실행합니다.

Jira 상태 이동과 댓글 자동화는 PR의 병합 대상이 해당 저장소의 기본 브랜치일 때만 실행됩니다.

| Pull Request 이벤트               | Jira 처리                           |
| --------------------------------- | ----------------------------------- |
| PR 생성                           | 검토 중으로 이동                    |
| 새로운 커밋 push                  | 검토 중 상태 확인                   |
| Draft에서 Ready for review로 변경 | 검토 중으로 이동                    |
| 종료된 PR 다시 열기               | 검토 중으로 이동하고 Jira 댓글 작성 |
| PR 병합                           | 완료로 이동                         |
| 병합하지 않고 PR 종료             | 상태를 유지하고 Jira 댓글 작성      |

## 6. 동작 확인

설정을 완료한 뒤 대상 저장소에서 작업 브랜치를 만들고 Pull Request를 생성합니다.

Jira를 연결했다면 브랜치명에 Jira 티켓 키를 포함합니다.

```text
MCPTEST-30
feature/MCPTEST-30-review
```

GitHub Actions에서 다음 작업을 확인할 수 있습니다.

| 작업                          | 역할                                |
| ----------------------------- | ----------------------------------- |
| `reviewflow / review`         | AI 코드 리뷰 실행과 PR 댓글 작성    |
| `reviewflow / jira-lifecycle` | 선택적인 Jira 상태 이동과 댓글 작성 |

ReviewFlow는 숨겨진 마커로 자동 리뷰 댓글을 구분합니다.

```html
<!-- reviewflow-ai-review -->
```

같은 PR에서 새로운 커밋을 push하면 새 댓글을 계속 추가하지 않고 기존 ReviewFlow 댓글을 갱신합니다.
저장소의 Ruleset에서 ReviewFlow 리뷰를 필수 상태 체크로 사용한다면 `reviewflow / review`를 필수 체크로 등록합니다.
jira-lifecycle은 Jira를 사용하지 않는 저장소에서는 실행되지 않으므로 필수 체크로 등록하지 않습니다.

### 리뷰 판정

| 판정        | GitHub Actions 결과  |
| ----------- | -------------------- |
| `통과`      | 성공                 |
| `수정 권장` | warning 표시 후 성공 |
| `수정 필요` | 실패                 |

완료된 Jira 티켓은 검토 중으로 되돌리지 않습니다. 이 경우 `jira-lifecycle` 작업은 실패하지 않고 warning을 표시하며 AI 코드 리뷰는 계속 실행합니다.

## 문제 해결

### 재사용 워크플로를 찾지 못하는 경우

- `uses`에 입력한 저장소와 파일 경로가 올바른지 확인합니다.
- `@v1` 태그가 ReviewFlow 저장소에 존재하는지 확인합니다.
- ReviewFlow 저장소가 호출 저장소에서 접근 가능한 공개 저장소인지 확인합니다.
- 호출 저장소의 Actions 설정에서 외부 재사용 워크플로 사용이 허용되어 있는지 확인합니다.

### ReviewFlow API가 401을 반환하는 경우

- 호출 워크플로의 `permissions`에 `id-token: write`가 있는지 확인합니다.
- GitHub OIDC 토큰이 `Authorization: Bearer ...` 헤더로 전달되는지 확인합니다.
- OIDC audience가 `reviewflow-mcp`인지 확인합니다.

### ReviewFlow API가 403을 반환하는 경우

- 대상 저장소가 `REVIEWFLOW_ALLOWED_REPOSITORIES`에 등록되어 있는지 확인합니다.
- 저장소 이름을 `owner/repository` 형식으로 입력했는지 확인합니다.
- OIDC 토큰을 발급받은 저장소와 리뷰를 요청한 저장소가 같은지 확인합니다.

### ReviewFlow API가 404를 반환하는 경우

- 워크플로에 입력한 ReviewFlow 서버 주소가 올바른지 확인합니다.
- `/reviews/github`와 `/jira/github-pull-request` 경로가 포함되어 있는지 확인합니다.
- 최신 코드가 배포된 서버인지 확인합니다.

### GitHub 저장소 또는 PR을 찾지 못하는 경우

- ReviewFlow 서버의 `GITHUB_TOKEN`이 대상 저장소를 읽을 권한을 가지고 있는지 확인합니다.
- 비공개 저장소라면 토큰의 Repository access 범위를 확인합니다.

### Jira 티켓을 찾지 못하는 경우

- 브랜치의 Jira 티켓 키가 실제로 존재하는지 확인합니다.
- `REVIEWFLOW_JIRA_PROJECT_KEY`가 브랜치의 프로젝트 키와 같은지 확인합니다.
- ReviewFlow 서버의 Jira 주소, 이메일과 API 토큰을 확인합니다.

### Draft 또는 fork PR에서 실행되지 않는 경우

AI 리뷰는 Draft Pull Request에서 실행되지 않으며, Ready for review로 변경하면 실행됩니다. 외부 fork Pull Request는 인증과 권한 보호를 위해 실행하지 않습니다.
