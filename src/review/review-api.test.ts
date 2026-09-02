import assert from "node:assert/strict";
import test from "node:test";

import { GitHubReviewRequestSchema, extractBearerToken } from "./review-api.js";

test("올바른 GitHub 리뷰 요청을 허용합니다.", () => {
  const result = GitHubReviewRequestSchema.parse({
    repositoryUrl: "https://github.com/kayoungcha/reviewflow-mcp",
    pullNumber: 12,
  });

  assert.equal(
    result.repositoryUrl,
    "https://github.com/kayoungcha/reviewflow-mcp",
  );
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
    repositoryUrl: "https://github.com/kayoungcha/reviewflow-mcp",
    pullNumber: 0,
  });

  assert.equal(result.success, false);
});

test("정수가 아닌 Pull Request 번호를 거부합니다.", () => {
  const result = GitHubReviewRequestSchema.safeParse({
    repositoryUrl: "https://github.com/kayoungcha/reviewflow-mcp",
    pullNumber: 1.5,
  });

  assert.equal(result.success, false);
});

test("예상하지 않은 요청 속성을 거부합니다.", () => {
  const result = GitHubReviewRequestSchema.safeParse({
    repositoryUrl: "https://github.com/kayoungcha/reviewflow-mcp",
    pullNumber: 12,
    unexpected: true,
  });

  assert.equal(result.success, false);
});

test("Authorization 헤더에서 Bearer 토큰을 추출합니다.", () => {
  assert.equal(
    extractBearerToken("Bearer github-oidc-token"),
    "github-oidc-token",
  );
});

test("Bearer의 대소문자를 구분하지 않습니다.", () => {
  assert.equal(
    extractBearerToken("bearer github-oidc-token"),
    "github-oidc-token",
  );
});

test("Authorization 헤더가 없으면 null을 반환합니다.", () => {
  assert.equal(extractBearerToken(undefined), null);
});

test("Bearer 형식이 아니면 null을 반환합니다.", () => {
  assert.equal(extractBearerToken("Basic github-oidc-token"), null);
});

test("Bearer 뒤에 토큰이 없으면 null을 반환합니다.", () => {
  assert.equal(extractBearerToken("Bearer   "), null);
});

test("Jira 프로젝트 키가 없어도 GitHub 리뷰 요청을 허용합니다.", () => {
  const result = GitHubReviewRequestSchema.parse({
    repositoryUrl: "https://github.com/kayoungcha/reviewflow-mcp",
    pullNumber: 12,
  });

  assert.equal(result.jiraProjectKey, undefined);
});

test("Jira 프로젝트 키를 대문자로 정규화합니다.", () => {
  const result = GitHubReviewRequestSchema.parse({
    repositoryUrl: "https://github.com/kayoungcha/reviewflow-mcp",
    pullNumber: 12,
    jiraProjectKey: "mcptest",
  });

  assert.equal(result.jiraProjectKey, "MCPTEST");
});

test("올바르지 않은 Jira 프로젝트 키를 거부합니다.", () => {
  const result = GitHubReviewRequestSchema.safeParse({
    repositoryUrl: "https://github.com/kayoungcha/reviewflow-mcp",
    pullNumber: 12,
    jiraProjectKey: "MCP TEST!",
  });

  assert.equal(result.success, false);
});
