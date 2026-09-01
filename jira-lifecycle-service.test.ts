import assert from "node:assert/strict";
import test from "node:test";

import {
  createJiraCommentDocument,
  determineJiraLifecycleOperations,
} from "./jira-lifecycle-service.js";

test("PR 생성 시 Jira를 검토 중으로 이동합니다.", () => {
  const operations = determineJiraLifecycleOperations({
    action: "opened",
    merged: false,
  });

  assert.deepEqual(operations, ["move_to_review"]);
});

test("새 커밋 push 시 Jira를 검토 중으로 이동합니다.", () => {
  const operations = determineJiraLifecycleOperations({
    action: "synchronize",
    merged: false,
  });

  assert.deepEqual(operations, ["move_to_review"]);
});

test("Draft PR을 리뷰 가능 상태로 변경하면 Jira를 검토 중으로 이동합니다.", () => {
  const operations = determineJiraLifecycleOperations({
    action: "ready_for_review",
    merged: false,
  });

  assert.deepEqual(operations, ["move_to_review"]);
});

test("PR 재개 시 Jira를 검토 중으로 이동하고 댓글을 작성합니다.", () => {
  const operations = determineJiraLifecycleOperations({
    action: "reopened",
    merged: false,
  });

  assert.deepEqual(operations, ["move_to_review", "comment_reopened"]);
});

test("PR 병합 시 Jira를 완료로 이동합니다.", () => {
  const operations = determineJiraLifecycleOperations({
    action: "closed",
    merged: true,
  });

  assert.deepEqual(operations, ["move_to_done"]);
});

test("PR이 병합되지 않고 종료되면 Jira 댓글만 작성합니다.", () => {
  const operations = determineJiraLifecycleOperations({
    action: "closed",
    merged: false,
  });

  assert.deepEqual(operations, ["comment_unmerged"]);
});

test("Jira 댓글을 하나의 문단과 줄바꿈으로 구성합니다. ", () => {
  const document = createJiraCommentDocument([
    "Pull Request가 다시 열렸습니다.",
    "PR: #12 테스트 PR",
    "재개한 사람: kayoungcha",
  ]);
  assert.deepEqual(document, {
    body: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Pull Request가 다시 열렸습니다.",
            },
            {
              type: "hardBreak",
            },
            {
              type: "text",
              text: "PR: #12 테스트 PR",
            },
            {
              type: "hardBreak",
            },
            {
              type: "text",
              text: "재개한 사람: kayoungcha",
            },
          ],
        },
      ],
    },
  });
});
