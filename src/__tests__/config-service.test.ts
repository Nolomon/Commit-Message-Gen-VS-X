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
      const mockGet = vi.fn().mockReturnValue("gpt-5.6-sol");
      mockWorkspace.getConfiguration.mockReturnValue(makeConfig({ get: mockGet }));

      expect(service.getModelId()).toBe("gpt-5.6-sol");
    });

    it("reads from the 'commitMessageGen' section", () => {
      const mockGet = vi.fn().mockReturnValue("gpt-5.6-sol");
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

  describe("shouldFocusMessageBox", () => {
    it("returns the configured value", () => {
      const mockGet = vi.fn().mockReturnValue(true);
      mockWorkspace.getConfiguration.mockReturnValue(makeConfig({ get: mockGet }));

      expect(service.shouldFocusMessageBox()).toBe(true);
      expect(mockGet).toHaveBeenCalledWith("focusMessageBox", false);
    });

    it("defaults to false so generation never steals focus", () => {
      const mockGet = vi.fn((_key: string, fallback: boolean) => fallback);
      mockWorkspace.getConfiguration.mockReturnValue(makeConfig({ get: mockGet }));

      expect(service.shouldFocusMessageBox()).toBe(false);
    });
  });

  describe("isDraftFileEnabled", () => {
    it("returns the configured value", () => {
      const mockGet = vi.fn().mockReturnValue(false);
      mockWorkspace.getConfiguration.mockReturnValue(makeConfig({ get: mockGet }));

      expect(service.isDraftFileEnabled()).toBe(false);
      expect(mockWorkspace.getConfiguration).toHaveBeenCalledWith("commitMessageGen");
      expect(mockGet).toHaveBeenCalledWith("draftFile.enabled", true);
    });

    it("defaults to on", () => {
      const mockGet = vi.fn((_key: string, fallback: boolean) => fallback);
      mockWorkspace.getConfiguration.mockReturnValue(makeConfig({ get: mockGet }));

      expect(service.isDraftFileEnabled()).toBe(true);
    });
  });

  describe("onDidChangeDraftFileEnabled", () => {
    function fireConfigurationChange(affected: string) {
      const handler = mockWorkspace.onDidChangeConfiguration.mock.calls[0][0];
      handler({
        affectsConfiguration: (section: string) => section === affected,
      } as vscode.ConfigurationChangeEvent);
    }

    it("calls the listener when the setting changes", () => {
      const listener = vi.fn();
      service.onDidChangeDraftFileEnabled(listener);

      fireConfigurationChange("commitMessageGen.draftFile.enabled");

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("ignores changes to other settings", () => {
      const listener = vi.fn();
      service.onDidChangeDraftFileEnabled(listener);

      fireConfigurationChange("commitMessageGen.model");

      expect(listener).not.toHaveBeenCalled();
    });

    it("returns the subscription so it can be disposed", () => {
      const subscription = { dispose: vi.fn() };
      mockWorkspace.onDidChangeConfiguration.mockReturnValueOnce(subscription);

      expect(service.onDidChangeDraftFileEnabled(vi.fn())).toBe(subscription);
    });
  });

  describe("setModelId", () => {
    it("calls update with the given model ID and ConfigurationTarget.Global", async () => {
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      mockWorkspace.getConfiguration.mockReturnValue(makeConfig({ update: mockUpdate }));

      await service.setModelId("gpt-5.6-sol");

      expect(mockUpdate).toHaveBeenCalledWith(
        "model",
        "gpt-5.6-sol",
        vscode.ConfigurationTarget.Global
      );
    });

    it("reads from the 'commitMessageGen' section when updating", async () => {
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      mockWorkspace.getConfiguration.mockReturnValue(makeConfig({ update: mockUpdate }));

      await service.setModelId("gpt-5.6-sol");

      expect(mockWorkspace.getConfiguration).toHaveBeenCalledWith("commitMessageGen");
    });
  });
});
