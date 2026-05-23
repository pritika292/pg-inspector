import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "node_modules", "*.config.js"],
  },
  {
    files: ["src/**/*.ts", "scripts/**/*.ts"],
    extends: [...tseslint.configs.recommended, ...tseslint.configs.strict],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
