import { describe, it, expect, vi } from "vitest";
import { generateCommitMessage } from "../core/generate-commit-message";
import { NoDiffError, UnknownModelError, NoApiKeyError } from "../core/errors";
import type {
  IGitService,
  ISecretStore,
  IConfigService,
  IProviderFactory,
} from "../core/ports";
import type { ApiKeyResolver } from "../core/generate-commit-message";
import type { CommitMessageProvider } from "../providers/types";

function createMockDeps(overrides?: {
  gitService?: Partial<IGitService>;
  configService?: Partial<IConfigService>;
  secretStore?: Partial<ISecretStore>;
  providerFactory?: Partial<IProviderFactory>;
  apiKeyResolver?: Partial<ApiKeyResolver>;
}) {
  const mockProvider: CommitMessageProvider = {
    name: "mock",
    generate: vi.fn().mockResolvedValue("feat(core): add new feature"),
    dispose: vi.fn(),
  };

  return {
    gitService: {
      getRepositoryPath: vi.fn().mockResolvedValue("/repo"),
      getStagedDiff: vi.fn().mockResolvedValue("diff --git a/file.ts\n+added"),
      ...overrides?.gitService,
    } satisfies IGitService,
    configService: {
      getModelId: vi.fn().mockReturnValue("claude-sonnet-4-6"),
      ...overrides?.configService,
    } satisfies IConfigService,
    secretStore: {
      get: vi.fn().mockResolvedValue("sk-test-key"),
      store: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      ...overrides?.secretStore,
    } satisfies ISecretStore,
    providerFactory: {
      create: vi.fn().mockReturnValue(mockProvider),
      ...overrides?.providerFactory,
    } satisfies IProviderFactory,
    apiKeyResolver: {
      resolve: vi.fn().mockResolvedValue("sk-resolved-key"),
      ...overrides?.apiKeyResolver,
    } satisfies ApiKeyResolver,
    mockProvider,
  };
}

describe("generateCommitMessage", () => {
  it("should generate a commit message using stored API key", async () => {
    const deps = createMockDeps();

    const result = await generateCommitMessage(deps);

    expect(result.message).toBe("feat(core): add new feature");
    expect(deps.gitService.getRepositoryPath).toHaveBeenCalled();
    expect(deps.gitService.getStagedDiff).toHaveBeenCalledWith("/repo");
    expect(deps.providerFactory.create).toHaveBeenCalledWith(
      "claude-sonnet-4-6",
      "sk-test-key"
    );
    expect(deps.mockProvider.dispose).toHaveBeenCalled();
  });

  it("should throw NoDiffError when no staged changes", async () => {
    const deps = createMockDeps({
      gitService: {
        getRepositoryPath: vi.fn().mockResolvedValue("/repo"),
        getStagedDiff: vi.fn().mockResolvedValue("   "),
      },
    });

    await expect(generateCommitMessage(deps)).rejects.toThrow(NoDiffError);
  });

  it("should throw UnknownModelError for invalid model", async () => {
    const deps = createMockDeps({
      configService: { getModelId: vi.fn().mockReturnValue("invalid-model") },
    });

    await expect(generateCommitMessage(deps)).rejects.toThrow(
      UnknownModelError
    );
  });

  it("should resolve API key when not in store", async () => {
    const deps = createMockDeps({
      secretStore: {
        get: vi.fn().mockResolvedValue(undefined),
        store: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      },
    });

    const result = await generateCommitMessage(deps);

    expect(deps.apiKeyResolver.resolve).toHaveBeenCalledWith(
      "anthropic",
      "Claude"
    );
    expect(deps.secretStore.store).toHaveBeenCalledWith(
      "commitMessageGen.apiKey.anthropic",
      "sk-resolved-key"
    );
    expect(result.message).toBe("feat(core): add new feature");
  });

  it("should throw NoApiKeyError when resolver returns nothing", async () => {
    const deps = createMockDeps({
      secretStore: {
        get: vi.fn().mockResolvedValue(undefined),
        store: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      apiKeyResolver: {
        resolve: vi.fn().mockResolvedValue(undefined),
      },
    });

    await expect(generateCommitMessage(deps)).rejects.toThrow(NoApiKeyError);
  });

  it("should dispose provider even if generate throws", async () => {
    const mockProvider: CommitMessageProvider = {
      name: "mock",
      generate: vi.fn().mockRejectedValue(new Error("API error")),
      dispose: vi.fn(),
    };
    const deps = createMockDeps({
      providerFactory: { create: vi.fn().mockReturnValue(mockProvider) },
    });

    await expect(generateCommitMessage(deps)).rejects.toThrow("API error");
    expect(mockProvider.dispose).toHaveBeenCalled();
  });
});
