import { z } from "zod";

export const GitHubReviewRequestSchema = z
  .object({
    repositoryUrl: z.url({
      message: "올바른 GitHub 저장소 주소를 입력해주세요.",
    }),

    pullNumber: z
      .number({ message: "Pull Request 번호는 숫자여야 합니다." })
      .int("Pull Request 번호는 정수여야 합니다.")
      .positive("Pull Request 번호는 1 이상이어야 합니다."),
  })
  .strict();

//  요청의 Authorization 헤더가
// ReviewFlow API 토큰과 일치하는지 확인합니다.
export function hasValidReviewApiToken(
  authorization: string | undefined,
  expectedToken: string,
): boolean {
  return authorization === `Bearer ${expectedToken}`;
}
