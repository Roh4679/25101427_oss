import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["dist/", "coverage/", "fixtures/", "node_modules/"] },
  tseslint.configs.recommended,
);
