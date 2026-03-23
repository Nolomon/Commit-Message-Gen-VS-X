import * as vscode from "vscode";
import { ISecretStore } from "../core/ports";

export class SecretStore implements ISecretStore {
  constructor(private readonly storage: vscode.SecretStorage) {}

  async get(key: string): Promise<string | undefined> {
    return this.storage.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    return this.storage.store(key, value);
  }

  async delete(key: string): Promise<void> {
    return this.storage.delete(key);
  }
}
