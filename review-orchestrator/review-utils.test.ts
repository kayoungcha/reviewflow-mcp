import assert from "node:assert/strict";
import test from "node:test";
import {
  extractJiraIssueKey,
  extractMcpTextContent,
  shouldFailReview,
} from "./review-utils.js";

test("브랜치명에서 Jira 티켓 키를 추출합니다", () => {
  assert.equal(extractJiraIssueKey("MCPTEST-6-fix"), "MCPTEST-6");
});

test("브랜치 중간에 있는 Jira 티켓 키도 추출합니다", () => {
  assert.equal(extractJiraIssueKey("feature/MCPTEST-7-login"), "MCPTEST-7");
});

test("Jira 티켓 키가 없으면 null을 반환합니다", () => {
  assert.equal(extractJiraIssueKey("simple-branch"), null);
});

test("소문자로 입력된 Jira 티켓 키를 대문자로 변환합니다", () => {
  assert.equal(extractJiraIssueKey("mcptest-8-fix"), "MCPTEST-8");
});

test("통과 판정은 Actions를 실패시키지 않습니다", () => {
  assert.equal(shouldFailReview("통과"), false);
});

test("수정 권장 판정은 Actions를 실패시키지 않습니다", () => {
  assert.equal(shouldFailReview("수정 권장"), false);
});

test("수정 필요 판정은 Actions를 실패시킵니다", () => {
  assert.equal(shouldFailReview("수정 필요"), true);
});

test("MCP 결과에서 text 콘텐츠만 문자열로 합칩니다", () => {
  const result = extractMcpTextContent([
    { type: "text", text: "첫 번째 내용" },
    {
      type: "image",
    },
    {
      type: "text",
      text: "두 번째 내용",
    },
  ]);

  assert.equal(result, "첫 번째 내용\n두 번째 내용");
});

test("MCP 결과에 text 콘텐츠가 없으면 빈 문자열을 반환합니다.", () => {
  const result = extractMcpTextContent([{ type: "image" }]);

  assert.equal(result, "");
});
