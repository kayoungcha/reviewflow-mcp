import type { ReviewResult } from "./types.js";

export function judge(results: ReviewResult[]) {
  console.log("====최종 리뷰====\n");

  for (const r of results) {
    console.log(`### ${r.reviewer}`);
    console.log(r.summary);

    console.log("\n👍 장점");
    r.positives.forEach((p) => console.log(`- ${p}`));

    console.log("\n⚠️ 개선점");
    r.issues.forEach((i) => console.log(`- ${i}`));

    console.log("");
  }
}
