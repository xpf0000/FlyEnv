const { defineConfig } = require("eslint/config");
const vue = require("eslint-plugin-vue");
const typescript = require("@typescript-eslint/eslint-plugin");
const parser = require("vue-eslint-parser");
const tsParser = require("@typescript-eslint/parser");

module.exports = defineConfig([
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.vue'],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2020,
        parser: tsParser,
        sourceType: 'module',
        project: "tsconfig.json",
        allowNonTsExtensions: true,
        extraFileExtensions: [".vue"]
      }
    },
    plugins: {
      '@typescript-eslint': typescript,
      vue
    },
    extends: [
      'plugin:vue/vue3-recommended',
      'plugin:@typescript-eslint/recommended',
      'plugin:prettier/recommended'
    ],
    rules: {
      "no-unused-vars": "off",
      "no-use-before-define": "off",
      "comma-dangle": ["error", "never"],
      "quotes": ["error", "single", { allowTemplateLiterals: true }],
      "space-before-function-paren": "off",
      "vue/custom-event-name-casing": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/ban-types": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^e|h$",
          varsIgnorePattern: "^e|h$"
        }
      ],
      "@typescript-eslint/no-use-before-define": "off",
      "@typescript-eslint/no-unnecessary-condition": "warn"
    }
  }
];
