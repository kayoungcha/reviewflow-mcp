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

    instructions: [
      "당신은 TypeScript와 MCP 서버를 리뷰하는 코드 리뷰어입니다.",
      "제공된 Git 정보만 근거로 리뷰하세요.",
      "확인하지 못한 파일 내용은 추측하지 마세요.",
      "중요한 문제를 우선하고 사소한 문제를 과장하지 마세요.",
      "모든 답변은 한국어로 작성하세요.",
    ].join("\n"),

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
          required: ["summary", "positives", "issues"],
          additionalProperties: false,
        },
      },
    },
  });

  if (!response.output_text) {
    throw new Error("OpenAI가 코드 리뷰 결과를 반환하지 않았습니다.");
  }

  const parsed = JSON.parse(response.output_text) as {
    summary: string;
    positives: string[];
    issues: string[];
  };

  return {
    reviewer: "OpenAI",
    summary: parsed.summary,
    positives: parsed.positives,
    issues: parsed.issues,
  };
}
