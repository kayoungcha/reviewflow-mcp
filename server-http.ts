import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express";
import { createReviewFlowMcpServer } from "./mcp-server.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

const host = "127.0.0.1";
const port = 5200;
const app = createMcpExpressApp({ host });

const mcpApiToken = process.env.MCP_API_TOKEN;

app.get("/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    name: "reviewflow-mcp",
  });
});

// 토큰 없이 서버가 실행되는 실수를 막습니다.
if (!mcpApiToken) {
  throw new Error("MCP_API_TOKEN 환경변수가 필요합니다.");
}

// /mcp로 들어오는 모든 요청의 인증 정보를 검사합니다.
// /health는 이 검사를 거치지 않으므로 상태 확인은 계속 가능합니다.
app.use("/mcp", (request, response, next) => {
  // HTTP 요청에 들어 있는 Authorization 헤더를 가져옵니다.
  const authorization = request.headers.authorization;

  // 우리가 기대하는 형식은:
  // Authorization: Bearer 비밀토큰
  const expectedAuthorization = `Bearer ${mcpApiToken}`;

  if (authorization !== expectedAuthorization) {
    response.status(401).json({
      error: "올바른 MCP 인증 토큰이 필요합니다.",
    });

    return;
  }

  // 토큰이 맞으면 다음 /mcp 처리 코드로 이동합니다.
  next();
});

app.post("/mcp", async (request, response) => {
  const mcpServer = createReviewFlowMcpServer();

  const httpTransport = new StreamableHTTPServerTransport();

  response.on("close", () => {
    void httpTransport.close();
    void mcpServer.close();
  });

  try {
    await mcpServer.connect(httpTransport as unknown as Transport);
    await httpTransport.handleRequest(request, response, request.body);
  } catch (error: unknown) {
    console.error("MCP HTTP 요청 처리에 실패했습니다.", error);

    if (!response.headersSent) {
      response.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.get("/mcp", (_request, response) => {
  response.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed.",
    },
    id: null,
  });
});

app.delete("/mcp", (request, response) => {
  response.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed",
    },
    id: null,
  });
});

// 실제 HTTP 포트를 열고 요청을 기다립니다.
app.listen(port, host, () => {
  console.log(`ReviewFlow MCP HTTP server started`);
  console.log(`Health check: http://${host}:${port}/health`);
  console.log(`MCP endpoint: http://${host}:${port}/mcp`);
});
