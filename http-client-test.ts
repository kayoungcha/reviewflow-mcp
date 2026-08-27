import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const mcpClient = new Client({
  name: "reviewflow-mcp-http-smoke-client",
  version: "1.0.0",
});

const mcpServerUrl = process.env.MCP_SERVER_URL ?? "http://127.0.0.1:5200/mcp";

const mcpApiToken = process.env.MCP_API_TOKEN;

if (!mcpApiToken) {
  throw new Error("MCP_API_TOKEN 환경변수가 필요합니다.");
}

const httpTransport = new StreamableHTTPClientTransport(new URL(mcpServerUrl), {
  requestInit: {
    headers: {
      Authorization: `Bearer ${mcpApiToken}`,
    },
  },
});

try {
  await mcpClient.connect(httpTransport as unknown as Transport);
  console.log("HTTP MCP 서버에 연결되었습니다.");

  const toolsResult = await mcpClient.listTools();

  console.log("\n=== 사용 가능한 도구 ===");

  for (const tool of toolsResult.tools) {
    console.log(`- ${tool.name}: ${tool.description ?? "설명 없음"}`);
  }

  const rawBananaResult = await mcpClient.callTool({
    name: "greeting",
    arguments: {
      name: "가영",
    },
  });

  const greetingResult = CallToolResultSchema.parse(rawBananaResult);

  console.log("\n=== greeting 호출결과 ===");

  for (const item of greetingResult.content) {
    if (item.type === "text") {
      console.log(item.text);
    }
  }

  const rawGitHubPullRequestResult = await mcpClient.callTool({
    name: "githubPullRequestContext",

    arguments: {
      repositoryUrl: "https://github.com/kayoungcha/MCP-test",
      pullNumber: 10,
    },
  });

  // MCP 호출 결과는 타입상 unknown일 수 있으므로
  // SDK가 제공하는 스키마로 실제 결과 형식을 검사합니다.
  const githubPullRequestResult = CallToolResultSchema.parse(
    rawGitHubPullRequestResult,
  );

  const githubPullRequestText = githubPullRequestResult.content
    .map((item) => {
      return item.type === "text" ? item.text : "";
    })
    .filter(Boolean)
    .join("\n");

  if (githubPullRequestResult.isError) {
    throw new Error(
      githubPullRequestText ||
        "GitHub Pull Request 조회 도구 호출에 실패했습니다.",
    );
  }

  console.log("\n=== GitHub Pull Request 호출 결과 ===");
  console.log(githubPullRequestText);
} catch (error) {
  console.error("HTTP MCP 테스트에 실패했습니다:", error);
  process.exitCode = 1;
} finally {
  await mcpClient.close();
}
