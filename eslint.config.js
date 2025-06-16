// ESLint 9+ flat config for Vue 3, TypeScript, Prettier, and Vue I18n
const vue = require('eslint-plugin-vue');
const vueI18n = require('@intlify/eslint-plugin-vue-i18n');
const typescript = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const parser = require('vue-eslint-parser');

module.exports = [
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.vue'],
    languageOptions: {
      parser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 2020,
        sourceType: 'module',
        project: 'tsconfig.json',
        extraFileExtensions: ['.vue']
      }
    },
    plugins: {
      '@typescript-eslint': typescript,
      'vue': vue,
      '@intlify/vue-i18n': vueI18n
    },
    rules: {
      // Vue 3 recommended rules
      ...vue.configs['vue3-recommended']?.rules,
      // Vue I18n recommended rules
      ...vueI18n.configs.recommended?.rules,
      'no-unused-vars': 'off',
      'no-use-before-define': 'off',
      'comma-dangle': ['error', 'never'],
      'quotes': ['error', 'single', { allowTemplateLiterals: true }],
      'space-before-function-paren': 'off',
      'vue/custom-event-name-casing': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/ban-types': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^e|h$',
          varsIgnorePattern: '^e|h$'
        }
      ],
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@intlify/vue-i18n/no-dynamic-keys': 'error',
      '@intlify/vue-i18n/no-unused-keys': [
        'error',
        {
          extensions: ['.js', '.vue']
        }
      ]
    }
  }
];
