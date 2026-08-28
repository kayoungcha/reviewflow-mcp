import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { extractJiraIssueKey, extractMcpTextContent } from "./review-utils.js";
import type { ReviewResult } from "./types.js";

// 재사용 가능한 원격 GitHub PR 리뷰 함수가 받을 입력값입니다.
export interface ReviewGitHubPullRequestOptions {
  repositoryUrl: string;
  pullNumber: number;
  mcpServerUrl: string;
  mcpApiToken: string;
}

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

// GitHub PR 정보와 Jira 정보를 구분해
// OpenAI에 전달할 하나의 리뷰 컨텍스트로 만듭니다.
export function buildOpenAiReviewContext(
  pullRequestContext: string,
  jiraContext: string,
): string {
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

  return [sourceGuide, pullRequestContext, jiraContext]
    .filter(Boolean)
    .join("\n\n");
}

// 원격 MCP 서버에서 GitHub PR과 Jira 정보를 수집하고
// OpenAI 코드 리뷰 결과를 반환합니다.
export async function reviewGitHubPullRequest(
  options: ReviewGitHubPullRequestOptions,
): Promise<ReviewResult> {
  const { repositoryUrl, pullNumber, mcpServerUrl, mcpApiToken } = options;

  // CLI뿐 아니라 향후 HTTP API에서도 호출할 수 있으므로
  // 함수 자체에서도 입력값을 검사합니다.
  if (!repositoryUrl.trim()) {
    throw new Error("GitHub 저장소 주소가 필요합니다.");
  }

  if (!Number.isInteger(pullNumber) || pullNumber < 1) {
    throw new Error("Pull Request 번호는 1 이상의 정수여야 합니다.");
  }

  if (!mcpServerUrl.trim()) {
    throw new Error("MCP 서버 주소가 필요합니다.");
  }

  if (!mcpApiToken.trim()) {
    throw new Error("MCP API 토큰이 필요합니다.");
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY 환경변수가 필요합니다.");
  }

  // 원격 ReviewFlow MCP 서버에 연결할 클라이언트입니다.
  const mcpClient = new Client({
    name: "reviewflow-github-review-service",
    version: "1.0.0",
  });

  const httpTransport = new StreamableHTTPClientTransport(
    new URL(mcpServerUrl),
    {
      requestInit: {
        headers: {
          Authorization: `Bearer ${mcpApiToken}`,
        },
      },
    },
  );

  let connected = false;

  try {
    await mcpClient.connect(httpTransport as unknown as Transport);

    connected = true;

    // 원격 GitHub Pull Request 정보를 조회합니다.
    const rawToolResult = await mcpClient.callTool({
      name: "githubPullRequestContext",
      arguments: {
        repositoryUrl,
        pullNumber,
      },
    });

    const toolResult = CallToolResultSchema.parse(rawToolResult);
    const pullRequestText = extractMcpTextContent(toolResult.content);

    if (toolResult.isError) {
      throw new Error(
        pullRequestText || "GitHub Pull Request 정보를 조회하지 못했습니다.",
      );
    }

    if (!pullRequestText) {
      throw new Error("리뷰할 Pull Request 정보가 없습니다.");
    }

    if (!toolResult.structuredContent) {
      throw new Error(
        "GitHub Pull Request의 구조화된 결과가 없습니다. MCP 서버 배포 버전을 확인해주세요.",
      );
    }

    const pullRequestData = GitHubPullRequestStructuredContentSchema.parse(
      toolResult.structuredContent,
    );

    // 작업 브랜치에서 Jira 티켓 키를 찾습니다.
    const jiraIssueKey = extractJiraIssueKey(pullRequestData.targetBranch);

    let jiraContext = "";

    // Jira 티켓 키가 있는 경우에만 Jira 도구를 호출합니다.
    if (jiraIssueKey) {
      const rawJiraToolResult = await mcpClient.callTool({
        name: "getJiraIssue",
        arguments: {
          issueKey: jiraIssueKey,
        },
      });

      const jiraToolResult = CallToolResultSchema.parse(rawJiraToolResult);

      jiraContext = extractMcpTextContent(jiraToolResult.content);

      if (jiraToolResult.isError) {
        throw new Error(jiraContext || "Jira 티켓 정보를 조회하지 못했습니다.");
      }
    }

    // GitHub PR과 Jira 정보를 OpenAI 입력으로 조합합니다.
    const openAiReviewContext = buildOpenAiReviewContext(
      pullRequestData.reviewContext,
      jiraContext,
    );

    // 테스트에서 이 파일을 불러올 때 OpenAI 클라이언트가
    // 즉시 만들어지지 않도록 실제 실행 시점에 가져옵니다.
    const { reviewByCodex } = await import("./codex.js");

    return await reviewByCodex(openAiReviewContext);
  } finally {
    // 연결에 성공한 경우에만 MCP 클라이언트를 닫습니다.
    if (connected) {
      await mcpClient.close();
    }
  }
}
