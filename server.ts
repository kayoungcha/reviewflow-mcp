import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import os from "node:os";

const server = new McpServer({
  name: "hello-mcp",
  version: "1.0.0",
});

server.registerTool(
  "banana",
  {
    description: "입력받은 이름으로 인사합니다.",
    inputSchema: {
      name: z.string().describe("인사할 사람의 이름"),
    },
  },
  async ({ name }) => {
    const now = new Date();
    return {
      content: [
        {
          type: "text",
          text: [
            `안녕하세요! ${name}님! 👋`,
            `현재 시각은 ${now.toLocaleTimeString("ko-KR")}입니다.`,
            `컴퓨터 이름은 ${os.hostname()}입니다.`,
          ].join("\n"),
        },
      ],
    };
  },
);

server.registerTool(
  "dice",
  {
    description: "6면체 주사위를 굴립니다.",
  },
  async () => {
    const value = Math.floor(Math.random() * 6) + 1;

    return {
      content: [
        {
          type: "text",
          text: `🎲 주사위 결과는 ${value} 입니다.`,
        },
      ],
    };
  },
);

server.registerTool("coin", { description: "동전을 던집니다." }, async () => {
  const result = Math.random() < 0.5 ? "앞면" : "뒷면";

  return {
    content: [
      {
        type: "text",
        text: `🪙 ${result}`,
      },
    ],
  };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdio MCP에서는 stdout이 통신용이므로 로그는 stderr로 출력
  console.error("hello-mcp server started");
}

main().catch((error: unknown) => {
  console.error("MCP server failed:", error);
  process.exit(1);
});
