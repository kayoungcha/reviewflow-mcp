import assert from "node:assert/strict";
import test from "node:test";
import { JiraLifecycleRequestSchema } from "./jira-lifecycle-api.js";

test("올바른 Jira 생명주기 요청을 허용합니다.", () => {
  const result = JiraLifecycleRequestSchema.parse({
    repositoryUrl: "https://github.com/kayoungcha/reviewflow-demo",
    pullNumber: 1,
    action: "opened",
    merged: false,
    jiraProjectKey: "MCPTEST",
  });

  assert.equal(result.action, "opened");
  assert.equal(result.merged, false);
  assert.equal(result.jiraProjectKey, "MCPTEST");
});

test("Jira 프로젝트 키가 없는 요청도 허용합니다.", () => {
  const result = JiraLifecycleRequestSchema.parse({
    repositoryUrl: "https://github.com/kayoungcha/reviewflow-demo",
    pullNumber: 1,
    action: "opened",
    merged: false,
  });

  assert.equal(result.jiraProjectKey, undefined);
});

test("Jira 프로젝트 키를 대문자로 정규화합니다.", () => {
  const result = JiraLifecycleRequestSchema.parse({
    repositoryUrl: "https://github.com/kayoungcha/reviewflow-demo",
    pullNumber: 1,
    action: "reopened",
    merged: false,
    jiraProjectKey: "mcptest",
  });
  assert.equal(result.jiraProjectKey, "MCPTEST");
});

test("지원하지 않는 Pull Request 이벤트를 거부합니다.", () => {
  const result = JiraLifecycleRequestSchema.safeParse({
    repositoryUrl: "https://github.com/kayoungcha/reviewflow-demo",
    pullNumber: 1,
    action: "edited",
    merged: false,
  });
  assert.equal(result.success, false);
});

test("merged가 boolean이 아니면 거부합니다", () => {
  const result = JiraLifecycleRequestSchema.safeParse({
    repositoryUrl: "https://github.com/kayoungcha/reviewflow-demo",
    pullNumber: 1,
    action: "closed",
    merged: "true",
  });

  assert.equal(result.success, false);
});

test("예상하지 않은 요청 속성을 거부합니다", () => {
  const result = JiraLifecycleRequestSchema.safeParse({
    repositoryUrl: "https://github.com/kayoungcha/reviewflow-demo",
    pullNumber: 1,
    action: "closed",
    merged: true,
    unexpected: true,
  });
  assert.equal(result.success, false);
});
