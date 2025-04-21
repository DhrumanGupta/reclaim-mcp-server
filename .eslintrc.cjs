/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["./tsconfig.json"], // enables type-aware rules
    tsconfigRootDir: __dirname,
    ecmaVersion: "latest",
    sourceType: "module",
  },
  env: { node: true, es2024: true },
  plugins: [
    "@typescript-eslint",
    "import",
    "promise",
    "security-node",
    "unused-imports",
    "jest", // Add Jest plugin
    // 'prettier' plugin is included via extends below
  ],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended", // Basic TS rules
    "plugin:@typescript-eslint/recommended-type-checked", // Type-aware rules
    "plugin:import/recommended",
    "plugin:import/typescript", // Ensure import plugin understands TS paths
    "plugin:promise/recommended", // Best practices for Promises
    "plugin:security-node/recommended", // Node.js security rules
    // Jest recommended rules are applied in overrides below
    "plugin:prettier/recommended", // IMPORTANT: Must be LAST. Disables formatting rules and integrates Prettier.
  ],
  settings: {
    // Help eslint-plugin-import resolve TS paths
    "import/resolver": {
      typescript: {
        alwaysTryTypes: true, // Look for @types/* packages
        project: "./tsconfig.json",
      },
      node: true,
    },
  },
  rules: {
    // —— TypeScript quality gates ——
    "@typescript-eslint/no-floating-promises": "error", // Don't forget to await Promises
    "@typescript-eslint/consistent-type-imports": "error", // Use `import type` for types
    "@typescript-eslint/no-misused-promises": [
      "error",
      { checksVoidReturn: false },
    ], // Catch common async mistakes, allows void returns in handlers
    "@typescript-eslint/no-unused-vars": "off", // Disabled; use unused-imports/no-unused-vars instead for autofixing

    // —— Import hygiene ——
    "import/order": [
      "error",
      {
        groups: [
          "builtin", // Node built-ins (fs, path)
          "external", // npm packages
          "internal", // Aliased modules (if you set up aliases)
          "parent", // ../
          "sibling", // ./
          "index", // ./index
          "object", // import { type X }
          "type", // import type {}
        ],
        "newlines-between": "always",
        alphabetize: { order: "asc", caseInsensitive: true },
      },
    ],
    "import/no-duplicates": "error", // Prevent duplicate imports
    "import/newline-after-import": "error", // Enforce newline after imports
    "import/no-useless-path-segments": "error", // Clean up ../../ paths

    // —— Promise hygiene ——
    "promise/catch-or-return": ["error", { allowFinally: true }], // Ensure all promises handle errors
    "promise/no-multiple-resolved": "error", // Avoid resolving a promise multiple times

    // —— Unused imports/vars (autofixable) ——
    "unused-imports/no-unused-imports": "error", // Remove unused imports
    "unused-imports/no-unused-vars": [
      // Remove unused variables/parameters
      "warn",
      {
        vars: "all",
        varsIgnorePattern: "^_",
        args: "after-used",
        argsIgnorePattern: "^_",
      },
    ],

    // —— Node/Security ——
    // Many security rules are enabled by 'plugin:security-node/recommended'
    // Add specific overrides if needed, e.g.:
    // 'security-node/detect-cwe-117': 'off', // Example: If log injection FP occurs

    // —— Misc ——
    "no-console": ["warn", { allow: ["warn", "error", "info"] }], // Allow specific console methods
    "no-debugger": "warn", // Discourage debugger statements in production code
    eqeqeq: ["error", "always", { null: "ignore" }], // Always use === or !==, except for null checks

    // —— Rules to consider adding later if needed ——
    // '@typescript-eslint/explicit-function-return-type': 'warn', // Be explicit about return types
    // '@typescript-eslint/no-explicit-any': 'warn', // Avoid 'any' type
  },
  ignorePatterns: ["dist/**/*", "node_modules/**/*", "*.cjs", ".env*"], // Ignore build output, deps, config files, env files
  overrides: [
    {
      // Configuration for test files
      files: ["*.test.ts", "*.spec.ts"],
      extends: ["plugin:jest/recommended"], // Apply Jest recommended rules
      env: { node: true, "jest/globals": true }, // Define Jest environment
      rules: {
        // Relax rules often needed in tests
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unsafe-call": "off",
        "@typescript-eslint/no-unsafe-member-access": "off", // Often needed for mocking
      },
    },
  ],
};
