import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";

vi.mock("@anthropic-ai/sdk", () => {
  const MockAnthropic = vi.fn(function (this: any) {
    this.messages = { create: vi.fn() };
  });
  return { default: MockAnthropic };
});

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

import { activate, deactivate } from "../extension";

const mockCommands = vi.mocked(vscode.commands);

describe("activate", () => {
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = {
      subscriptions: [],
      secrets: {
        get: vi.fn(),
        store: vi.fn(),
        delete: vi.fn(),
      },
    };
  });

  it("registers 4 commands", () => {
    activate(mockContext);
    expect(mockCommands.registerCommand).toHaveBeenCalledTimes(4);
  });

  it('registers "commitMessageGen.generate"', () => {
    activate(mockContext);
    const commandIds = mockCommands.registerCommand.mock.calls.map(
      (call) => call[0]
    );
    expect(commandIds).toContain("commitMessageGen.generate");
  });

  it('registers "commitMessageGen.setApiKey"', () => {
    activate(mockContext);
    const commandIds = mockCommands.registerCommand.mock.calls.map(
      (call) => call[0]
    );
    expect(commandIds).toContain("commitMessageGen.setApiKey");
  });

  it('registers "commitMessageGen.clearApiKey"', () => {
    activate(mockContext);
    const commandIds = mockCommands.registerCommand.mock.calls.map(
      (call) => call[0]
    );
    expect(commandIds).toContain("commitMessageGen.clearApiKey");
  });

  it('registers "commitMessageGen.setModel"', () => {
    activate(mockContext);
    const commandIds = mockCommands.registerCommand.mock.calls.map(
      (call) => call[0]
    );
    expect(commandIds).toContain("commitMessageGen.setModel");
  });

  it("pushes all registrations to subscriptions", () => {
    activate(mockContext);
    expect(mockContext.subscriptions).toHaveLength(4);
  });
});

describe("deactivate", () => {
  it("does not throw", () => {
    expect(() => deactivate()).not.toThrow();
  });
});
