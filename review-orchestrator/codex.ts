// codex.ts

import OpenAI from "openai";
import type { ReviewResult } from "./types.js";

// OPENAI_API_KEY 환경변수를 자동으로 사용합니다.
const openai = new OpenAI();

export async function reviewByCodex(
  reviewContext: string,
): Promise<ReviewResult> {
  const response = await openai.responses.create({
    model: "gpt-5.4-mini",
    instructions: `당신은 Jira 요구사항과 Git 변경사항을 비교하는 코드 리뷰어입니다.
      입력에 Jira 정보가 있다면:
      1. Jira 티켓의 키, 제목, 목적, 주요 수용 기준을 jiraSummary에 요약합니다.
      2. Git 변경사항이 Jira 수용 기준을 충족하는지 확인합니다.
      3. 요구사항과 관계없는 변경이 있는지도 확인합니다.

      입력에 Jira 정보가 없다면:
      - jiraSummary는 null로 반환합니다.
      - Git 변경사항만 리뷰합니다.

      summary에는 전체 리뷰 결론을 작성합니다.
      positives에는 잘된 점을 작성합니다.
      issues에는 개선할 점을 작성합니다.
      `,
    input: reviewContext,
    store: false,

    text: {
      format: {
        type: "json_schema",
        name: "code_review",
        strict: true,
        schema: {
          type: "object",
          properties: {
            jiraSummary: {
              // 브랜치 리뷰는 문자열,
              // Jira가 없는 미커밋 리뷰는 null을 반환합니다.
              type: ["string", "null"],

              description:
                "Jira 티켓의 키, 제목, 목적, 주요 수용 기준을 요약합니다. Jira 정보가 없으면 null입니다.",
            },
            summary: {
              type: "string",
            },
            positives: {
              type: "array",
              items: {
                type: "string",
              },
            },
            issues: {
              type: "array",
              items: {
                type: "string",
              },
            },
          },
          required: ["jiraSummary", "summary", "positives", "issues"],
          additionalProperties: false,
        },
      },
    },
  });

  if (!response.output_text) {
    throw new Error("OpenAI가 코드 리뷰 결과를 반환하지 않았습니다.");
  }

  const parsed = JSON.parse(response.output_text) as {
    jiraSummary: null | string;
    summary: string;
    positives: string[];
    issues: string[];
  };

  return {
    reviewer: "OpenAI",
    jiraSummary: parsed.jiraSummary ? parsed.jiraSummary : null,
    summary: parsed.summary,
    positives: parsed.positives,
    issues: parsed.issues,
  };
}
