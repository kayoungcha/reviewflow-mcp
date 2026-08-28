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

## 2. Repository Secret 등록

대상 저장소의 다음 화면으로 이동합니다.

```text
Settings
→ Secrets and variables
→ Actions
→ New repository secret
```

다음 Secret을 추가합니다.

```text
Name: REVIEWFLOW_API_TOKEN
Secret: ReviewFlow 서버와 약속한 인증 토큰
```

토큰은 워크플로 파일이나 저장소 코드에 직접 작성하지 않습니다.

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

## Jira 연동

작업 브랜치 이름에 Jira 티켓 키가 있으면 Jira 요구사항을 함께 검토합니다.

```text
MCPTEST-20
MCPTEST-20-fix
feature/MCPTEST-20-review
```

Jira 티켓 키가 없거나 연결된 Jira 정보가 없으면 GitHub Pull Request만 리뷰합니다.

## 필요한 GitHub 권한

워크플로는 다음 권한을 사용합니다.

```yaml
permissions:
  contents: read
  issues: write
  pull-requests: write
```

이 권한은 저장소 코드를 읽고 현재 PR에 ReviewFlow 댓글을 작성하는 데 사용합니다.

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

대상 저장소의 `REVIEWFLOW_API_TOKEN`과 중앙 ReviewFlow 서버의 토큰이 같은지 확인합니다.

### 저장소 또는 PR을 찾을 수 없는 경우

중앙 ReviewFlow 서버의 `GITHUB_TOKEN`이 대상 저장소에 접근할 수 있는지 확인합니다.

### 첫 리뷰가 오래 걸리는 경우

무료 Render 인스턴스가 비활성 상태였다면 서버 시작으로 인해 첫 요청이 늦어질 수 있습니다.

### fork Pull Request에서 실행되지 않는 경우

GitHub는 보안을 위해 fork Pull Request에 Repository Secret을 전달하지 않습니다. 현재 템플릿은 이러한 요청을 의도적으로 건너뜁니다.
