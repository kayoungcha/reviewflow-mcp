import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import os from "node:os";

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractJiraText } from "./review-orchestrator/extractJiraText.js";
import { registerGitHubTools } from "./tools/github-tools.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repositoryRoot = __dirname;

function runGit(args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trimEnd();
}

export function createReviewFlowMcpServer(): McpServer {
  const mcpServer = new McpServer({
    name: "reviewflow-mcp",
    version: "1.0.0",
  });

  /** 연습용 tools*/
  mcpServer.registerTool(
    "greeting",
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

  mcpServer.registerTool(
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

  mcpServer.registerTool(
    "coin",
    { description: "동전을 던집니다." },
    async () => {
      const result = Math.random() < 0.5 ? "앞면" : "뒷면";

      return {
        content: [
          {
            type: "text",
            text: `🪙 ${result}`,
          },
        ],
      };
    },
  );

  mcpServer.registerTool(
    "currentBranch",
    {
      description: "현재 Git 저장소에서 체크아웃된 브랜치 이름을 조회합니다.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async () => {
      try {
        const branch = runGit(["branch", "--show-current"]);

        return {
          content: [
            {
              type: "text",
              text: branch || "현재 브랜치 이름을 확인할 수 없습니다.",
            },
          ],
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `현재 브랜치를 조회하지 못했습니다: ${message}`,
            },
          ],
        };
      }
    },
  );
  /* --- 연습용 tools 끝  ---*/

  // 본격 git, jira mcp 연결용
  mcpServer.registerTool(
    "lastCommit",
    {
      description:
        "현재 Git 저장소의 가장 최근 커밋 해시와 커밋 메시지를 조회합니다.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async () => {
      try {
        const commit = runGit(["log", "-1", "--oneline"]);
        return {
          content: [
            {
              type: "text",
              text: commit,
            },
          ],
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `최근 커밋을 조회하지 못했습니다: ${message}`,
            },
          ],
        };
      }
    },
  );

  mcpServer.registerTool(
    "gitDiff",
    {
      description:
        "현재 Git 저장소에서 추적 중인 파일의 스테이징되지 않은 diff를 조회합니다.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async () => {
      try {
        const diff = runGit(["diff"]);

        return {
          content: [
            {
              type: "text",
              text: diff || "커밋되지 않은 변경사항이 없습니다.",
            },
          ],
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Git diff를 조회하지 못했습니다: ${message}`,
            },
          ],
        };
      }
    },
  );

  mcpServer.registerTool(
    "gitStatus",
    {
      description:
        "현재 Git 저장소에서 수정, 추가, 삭제 및 추적되지 않은 파일 목록을 조회합니다.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async () => {
      try {
        const status = runGit(["status", "--short"]);

        return {
          content: [
            { type: "text", text: status || "변경된 파일이 없습니다." },
          ],
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Git 상태를 조회하지 못했습니다: ${message}`,
            },
          ],
        };
      }
    },
  );

  mcpServer.registerTool(
    "stagedDiff",
    {
      description:
        "현재 Git 저장소에서 Git add로 스테이징된 변경사항의 diff를 조회합니다.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async () => {
      try {
        const diff = runGit(["diff", "--cached"]);

        return {
          content: [
            { type: "text", text: diff || "스테이징된 변경사항이 없습니다." },
          ],
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `스테이징된 diff를 조회하지 못했습니다: ${message}`,
            },
          ],
        };
      }
    },
  );

  mcpServer.registerTool(
    "gitReviewContext",
    {
      description:
        "현재 브랜치, 최근 커밋, 파일 상태, 일반 diff와 스테이징된 diff를 한 번에 조회합니다. 코드 리뷰를 준비할 때 사용합니다.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      try {
        // git branch --show-current를 실행해 현재 브랜치 이름을 가져옵니다.
        const branch = runGit(["branch", "--show-current"]);

        // git log -1 --oneline을 실행해 최근 커밋 하나를 가져옵니다.
        const lastCommit = runGit(["log", "-1", "--oneline"]);

        // git status --short를 실행해 변경된 파일 목록을 가져옵니다.
        const status = runGit(["status", "--short"]);

        // git diff를 실행해 아직 git add하지 않은 변경 내용을 가져옵니다.
        const unstagedDiff = runGit(["diff"]);

        // git diff --cached를 실행해 git add된 변경 내용을 가져옵니다.
        const stagedDiff = runGit(["diff", "--cached"]);
        return {
          content: [
            {
              type: "text",
              text: [
                "=== 현재 브랜치 ===",
                branch || "현재 브랜치를 확인할 수 없습니다.",

                "",
                "=== 최근 커밋 ===",
                lastCommit || "최근 커밋이 없습니다.",

                "",
                "=== 변경된 파일 ===",
                status || "변경된 파일이 없습니다.",

                "",
                "=== 스테이징되지 않은 변경 ===",
                unstagedDiff || "스테이징되지 않은 변경사항이 없습니다.",

                "",
                "=== 스테이징된 변경 ===",
                stagedDiff || "스테이징된 변경사항이 없습니다.",
              ].join("\n"),
            },
          ],
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `코드 리뷰 정보를 준비하지 못했습니다: ${message}`,
            },
          ],
        };
      }
    },
  );

  const gitReferenceSchema = z
    .string()
    .trim()
    .min(1, "브랜치 이름을 입력해야합니다.")
    .refine((value) => !value.startsWith("-"), {
      message: "브랜치 이름은 -로 시작할 수 없습니다.",
    });

  // 두 Git 브랜치의 차이를 코드 리뷰용으로 가져오는 MCP 도구입니다.
  mcpServer.registerTool(
    // AI나 MCP 클라이언트가 호출할 도구 이름입니다.
    "branchReviewContext",

    {
      // 이 도구가 무엇을 하는지 AI에게 알려줍니다.
      description:
        "기준 브랜치와 비교 브랜치 사이의 커밋, 변경 파일 및 diff를 코드 리뷰용으로 조회합니다.",

      // 이 도구를 호출할 때 받아야 하는 입력값입니다.
      inputSchema: {
        // 보통 main처럼 비교의 기준이 되는 브랜치입니다.
        baseBranch: gitReferenceSchema.describe(
          "비교 기준이 되는 브랜치 또는 커밋입니다. 예: main",
        ),

        // feature/login처럼 리뷰하려는 브랜치입니다.
        targetBranch: gitReferenceSchema.describe(
          "리뷰할 대상 브랜치 또는 커밋입니다. 예: feature/login",
        ),
      },

      // 저장소를 변경하지 않는 조회 전용 도구라는 뜻입니다.
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },

    // MCP 클라이언트가 전달한 두 입력값을 받습니다.
    async ({ baseBranch, targetBranch }) => {
      try {
        // 기준 브랜치가 실제로 존재하는지 확인합니다.
        // ^{commit}은 입력값이 실제 커밋을 가리키는지 검사합니다.
        runGit(["rev-parse", "--verify", `${baseBranch}^{commit}`]);
        // 비교 대상 브랜치도 실제로 존재하는지 확인합니다.
        runGit(["rev-parse", "--verify", `${targetBranch}^{commit}`]);

        // 기준 브랜치에는 없고 대상 브랜치에만 있는 커밋을 가져옵니다.
        const commits = runGit([
          "log",
          "--oneline",
          `${baseBranch}..${targetBranch}`,
        ]);

        // 두 브랜치 사이에서 변경된 파일 이름과 상태를 가져옵니다.
        // A = 추가
        // M = 수정
        // D = 삭제
        const changedFiles = runGit([
          "diff",
          "--name-status",
          `${baseBranch}...${targetBranch}`,
        ]);

        // 실제 코드 변경 내용을 가져옵니다.
        // 점 세 개(...)는 두 브랜치가 갈라진 지점부터
        // targetBranch에 생긴 변경을 보여줍니다.
        const diff = runGit(["diff", `${baseBranch}...${targetBranch}`]);

        // 가져온 정보를 하나의 코드 리뷰 자료로 합칩니다.
        const reviewContext = [
          "=== 기준 브랜치 ===",
          baseBranch,

          "",
          "=== 비교 브랜치 ===",
          targetBranch,

          "",
          "=== 비교 브랜치에만 있는 커밋 ===",
          commits || "추가된 커밋이 없습니다.",

          "",
          "=== 변경된 파일 ===",
          changedFiles || "변경된 파일이 없습니다.",

          "",
          "=== 브랜치 변경 내용 ===",
          diff || "두 브랜치 사이에 변경사항이 없습니다.",
        ].join("\n");

        // MCP 표준 형식으로 결과를 반환합니다.
        return {
          content: [
            {
              type: "text",
              text: reviewContext,
            },
          ],
        };
      } catch (error: unknown) {
        // Error 객체라면 실제 오류 메시지를 가져옵니다.
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";

        // MCP 도구 실행 실패 형식으로 반환합니다.
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `브랜치 비교 정보를 가져오지 못했습니다: ${message}`,
            },
          ],
        };
      }
    },
  );

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
