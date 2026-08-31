# ReviewFlow GitHub Actions 설치

이 템플릿은 Pull Request가 생성되거나 새로운 커밋이 push될 때 중앙 ReviewFlow API를 호출해 AI 코드 리뷰를 실행합니다.

## 동작 흐름

```text
Pull Request 생성 또는 push
→ GitHub Actions
→ 중앙 ReviewFlow API
→ GitHub PR 및 선택적 Jira 조회
→ OpenAI 코드 리뷰
→ PR 댓글 작성 또는 갱신
→ 최종 판정에 따라 Check 성공 또는 실패
```

## 1. 워크플로 파일 복사

`reviewflow-review.yml` 파일을 대상 저장소의 다음 위치에 복사합니다.

```text
.github/workflows/reviewflow-review.yml
```

대상 저장소에 `.github/workflows` 폴더가 없다면 새로 만듭니다.

## 2. ReviewFlow 사용 저장소 등록

대상 저장소에는 별도의 ReviewFlow 인증 Secret을 등록하지 않습니다.

GitHub Actions가 실행될 때 GitHub에서 발급하는 임시 OIDC 토큰으로 ReviewFlow API를 인증합니다. 따라서 대상 저장소마다 토큰을 생성하거나 관리할 필요가 없습니다.

대신 중앙 ReviewFlow 서버의 `REVIEWFLOW_ALLOWED_REPOSITORIES` 환경변수에 사용할 저장소를 등록해야 합니다.

```text
REVIEWFLOW_ALLOWED_REPOSITORIES=kayoungcha/MCP-test,kayoungcha/reviewflow-demo
```

## 3. Pull Request 생성

설치 이후에는 평소처럼 Pull Request를 생성하면 됩니다.

ReviewFlow는 다음 이벤트에서 자동 실행됩니다.

- Pull Request 생성
- 새로운 커밋 push
- 종료된 Pull Request 다시 열기
- Draft Pull Request를 Ready for review로 변경

Draft Pull Request와 외부 fork Pull Request에서는 실행하지 않습니다.

## 리뷰 판정

- `통과`: Check 성공
- `수정 권장`: 경고를 표시하지만 Check 성공
- `수정 필요`: 리뷰 댓글 작성 후 Check 실패

## Jira 연동 — 선택 사항

Jira를 사용하지 않는 프로젝트는 별도 설정 없이 GitHub Pull Request만 리뷰할 수 있습니다.
Jira 요구사항을 함께 리뷰하려면 대상 저장소의 다음 화면으로 이동합니다.

```text
Settings
→ Secrets and variables
→ Actions
→ Variables
→ New repository variable
```

다음 Repository Variable을 추가합니다.

```text
Name: REVIEWFLOW_JIRA_PROJECT_KEY
Value: MCPTEST
```

`MCPTEST` 부분에는 연결할 Jira 프로젝트 키를 입력합니다.

이 값은 인증 정보가 아니므로 Secret이 아닌 Repository Variable로 등록합니다. Jira 이메일과 API 토큰은 대상 저장소에 등록하지 않으며 중앙 ReviewFlow 서버에서만 관리합니다.
Repository Variable이 설정되면 ReviewFlow는 작업 브랜치에서 같은 프로젝트의 Jira 티켓 키를 찾습니다.

```text
설정값: MCPTEST

MCPTEST-20
MCPTEST-20-fix
feature/MCPTEST-20-review
```

다른 프로젝트의 Jira 키는 조회하지 않습니다.

```text
설정값: MCPTEST
작업 브랜치: OTHER-20-fix
결과: Jira 조회 생략
```

다음 경우에는 Jira 조회를 생략하고 GitHub Pull Request만 리뷰합니다.

- `REVIEWFLOW_JIRA_PROJECT_KEY`가 등록되지 않은 경우
- 작업 브랜치에 Jira 티켓 키가 없는 경우
- 브랜치의 Jira 프로젝트 키가 설정값과 일치하지 않는 경우

## 필요한 GitHub 권한

워크플로는 다음 권한을 사용합니다.

```yaml
permissions:
  contents: read
  issues: write
  pull-requests: write
  id-token: write
```

이 권한은 저장소 코드를 읽고 현재 PR에 ReviewFlow 댓글을 작성하며, GitHub Actions 실행을 증명하는 임시 OIDC 토큰을 발급받는 데 사용합니다.

## 비공개 저장소

비공개 저장소를 리뷰하려면 중앙 ReviewFlow 서버의 `GITHUB_TOKEN`이 해당 저장소를 읽을 권한을 가지고 있어야 합니다.

대상 저장소의 GitHub Actions에는 GitHub 개인 토큰, OpenAI API 키 또는 Jira API 토큰을 추가하지 않습니다.

## 댓글 갱신

ReviewFlow는 다음 숨겨진 마커로 자동 리뷰 댓글을 구분합니다.

```html
<!-- reviewflow-ai-review -->
```

같은 PR에서 리뷰가 다시 실행되면 새 댓글을 계속 만들지 않고 기존 ReviewFlow 댓글을 갱신합니다.

## 문제 해결

### ReviewFlow API가 401을 반환하는 경우

다음 항목을 확인합니다.

- 워크플로의 `permissions`에 `id-token: write`가 있는지 확인합니다.
- GitHub Actions가 발급한 OIDC 토큰을 `Authorization: Bearer ...` 헤더로 전달하는지 확인합니다.
- OIDC 토큰의 발급자와 audience가 ReviewFlow 서버 설정과 일치하는지 확인합니다.

### ReviewFlow API가 403을 반환하는 경우

다음 항목을 확인합니다.

- 대상 저장소가 중앙 ReviewFlow 서버의 `REVIEWFLOW_ALLOWED_REPOSITORIES`에 등록되어 있는지 확인합니다.
- OIDC 토큰을 발급받은 저장소와 리뷰 요청에 포함된 저장소가 같은지 확인합니다.

### 저장소 또는 PR을 찾을 수 없는 경우

중앙 ReviewFlow 서버의 `GITHUB_TOKEN`이 대상 저장소에 접근할 수 있는지 확인합니다.

### 첫 리뷰가 오래 걸리는 경우

무료 Render 인스턴스가 비활성 상태였다면 서버 시작으로 인해 첫 요청이 늦어질 수 있습니다.

### fork Pull Request에서 실행되지 않는 경우

현재 템플릿은 외부 저장소에서 임의로 ReviewFlow API를 호출하는 것을 방지하기 위해 fork Pull Request를 의도적으로 건너뜁니다.
