import { judge } from "./judge.js";
import { shouldFailReview } from "./review-utils.js";
import { reviewGitHubPullRequest } from "./github-review-service.js";

// pnpm에서 전달된 -- 구분자를 제외하고 실제 인자만 가져옵니다.
const argumentStartIndex = process.argv[2] === "--" ? 3 : 2;

const [repositoryUrl, pullNumberText, ...extraArguments] =
  process.argv.slice(argumentStartIndex);

// GitHub 저장소 주소와 PR 번호가 모두 입력됐는지 확인합니다.
if (!repositoryUrl || !pullNumberText) {
  throw new Error("GitHub 저장소 주소와 Pull Request 번호를 입력해주세요.");
}

// 예상치 않은 추가 입력을 막습니다.
if (extraArguments.length > 0) {
  throw new Error(
    "GitHub 저장소 주소와 Pull Request 번호만 입력할 수 있습니다.",
  );
}

const pullNumber = Number(pullNumberText);

// PR 번호가 1 이상의 정수인지 확인합니다.
if (!Number.isInteger(pullNumber) || pullNumber < 1) {
  throw new Error("Pull Request 번호는 1 이상의 정수여야 합니다.");
}

const mcpServerUrl = process.env.MCP_SERVER_URL;
const mcpApiToken = process.env.MCP_API_TOKEN;

if (!mcpServerUrl) {
  throw new Error("MCP_SERVER_URL 환경변수가 필요합니다.");
}

if (!mcpApiToken) {
  throw new Error("MCP_API_TOKEN 환경변수가 필요합니다.");
}

try {
  console.log("원격 ReviewFlow MCP 서버를 통해 코드 리뷰를 시작합니다.");

  const review = await reviewGitHubPullRequest({
    repositoryUrl,
    pullNumber,
    mcpServerUrl,
    mcpApiToken,
  });

  judge([review]);
  if (shouldFailReview(review.verdict)) {
    console.error("병합 전에 반드시 수정해야 할 문제가 발견되었습니다.");
    process.exitCode = 1;
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : "알 수 없는 오류";

  console.error(`원격 GitHub PR 리뷰에 실패했습니다: ${message}`);
  process.exitCode = 1;
}
