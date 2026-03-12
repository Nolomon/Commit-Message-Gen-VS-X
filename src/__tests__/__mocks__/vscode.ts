import { vi } from "vitest";

export const window = {
  activeTextEditor: undefined as any,
  showQuickPick: vi.fn(),
  showInputBox: vi.fn(),
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  withProgress: vi.fn((_opts: any, task: any) => task({ report: vi.fn() })),
};

export const commands = {
  registerCommand: vi.fn((_id: string, _handler: Function) => ({ dispose: vi.fn() })),
  executeCommand: vi.fn(),
};

export const workspace = {
  getConfiguration: vi.fn(() => ({
    get: vi.fn(),
    update: vi.fn(),
  })),
};

export const extensions = {
  getExtension: vi.fn(),
};

export const Uri = {
  file: (fsPath: string) => ({ fsPath, scheme: "file" }),
};

export const ProgressLocation = { SourceControl: 1 };
export const ConfigurationTarget = { Global: 1 };
