// @ts-check
import base from './base.js';

export default [
  ...base,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off', // NestJS modules are classes by design
      '@typescript-eslint/no-empty-function': 'off', // common in lifecycle hooks
    },
  },
];
