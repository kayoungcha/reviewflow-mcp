// 원격 MCP 서버와 통신할 클라이언트입니다.
import { Client } from "@modelcontextprotocol/sdk/client";

// Streamable HTTP 방식으로 원격 MCP 서버에 연결합니다.
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";

// 현재 SDK 타입 호환을 위해 Transport 타입을 가져옵니다.
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport";

// MCP 도구 호출 결과가 표준 형식인지 검사합니다.
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

import { judge } from "./judge.js";
import {
  extractJiraIssueKey,
  extractMcpTextContent,
  shouldFailReview,
} from "./review-utils.js";
import { z } from "zod";

// githubPullRequestContext가 반환하는 구조화된 결과 형식입니다.
const GitHubPullRequestStructuredContentSchema = z.object({
  repository: z.string(),
  pullNumber: z.number().int().positive(),
  title: z.string(),
  baseBranch: z.string(),
  targetBranch: z.string(),
  url: z.url(),
  reviewContext: z.string(),
});
// pnpm에서 전달된 -- 구분자를 제외하고 실제 인자만 가져온다.
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

// PR 번호가 1 이상의 정수인지  확인
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

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY 환경변수가 필요합니다.");
}

// 원격 리뷰 전용 MCP 클라이언트를 만듭니다.
const mcpClient = new Client({
  name: "reviewflow-github-review-client",
  version: "1.0.0",
});

const httpTransport = new StreamableHTTPClientTransport(new URL(mcpServerUrl), {
  requestInit: {
    headers: {
      Authorization: `Bearer ${mcpApiToken}`,
    },
  },
});

let connected = false;
try {
  await mcpClient.connect(httpTransport as unknown as Transport);
  connected = true;

  console.log("원격 ReviewFlow MCP 서버에 연결되었습니다.");

  const rawToolResult = await mcpClient.callTool({
    name: "githubPullRequestContext",
    arguments: {
      repositoryUrl,
      pullNumber,
    },
  });

  const toolResult = CallToolResultSchema.parse(rawToolResult);

  const reviewContext = extractMcpTextContent(toolResult.content);

  if (toolResult.isError) {
    throw new Error(
      reviewContext || "GitHub Pull Request 정보를 조회하지 못했습니다.",
    );
  }

  if (!reviewContext) {
    throw new Error("리뷰할 Pull Request 정보가 없습니다.");
  }

  // MCP 서버가 반환한 structuredContent를 실제 형식과 비교해 검사합니다.
  const pullRequestData = GitHubPullRequestStructuredContentSchema.parse(
    toolResult.structuredContent,
  );

  // 작업 브랜치에서 Jira 티켓 키를 찾습니다.
  const jiraIssueKey = extractJiraIssueKey(pullRequestData.targetBranch);

  console.log(`작업 브랜치: ${pullRequestData.targetBranch}`);

  let jiraContext = "";

  if (jiraIssueKey) {
    console.log(`연결된 Jira 티켓: ${jiraIssueKey}`);
    const rawJiraToolResult = await mcpClient.callTool({
      name: "getJiraIssue",
      arguments: {
        issueKey: jiraIssueKey,
      },
    });

    // Jira 도구 결과도 MCP 표준 형식인지 검사합니다.
    const jiraToolResult = CallToolResultSchema.parse(rawJiraToolResult);

    // Jira 결과에서 text 콘텐츠만 합칩니다.
    jiraContext = extractMcpTextContent(jiraToolResult.content);

    if (jiraToolResult.isError) {
      throw new Error(jiraContext || "Jira 티켓 정보를 조회하지 못했습니다.");
    }

    if (jiraContext) {
      console.log("Jira 티켓 정보를 가져왔습니다.");
    } else {
      console.log(
        "연결된 Jira 티켓을 찾지 못해 GitHub Pull Request만 리뷰합니다.",
      );
    }
  } else {
    console.log("작업 브랜치에서 Jira 티켓 키를 찾지 못했습니다.");
  }

  console.log("GitHub Pull Request 정보를 가져왔습니다.");
  console.log("OpenAI 코드 리뷰를 시작합니다.");

  const { reviewByCodex } = await import("./codex.js");

  // GitHub Pull Request 정보와 실제 Jira 조회 결과를 구분하도록
  // OpenAI에 각 데이터의 출처를 명확히 알려줍니다.
  const sourceGuide = jiraContext
    ? [
        "=== 입력 데이터 출처 안내 ===",
        "입력에는 GitHub Pull Request 정보와 실제 Jira 조회 결과가 포함되어 있습니다.",
        "'=== Jira 티켓 ==='로 시작하는 영역만 Jira 조회 결과입니다.",
        "PR 제목이나 브랜치의 티켓 키만으로 Jira 내용을 추측하지 마세요.",
        "GitHub PR, 실제 변경사항, Jira 요구사항을 서로 비교하세요.",
        "=== 입력 데이터 출처 안내 끝 ===",
      ].join("\n")
    : [
        "=== 입력 데이터 출처 안내 ===",
        "아래 정보는 GitHub Pull Request에서 조회한 데이터입니다.",
        "Jira 티켓 정보는 제공되지 않았습니다.",
        "PR 제목, 본문 또는 브랜치에 포함된 티켓 키를 Jira 조회 결과로 간주하지 마세요.",
        "jiraSummary는 반드시 null로 반환하세요.",
        "=== 입력 데이터 출처 안내 끝 ===",
      ].join("\n");

  // GitHub PR 컨텍스트와 Jira 컨텍스트를 구분해 합칩니다.
  const openAiReviewContext = [
    sourceGuide,
    pullRequestData.reviewContext,
    jiraContext,
  ]
    .filter(Boolean)
    .join("\n\n");

  const review = await reviewByCodex(openAiReviewContext);

  judge([review]);

  if (shouldFailReview(review.verdict)) {
    console.error("병합 전에 반드시 수정해야 할 문제가 발견되었습니다.");
    process.exitCode = 1;
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : "알 수 없는 오류";

  console.error(`원격 GitHub PR 리뷰에 실패했습니다: ${message}`);
  process.exitCode = 1;
} finally {
  if (connected) {
    await mcpClient.close();
  }
}
