import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

// GitHub Actions OIDC 토큰의 공식 발급자 주소
export const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";

// GitHub Actions가 ReviewFlow용으로 토큰을 요청할 때 사용하는 대상값입니다.
export const REVIEWFLOW_OIDC_AUDIENCE = "reviewflow-mcp";

// GitHub가 OIDC 토큰 서명에 사용하는 공개 키 목록입니다.
// jose가 토큰의 kid에 맞는 공개 키를 찾아 서명을 검증합니다.
const githubOidcJwks = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks"),
);

// 검증에 성공한 GitHub Actions의 신원 정보입니다.
export type GitHubOidcIdentity = {
  // OIDC 토큰이 발급된 GitHub 저장소입니다.
  repository: string;
  // GitHub Actions 실행을 발생시킨 사용자 또는 봇입니다.
  actor: string | null;
  // GitHub OIDC 토큰의 subject입니다. 저장소, 브랜치 또는 이벤트 실행 조건 등이 담길 수 있습니다.
  subject: string;
};

// OIDC payload에서 반드시 필요한 문자열 값을 꺼냅니다.
// 값이 없거나 문자열이 아니면 신뢰할 수 없는 토큰으로 처리합니다.
const readRequiredStringClaim = (
  payload: Record<string, unknown>,
  claimName: string,
): string => {
  const value = payload[claimName];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`GitHub OIDC 토큰에 ${claimName} 정보가 없습니다.`);
  }

  return value;
};

// 실제 서비스에서 사용하는 함수입니다.
// GitHub가 공개한 키 목록으로 OIDC 토큰을 검증합니다.
export const verifyGitHubOidcToken = async (
  token: string,
): Promise<GitHubOidcIdentity> => {
  return verifyGitHubOidcTokenWithKeySet(token, githubOidcJwks);
};

// 테스트에서는 GitHub 서버에 접속하지 않고
// 테스트용 공개 키를 전달해 동일한 검증 로직을 확인합니다.
export const verifyGitHubOidcTokenWithKeySet = async (
  token: string,
  keySet: JWTVerifyGetKey,
): Promise<GitHubOidcIdentity> => {
  if (token.trim().length === 0) {
    throw new Error("GitHub OIDC 토큰이 필요합니다.");
  }

  const { payload } = await jwtVerify(token, keySet, {
    issuer: GITHUB_OIDC_ISSUER,
    audience: REVIEWFLOW_OIDC_AUDIENCE,
    algorithms: ["RS256"],
  });

  const repository = readRequiredStringClaim(payload, "repository");
  const subject = readRequiredStringClaim(payload, "sub");
  const actor = typeof payload.actor === "string" ? payload.actor : null;

  return {
    repository,
    actor,
    subject,
  };
};

// 저장소 이름을 비교하기 쉬운 형태로 통일합니다.
const normalizeGitHubRepository = (repository: string): string => {
  return repository.trim().toLowerCase();
};

export const parseAllowedRepositories = (
  value: string | undefined,
): Set<string> => {
  if (!value) {
    return new Set();
  }
  const repositories = value
    .split(",")
    .map((repository) => normalizeGitHubRepository(repository))
    .filter(Boolean);

  return new Set(repositories);
};

// OIDC 토큰의 저장소와 API 요청 저장소가 같은지 확인하고,
// 해당 저장소가 ReviewFlow 사용 허용 목록에 있는지 확인합니다.
export const assertGitHubRepositoryAccess = (params: {
  oidcRepository: string;
  requestedRepository: string;
  allowedRepositories: Set<string>;
}): void => {
  const oidcRepository = normalizeGitHubRepository(params.oidcRepository);

  const requestedRepository = normalizeGitHubRepository(
    params.requestedRepository,
  );
  // 다른 저장소에서 받은 OIDC 토큰으로
  // 임의의 저장소를 리뷰하지 못하도록 막습니다.
  if (oidcRepository !== requestedRepository) {
    throw new Error(
      "OIDC 토큰의 저장소와 리뷰 요청 저장소가 일치하지 않습니다.",
    );
  }

  // 허용 목록이 비어 있어도 모든 저장소를 허용하지 않습니다.
  // 서버 설정 실수로 OpenAI API가 외부에 공개되는 상황을 방지합니다.
  if (!params.allowedRepositories.has(requestedRepository)) {
    throw new Error(
      `ReviewFlow 사용이 허용되지 않은 저장소입니다: ${params.requestedRepository}`,
    );
  }
};
