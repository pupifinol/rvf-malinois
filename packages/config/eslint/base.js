// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';

/**
 * Base ESLint config shared by every package in RVF Malinois.
 * Layered configs (next/nest/react) extend this one.
 */
export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/build/**', '**/.next/**', '**/.turbo/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      // ---- TypeScript discipline (engineering doc §8) ----
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],

      // ---- ISA-101 discipline: forbid raw color literals in source ----
      // Components must use semantic tokens (var(--status-alarm), tailwind `bg-status-alarm`),
      // never literal hex values. This rule is the lint guard for §10 of the engineering doc.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
          message:
            'Raw hex colors are forbidden. Use a semantic design token (e.g. var(--status-alarm) or the Tailwind token bg-status-alarm).',
        },
        {
          selector:
            'TemplateElement[value.cooked=/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/]',
          message:
            'Raw hex colors are forbidden in template strings. Use a semantic design token instead.',
        },
      ],

      // ---- Import hygiene ----
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-default-export': 'off',
      'import/no-duplicates': 'error',
    },
  },
  prettier,
);
