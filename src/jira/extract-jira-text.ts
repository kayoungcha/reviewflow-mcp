/*NOTE
 * JIRA 설명은 단순 문자열이 아니라
 * 여러 객체와 배열이 중첩된 ADF 형식으로 전달됩니다.
 * 이 함수는 ADF 안의 text 값들을 찾아
 * AI 가 읽을 수 있는 일반 문자열로 바꿉니다.
 */
export function extractJiraText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => extractJiraText(item))
      .filter(Boolean)
      .join("\n");
  }

  if (typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;

  if (typeof record.text === "string") {
    return record.text;
  }

  return extractJiraText(record.content);
}
