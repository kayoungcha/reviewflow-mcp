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

  // MCP 도구를 호출해 아직 형식이 확정되지 않은 결과를 받습니다.
  const rawToolResult =
    baseBranch && targetBranch
      ? await client.callTool({
          name: "branchReviewContext",
          // MCP 서버의 inputSchema에 정의한 이름과 같아야 합니다.
          arguments: { baseBranch, targetBranch },
        })
      : await client.callTool({
          name: "gitReviewContext",
          arguments: {},
        });

  // 현재 MCP 표준 결과 형식인지 검사합니다.
  //
  // 검사를 통과하면 TypeScript도 toolResult.content가
  // MCP 콘텐츠 배열이라는 사실을 알게 됩니다.
  const toolResult = CallToolResultSchema.parse(rawToolResult);

  const reviewContext = toolResult.content
    .map((item) => {
      // 이미지나 다른 형식은 제외하고 문자열만 가져옵니다.
      return item.type === "text" ? item.text : "";
    })
    .filter(Boolean)
    .join("\n");

  if (toolResult.isError) {
    throw new Error(reviewContext || "Git 정보를 가져오지 못했습니다.");
  }

  if (!reviewContext) {
    console.log("리뷰할 정보를 가져오지 못했습니다.");
    process.exitCode = 1;
  } else {
    const codex = await reviewByCodex(reviewContext);

    judge([codex]);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : "알 수 없는 오류";
  console.error(`리뷰 실행에 실패했습니다: ${message}`);
  process.exitCode = 1;
} finally {
  await client.close();
}
