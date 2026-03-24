import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { ConfigService } from "../infrastructure/config-service";
import { DEFAULT_MODEL_ID } from "../providers/models";

function makeConfig(overrides: { get?: ReturnType<typeof vi.fn>; update?: ReturnType<typeof vi.fn> } = {}): vscode.WorkspaceConfiguration {
  return {
    get: overrides.get ?? vi.fn(),
    update: overrides.update ?? vi.fn(),
    has: vi.fn(),
    inspect: vi.fn(),
  } as vscode.WorkspaceConfiguration;
}

describe("ConfigService", () => {
  const mockWorkspace = vi.mocked(vscode.workspace);
  let service: ConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ConfigService();
  });

  describe("getModelId", () => {
    it("returns the value from workspace configuration", () => {
      const mockGet = vi.fn().mockReturnValue("gpt-4o");
      mockWorkspace.getConfiguration.mockReturnValue(makeConfig({ get: mockGet }));

      expect(service.getModelId()).toBe("gpt-4o");
    });

    it("reads from the 'commitMessageGen' section", () => {
      const mockGet = vi.fn().mockReturnValue("gpt-4o");
      mockWorkspace.getConfiguration.mockReturnValue(makeConfig({ get: mockGet }));

      service.getModelId();

      expect(mockWorkspace.getConfiguration).toHaveBeenCalledWith("commitMessageGen");
    });

    it("passes DEFAULT_MODEL_ID as the fallback to .get()", () => {
      const mockGet = vi.fn().mockReturnValue(DEFAULT_MODEL_ID);
      mockWorkspace.getConfiguration.mockReturnValue(makeConfig({ get: mockGet }));

      service.getModelId();

      expect(mockGet).toHaveBeenCalledWith("model", DEFAULT_MODEL_ID);
    });

    it("returns DEFAULT_MODEL_ID when no model is configured", () => {
      const mockGet = vi.fn().mockReturnValue(DEFAULT_MODEL_ID);
      mockWorkspace.getConfiguration.mockReturnValue(makeConfig({ get: mockGet }));

      expect(service.getModelId()).toBe(DEFAULT_MODEL_ID);
    });
  });

  describe("setModelId", () => {
    it("calls update with the given model ID and ConfigurationTarget.Global", async () => {
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      mockWorkspace.getConfiguration.mockReturnValue(makeConfig({ update: mockUpdate }));

      await service.setModelId("gpt-4o");

      expect(mockUpdate).toHaveBeenCalledWith(
        "model",
        "gpt-4o",
        vscode.ConfigurationTarget.Global
      );
    });

    it("reads from the 'commitMessageGen' section when updating", async () => {
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      mockWorkspace.getConfiguration.mockReturnValue(makeConfig({ update: mockUpdate }));

      await service.setModelId("gpt-4o");

      expect(mockWorkspace.getConfiguration).toHaveBeenCalledWith("commitMessageGen");
    });
  });
});
