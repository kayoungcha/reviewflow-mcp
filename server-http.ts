import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express";
import { createReviewFlowMcpServer } from "./mcp-server.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { GitHubReviewRequestSchema, extractBearerToken } from "./review-api.js";

import {
  assertGitHubRepositoryAccess,
  parseAllowedRepositories,
  verifyGitHubOidcToken,
} from "./github-oidc.js";

import { parseGitHubRepositoryUrl } from "./github.js";

import { reviewGitHubPullRequest } from "./review-orchestrator/github-review-service.js";

// 127.0.0.1은 내 Mac 내부에서만 접근할 수 있습니다.
// 0.0.0.0은 배포 서버 외부에서 들어오는 요청도 받을 수 있습니다.
const host = "0.0.0.0";
// 배포 서비스가 PORT 환경변수를 제공하면 그 값을 사용합니다.
// 로컬에서 실행할 때 PORT가 없다면 기존 5200번을 사용합니다.
const port = Number(process.env.PORT ?? 5200);
const app = createMcpExpressApp({ host });

const mcpApiToken = process.env.MCP_API_TOKEN;
// 쉼표로 구분된 허용 저장소 환경변수를
// 비교 가능한 Set 형태로 한 번만 변환합니다.
const allowedRepositories = parseAllowedRepositories(
  process.env.REVIEWFLOW_ALLOWED_REPOSITORIES,
);

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

app.post("/reviews/github", async (request, response) => {
  // Authorization 헤더에서 GitHub Actions OIDC JWT를 꺼냅니다.

  const oidcToken = extractBearerToken(request.headers.authorization);

  if (oidcToken === null) {
    response.status(401).json({
      error: "GitHub Actions OIDC 인증 토큰이 필요합니다.",
    });

    return;
  }
  let oidcRepository: string;

  try {
    // GitHub 공개 키를 사용해 JWT 서명, 발급자, audience와 만료시간을 검증합니다.
    const identity = await verifyGitHubOidcToken(oidcToken);
    oidcRepository = identity.repository;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 OIDC 인증 오류";

    console.warn("GitHub Actions OIDC 인증에 실패했습니다.", message);
    response.status(401).json({
      error: "GitHub Actions OIDC 인증에 실패했습니다.",
    });

    return;
  }

  // 요청 본문이 repositoryUrl과 pullNumber 형식에 맞는지 검사합니다.
  const requestResult = GitHubReviewRequestSchema.safeParse(request.body);

  if (!requestResult.success) {
    response.status(400).json({
      error: "GitHub 리뷰 요청 형식이 올바르지 않습니다.",
      details: requestResult.error.issues.map((issue) => {
        return {
          path: issue.path.join("."),
          message: issue.message,
        };
      }),
    });

    return;
  }

  let requestedRepository: string;

  try {
    // 전체 GitHub URL에서 owner/repository 형태를 만듭니다.
    const parsedRepository = parseGitHubRepositoryUrl(
      requestResult.data.repositoryUrl,
    );

    requestedRepository =
      `${parsedRepository.owner}/` + `${parsedRepository.repository}`;
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "GitHub 저장소 주소가 올바르지 않습니다.";

    response.status(400).json({
      error: message,
    });

    return;
  }

  try {
    // OIDC 신분증의 저장소와 요청 저장소가 같은지,
    // Render 허용 목록에 있는 저장소인지 확인합니다.
    assertGitHubRepositoryAccess({
      oidcRepository,
      requestedRepository,
      allowedRepositories,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "ReviewFlow 사용 권한이 없습니다.";

    response.status(403).json({
      error: message,
    });

    return;
  }

  try {
    const review = await reviewGitHubPullRequest({
      repositoryUrl: requestResult.data.repositoryUrl,
      pullNumber: requestResult.data.pullNumber,
      jiraProjectKey: requestResult.data.jiraProjectKey ?? null,
      // 같은 서버의 MCP 엔드포인트를 내부적으로 호출합니다.
      mcpServerUrl: `http://127.0.0.1:${port}/mcp`,
      mcpApiToken,
    });

    response.status(200).json(review);
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "GitHub Pull Request 리뷰에 실패했습니다.";

    console.error("GitHub 리뷰 API 처리에 실패했습니다.", error);

    response.status(500).json({
      error: message,
    });
  }
});

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
  console.log("ReviewFlow MCP HTTP server started");
  console.log(`Health check: http://127.0.0.1:${port}/health`);
  console.log(`MCP endpoint: http://127.0.0.1:${port}/mcp`);
  console.log(`Review API endpoint: http://127.0.0.1:${port}/reviews/github`);
});
