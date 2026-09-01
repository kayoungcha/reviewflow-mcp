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
export type GitHubPullRequestFileResponse = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  // 바이너리 파일이나 너무 큰 변경에서는 patch가 없을 수있습니다.
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

// GitHub 변경 파일 API가 한 페이지에서 제공하는 최대 파일 수입니다.
const GITHUB_FILES_PER_PAGE = 100;
// GitHub 변경 파일 API가 제공하는 최대 파일 수는 3,000개 이므로
// 최대 30페이지까지만 조회합니다.
const GITHUB_MAX_FILE_PAGES = 30;

type FetchGitHubFilesPage = (
  page: number,
) => Promise<GitHubPullRequestFileResponse[]>;

// 여러 페이지의 GitHub 변경 파일을 하나의 배열로 합칩니다.
export async function collectGitHubPullRequestFiles(
  fetchPage: FetchGitHubFilesPage,
  totalChangedFiles: number,
): Promise<GitHubPullRequestFileResponse[]> {
  // GitHub API가 제공할 수 있는 최대 3,000개까지만 목표로 합니다.
  const expectedFileCount = Math.min(
    Math.max(Math.trunc(totalChangedFiles), 0),
    GITHUB_FILES_PER_PAGE * GITHUB_MAX_FILE_PAGES,
  );

  if (expectedFileCount === 0) {
    return [];
  }

  const filesByFilename = new Map<string, GitHubPullRequestFileResponse>();

  for (let page = 1; page <= GITHUB_MAX_FILE_PAGES; page += 1) {
    const pageFiles = await fetchPage(page);

    for (const file of pageFiles) {
      filesByFilename.set(file.filename, file);
    }

    // PR 정보에 표시된 전체 파일 수만큼 모았다면 종료합니다.
    if (filesByFilename.size >= expectedFileCount) {
      break;
    }

    // 한 페이지에서 100개보다 적게 반환됐다면
    // 해당 페이지가 마지막 페이지이므로 종료합니다.
    if (pageFiles.length < GITHUB_FILES_PER_PAGE) {
      break;
    }
  }

  return Array.from(filesByFilename.values()).slice(0, expectedFileCount);
}

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

  const githubFiles = await collectGitHubPullRequestFiles(
    async (page) => {
      const filesApiUrl =
        `${apiUrl}/files` +
        `?per_page=${GITHUB_FILES_PER_PAGE}` +
        `&page=${page}`;

      try {
        const filesResponse = await fetch(filesApiUrl, {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${githubToken}`,
            "X-GitHub-Api-Version": "2026-03-10",
            "User-Agent": "reviewflow-mcp",
          },
          signal: AbortSignal.timeout(10_000),
        });
        // fetch는 404나 500에서도 자동으로 실패하지 않으므로
        // 각 페이지 응답 상태를 직접 검사합니다.
        if (!filesResponse.ok) {
          throw new Error(`HTTP 상태: ${filesResponse.status}`);
        }
        return (await filesResponse.json()) as GitHubPullRequestFileResponse[];
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";

        throw new Error(
          `GitHub PR 변경 파일 ${page}페이지 조회에 실패했습니다: ${message}`,
        );
      }
    },
    // PR 기본 정보에 포함된 전체 변경 파일 수를 전달합니다.
    pullRequest.changed_files,
  );

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

type GitHubPullRequestMetadataResponse = {
  number: number;
  title: string;
  state: string;
  merged: boolean;
  html_url: string;
  base: {
    ref: string;
  };
  head: {
    ref: string;
  };
};

export type GitHubPullRequestMetadata = {
  number: number;
  title: string;
  state: string;
  merged: boolean;
  url: string;
  baseBranch: string;
  targetBranch: string;
};

// Jira 생명주기 처리에 필요한 Pull Request 기본 정보만 조회합니다.
// 변경 파일과 patch는 가져오지 않습니다.
export const fetchGitHubPullRequestMetadata = async (
  repositoryUrl: string,
  pullNumber: number,
): Promise<GitHubPullRequestMetadata> => {
  const githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    throw new Error("GITHUB_TOKEN 환경변수가 필요합니다.");
  }

  if (!Number.isInteger(pullNumber) || pullNumber < 1) {
    throw new Error("Pull Request 번호는 1 이상의 정수여야 합니다");
  }

  const { owner, repository } = parseGitHubRepositoryUrl(repositoryUrl);

  const apiUrl =
    `https://api.github.com/repos/` +
    `${encodeURIComponent(owner)}/` +
    `${encodeURIComponent(repository)}/` +
    `pulls/${pullNumber}`;

  const response = await fetch(apiUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "reviewflow-mcp",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `GitHub 저장소 또는 PR을 찾을 수 없습니다: ` +
          `${owner}/${repository}#${pullNumber}`,
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
  const pullRequest =
    (await response.json()) as GitHubPullRequestMetadataResponse;

  return {
    number: pullRequest.number,
    title: pullRequest.title,
    state: pullRequest.state,
    merged: pullRequest.merged,
    url: pullRequest.html_url,
    baseBranch: pullRequest.base.ref,
    targetBranch: pullRequest.head.ref,
  };
};
