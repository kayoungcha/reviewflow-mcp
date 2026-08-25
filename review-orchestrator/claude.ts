import type { ReviewResult } from "./types.js";

export async function reviewByClaude(diff: string): Promise<ReviewResult> {
  return {
    reviewer: "Claude",
    positives: ["Git Tool을 잘 분리했습니다."],
    issues: ["runGit 함수가 예외를 한 곳에서 처리하면 더 좋겠습니다."],
    summary: "설계는 깔끔하지만 리팩토링 여지가 있습니다.",
  };
}
