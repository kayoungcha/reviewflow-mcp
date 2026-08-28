import type { ReviewVerdict } from "./types.js";

// 브랜치명 안에서 Jira 티켓 키를 찾습니다.
// 예시:
// MCPTEST-6-fix → MCPTEST-6
// feature/MCPTEST-7-login → MCPTEST-7
// simple-branch → null
export function extractJiraIssueKey(branchName: string): string | null {
  const match = branchName.match(/[A-Z][A-Z0-9_]*-\d+/i);

  return match ? match[0].toUpperCase() : null;
}

// AI 리뷰 결과가 GitHub Actions를 실패시켜야 하는지 판단합니다.
// "수정 필요"만 실패하고,
// "통과"와 "수정 권장"은 성공으로 처리합니다.
export function shouldFailReview(verdict: ReviewVerdict): boolean {
  return verdict === "수정 필요";
}

// MCP 도구 결과에서 text 콘텐츠만 추출해 하나의 문자열로 합친다.
export function extractMcpTextContent(
  content: readonly { type: string; text?: string }[],
): string {
  return content
    .map((item) => {
      return item.type === "text" ? (item.text ?? "") : "";
    })
    .filter(Boolean)
    .join("\n");
}
