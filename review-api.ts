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
    jiraProjectKey: z
      .string({
        message: "Jira 프로젝트 키는 문자열이어야 합니다.",
      })
      .trim()
      .min(1, "Jira 프로젝트 키는 비어 있을 수 없습니다.")
      .regex(/^[A-Z][A-Z0-9_]*$/i, "Jira 프로젝트 키 형식이 올바르지 않습니다.")
      .transform((value) => {
        return value.toUpperCase();
      })
      .optional(),
  })
  .strict();

// Authorization 헤더에서 Bearer 토큰을 추출합니다.
export const extractBearerToken = (
  authorization: string | undefined,
): string | null => {
  if (!authorization) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  const token = match?.[1]?.trim();

  if (!token) {
    return null;
  }

  return token;
};
