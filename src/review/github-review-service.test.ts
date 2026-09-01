import assert from "node:assert/strict";
import test from "node:test";
import { buildOpenAiReviewContext } from "./github-review-service.js";

test("GitHub PR과 Jira 정보가 있으면 두 컨텍스트를 함께 포함합니다.", () => {
  const pullRequestContext = [
    "=== GitHub Pull Request ===",
    "PR 번호: 17",
    "작업 브랜치: MCPTEST-17",
  ].join("\n");

  const jiraContext = [
    "=== Jira 티켓 ===",
    "MCPTEST-17",
    "리뷰 로직을 재사용 가능한 함수로 분리합니다.",
  ].join("\n");

  const result = buildOpenAiReviewContext(pullRequestContext, jiraContext);

  assert.ok(
    result.includes(
      "입력에는 GitHub Pull Request 정보와 실제 Jira 조회 결과가 포함되어 있습니다.",
    ),
  );

  assert.ok(result.includes(pullRequestContext));
  assert.ok(result.includes(jiraContext));
});

test("Jira 정보가 없으면 GitHub PR 컨텍스트만 포함합니다.", () => {
  const pullRequestContext = [
    "=== GitHub Pull Request ===",
    "PR 번호: 17",
  ].join("\n");

  const result = buildOpenAiReviewContext(pullRequestContext, "");

  assert.ok(result.includes("Jira 티켓 정보는 제공되지 않았습니다."));
  assert.ok(result.includes("jiraSummary는 반드시 null로 반환하세요."));
  assert.ok(result.includes(pullRequestContext));
  assert.equal(
    result.includes("실제 Jira 조회 결과가 포함되어 있습니다."),
    false,
  );
});
