export type JiraClientConfiguration = {
  baseUrl: string;
  email: string;
  apiToken: string;
};

// 로컬 .env 또는 Render Environment에 등록된
// Jira 인증정보를 읽고 검사합니다.
export const getJiraClientConfiguration = (): JiraClientConfiguration => {
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/+$/, "");
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !apiToken) {
    throw new Error(
      "JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN 환경변수가 필요합니다.",
    );
  }

  return {
    baseUrl,
    email,
    apiToken,
  };
};

// Jira API 요청에서 공통으로 사용하는 인증과 오류 처리를 담당합니다.

export const requestJira = async (
  path: string,
  requestInit: RequestInit = {},
): Promise<Response> => {
  const configuration = getJiraClientConfiguration();
  const authorization = Buffer.from(
    `${configuration.email}:${configuration.apiToken}`,
  ).toString("base64");

  const headers = new Headers(requestInit.headers);

  headers.set("Accept", "application/json");
  headers.set("Authorization", `Basic ${authorization}`);

  if (requestInit.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${configuration.baseUrl}${path}`, {
    ...requestInit,
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      [
        `Jira API 요청에 실패했습니다. HTTP 상태: ${response.status}`,
        responseText,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return response;
};
