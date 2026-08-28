import assert from "node:assert/strict";
import test from "node:test";

import {
  GitHubReviewRequestSchema,
  hasValidReviewApiToken,
} from "./review-api.js";

test("올바른 GitHub 리뷰 요청을 허용합니다.", () => {
  const result = GitHubReviewRequestSchema.parse({
    repositoryUrl: "https://github.com/kayoungcha/MCP-test",
    pullNumber: 12,
  });

  assert.equal(result.repositoryUrl, "https://github.com/kayoungcha/MCP-test");
  assert.equal(result.pullNumber, 12);
});

test("올바르지 않은 저장소 주소를 거부합니다.", () => {
  const result = GitHubReviewRequestSchema.safeParse({
    repositoryUrl: "github 주소 아님",
    pullNumber: 12,
  });

  assert.equal(result.success, false);
});

test("1보다 작은 Pull Request 번호를 거부합니다.", () => {
  const result = GitHubReviewRequestSchema.safeParse({
    repositoryUrl: "https://github.com/kayoungcha/MCP-test",
    pullNumber: 0,
  });

  assert.equal(result.success, false);
});

test("정수가 아닌 Pull Request 번호를 거부합니다.", () => {
  const result = GitHubReviewRequestSchema.safeParse({
    repositoryUrl: "https://github.com/kayoungcha/MCP-test",
    pullNumber: 1.5,
  });

  assert.equal(result.success, false);
});

test("예상하지 않은 요청 속성을 거부합니다.", () => {
  const result = GitHubReviewRequestSchema.safeParse({
    repositoryUrl: "https://github.com/kayoungcha/MCP-test",
    pullNumber: 12,
    unexpected: true,
  });

  assert.equal(result.success, false);
});

test("올바른 ReviewFlow API 토큰을 허용합니다.", () => {
  assert.equal(
    hasValidReviewApiToken("Bearer secret-token", "secret-token"),
    true,
  );
});

test("토큰이 없거나 올바르지 않으면 거부합니다.", () => {
  assert.equal(hasValidReviewApiToken(undefined, "secret-token"), false);
  assert.equal(
    hasValidReviewApiToken("Bearer wrong-token", "secret-token"),
    false,
  );
});

test("Jira 프로젝트 키가 없어도 GitHub 리뷰 요청을 허용합니다.", () => {
  const result = GitHubReviewRequestSchema.parse({
    repositoryUrl: "https://github.com/kayoungcha/MCP-test",
    pullNumber: 12,
  });

  assert.equal(result.jiraProjectKey, undefined);
});

test("Jira 프로젝트 키를 대문자로 정규화합니다.", () => {
  const result = GitHubReviewRequestSchema.parse({
    repositoryUrl: "https://github.com/kayoungcha/MCP-test",
    pullNumber: 12,
    jiraProjectKey: "mcptest",
  });

  assert.equal(result.jiraProjectKey, "MCPTEST");
});

test("올바르지 않은 Jira 프로젝트 키를 거부합니다.", () => {
  const result = GitHubReviewRequestSchema.safeParse({
    repositoryUrl: "https://github.com/kayoungcha/MCP-test",
    pullNumber: 12,
    jiraProjectKey: "MCP TEST!",
  });

  assert.equal(result.success, false);
});
