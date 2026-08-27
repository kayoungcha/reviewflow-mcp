import assert from "node:assert/strict";
import test from "node:test";

import { parseGitHubRepositoryUrl } from "./github.js";

test("GitHub 저장소 주소에서 owner와 repository를 추출합니다", () => {
  const result = parseGitHubRepositoryUrl(
    "https://github.com/kayoungcha/MCP-test",
  );

  assert.deepEqual(result, {
    owner: "kayoungcha",
    repository: "MCP-test",
  });
});

test(".git으로 끝나는 저장소 주소도 처리합니다.", () => {
  const result = parseGitHubRepositoryUrl(
    "https://github.com/kayoungcha/MCP-test.git",
  );

  assert.deepEqual(result, {
    owner: "kayoungcha",
    repository: "MCP-test",
  });
});

test("마지막에 슬래시가 있는 저장소 주소도 처리합니다.", () => {
  const result = parseGitHubRepositoryUrl(
    "https://github.com/kayoungcha/MCP-test/",
  );

  assert.deepEqual(result, {
    owner: "kayoungcha",
    repository: "MCP-test",
  });
});

test("올바른 URL이 아니면 오류를 발생시킵니다 ", () => {
  assert.throws(() => {
    parseGitHubRepositoryUrl("github 저장소");
  }, /올바른 GitHub 저장소 주소/);
});

test("github.com이 아닌 주소는 거부합니다", () => {
  assert.throws(() => {
    parseGitHubRepositoryUrl("https://example.com/kayoungcha/MCP-test");
  }, /github\.com 저장소 주소만/);
});

test("저장소보다 하위 경로가 더 있으면 거부합니다", () => {
  assert.throws(() => {
    parseGitHubRepositoryUrl("https://github.com/kayoungcha/MCP-test/pulls/10");
  }, /GitHub 저장소 주소는/);
});

test("저장소 이름이 없으면 거부합니다", () => {
  assert.throws(() => {
    parseGitHubRepositoryUrl("https://github.com/kayoungcha");
  }, /GitHub 저장소 주소는/);
});

test("저장소 이름이 .git뿐이면 거부합니다", () => {
  assert.throws(() => {
    parseGitHubRepositoryUrl("https://github.com/kayoungcha/.git");
  }, /GitHub 저장소 이름을 확인할 수 없습니다/);
});
