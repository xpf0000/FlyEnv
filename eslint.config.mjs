// eslint.config.js

import { defineConfig, globalIgnores } from 'eslint/config' // Used for type hinting and potential future utilities
// Core ESLint recommended rules
import js from '@eslint/js'

// TypeScript ESLint plugin and recommended flat configs
import tseslint from 'typescript-eslint'

// Prettier plugin and config
import prettierConfig from 'eslint-config-prettier' // This is the 'config' part to disable conflicting rules
import prettierPlugin from 'eslint-plugin-prettier'

import {
  defineConfigWithVueTs,
  vueTsConfigs,
  configureVueProject
} from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'
import vuePlugin from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
configureVueProject({ scriptLangs: ['js', 'jsx', 'ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

const vueConfig = defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}']
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,
  skipFormatting
)

vueConfig.forEach((v) => {
  if (v?.plugins) {
    v.plugins.prettier = prettierPlugin
  }
})

export default defineConfig([
  // 1. Global ignores (always apply)
  // Ensure paths are relative to the config file or absolute
  {
    ignores: [
      'src/assets/**', // Ignore all files in src/assets
      'src/icons/**', // Ignore all files in src/icons
      '**/public/**', // Ignore all files in any 'public' directory
      '**/dist/**', // Ignore all files in any 'dist' directory
      '**/node_modules/**' // Ignore all files in any 'node_modules' directory
    ]
  },

  // 2. ESLint's own recommended rules
  js.configs.recommended,

  // 3. TypeScript ESLint recommended configuration
  // Spreading the recommended configs from typescript-eslint
  ...tseslint.configs.recommended,

  // VUE
  { name: 'app/files-to-lint', files: ['**/*.{ts,mts,tsx,vue}'] },
  {
    name: 'globalIgnores 0',
    ignores: ['**/dist/**', '**/dist-ssr/**', '**/coverage/**']
  },
  {
    name: 'vue/base/setup',
    plugins: { vue: vuePlugin, prettier: prettierPlugin },
    languageOptions: { sourceType: 'module' }
  },
  {
    name: 'vue/base/setup-for-vue',
    files: ['*.vue', '**/*.vue'],
    plugins: { vue: vuePlugin, prettier: prettierPlugin },
    languageOptions: { parser: vueParser, sourceType: 'module' },
    rules: { 'vue/comment-directive': 'error', 'vue/jsx-uses-vars': 'error' },
    processor: 'vue/vue'
  },
  {
    name: 'vue/essential/rules',
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/no-arrow-functions-in-watch': 'error',
      'vue/no-async-in-computed-properties': 'error',
      'vue/no-child-content': 'error',
      'vue/no-computed-properties-in-data': 'error',
      'vue/no-deprecated-data-object-declaration': 'error',
      'vue/no-deprecated-delete-set': 'error',
      'vue/no-deprecated-destroyed-lifecycle': 'error',
      'vue/no-deprecated-dollar-listeners-api': 'error',
      'vue/no-deprecated-dollar-scopedslots-api': 'error',
      'vue/no-deprecated-events-api': 'error',
      'vue/no-deprecated-filter': 'error',
      'vue/no-deprecated-functional-template': 'error',
      'vue/no-deprecated-html-element-is': 'error',
      'vue/no-deprecated-inline-template': 'error',
      'vue/no-deprecated-model-definition': 'error',
      'vue/no-deprecated-props-default-this': 'error',
      'vue/no-deprecated-router-link-tag-prop': 'error',
      'vue/no-deprecated-scope-attribute': 'error',
      'vue/no-deprecated-slot-attribute': 'error',
      'vue/no-deprecated-slot-scope-attribute': 'error',
      'vue/no-deprecated-v-bind-sync': 'error',
      'vue/no-deprecated-v-is': 'error',
      'vue/no-deprecated-v-on-native-modifier': 'error',
      'vue/no-deprecated-v-on-number-modifiers': 'error',
      'vue/no-deprecated-vue-config-keycodes': 'error',
      'vue/no-dupe-keys': 'error',
      'vue/no-dupe-v-else-if': 'error',
      'vue/no-duplicate-attributes': 'error',
      'vue/no-export-in-script-setup': 'error',
      'vue/no-expose-after-await': 'error',
      'vue/no-lifecycle-after-await': 'error',
      'vue/no-mutating-props': 'error',
      'vue/no-parsing-error': 'error',
      'vue/no-ref-as-operand': 'error',
      'vue/no-reserved-component-names': 'error',
      'vue/no-reserved-keys': 'error',
      'vue/no-reserved-props': 'error',
      'vue/no-shared-component-data': 'error',
      'vue/no-side-effects-in-computed-properties': 'error',
      'vue/no-template-key': 'error',
      'vue/no-textarea-mustache': 'error',
      'vue/no-unused-components': 'error',
      'vue/no-unused-vars': 'error',
      'vue/no-use-computed-property-like-method': 'error',
      'vue/no-use-v-if-with-v-for': 'error',
      'vue/no-useless-template-attributes': 'error',
      'vue/no-v-for-template-key-on-child': 'error',
      'vue/no-v-text-v-html-on-component': 'error',
      'vue/no-watch-after-await': 'error',
      'vue/prefer-import-from-vue': 'error',
      'vue/require-component-is': 'error',
      'vue/require-prop-type-constructor': 'error',
      'vue/require-render-return': 'error',
      'vue/require-slots-as-functions': 'error',
      'vue/require-toggle-inside-transition': 'error',
      'vue/require-v-for-key': 'error',
      'vue/require-valid-default-prop': 'error',
      'vue/return-in-computed-property': 'error',
      'vue/return-in-emits-validator': 'error',
      'vue/use-v-on-exact': 'error',
      'vue/valid-attribute-name': 'error',
      'vue/valid-define-emits': 'error',
      'vue/valid-define-options': 'error',
      'vue/valid-define-props': 'error',
      'vue/valid-next-tick': 'error',
      'vue/valid-template-root': 'error',
      'vue/valid-v-bind': 'error',
      'vue/valid-v-cloak': 'error',
      'vue/valid-v-else-if': 'error',
      'vue/valid-v-else': 'error',
      'vue/valid-v-for': 'error',
      'vue/valid-v-html': 'error',
      'vue/valid-v-if': 'error',
      'vue/valid-v-is': 'error',
      'vue/valid-v-memo': 'error',
      'vue/valid-v-model': 'error',
      'vue/valid-v-on': 'error',
      'vue/valid-v-once': 'error',
      'vue/valid-v-pre': 'error',
      'vue/valid-v-show': 'error',
      'vue/valid-v-slot': 'error',
      'vue/valid-v-text': 'error'
    }
  },
  {
    name: 'vue/strongly-recommended/rules',
    rules: {
      'vue/attribute-hyphenation': 'warn',
      'vue/component-definition-name-casing': 'warn',
      'vue/first-attribute-linebreak': 'warn',
      'vue/html-closing-bracket-newline': 'warn',
      'vue/html-closing-bracket-spacing': 'warn',
      'vue/html-end-tags': 'warn',
      'vue/html-indent': 'warn',
      'vue/html-quotes': 'warn',
      'vue/html-self-closing': 'warn',
      'vue/max-attributes-per-line': 'warn',
      'vue/multiline-html-element-content-newline': 'warn',
      'vue/mustache-interpolation-spacing': 'warn',
      'vue/no-multi-spaces': 'warn',
      'vue/no-spaces-around-equal-signs-in-attribute': 'warn',
      'vue/no-template-shadow': 'warn',
      'vue/one-component-per-file': 'warn',
      'vue/prop-name-casing': 'warn',
      'vue/require-default-prop': 'warn',
      'vue/require-explicit-emits': 'warn',
      'vue/require-prop-types': 'warn',
      'vue/singleline-html-element-content-newline': 'warn',
      'vue/v-bind-style': 'warn',
      'vue/v-on-event-hyphenation': [
        'warn',
        'always',
        {
          autofix: true
        }
      ],
      'vue/v-on-style': 'warn',
      'vue/v-slot-style': 'warn'
    }
  },
  {
    name: 'vue/recommended/rules',
    rules: {
      'vue/attributes-order': 'warn',
      'vue/block-order': 'warn',
      'vue/no-lone-template': 'warn',
      'vue/no-multiple-slot-args': 'warn',
      'vue/no-required-prop-with-default': 'warn',
      'vue/no-v-html': 'warn',
      'vue/order-in-components': 'warn',
      'vue/this-in-template': 'warn'
    }
  },
  {
    name: 'typescript-eslint/base',
    languageOptions: { parser: tseslint.parser, sourceType: 'module' },
    plugins: { '@typescript-eslint': tseslint.plugin, prettier: prettierPlugin }
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts', '**/*.vue'],
    rules: {
      'constructor-super': 'off',
      'getter-return': 'off',
      'no-class-assign': 'off',
      'no-const-assign': 'off',
      'no-dupe-args': 'off',
      'no-dupe-class-members': 'off',
      'no-dupe-keys': 'off',
      'no-func-assign': 'off',
      'no-import-assign': 'off',
      'no-new-native-nonconstructor': 'off',
      'no-new-symbol': 'off',
      'no-obj-calls': 'off',
      'no-redeclare': 'off',
      'no-setter-return': 'off',
      'no-this-before-super': 'off',
      'no-undef': 'off',
      'no-unreachable': 'off',
      'no-unsafe-negation': 'off',
      'no-var': 'error',
      'no-with': 'off',
      'prefer-const': 'error',
      'prefer-rest-params': 'error',
      'prefer-spread': 'error'
    },
    name: 'typescript-eslint/eslint-recommended'
  },
  {
    name: 'typescript-eslint/recommended',
    rules: {
      '@typescript-eslint/ban-ts-comment': 'error',
      'no-array-constructor': 'off',
      '@typescript-eslint/no-array-constructor': 'error',
      '@typescript-eslint/no-duplicate-enum-values': 'error',
      '@typescript-eslint/no-empty-object-type': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-extra-non-null-assertion': 'error',
      '@typescript-eslint/no-misused-new': 'error',
      '@typescript-eslint/no-namespace': 'error',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/no-this-alias': 'error',
      '@typescript-eslint/no-unnecessary-type-constraint': 'error',
      '@typescript-eslint/no-unsafe-declaration-merging': 'error',
      '@typescript-eslint/no-unsafe-function-type': 'error',
      'no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-expressions': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-wrapper-object-types': 'error',
      '@typescript-eslint/prefer-as-const': 'error',
      '@typescript-eslint/prefer-namespace-keyword': 'error',
      '@typescript-eslint/triple-slash-reference': 'error'
    }
  },
  {
    name: 'vue/base/setup',
    plugins: { vue: vuePlugin, prettier: prettierPlugin },
    languageOptions: { sourceType: 'module' }
  },
  {
    name: 'vue/base/setup-for-vue',
    files: ['*.vue', '**/*.vue'],
    plugins: { vue: vuePlugin, prettier: prettierPlugin },
    languageOptions: { parser: vueParser, sourceType: 'module' },
    rules: { 'vue/comment-directive': 'error', 'vue/jsx-uses-vars': 'error' },
    processor: 'vue/vue'
  },
  {
    name: '@vue/typescript/setup',
    files: ['*.vue', '**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: {
          js: 'espree',
          jsx: 'espree',
          ts: tseslint.parser,
          tsx: tseslint.parser
        },
        ecmaFeatures: {
          jsx: true
        },
        extraFileExtensions: ['.vue']
      }
    },
    rules: {
      'vue/block-lang': [
        'error',
        {
          script: {
            lang: ['ts', 'tsx'],
            allowNoLang: false
          }
        }
      ]
    }
  },
  {
    rules: {
      curly: 0,
      'no-unexpected-multiline': 0,
      '@stylistic/lines-around-comment': 0,
      '@stylistic/max-len': 0,
      '@stylistic/no-confusing-arrow': 0,
      '@stylistic/no-mixed-operators': 0,
      '@stylistic/no-tabs': 0,
      '@stylistic/quotes': 0,
      '@stylistic/js/lines-around-comment': 0,
      '@stylistic/js/max-len': 0,
      '@stylistic/js/no-confusing-arrow': 0,
      '@stylistic/js/no-mixed-operators': 0,
      '@stylistic/js/no-tabs': 0,
      '@stylistic/js/quotes': 0,
      '@stylistic/ts/lines-around-comment': 0,
      '@stylistic/ts/quotes': 0,
      '@typescript-eslint/lines-around-comment': 0,
      '@typescript-eslint/quotes': 0,
      'babel/quotes': 0,
      'unicorn/template-indent': 0,
      'vue/html-self-closing': 0,
      'vue/max-len': 0,
      '@babel/object-curly-spacing': 'off',
      '@babel/semi': 'off',
      '@stylistic/array-bracket-newline': 'off',
      '@stylistic/array-bracket-spacing': 'off',
      '@stylistic/array-element-newline': 'off',
      '@stylistic/arrow-parens': 'off',
      '@stylistic/arrow-spacing': 'off',
      '@stylistic/block-spacing': 'off',
      '@stylistic/brace-style': 'off',
      '@stylistic/comma-dangle': 'off',
      '@stylistic/comma-spacing': 'off',
      '@stylistic/comma-style': 'off',
      '@stylistic/computed-property-spacing': 'off',
      '@stylistic/dot-location': 'off',
      '@stylistic/eol-last': 'off',
      '@stylistic/func-call-spacing': 'off',
      '@stylistic/function-call-argument-newline': 'off',
      '@stylistic/function-call-spacing': 'off',
      '@stylistic/function-paren-newline': 'off',
      '@stylistic/generator-star-spacing': 'off',
      '@stylistic/implicit-arrow-linebreak': 'off',
      '@stylistic/indent': 'off',
      '@stylistic/jsx-quotes': 'off',
      '@stylistic/key-spacing': 'off',
      '@stylistic/keyword-spacing': 'off',
      '@stylistic/linebreak-style': 'off',
      '@stylistic/max-statements-per-line': 'off',
      '@stylistic/multiline-ternary': 'off',
      '@stylistic/new-parens': 'off',
      '@stylistic/newline-per-chained-call': 'off',
      '@stylistic/no-extra-parens': 'off',
      '@stylistic/no-extra-semi': 'off',
      '@stylistic/no-floating-decimal': 'off',
      '@stylistic/no-mixed-spaces-and-tabs': 'off',
      '@stylistic/no-multi-spaces': 'off',
      '@stylistic/no-multiple-empty-lines': 'off',
      '@stylistic/no-trailing-spaces': 'off',
      '@stylistic/no-whitespace-before-property': 'off',
      '@stylistic/nonblock-statement-body-position': 'off',
      '@stylistic/object-curly-newline': 'off',
      '@stylistic/object-curly-spacing': 'off',
      '@stylistic/object-property-newline': 'off',
      '@stylistic/one-var-declaration-per-line': 'off',
      '@stylistic/operator-linebreak': 'off',
      '@stylistic/padded-blocks': 'off',
      '@stylistic/quote-props': 'off',
      '@stylistic/rest-spread-spacing': 'off',
      '@stylistic/semi': 'off',
      '@stylistic/semi-spacing': 'off',
      '@stylistic/semi-style': 'off',
      '@stylistic/space-before-blocks': 'off',
      '@stylistic/space-before-function-paren': 'off',
      '@stylistic/space-in-parens': 'off',
      '@stylistic/space-infix-ops': 'off',
      '@stylistic/space-unary-ops': 'off',
      '@stylistic/switch-colon-spacing': 'off',
      '@stylistic/template-curly-spacing': 'off',
      '@stylistic/template-tag-spacing': 'off',
      '@stylistic/wrap-iife': 'off',
      '@stylistic/wrap-regex': 'off',
      '@stylistic/yield-star-spacing': 'off',
      '@stylistic/member-delimiter-style': 'off',
      '@stylistic/type-annotation-spacing': 'off',
      '@stylistic/jsx-child-element-spacing': 'off',
      '@stylistic/jsx-closing-bracket-location': 'off',
      '@stylistic/jsx-closing-tag-location': 'off',
      '@stylistic/jsx-curly-newline': 'off',
      '@stylistic/jsx-curly-spacing': 'off',
      '@stylistic/jsx-equals-spacing': 'off',
      '@stylistic/jsx-first-prop-new-line': 'off',
      '@stylistic/jsx-indent': 'off',
      '@stylistic/jsx-indent-props': 'off',
      '@stylistic/jsx-max-props-per-line': 'off',
      '@stylistic/jsx-newline': 'off',
      '@stylistic/jsx-one-expression-per-line': 'off',
      '@stylistic/jsx-props-no-multi-spaces': 'off',
      '@stylistic/jsx-tag-spacing': 'off',
      '@stylistic/jsx-wrap-multilines': 'off',
      '@stylistic/indent-binary-ops': 'off',
      '@stylistic/type-generic-spacing': 'off',
      '@stylistic/type-named-tuple-spacing': 'off',
      '@stylistic/js/array-bracket-newline': 'off',
      '@stylistic/js/array-bracket-spacing': 'off',
      '@stylistic/js/array-element-newline': 'off',
      '@stylistic/js/arrow-parens': 'off',
      '@stylistic/js/arrow-spacing': 'off',
      '@stylistic/js/block-spacing': 'off',
      '@stylistic/js/brace-style': 'off',
      '@stylistic/js/comma-dangle': 'off',
      '@stylistic/js/comma-spacing': 'off',
      '@stylistic/js/comma-style': 'off',
      '@stylistic/js/computed-property-spacing': 'off',
      '@stylistic/js/dot-location': 'off',
      '@stylistic/js/eol-last': 'off',
      '@stylistic/js/func-call-spacing': 'off',
      '@stylistic/js/function-call-argument-newline': 'off',
      '@stylistic/js/function-call-spacing': 'off',
      '@stylistic/js/function-paren-newline': 'off',
      '@stylistic/js/generator-star-spacing': 'off',
      '@stylistic/js/implicit-arrow-linebreak': 'off',
      '@stylistic/js/indent': 'off',
      '@stylistic/js/jsx-quotes': 'off',
      '@stylistic/js/key-spacing': 'off',
      '@stylistic/js/keyword-spacing': 'off',
      '@stylistic/js/linebreak-style': 'off',
      '@stylistic/js/max-statements-per-line': 'off',
      '@stylistic/js/multiline-ternary': 'off',
      '@stylistic/js/new-parens': 'off',
      '@stylistic/js/newline-per-chained-call': 'off',
      '@stylistic/js/no-extra-parens': 'off',
      '@stylistic/js/no-extra-semi': 'off',
      '@stylistic/js/no-floating-decimal': 'off',
      '@stylistic/js/no-mixed-spaces-and-tabs': 'off',
      '@stylistic/js/no-multi-spaces': 'off',
      '@stylistic/js/no-multiple-empty-lines': 'off',
      '@stylistic/js/no-trailing-spaces': 'off',
      '@stylistic/js/no-whitespace-before-property': 'off',
      '@stylistic/js/nonblock-statement-body-position': 'off',
      '@stylistic/js/object-curly-newline': 'off',
      '@stylistic/js/object-curly-spacing': 'off',
      '@stylistic/js/object-property-newline': 'off',
      '@stylistic/js/one-var-declaration-per-line': 'off',
      '@stylistic/js/operator-linebreak': 'off',
      '@stylistic/js/padded-blocks': 'off',
      '@stylistic/js/quote-props': 'off',
      '@stylistic/js/rest-spread-spacing': 'off',
      '@stylistic/js/semi': 'off',
      '@stylistic/js/semi-spacing': 'off',
      '@stylistic/js/semi-style': 'off',
      '@stylistic/js/space-before-blocks': 'off',
      '@stylistic/js/space-before-function-paren': 'off',
      '@stylistic/js/space-in-parens': 'off',
      '@stylistic/js/space-infix-ops': 'off',
      '@stylistic/js/space-unary-ops': 'off',
      '@stylistic/js/switch-colon-spacing': 'off',
      '@stylistic/js/template-curly-spacing': 'off',
      '@stylistic/js/template-tag-spacing': 'off',
      '@stylistic/js/wrap-iife': 'off',
      '@stylistic/js/wrap-regex': 'off',
      '@stylistic/js/yield-star-spacing': 'off',
      '@stylistic/ts/block-spacing': 'off',
      '@stylistic/ts/brace-style': 'off',
      '@stylistic/ts/comma-dangle': 'off',
      '@stylistic/ts/comma-spacing': 'off',
      '@stylistic/ts/func-call-spacing': 'off',
      '@stylistic/ts/function-call-spacing': 'off',
      '@stylistic/ts/indent': 'off',
      '@stylistic/ts/key-spacing': 'off',
      '@stylistic/ts/keyword-spacing': 'off',
      '@stylistic/ts/member-delimiter-style': 'off',
      '@stylistic/ts/no-extra-parens': 'off',
      '@stylistic/ts/no-extra-semi': 'off',
      '@stylistic/ts/object-curly-spacing': 'off',
      '@stylistic/ts/semi': 'off',
      '@stylistic/ts/space-before-blocks': 'off',
      '@stylistic/ts/space-before-function-paren': 'off',
      '@stylistic/ts/space-infix-ops': 'off',
      '@stylistic/ts/type-annotation-spacing': 'off',
      '@stylistic/jsx/jsx-child-element-spacing': 'off',
      '@stylistic/jsx/jsx-closing-bracket-location': 'off',
      '@stylistic/jsx/jsx-closing-tag-location': 'off',
      '@stylistic/jsx/jsx-curly-newline': 'off',
      '@stylistic/jsx/jsx-curly-spacing': 'off',
      '@stylistic/jsx/jsx-equals-spacing': 'off',
      '@stylistic/jsx/jsx-first-prop-new-line': 'off',
      '@stylistic/jsx/jsx-indent': 'off',
      '@stylistic/jsx/jsx-indent-props': 'off',
      '@stylistic/jsx/jsx-max-props-per-line': 'off',
      '@typescript-eslint/block-spacing': 'off',
      '@typescript-eslint/brace-style': 'off',
      '@typescript-eslint/comma-dangle': 'off',
      '@typescript-eslint/comma-spacing': 'off',
      '@typescript-eslint/func-call-spacing': 'off',
      '@typescript-eslint/indent': 'off',
      '@typescript-eslint/key-spacing': 'off',
      '@typescript-eslint/keyword-spacing': 'off',
      '@typescript-eslint/member-delimiter-style': 'off',
      '@typescript-eslint/no-extra-parens': 'off',
      '@typescript-eslint/no-extra-semi': 'off',
      '@typescript-eslint/object-curly-spacing': 'off',
      '@typescript-eslint/semi': 'off',
      '@typescript-eslint/space-before-blocks': 'off',
      '@typescript-eslint/space-before-function-paren': 'off',
      '@typescript-eslint/space-infix-ops': 'off',
      '@typescript-eslint/type-annotation-spacing': 'off',
      'babel/object-curly-spacing': 'off',
      'babel/semi': 'off',
      'flowtype/boolean-style': 'off',
      'flowtype/delimiter-dangle': 'off',
      'flowtype/generic-spacing': 'off',
      'flowtype/object-type-curly-spacing': 'off',
      'flowtype/object-type-delimiter': 'off',
      'flowtype/quotes': 'off',
      'flowtype/semi': 'off',
      'flowtype/space-after-type-colon': 'off',
      'flowtype/space-before-generic-bracket': 'off',
      'flowtype/space-before-type-colon': 'off',
      'flowtype/union-intersection-spacing': 'off',
      'react/jsx-child-element-spacing': 'off',
      'react/jsx-closing-bracket-location': 'off',
      'react/jsx-closing-tag-location': 'off',
      'react/jsx-curly-newline': 'off',
      'react/jsx-curly-spacing': 'off',
      'react/jsx-equals-spacing': 'off',
      'react/jsx-first-prop-new-line': 'off',
      'react/jsx-indent': 'off',
      'react/jsx-indent-props': 'off',
      'react/jsx-max-props-per-line': 'off',
      'react/jsx-newline': 'off',
      'react/jsx-one-expression-per-line': 'off',
      'react/jsx-props-no-multi-spaces': 'off',
      'react/jsx-tag-spacing': 'off',
      'react/jsx-wrap-multilines': 'off',
      'standard/array-bracket-even-spacing': 'off',
      'standard/computed-property-even-spacing': 'off',
      'standard/object-curly-even-spacing': 'off',
      'unicorn/empty-brace-spaces': 'off',
      'unicorn/no-nested-ternary': 'off',
      'unicorn/number-literal-case': 'off',
      'vue/array-bracket-newline': 'off',
      'vue/array-bracket-spacing': 'off',
      'vue/array-element-newline': 'off',
      'vue/arrow-spacing': 'off',
      'vue/block-spacing': 'off',
      'vue/block-tag-newline': 'off',
      'vue/brace-style': 'off',
      'vue/comma-dangle': 'off',
      'vue/comma-spacing': 'off',
      'vue/comma-style': 'off',
      'vue/dot-location': 'off',
      'vue/func-call-spacing': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/html-closing-bracket-spacing': 'off',
      'vue/html-end-tags': 'off',
      'vue/html-indent': 'off',
      'vue/html-quotes': 'off',
      'vue/key-spacing': 'off',
      'vue/keyword-spacing': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/multiline-ternary': 'off',
      'vue/mustache-interpolation-spacing': 'off',
      'vue/no-extra-parens': 'off',
      'vue/no-multi-spaces': 'off',
      'vue/no-spaces-around-equal-signs-in-attribute': 'off',
      'vue/object-curly-newline': 'off',
      'vue/object-curly-spacing': 'off',
      'vue/object-property-newline': 'off',
      'vue/operator-linebreak': 'off',
      'vue/quote-props': 'off',
      'vue/script-indent': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/space-in-parens': 'off',
      'vue/space-infix-ops': 'off',
      'vue/space-unary-ops': 'off',
      'vue/template-curly-spacing': 'off',
      'space-unary-word-ops': 'off',
      'generator-star': 'off',
      'no-comma-dangle': 'off',
      'no-reserved-keys': 'off',
      'no-space-before-semi': 'off',
      'no-wrap-func': 'off',
      'space-after-function-name': 'off',
      'space-before-function-parentheses': 'off',
      'space-in-brackets': 'off',
      'no-arrow-condition': 'off',
      'space-after-keywords': 'off',
      'space-before-keywords': 'off',
      'space-return-throw-case': 'off',
      'no-spaced-func': 'off',
      'indent-legacy': 'off',
      'array-bracket-newline': 'off',
      'array-bracket-spacing': 'off',
      'array-element-newline': 'off',
      'arrow-parens': 'off',
      'arrow-spacing': 'off',
      'block-spacing': 'off',
      'brace-style': 'off',
      'comma-dangle': 'off',
      'comma-spacing': 'off',
      'comma-style': 'off',
      'computed-property-spacing': 'off',
      'dot-location': 'off',
      'eol-last': 'off',
      'func-call-spacing': 'off',
      'function-call-argument-newline': 'off',
      'function-paren-newline': 'off',
      'generator-star-spacing': 'off',
      'implicit-arrow-linebreak': 'off',
      indent: 'off',
      'jsx-quotes': 'off',
      'key-spacing': 'off',
      'keyword-spacing': 'off',
      'linebreak-style': 'off',
      'lines-around-comment': 0,
      'max-len': 0,
      'max-statements-per-line': 'off',
      'multiline-ternary': 'off',
      'new-parens': 'off',
      'newline-per-chained-call': 'off',
      'no-confusing-arrow': 0,
      'no-extra-parens': 'off',
      'no-extra-semi': 'off',
      'no-floating-decimal': 'off',
      'no-mixed-operators': 0,
      'no-mixed-spaces-and-tabs': 'off',
      'no-multi-spaces': 'off',
      'no-multiple-empty-lines': 'off',
      'no-tabs': 0,
      'no-trailing-spaces': 'off',
      'no-whitespace-before-property': 'off',
      'nonblock-statement-body-position': 'off',
      'object-curly-newline': 'off',
      'object-curly-spacing': 'off',
      'object-property-newline': 'off',
      'one-var-declaration-per-line': 'off',
      'operator-linebreak': 'off',
      'padded-blocks': 'off',
      'quote-props': 'off',
      quotes: 0,
      'rest-spread-spacing': 'off',
      semi: 'off',
      'semi-spacing': 'off',
      'semi-style': 'off',
      'space-before-blocks': 'off',
      'space-before-function-paren': 'off',
      'space-in-parens': 'off',
      'space-infix-ops': 'off',
      'space-unary-ops': 'off',
      'switch-colon-spacing': 'off',
      'template-curly-spacing': 'off',
      'template-tag-spacing': 'off',
      'wrap-iife': 'off',
      'wrap-regex': 'off',
      'yield-star-spacing': 'off',
      'react/jsx-space-before-closing': 'off',
      'prettier/prettier': 'off'
    }
  },
  {
    rules: {
      // Spread Vue 3 recommended rules first
      ...vuePlugin.configs['flat/recommended'].rules,

      // == Custom Rule Overrides ==

      // TypeScript specific rules
      '@typescript-eslint/ban-ts-ignore': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/ban-types': 'off',
      '@typescript-eslint/no-import-type-side-effects': 'off', // 允许 import.meta.url
      // TypeScript unused vars (disable base ESLint one, use TS version)
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^[hH]$', // Changed to handle both h and H
          varsIgnorePattern: '^[hH]$'
        }
      ],
      'no-unused-vars': 'off', // Disable the base ESLint rule
      'no-async-promise-executor': 'off',
      // Vue specific rules
      'vue/custom-event-name-casing': 'off',
      'vue/jsx-uses-vars': 'error',
      // 'vue/multi-word-component-names': 'off', // Common to disable if you have single-word components
      'no-control-regex': 'off',
      'no-empty': 'off',
      // Base JavaScript rules
      'no-use-before-define': 'off', // Disable base rule
      '@typescript-eslint/no-use-before-define': 'off', // Disable TS version if you don't want it

      // Prettier formatting rules (handled by prettier-config and prettier-plugin)
      // These should NOT be set here, let Prettier manage them via .prettierrc
      // 'space-before-function-paren': 'off', // Handled by prettier-config
      // 'quotes': ['error', 'single', { allowTemplateLiterals: true }], // Handled by prettier-config or .prettierrc
      // 'comma-dangle': ['error', 'never'], // Handled by prettier-config or .prettierrc

      // Re-enable prettier/prettier rule to report formatting issues as ESLint errors
      'prettier/prettier': 'error'
    }
  },

  // 5. Prettier configuration (this must be the last item to override all formatting rules)
  // This object from eslint-config-prettier disables conflicting ESLint rules.
  prettierConfig
])
