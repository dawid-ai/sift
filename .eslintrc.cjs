module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  env: { node: true, browser: true, es2022: true },
  ignorePatterns: ["dist", "out", "node_modules", "release"],
  rules: {
    // Honor the `_`-prefix convention for deliberately-unused args/vars/catch bindings
    // (e.g. an interface-required param a given impl ignores, like cookiesFileForUrl(_url)).
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
    ],
  },
  overrides: [
    {
      files: ["apps/desktop/src/renderer/**/*.{ts,tsx}"],
      env: { browser: true, node: false },
      plugins: ["react", "react-hooks"],
      extends: [
        "plugin:react/recommended",
        "plugin:react/jsx-runtime",
        "plugin:react-hooks/recommended",
      ],
      settings: { react: { version: "detect" } },
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: ["node:*"],
            paths: [
              { name: "electron", message: "Renderer must not import electron; use window.sift (typed IPC)." },
              { name: "fs", message: "Renderer must not import Node built-ins." },
              { name: "path", message: "Renderer must not import Node built-ins." },
              { name: "os", message: "Renderer must not import Node built-ins." },
              { name: "child_process", message: "Renderer must not import Node built-ins." },
            ],
          },
        ],
      },
    },
  ],
};
