// MCP 서버와 통신할 수 있는 클라이언트를 가져옵니다.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
// stdio 방식으로 MCP 서버를 실행하고 연결하는 통신 도구입니다.
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

// import { reviewByClaude } from "./claude.js";
import { reviewByCodex } from "./codex.js";
// import { reviewByCodexLocal } from "./codex-local.js";
import { judge } from "./judge.js";

const client = new Client({
  name: "review-orchestrator",
  version: "1.0.0",
});

const transport = new StdioClientTransport({
  command: "pnpm",
  args: ["exec", "tsx", "server.ts"],
  cwd: process.cwd(),

  // 현재 터미널에 등록된 Jira 연결 정보만
  // 자식 MCP 서버에 명시적으로 전달합니다.
  // OpenAI 키는 review-orchestrator에서만 사용하므로
  // MCP 서버에 전달하지 않습니다.
  env: {
    JIRA_BASE_URL: process.env.JIRA_BASE_URL ?? "",
    JIRA_EMAIL: process.env.JIRA_EMAIL ?? "",
    JIRA_API_TOKEN: process.env.JIRA_API_TOKEN ?? "",
  },
});

try {
  await client.connect(transport);
  const argumentStartIndex = process.argv[2] === "--" ? 3 : 2;

  // 실제 사용자가 입력한 브랜치 값만 가져옵니다.
  const [baseBranch, targetBranch, ...extraArguments] =
    process.argv.slice(argumentStartIndex);

  if ((baseBranch && !targetBranch) || (!baseBranch && targetBranch)) {
    throw new Error(
      "브랜치 리뷰에는 기준 브랜치와 비교 브랜치를 모두 입력해야 합니다.",
    );
  }

  // 브랜치 입력 여부에 따라 호출할 MCP 도구를 결정합니다.
  //
  // 브랜치가 있으면:
  // 1. 두 브랜치의 코드 변경사항 조회
  // 2. 대상 브랜치와 이름이 같은 Jira 티켓 조회
  //
  // 브랜치가 없으면:
  // 현재 작업 폴더의 미커밋 변경사항만 조회
  const rawToolResults =
    baseBranch && targetBranch
      ? await Promise.all([
          client.callTool({
            name: "branchReviewContext",
            // MCP 서버의 inputSchema에 정의한 이름과 같아야 합니다.
            arguments: { baseBranch, targetBranch },
          }),

          client.callTool({
            name: "getJiraIssue",
            arguments: {
              issueKey: targetBranch,
            },
          }),
        ])
      : [
          await client.callTool({
            name: "gitReviewContext",
            arguments: {},
          }),
        ];

  // 여러 MCP 결과를 각각 검사하고 문자열로 바꿉니다.
  const reviewContexts = rawToolResults.map((rawToolResult) => {
    // MCP 표준 Tool 결과 형식인지 검사합니다.
    const toolResult = CallToolResultSchema.parse(rawToolResult);

    // text 콘텐츠만 가져와 하나의 문자열로 합칩니다.
    const text = toolResult.content
      .map((item) => {
        return item.type === "text" ? item.text : "";
      })
      .filter(Boolean)
      .join("\n");

    // Git 또는 Jira 도구가 오류를 반환했다면
    // OpenAI를 호출하지 않고 리뷰 프로그램을 중단합니다.
    if (toolResult.isError) {
      throw new Error(text || "MCP 도구 실행에 실패했습니다.");
    }

    return text;
  });

  // Jira 정보와 Git 변경사항 사이에 빈 줄을 넣어
  // OpenAI가 두 정보를 구분하기 쉽게 만듭니다.
  const reviewContext = reviewContexts.filter(Boolean).join("\n\n");

  // MCP 결과가 비어 있다면 OpenAI를 호출하지 않습니다.
  if (!reviewContext) {
    console.log("리뷰할 정보를 가져오지 못했습니다.");
    process.exitCode = 1;
  } else {
    // Git 변경사항과 Jira 티켓을 OpenAI에 전달합니다.
    const codex = await reviewByCodex(reviewContext);

    // OpenAI 리뷰 결과를 터미널에 출력합니다.
    judge([codex]);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : "알 수 없는 오류";
  console.error(`리뷰 실행에 실패했습니다: ${message}`);
  process.exitCode = 1;
} finally {
  await client.close();
}
