import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**"],
    },
  },
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, "src/__tests__/__mocks__/vscode.ts"),
    },
  },
});
