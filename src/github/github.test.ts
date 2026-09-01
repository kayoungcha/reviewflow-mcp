import assert from "node:assert/strict";
import test from "node:test";

import {
  collectGitHubPullRequestFiles,
  parseGitHubRepositoryUrl,
} from "./github.js";

import type { GitHubPullRequestFileResponse } from "./github.js";

function createFakeFiles(
  startNumber: number,
  count: number,
): GitHubPullRequestFileResponse[] {
  return Array.from({ length: count }, (_value, index) => {
    const fileNumber = startNumber + index;

    return {
      filename: `src/file-${fileNumber}.ts`,
      status: "modified",
      additions: 1,
      deletions: 0,
      changes: 1,
      patch: `+ file ${fileNumber}`,
    };
  });
}

test("250개 변경 파일을 3페이지에 걸쳐 조회합니다", async () => {
  const requestedPages: number[] = [];

  const files = await collectGitHubPullRequestFiles(async (page) => {
    requestedPages.push(page);

    if (page === 1) {
      return createFakeFiles(1, 100);
    }

    if (page === 2) {
      return createFakeFiles(101, 100);
    }

    if (page === 3) {
      return createFakeFiles(201, 50);
    }

    return [];
  }, 250);

  assert.equal(files.length, 250);
  assert.deepEqual(requestedPages, [1, 2, 3]);
  assert.equal(files[0]?.filename, "src/file-1.ts");
  assert.equal(files[249]?.filename, "src/file-250.ts");
});

test("100개보다 적은 페이지를 받으면 다음 페이지를 요청하지 않습니다.", async () => {
  const requestedPages: number[] = [];

  const files = await collectGitHubPullRequestFiles(async (page) => {
    requestedPages.push(page);
    return createFakeFiles(1, 20);
  }, 250);

  assert.equal(files.length, 20);
  assert.deepEqual(requestedPages, [1]);
});

test("같은 파일이 여러 번 반환돼도 결과에는 한 번만 포함합니다", async () => {
  const duplicateFile = createFakeFiles(1, 1)[0];

  assert.ok(duplicateFile);
  const files = await collectGitHubPullRequestFiles(async () => {
    return [duplicateFile, duplicateFile];
  }, 2);

  assert.equal(files.length, 1);
  assert.equal(files[0]?.filename, "src/file-1.ts");
});

test("변경 파일은 최대 3,000개까지만 조회합니다.", async () => {
  const requestedPages: number[] = [];

  const files = await collectGitHubPullRequestFiles(async (page) => {
    requestedPages.push(page);

    const startNumber = (page - 1) * 100 + 1;

    return createFakeFiles(startNumber, 100);
  }, 4_000);

  assert.equal(files.length, 3_000);
  assert.equal(requestedPages.length, 30);
  assert.equal(requestedPages[0], 1);
  assert.equal(requestedPages[29], 30);
  assert.equal(files[2_999]?.filename, "src/file-3000.ts");
});

test("변경 파일이 0개면 페이지를 요청하지 않습니다", async () => {
  let callCount = 0;
  const files = await collectGitHubPullRequestFiles(async () => {
    callCount += 1;
    return [];
  }, 0);

  assert.deepEqual(files, []);
  assert.equal(callCount, 0);
});

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
