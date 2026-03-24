import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { SecretStore } from "../infrastructure/secret-store";

describe("SecretStore", () => {
  function makeMockStorage() {
    return { get: vi.fn(), store: vi.fn(), delete: vi.fn() };
  }

  let mockStorage: ReturnType<typeof makeMockStorage>;
  let store: SecretStore;

  beforeEach(() => {
    mockStorage = makeMockStorage();
    store = new SecretStore(mockStorage as Partial<vscode.SecretStorage> as vscode.SecretStorage);
  });

  describe("get", () => {
    it("delegates to storage.get with the given key", async () => {
      mockStorage.get.mockResolvedValue("secret-value");

      const result = await store.get("my-key");

      expect(mockStorage.get).toHaveBeenCalledWith("my-key");
      expect(result).toBe("secret-value");
    });

    it("returns undefined when the key is not found", async () => {
      mockStorage.get.mockResolvedValue(undefined);

      const result = await store.get("missing-key");

      expect(result).toBeUndefined();
    });
  });

  describe("store", () => {
    it("delegates to storage.store with the given key and value", async () => {
      mockStorage.store.mockResolvedValue(undefined);

      await store.store("my-key", "my-value");

      expect(mockStorage.store).toHaveBeenCalledWith("my-key", "my-value");
    });
  });

  describe("delete", () => {
    it("delegates to storage.delete with the given key", async () => {
      mockStorage.delete.mockResolvedValue(undefined);

      await store.delete("my-key");

      expect(mockStorage.delete).toHaveBeenCalledWith("my-key");
    });
  });
});
