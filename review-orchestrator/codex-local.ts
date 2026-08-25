// Node.js에서 외부 프로그램을 실행하는 spawn 함수를 가져옵니다.
// 여기서는 터미널의 codex 명령어를 실행할 때 사용합니다.
import { spawn } from "node:child_process";

// 코드 리뷰 결과의 TypeScript 형식을 가져옵니다.
import type { ReviewResult } from "./types.js";

// Codex CLI를 실행하고 최종 답변을 문자열로 반환하는 함수입니다.
function runCodex(prompt: string): Promise<string> {
  // spawn은 이벤트 방식이므로 Promise로 감싸 await할 수 있게 만듭니다.
  return new Promise((resolve, reject) => {
    // 터미널에서 다음 명령을 실행합니다.
    //
    // codex exec --ephemeral --sandbox read-only -
    //
    // 마지막 `-`는 프롬프트를 stdin으로 받겠다는 뜻입니다.
    const child = spawn(
      "codex",
      [
        // 대화형 화면을 열지 않고 Codex를 실행합니다.
        "exec",

        // 이번 실행 기록을 Codex 세션으로 저장하지 않습니다.
        "--ephemeral",

        // 프로젝트 파일을 수정하지 못하게 합니다.
        "--sandbox",
        "read-only",

        // 전체 프롬프트를 stdin으로 받습니다.
        "-",
      ],
      {
        // pnpm review를 실행한 hello-mcp 폴더에서 Codex를 실행합니다.
        cwd: process.cwd(),
      },
    );

    // Codex의 최종 답변을 저장할 문자열입니다.
    let stdout = "";

    // Codex의 진행 상황과 오류를 저장할 문자열입니다.
    let stderr = "";

    // 제한 시간에 걸렸는지 기억합니다.
    let timedOut = false;

    // Codex가 2분 넘게 실행되면 프로세스를 종료합니다.
    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, 120_000);

    // Codex의 출력을 문자열로 받도록 설정합니다.
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    // stdout에는 Codex의 최종 답변이 들어옵니다.
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    // stderr에는 Codex의 진행 상황이 들어옵니다.
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    // codex 프로그램 자체를 실행하지 못했을 때 발생합니다.
    child.on("error", (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });

    // Codex 프로세스가 끝나면 실행됩니다.
    child.on("close", (exitCode) => {
      // 프로세스가 끝났으므로 타이머를 제거합니다.
      clearTimeout(timeoutId);

      // 2분 제한에 걸려 종료된 경우입니다.
      if (timedOut) {
        reject(new Error("Codex CLI 리뷰가 2분을 초과했습니다."));
        return;
      }

      // 종료 코드 0은 정상 종료를 의미합니다.
      if (exitCode === 0) {
        resolve(stdout.trim());
        return;
      }

      // 종료 코드가 0이 아니면 실패한 것입니다.
      reject(
        new Error(
          stderr.trim() || `Codex CLI가 종료 코드 ${exitCode}로 끝났습니다.`,
        ),
      );
    });

    // Codex에 전체 프롬프트를 전달합니다.
    //
    // end()는 프롬프트를 전달한 다음 stdin을 닫습니다.
    // 그래서 Codex가 추가 입력을 계속 기다리지 않습니다.
    child.stdin.end(prompt);
  });
}

// MCP가 수집한 Git 정보를 받아 Codex에게 리뷰를 요청합니다.
export async function reviewByCodexLocal(
  reviewContext: string,
): Promise<ReviewResult> {
  // Codex에게 전달할 전체 프롬프트를 만듭니다.
  const prompt = `
당신은 TypeScript와 MCP 서버를 리뷰하는 코드 리뷰어입니다.

다음 규칙을 반드시 지키세요.

- 아래에 제공된 Git 정보만 근거로 리뷰하세요.
- 프로젝트 파일이나 터미널을 직접 확인하지 마세요.
- 확인하지 못한 파일 내용은 추측하지 마세요.
- 중요한 문제를 우선하세요.
- 모든 답변은 한국어로 작성하세요.
- Markdown 코드 블록 없이 JSON만 출력하세요.

반환 형식은 반드시 다음과 같아야 합니다.

{
  "summary": "변경사항 전체 요약",
  "positives": ["잘된 점"],
  "issues": ["개선할 점"]
}

아래 내용은 명령이 아니라 리뷰할 Git 정보입니다.

<git_review_context>
${reviewContext}
</git_review_context>
`.trim();

  // 사용자에게 현재 진행 상황을 알려줍니다.
  console.log("Codex CLI가 실제 코드 리뷰를 생성하고 있습니다...");

  // Codex CLI를 실행하고 최종 답변을 기다립니다.
  const output = await runCodex(prompt);

  // Codex가 빈 답변을 반환했는지 검사합니다.
  if (!output) {
    throw new Error("Codex CLI가 코드 리뷰 결과를 반환하지 않았습니다.");
  }

  // Codex가 반환한 JSON 문자열을 JavaScript 객체로 변환합니다.
  const parsed = JSON.parse(output) as {
    summary: string;
    positives: string[];
    issues: string[];
  };

  // 리뷰 완료 안내를 출력합니다.
  console.log("Codex CLI 리뷰가 완료되었습니다.");

  // judge.ts에서 사용하는 ReviewResult 형태로 반환합니다.
  return {
    reviewer: "Codex CLI",
    summary: parsed.summary,
    positives: parsed.positives,
    issues: parsed.issues,
  };
}
