import type { ReviewResult } from "../review/types.js";

// OpenAI, Claude 등 여러 리뷰 결과를 배열로 받습니다.
export function judge(reviews: ReviewResult[]) {
  console.log("====최종 리뷰====");

  // 여러 리뷰 중 Jira 요약이 들어 있는 첫 번째 결과를 찾습니다.
  const jiraSummary = reviews.find((review) => {
    return review.jiraSummary !== null;
  })?.jiraSummary;

  // Jira 정보가 있는 브랜치 리뷰에서만 출력합니다.
  if (jiraSummary) {
    console.log("\n### Jira 티켓 요약");
    console.log(jiraSummary);
  }

  console.log("\n### 코드 리뷰");

  // 각각의 리뷰 결과를 출력합니다.
  for (const review of reviews) {
    console.log(`\n#### ${review.reviewer}`);
    console.log(review.summary);

    console.log("\n👍 장점");

    for (const positive of review.positives) {
      console.log(`- ${positive}`);
    }

    console.log("\n⚠️ 개선점");

    for (const issue of review.issues) {
      console.log(`- ${issue}`);
    }
  }

  // 판정에 따라 터미널과 PR에 표시할 아이콘을 선택합니다.

  const verdict = reviews.find((review) => {
    return review.verdict !== null;
  })?.verdict;
  const verdictIcon =
    verdict === "통과" ? "✅" : verdict === "수정 권장" ? "🟡" : "❌";

  console.log("\n### 최종 판정");
  console.log(`${verdictIcon} ${verdict}`);
}
