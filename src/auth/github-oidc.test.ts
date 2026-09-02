import assert from "node:assert/strict";
import test from "node:test";

import {
  GITHUB_OIDC_ISSUER,
  REVIEWFLOW_OIDC_AUDIENCE,
  assertGitHubRepositoryAccess,
  parseAllowedRepositories,
  verifyGitHubOidcTokenWithKeySet,
} from "./github-oidc.js";

import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";

test("허용 저장소 환경변수를 저장소 목록으로 변환합니다.", () => {
  const repositories = parseAllowedRepositories(
    "kayoungcha/reviewflow-mcp, kayoungcha/reviewflow-demo",
  );

  assert.deepEqual(
    [...repositories],
    ["kayoungcha/reviewflow-mcp", "kayoungcha/reviewflow-demo"],
  );
});

test("허용 저장소 이름의 대소문자와 공백을 정규화합니다.", () => {
  const repositories = parseAllowedRepositories(
    "  KAYOUNGCHA/REVIEWFLOW-DEMO  ",
  );

  assert.deepEqual([...repositories], ["kayoungcha/reviewflow-demo"]);
});

test("중복된 허용 저장소는 한 번만 포함합니다.", () => {
  const repositories = parseAllowedRepositories(
    "kayoungcha/reviewflow-demo,KAYOUNGCHA/REVIEWFLOW-DEMO",
  );
  assert.equal(repositories.size, 1);
});

test("허용 저장소 설정이 없으면 빈 목록을 반환합니다.", () => {
  const repositories = parseAllowedRepositories(undefined);

  assert.equal(repositories.size, 0);
});

test("OIDC 저장소와 요청 저장소가 같고 허용 목록에 있으면 통과합니다.", () => {
  const allowedRepositories = parseAllowedRepositories(
    "kayoungcha/reviewflow-demo",
  );

  assert.doesNotThrow(() => {
    assertGitHubRepositoryAccess({
      oidcRepository: "kayoungcha/reviewflow-demo",
      requestedRepository: "KAYOUNGCHA/REVIEWFLOW-DEMO",
      allowedRepositories,
    });
  });
});

test("OIDC 저장소와 요청 저장소가 다르면 거부합니다.", () => {
  const allowedRepositories = parseAllowedRepositories(
    "kayoungcha/reviewflow-demo,kayoungcha/reviewflow-mcp",
  );

  assert.throws(() => {
    assertGitHubRepositoryAccess({
      oidcRepository: "kayoungcha/reviewflow-demo",
      requestedRepository: "kayoungcha/reviewflow-mcp",
      allowedRepositories,
    });
  }, /OIDC 토큰의 저장소와 리뷰 요청 저장소가 일치하지 않습니다/);
});

test("허용 목록에 없는 저장소는 거부합니다.", () => {
  const allowedRepositories = parseAllowedRepositories(
    "kayoungcha/reviewflow-mcp",
  );

  assert.throws(() => {
    assertGitHubRepositoryAccess({
      oidcRepository: "kayoungcha/reviewflow-demo",
      requestedRepository: "kayoungcha/reviewflow-demo",
      allowedRepositories,
    });
  }, /ReviewFlow 사용이 허용되지 않은 저장소입니다/);
});

test("허용 저장소 목록이 비어 있으면 요청을 거부합니다.", () => {
  const allowedRepositories = parseAllowedRepositories(undefined);

  assert.throws(() => {
    assertGitHubRepositoryAccess({
      oidcRepository: "kayoungcha/reviewflow-demo",
      requestedRepository: "kayoungcha/reviewflow-demo",
      allowedRepositories,
    });
  }, /ReviewFlow 사용이 허용되지 않은 저장소입니다/);
});

// 테스트 전용 RSA 키를 만들고,
// 공개 키는 검증용 JWKS로, 비공개 키는 JWT 서명용으로 사용합니다.
const createTestOidcKeys = async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");

  const publicJwk = await exportJWK(publicKey);

  // JWT header의 kid와 JWKS 공개 키의 kid가 같아야
  // jose가 검증에 사용할 키를 찾을 수 있습니다.
  publicJwk.kid = "reviewflow-test-key";
  publicJwk.alg = "RS256";

  const keySet = createLocalJWKSet({
    keys: [publicJwk],
  });

  return {
    privateKey,
    keySet,
  };
};

type TestPrivateKey = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

// 테스트마다 issuer, audience, 만료시간만 바꿀 수 있도록
// 기본 GitHub OIDC 형태의 JWT를 만들어줍니다.

async function createSignedTestOidcToken(params: {
  privateKey: TestPrivateKey;
  issuer?: string;
  audience?: string;
  expirationTime?: string | number;
  // null을 전달하면 해당 claim을 JWT에서 제외합니다.
  repository?: string | null;
  subject?: string | null;
}): Promise<string> {
  const payload =
    params.repository === null
      ? {
          actor: "kayoungcha",
        }
      : {
          repository: params.repository ?? "kayoungcha/reviewflow-demo",
          actor: "kayoungcha",
        };

  let tokenBuilder = new SignJWT(payload)
    .setProtectedHeader({
      alg: "RS256",
      kid: "reviewflow-test-key",
    })
    .setIssuer(params.issuer ?? GITHUB_OIDC_ISSUER)
    .setAudience(params.audience ?? REVIEWFLOW_OIDC_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(params.expirationTime ?? "5m");

  if (params.subject !== null) {
    tokenBuilder = tokenBuilder.setSubject(
      params.subject ?? "repo:kayoungcha/reviewflow-demo:pull_request",
    );
  }

  return tokenBuilder.sign(params.privateKey);
}

test("유효한 GitHub OIDC 토큰을 검증합니다.", async () => {
  const { privateKey, keySet } = await createTestOidcKeys();

  const token = await new SignJWT({
    repository: "kayoungcha/reviewflow-demo",
    actor: "kayoungcha",
  })
    .setProtectedHeader({
      alg: "RS256",
      kid: "reviewflow-test-key",
    })
    .setIssuer(GITHUB_OIDC_ISSUER)
    .setAudience(REVIEWFLOW_OIDC_AUDIENCE)
    .setSubject("repo:kayoungcha/reviewflow-demo:pull_request")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

  const identity = await verifyGitHubOidcTokenWithKeySet(token, keySet);

  assert.deepEqual(identity, {
    repository: "kayoungcha/reviewflow-demo",
    actor: "kayoungcha",
    subject: "repo:kayoungcha/reviewflow-demo:pull_request",
  });
});

test("다른 비공개 키로 서명한 OIDC 토큰을 거부합니다.", async () => {
  const { keySet } = await createTestOidcKeys();

  // 검증용 공개 키와 관련없는 별도의 비공개 키입니다.

  const { privateKey: unknownPrivateKey } = await generateKeyPair("RS256");

  const token = await new SignJWT({
    repository: "kayoungcha/reviewflow-demo",
  })
    .setProtectedHeader({
      alg: "RS256",
      kid: "reviewflow-test-key",
    })
    .setIssuer(GITHUB_OIDC_ISSUER)
    .setAudience(REVIEWFLOW_OIDC_AUDIENCE)
    .setSubject("repo:kayoungcha/reviewflow-demo:pull_request")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(unknownPrivateKey);

  await assert.rejects(async () => {
    await verifyGitHubOidcTokenWithKeySet(token, keySet);
  });
});

test("만료된 GitHub OIDC 토큰을 거부합니다.", async () => {
  const { privateKey, keySet } = await createTestOidcKeys();

  const token = await createSignedTestOidcToken({
    privateKey,
    expirationTime: Math.floor(Date.now() / 1000) - 60,
  });

  await assert.rejects(async () => {
    await verifyGitHubOidcTokenWithKeySet(token, keySet);
  });
});

test("GitHub가 아닌 발급자의 OIDC 토큰을 거부합니다.", async () => {
  const { privateKey, keySet } = await createTestOidcKeys();

  const token = await createSignedTestOidcToken({
    privateKey,
    issuer: "https://example.com",
  });

  await assert.rejects(async () => {
    await verifyGitHubOidcTokenWithKeySet(token, keySet);
  });
});

test("ReviewFlow용이 아닌 OIDC 토큰을 거부합니다.", async () => {
  const { privateKey, keySet } = await createTestOidcKeys();

  const token = await createSignedTestOidcToken({
    privateKey,
    audience: "another-service",
  });

  await assert.rejects(async () => {
    await verifyGitHubOidcTokenWithKeySet(token, keySet);
  });
});

test("repository 정보가 없는 OIDC 토큰을 거부합니다.", async () => {
  const { privateKey, keySet } = await createTestOidcKeys();

  const token = await createSignedTestOidcToken({
    privateKey,
    repository: null,
  });

  await assert.rejects(async () => {
    await verifyGitHubOidcTokenWithKeySet(token, keySet);
  }, /GitHub OIDC 토큰에 repository 정보가 없습니다/);
});

test("subject 정보가 없는 OIDC 토큰을 거부합니다.", async () => {
  const { privateKey, keySet } = await createTestOidcKeys();

  const token = await createSignedTestOidcToken({
    privateKey,
    subject: null,
  });

  await assert.rejects(async () => {
    await verifyGitHubOidcTokenWithKeySet(token, keySet);
  }, /GitHub OIDC 토큰에 sub 정보가 없습니다/);
});
