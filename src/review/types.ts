// AI 코드 리뷰의 최종 판정입니다.
export type ReviewVerdict = "통과" | "수정 권장" | "수정 필요";

export interface ReviewResult {
  reviewer: string;
  jiraSummary: string | null;
  positives: string[];
  issues: string[];
  summary: string;
  verdict: ReviewVerdict;
}
