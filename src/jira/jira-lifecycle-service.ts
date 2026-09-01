import type { JiraLifecycleRequest } from "./jira-lifecycle-api.js";
import { requestJira } from "./jira-client.js";
import { fetchGitHubPullRequestMetadata } from "../github/github.js";
import { extractJiraIssueKeyForProject } from "../review/review-utils.js";

export type JiraLifecycleOperation =
  "move_to_review" | "move_to_done" | "comment_reopened" | "comment_unmerged";

// Pull Request 이벤트를 실제로 실행할 Jira 작업 목록으로 변환합니다.
// Jira API 호출과 분리된 순수 함수이므로
// 네트워크 연결 없이 이벤트별 동작을 테스트할 수 있습니다.
export const determineJiraLifecycleOperations = (
  request: Pick<JiraLifecycleRequest, "action" | "merged">,
): JiraLifecycleOperation[] => {
  switch (request.action) {
    case "opened":
    case "synchronize":
    case "ready_for_review":
      return ["move_to_review"];

    case "reopened":
      return ["move_to_review", "comment_reopened"];

    case "closed":
      return request.merged ? ["move_to_done"] : ["comment_unmerged"];
  }
};

type JiraIssueStatusResponse = {
  fields?: {
    status?: {
      id?: string;
      name?: string;
      statusCategory?: {
        key?: string;
      };
    };
  };
};

type JiraTransitionsResponse = {
  transitions?: Array<{
    id?: string;
    to?: {
      id?: string;
      name?: string;
      statusCategory?: {
        key?: string;
      };
    };
  }>;
};

export type JiraIssueStatus = {
  id: string;
  name: string;
  categoryKey: string;
};

export type JiraTransition = {
  id: string;
  targetStatusId: string;
  targetStatusName: string;
  targetCategoryKey: string;
};

export const getJiraIssueStatus = async (
  issueKey: string,
): Promise<JiraIssueStatus> => {
  const encodedIssueKey = encodeURIComponent(issueKey);

  const response = await requestJira(
    `/rest/api/3/issue/${encodedIssueKey}?fields=status`,
  );

  const result = (await response.json()) as JiraIssueStatusResponse;
  const status = result.fields?.status;

  if (!status?.id || !status.name || !status.statusCategory?.key) {
    throw new Error(`Jira 티켓의 현재 상태를 확인하지 못했습니다: ${issueKey}`);
  }

  return {
    id: status.id,
    name: status.name,
    categoryKey: status.statusCategory.key,
  };
};

export const getJiraIssueTransitions = async (
  issueKey: string,
): Promise<JiraTransition[]> => {
  const encodedIssueKey = encodeURIComponent(issueKey);

  const response = await requestJira(
    `/rest/api/3/issue/${encodedIssueKey}/transitions`,
  );

  const result = (await response.json()) as JiraTransitionsResponse;

  return (result.transitions ?? []).flatMap((transition) => {
    const transitionId = transition.id;
    const targetStatusId = transition.to?.id;
    const targetStatusName = transition.to?.name;
    const targetCategoryKey = transition.to?.statusCategory?.key;

    if (
      !transitionId ||
      !targetStatusId ||
      !targetStatusName ||
      !targetCategoryKey
    ) {
      return [];
    }

    return [
      {
        id: transitionId,
        targetStatusId,
        targetStatusName,
        targetCategoryKey,
      },
    ];
  });
};

export const executeJiraTransition = async (
  issueKey: string,
  transitionId: string,
): Promise<void> => {
  const encodedIssueKey = encodeURIComponent(issueKey);

  await requestJira(`/rest/api/3/issue/${encodedIssueKey}/transitions`, {
    method: "POST",
    body: JSON.stringify({
      transition: {
        id: transitionId,
      },
    }),
  });
};

export type JiraStatusTransitionResult =
  "transitioned" | "already_in_target_status" | "skipped_completed";

export const moveJiraIssueToReview = async (
  issueKey: string,
): Promise<JiraStatusTransitionResult> => {
  const reviewStatusId = process.env.JIRA_REVIEW_STATUS_ID;

  if (!reviewStatusId) {
    throw new Error("JIRA_REVIEW_STATUS_ID 환경변수가 필요합니다.");
  }

  const currentStatus = await getJiraIssueStatus(issueKey);

  if (currentStatus.categoryKey === "done") {
    return "skipped_completed";
  }

  if (currentStatus.id === reviewStatusId) {
    return "already_in_target_status";
  }

  const transitions = await getJiraIssueTransitions(issueKey);

  const reviewTransition = transitions.find((transition) => {
    return transition.targetStatusId === reviewStatusId;
  });

  if (!reviewTransition) {
    throw new Error(
      `검토 중 상태로 이동할 수 있는 Jira transition을 찾지 못했습니다: ${issueKey}`,
    );
  }

  await executeJiraTransition(issueKey, reviewTransition.id);

  return "transitioned";
};

export const moveJiraIssueToDone = async (
  issueKey: string,
): Promise<JiraStatusTransitionResult> => {
  const currentStatus = await getJiraIssueStatus(issueKey);

  if (currentStatus.categoryKey === "done") {
    return "already_in_target_status";
  }

  const transitions = await getJiraIssueTransitions(issueKey);

  const doneTransition = transitions.find((transition) => {
    return transition.targetCategoryKey === "done";
  });

  if (!doneTransition) {
    throw new Error(
      `완료 상태로 이동할 수 있는 Jira transition을 찾지 못했습니다: ${issueKey}`,
    );
  }

  await executeJiraTransition(issueKey, doneTransition.id);

  return "transitioned";
};

export type JiraPullRequestCommentContext = {
  pullNumber: number;
  pullRequestTitle: string;
  pullRequestUrl: string;
  actor: string;
};

// 여러 줄의 내용을 Jira ADF 문서 형식으로 변환합니다.
export const createJiraCommentDocument = (
  lines: string[],
): Record<string, unknown> => {
  const content = lines.flatMap((line, index) => {
    const textNode = {
      type: "text",
      text: line,
    };

    if (index === 0) {
      return [textNode];
    }

    return [
      {
        type: "hardBreak",
      },
      textNode,
    ];
  });

  return {
    body: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content,
        },
      ],
    },
  };
};

// Jira 티켓에 댓글을 작성합니다.
export const addJiraIssueComment = async (
  issueKey: string,
  lines: string[],
): Promise<void> => {
  const encodedIssueKey = encodeURIComponent(issueKey);
  const document = createJiraCommentDocument(lines);

  await requestJira(`/rest/api/3/issue/${encodedIssueKey}/comment`, {
    method: "POST",
    body: JSON.stringify(document),
  });
};

// 종료되었던 PR이 다시 열린 사실을 Jira에 기록합니다.
export const commentReopenedPullRequest = async (
  issueKey: string,
  context: JiraPullRequestCommentContext,
): Promise<void> => {
  await addJiraIssueComment(issueKey, [
    "종료되었던 Pull Request가 다시 열렸습니다.",
    `PR: #${context.pullNumber} ${context.pullRequestTitle}`,
    `재개한 사람: ${context.actor}`,
    `PR 주소: ${context.pullRequestUrl}`,
  ]);
};

// PR이 병합되지 않고 종료된 사실을 Jira에 기록합니다.
export const commentUnmergedPullRequest = async (
  issueKey: string,
  context: JiraPullRequestCommentContext,
): Promise<void> => {
  await addJiraIssueComment(issueKey, [
    "연결된 Pull Request가 병합되지 않고 종료되었습니다.",
    `PR: #${context.pullNumber} ${context.pullRequestTitle}`,
    `종료자: ${context.actor}`,
    `PR 주소: ${context.pullRequestUrl}`,
    "티켓 상태와 후속 작업 여부를 다시 확인해주세요.",
  ]);
};

export type JiraLifecycleOperationResult = {
  operation: JiraLifecycleOperation;
  result: JiraStatusTransitionResult | "completed";
};

export type ExecuteJiraLifecycleParams = {
  issueKey: string;
  action: JiraLifecycleRequest["action"];
  merged: boolean;
  commentContext: JiraPullRequestCommentContext;
};

// PR 이벤트에 필요한 Jira 작업 순서대로 실행합니다.
export const executeJiraLifecycle = async (
  params: ExecuteJiraLifecycleParams,
): Promise<JiraLifecycleOperationResult[]> => {
  const operations = determineJiraLifecycleOperations({
    action: params.action,
    merged: params.merged,
  });

  const results: JiraLifecycleOperationResult[] = [];

  for (const operation of operations) {
    switch (operation) {
      case "move_to_review": {
        const result = await moveJiraIssueToReview(params.issueKey);
        results.push({
          operation,
          result,
        });
        break;
      }

      case "move_to_done": {
        const result = await moveJiraIssueToDone(params.issueKey);

        results.push({
          operation,
          result,
        });
        break;
      }

      case "comment_reopened": {
        await commentReopenedPullRequest(
          params.issueKey,
          params.commentContext,
        );

        results.push({
          operation,
          result: "completed",
        });

        break;
      }

      case "comment_unmerged": {
        await commentUnmergedPullRequest(
          params.issueKey,
          params.commentContext,
        );

        results.push({
          operation,
          result: "completed",
        });

        break;
      }
    }
  }
  return results;
};

export type JiraLifecycleExecutionResult =
  | {
      status: "skipped";
      reason: "jira_project_not_configured" | "jira_issue_key_not_found";
      issueKey: null;
      operations: [];
    }
  | {
      status: "completed";
      reason: null;
      issueKey: string;
      operations: JiraLifecycleOperationResult[];
    };

// GitHub PR 정보를 조회하고 연결된 Jira 티켓의 생명주기를 처리합니다.

export const handleJiraPullRequestLifecycle = async (
  request: JiraLifecycleRequest,
  actor: string | null,
): Promise<JiraLifecycleExecutionResult> => {
  // Jira를 사용하지 않는 저장소는 건너뜀
  if (!request.jiraProjectKey) {
    return {
      status: "skipped",
      reason: "jira_project_not_configured",
      issueKey: null,
      operations: [],
    };
  }

  const pullRequest = await fetchGitHubPullRequestMetadata(
    request.repositoryUrl,
    request.pullNumber,
  );

  const issueKey = extractJiraIssueKeyForProject(
    pullRequest.targetBranch,
    request.jiraProjectKey,
  );

  // 작업 브랜치에 설정한 프로젝트의 Jira 키가 없으면
  // 오류를 발생시키지 않고 Jira 처리를 생략합니다.
  if (!issueKey) {
    return {
      status: "skipped",
      reason: "jira_issue_key_not_found",
      issueKey: null,
      operations: [],
    };
  }

  const operations = await executeJiraLifecycle({
    issueKey,
    action: request.action,
    merged: request.merged,
    commentContext: {
      pullNumber: pullRequest.number,
      pullRequestTitle: pullRequest.title,
      pullRequestUrl: pullRequest.url,
      actor: actor ?? "알 수 없음",
    },
  });

  return {
    status: "completed",
    reason: null,
    issueKey,
    operations,
  };
};
