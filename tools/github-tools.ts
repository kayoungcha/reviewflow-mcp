import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { fetchGitHubPullRequest, parseGitHubRepositoryUrl } from "../github.js";

// 한 번의 MCP 응답에 포함할 patch 전체 길이 제한입니다.
const MAX_TOTAL_PATCH_LENGTH = 60_000;

// GitHub 관련 MCP 도구들을 서버에 등록합니다.
export function registerGitHubTools(mcpServer: McpServer): void {
  mcpServer.registerTool(
    "githubPullRequestContext",
    {
      description:
        "GitHub 저장소 주소와 Pull Request 번호를 입력받아 원격 PR 정보를 조회합니다.",

      inputSchema: {
        repositoryUrl: z
          .url()
          .describe(
            "GitHub 저장소 주소 예: https://github.com.kayoungcha/MCP-test",
          ),

        pullNumber: z
          .number()
          .int()
          .positive()
          .describe("조회할 Pull Request 번호"),
      },

      // MCP 클라이언트가 문자열을 다시 해석하지 않아도 되도록
      // 프로그램이 읽을 수 있는 결과 형식을 정의합니다.

      outputSchema: {
        repository: z.string(),
        pullNumber: z.number().int().positive(),
        title: z.string(),
        baseBranch: z.string(),
        targetBranch: z.string(),
        url: z.url(),
        reviewContext: z.string(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ repositoryUrl, pullNumber }) => {
      try {
        const { owner, repository } = parseGitHubRepositoryUrl(repositoryUrl);

        const pullRequest = await fetchGitHubPullRequest(
          owner,
          repository,
          pullNumber,
        );

        // 현재까지 응답에 포함한 patch길이
        let usedPatchLength = 0;
        // 실제 patch를 초함한 파일 수
        let includedPatchCount = 0;
        // 크기 제한 때문에 patch를 생략한 파일 수
        let omittedPatchCount = 0;
        // GitHub가 patch를 제공하지 않은 파일 수
        // ex바이너리가 너무 큰 파일 등
        let unavailablePatchCount = 0;

        const changedFilesText =
          pullRequest.files.length > 0
            ? pullRequest.files
                .map((file) => {
                  let patchText: string;

                  if (!file.patch) {
                    unavailablePatchCount += 1;
                    patchText = "GitHub가 이 파일의 patch를 제공하지 않습니다.";
                  } else if (
                    usedPatchLength + file.patch.length >
                    MAX_TOTAL_PATCH_LENGTH
                  ) {
                    omittedPatchCount += 1;
                    patchText =
                      "전체 patch크기 제한으로 이 파일의 patch를 생략했습니다.";
                  } else {
                    usedPatchLength += file.patch.length;
                    includedPatchCount += 1;
                    patchText = file.patch;
                  }

                  return [
                    `파일: ${file.filename}`,
                    `상태: ${file.status}`,
                    `변경: +${file.additions} -${file.deletions}`,
                    "",
                    patchText,
                  ].join("\n");
                })
                .join("\n\n--------------------\n\n")
            : "변경된 파일이 없습니다.";

        // GitHub API를 통해 최대 3,000개의 변경 파일을 가져옵니다.
        const notFetchedFileCount = Math.max(
          pullRequest.totalChangedFiles - pullRequest.files.length,
          0,
        );

        // 하나라도 가져오지 못하거나 생략된 patch가 있으면
        // 전체 변경을 모두 검토한 상태가 아닙니다.
        const isPartialContext =
          notFetchedFileCount > 0 ||
          omittedPatchCount > 0 ||
          unavailablePatchCount > 0;

        const reviewCoverageText = [
          `전체 변경 파일: ${pullRequest.totalChangedFiles}개`,
          `현재 조회된 파일: ${pullRequest.files.length}개`,
          `patch 포함 파일: ${includedPatchCount}개`,
          `크기 제한으로 patch 생략: ${omittedPatchCount}개`,
          `GitHub에서 patch 미제공: ${unavailablePatchCount}개`,
          `아직 조회하지 않은 파일: ${notFetchedFileCount}개`,
          `포함된 patch 크기: ${usedPatchLength.toLocaleString()}자`,
          `검토 범위: ${
            isPartialContext
              ? "일부 변경만 포함됨"
              : "조회된 모든 변경이 포함됨"
          }`,
        ].join("\n");

        // MCP 클라이언트와 AI가 읽기 쉬운 문자열로 정리합니다.
        const text = [
          "=== GitHub Pull Request ===",
          `저장소: ${owner}/${repository}`,
          `PR 번호: ${pullRequest.number}`,
          `제목: ${pullRequest.title}`,
          `상태: ${pullRequest.state}`,
          `작성자: ${pullRequest.author}`,
          `기준 브랜치: ${pullRequest.baseBranch}`,
          `작업 브랜치: ${pullRequest.targetBranch}`,
          `PR 주소: ${pullRequest.url}`,
          "",
          "=== PR 본문 ===",
          pullRequest.body || "PR 본문이 없습니다.",
          "",
          "=== 리뷰 컨텍스트 범위 ===",
          reviewCoverageText,
          "",
          "=== 변경 파일 및 Patch ===",
          changedFilesText,
        ].join("\n");

        return {
          // 사람과 AI가 읽는 기존 텍스트 결과입니다.
          content: [
            {
              type: "text",
              text,
            },
          ],
          // 다른 프로그램이 안정적으로 읽는 구조화된 결과
          structuredContent: {
            repository: `${owner}/${repository}`,
            pullNumber: pullRequest.number,
            title: pullRequest.title,
            baseBranch: pullRequest.baseBranch,
            targetBranch: pullRequest.targetBranch,
            url: pullRequest.url,
            reviewContext: text,
          },
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : "알 수 없는 오류가 발생했습니다.";

        return {
          content: [
            {
              type: "text",
              text: `GitHub Pull Request를 조회하지 못했습니다: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
