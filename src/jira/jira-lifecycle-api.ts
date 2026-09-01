import { z } from "zod";

export const JiraLifecycleRequestSchema = z
  .object({
    repositoryUrl: z.url({
      message: "올바른 GitHub 저장소 주소를 입력해주세요.",
    }),

    pullNumber: z
      .number({
        message: "Pull Request 번호는 숫자여야 합니다.",
      })
      .int("Pull Request 번호는 정수여야 합니다.")
      .positive("Pull Request 번호는 1 이상이어야 합니다."),

    action: z.enum([
      "opened",
      "synchronize",
      "reopened",
      "ready_for_review",
      "closed",
    ]),

    merged: z.boolean(),
    jiraProjectKey: z
      .string({ message: "Jira 프로젝트 키는 문자열이어야 합니다." })
      .trim()
      .min(1, "Jira 프로젝트 키는 비어 있을 수 없습니다.")
      .regex(/^[A-Z][A-Z0-9_]*$/i, "Jira 프로젝트 키 형식이 올바르지 않습니다.")
      .transform((value) => {
        return value.toUpperCase();
      })
      .optional(),
  })
  .strict();

export type JiraLifecycleRequest = z.infer<typeof JiraLifecycleRequestSchema>;
