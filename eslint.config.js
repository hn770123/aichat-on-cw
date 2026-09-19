/**
 * ブラウザー向け JavaScript の静的解析設定。
 * iOS 9 Safari で解釈できる ES5 構文だけを許可し、未定義変数などを検出する。
 */
import js from "@eslint/js";
import globals from "globals";

export default [
  {
    files: ["public/app.js"],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: "script",
      globals: globals.browser,
    },
    rules: {
      ...js.configs.recommended.rules,
      // ES5 では catch バインディングを省略できないため、未使用でも許可する。
      "no-unused-vars": ["error", { caughtErrors: "none" }],
    },
  },
  {
    files: ["eslint.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
];
