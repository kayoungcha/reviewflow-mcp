import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { extractJiraText } from "../jira/extract-jira-text.js";
import { registerGitHubTools } from "./tools/github-tools.js";

export function createReviewFlowMcpServer(): McpServer {
  const mcpServer = new McpServer({
    name: "reviewflow-mcp",
    version: "1.0.0",
  });

  const jiraIssueKeySchema = z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]*-\d+$/i, "Jira 티켓 키 형식이 올바르지 않습니다.");

  mcpServer.registerTool(
    "getJiraIssue",
    {
      description:
        "Jira 티켓 키를 입력받아 제목, 설명, 상태 및 이슈 유형을 조회합니다.",

      inputSchema: {
        issueKey: jiraIssueKeySchema.describe(
          "조회할 Jira 티켓 키입니다. 예: MCPTEST-4",
        ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },

    async ({ issueKey }) => {
      try {
        const jiraBaseUrl = process.env.JIRA_BASE_URL?.replace(/\/+$/, "");
        const jiraEmail = process.env.JIRA_EMAIL;
        const jiraApiToken = process.env.JIRA_API_TOKEN;

        if (!jiraBaseUrl || !jiraEmail || !jiraApiToken) {
          throw new Error(
            "JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN 환경변수가 필요합니다.",
          );
        }

        // 이메일과 API 토큰을 Jira Basic 인증 형식으로 변환합니다.
        // 원본 이메일과 토큰을 응답이나 로그에 출력하지 않습니다.
        const authorization = Buffer.from(
          `${jiraEmail}:${jiraApiToken}`,
        ).toString("base64");

        const requestUrl =
          `${jiraBaseUrl}/rest/api/3/issue/` +
          `${encodeURIComponent(issueKey)}` +
          "?fields=summary,description,status,issuetype";

        const response = await fetch(requestUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Basic ${authorization}`,
          },
          // Jira가 응답하지 않을 때 영원히 기다리지 않도록
          // 10초 뒤 요청을 중단합니다.
          signal: AbortSignal.timeout(10_000),
        });

        if (response.status === 404) {
          return {
            content: [{ type: "text", text: "" }],
          };
        }

        if (!response.ok) {
          throw new Error(
            `Jira 요청이 실패했습니다. HTTP 상태: ${response.status}`,
          );
        }

        const issue = (await response.json()) as {
          key?: string;
          fields?: {
            summary?: string;
            description?: unknown;
            status?: {
              name?: string;
            };
            issuetype?: {
              name?: string;
            };
          };
        };

        const description = extractJiraText(issue.fields?.description);

        // 사람과 AI가 함께 읽기 쉬운 리뷰 컨텍스트를 만듭니다.
        const jiraContext = [
          "=== Jira 티켓 ===",
          issue.key || issueKey,

          "",
          "=== 제목 ===",
          issue.fields?.summary || "제목이 없습니다.",

          "",
          "=== 이슈 유형 ===",
          issue.fields?.issuetype?.name || "확인할 수 없습니다.",

          "",
          "=== 상태 ===",
          issue.fields?.status?.name || "확인할 수 없습니다.",

          "",
          "=== 설명 및 수용 기준 ===",
          description || "설명이 없습니다.",
        ].join("\n");

        return {
          content: [{ type: "text", text: jiraContext }],
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Jira 티켓을 조회하지 못했습니다: ${message}`,
            },
          ],
        };
      }
    },
  );
  registerGitHubTools(mcpServer);
  return mcpServer;
}
