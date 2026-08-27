// MCP 서버를 stdio 방식으로 연결하는 통신 도구입니다.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// 모든 MCP 도구가 등록된 서버를 만드는 공통 함수입니다.
import { createReviewFlowMcpServer } from "./mcp-server.js";

async function main(): Promise<void> {
  // 공통 함수를 통해 reviewflow-mcp 서버를 만듭니다.
  const mcpServer = createReviewFlowMcpServer();

  // 현재 사용 중인 stdio 통신 방식을 만듭니다.
  const transport = new StdioServerTransport();

  // MCP 서버와 stdio 통신 방식을 연결합니다.
  await mcpServer.connect(transport);

  // stdio에서는 stdout이 MCP 통신에 사용되므로
  // 일반 로그는 stderr로 출력합니다.
  console.error("ReviewFlow MCP stdio server started");
}

main().catch((error: unknown) => {
  console.error("MCP stdio server failed:", error);
  process.exit(1);
});
