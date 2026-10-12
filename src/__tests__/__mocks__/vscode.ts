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
  executeCommand: vi.fn().mockResolvedValue(undefined),
};

const makeDisposable = () => ({ dispose: vi.fn() });

export const workspace = {
  getConfiguration: vi.fn(() => ({
    get: vi.fn(),
    update: vi.fn(),
  })),
  onDidChangeConfiguration: vi.fn((_listener: Function) => makeDisposable()),
  createFileSystemWatcher: vi.fn(() => ({
    onDidCreate: vi.fn((_listener: Function) => makeDisposable()),
    onDidChange: vi.fn((_listener: Function) => makeDisposable()),
    onDidDelete: vi.fn((_listener: Function) => makeDisposable()),
    dispose: vi.fn(),
  })),
};

export class RelativePattern {
  constructor(
    public base: { fsPath: string },
    public pattern: string
  ) {}
}

export const extensions = {
  getExtension: vi.fn(),
};

export const Uri = {
  file: (fsPath: string) => ({ fsPath, scheme: "file" }),
  parse: (value: string) => ({ toString: () => value, scheme: "https" }),
};

export const env = {
  openExternal: vi.fn().mockResolvedValue(true),
};

export const ProgressLocation = { SourceControl: 1 };
export const ConfigurationTarget = { Global: 1 };
