// GitHub API가 반환하는 데이터중 필요한 필드만 정의
type GitHubPullRequestResponse = {
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  // PR에서 변경된 전체 파일 수입니다.
  changed_files: number;
  user: {
    login: string;
  } | null;

  base: {
    ref: string;
  };

  head: {
    ref: string;
  };
};

//  ReviewFlow MCP 내부에서 사용할 정리된 PR
export type GitHubPullRequestContext = {
  number: number;
  title: string;
  body: string;
  state: string;
  author: string;
  baseBranch: string;
  targetBranch: string;
  url: string;
  // GitHub PR 전체 변경 파일 수입니다.
  totalChangedFiles: number;
  // PR에서 변경된 파일 목록입니다.
  files: GitHubPullRequestFileContext[];
};

// GitHub의 PR 변경 파일 API가 반환하는 파일 한개 형태
type GitHubPullRequestFileResponse = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  // 바이너리 파일이나 너무 큰 벼경에서는 patch가 없을 수있습니다.
  patch?: string;
};

// ReviewFlow MCP 내부에서 사용할 정리된 변경 파일 type
export type GitHubPullRequestFileContext = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch: string;
};

// GitHub 저장소와 PR 번호를 받아 PR 정보를 조회합니다.
export async function fetchGitHubPullRequest(
  owner: string,
  repository: string,
  pullNumber: number,
): Promise<GitHubPullRequestContext> {
  const githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    throw new Error("GITHUB_TOKEN 환경변수가 필요합니다.");
  }

  // 잘못된 PR 번호가 GitHub API까지 전달되지 않도록 검사합니다.
  if (!Number.isInteger(pullNumber) || pullNumber < 1) {
    throw new Error("Pull Request 번호는 1 이상의 정수여야 합니다.");
  }

  // 사용자가 입력한 owner와 저장소 이름을 URL에 안전하게 넣습니다.

  const encodedOwner = encodeURIComponent(owner);
  const encodedRepository = encodeURIComponent(repository);

  const apiUrl =
    `https://api.github.com/repos/${encodedOwner}` +
    `/${encodedRepository}/pulls/${pullNumber}`;

  const response = await fetch(apiUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      // 사용할 GitHub REST API 버전을 고정합니다.
      "X-GitHub-Api-Version": "2026-03-10",
      // 어떤 프로그램이 요청했는지 GitHub에 알려줍니다.
      "User-Agent": "reviewflow-mcp",
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `GitHub 저장소 또는 PR을 찾을 수 없습니다: ${owner}/${repository}#${pullNumber}`,
      );
    }

    if (response.status === 401) {
      throw new Error("GitHub 인증 토큰이 올바르지 않습니다.");
    }

    if (response.status === 403) {
      throw new Error(
        "GitHub API 접근 권한이 없거나 호출 한도를 초과했습니다.",
      );
    }

    throw new Error(
      `GitHub PR 조회에 실패했습니다. HTTP 상태: ${response.status}`,
    );
  }

  const pullRequest = (await response.json()) as GitHubPullRequestResponse;

  const filesApiUrl = `${apiUrl}/files?per_page=100`;
  const filesResponse = await fetch(filesApiUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "reviewflow-mcp",
    },
  });

  // fetch는 404나 500에서도 자동으로 실패하지 않으므로
  // 변경 파일 요청도 직접 상태를 검사합니다.
  if (!filesResponse.ok) {
    throw new Error(
      `GitHub PR 변경 파일 조회에 실패했습니다. HTTP 상태: ${filesResponse.status}`,
    );
  }

  // GitHub가 반환한 변경 파일 배열을 읽습니다.
  const githubFiles =
    (await filesResponse.json()) as GitHubPullRequestFileResponse[];

  // GitHub 원본 데이터에서 리뷰에 필요한 값만 정리합니다.
  const files: GitHubPullRequestFileContext[] = githubFiles.map((file) => {
    return {
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,

      // patch가 없는 파일은 빈 문자열로 통일합니다.
      patch: file.patch ?? "",
    };
  });

  return {
    number: pullRequest.number,
    title: pullRequest.title,
    body: pullRequest.body ?? "",
    state: pullRequest.state,
    author: pullRequest.user?.login ?? "알 수 없음",
    baseBranch: pullRequest.base.ref,
    targetBranch: pullRequest.head.ref,
    url: pullRequest.html_url,
    totalChangedFiles: pullRequest.changed_files,
    files,
  };
}

// GitHub 저장소 주소에서 owner와 저장소 이름을 추출합니다.
export function parseGitHubRepositoryUrl(repositoryUrl: string): {
  owner: string;
  repository: string;
} {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(repositoryUrl);
  } catch {
    throw new Error("올바른 GitHub 저장소 주소를 입력해주세요.");
  }

  //   다른 사이트 주소가 전달되는 것을 막습니다.
  if (parsedUrl.hostname !== "github.com") {
    throw new Error("github.com 저장소 주소만 사용할 수 있습니다.");
  }

  const pathParts = parsedUrl.pathname.replace(/^\/+|\/+$/g, "").split("/");

  const owner = pathParts[0];
  const repositoryWithGit = pathParts[1];

  if (!owner || !repositoryWithGit || pathParts.length !== 2) {
    throw new Error(
      "GitHub 저장소 주소는 https://github.com/owner/repository 형식이어야 합니다.",
    );
  }

  const repository = repositoryWithGit.replace(/\.git$/, "");

  if (!repository) {
    throw new Error("GitHub 저장소 이름을 확인할 수 없습니다.");
  }

  return {
    owner,
    repository,
  };
}
