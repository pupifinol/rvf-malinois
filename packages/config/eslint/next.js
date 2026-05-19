// @ts-check
import boundaries from 'eslint-plugin-boundaries';
import react from './react.js';

/**
 * ESLint config for Next.js apps.
 *
 * The boundaries plugin enforces the layered architecture from the engineering doc:
 *
 *   primitives  ->  composites  ->  screens
 *   api-client  is  the only door to the backend
 *   realtime    can be consumed by screens but never imports api-client
 *
 * A screen may import composites and primitives. A primitive may NOT import a
 * screen, a feature, or the api-client. Violations fail lint.
 */
export default [
  ...react,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'screen', pattern: 'app/**' },
        { type: 'feature', pattern: '{features,modules}/**' },
        { type: 'composite', pattern: 'components/composite/**' },
        { type: 'primitive', pattern: 'components/primitives/**' },
        { type: 'lib', pattern: 'lib/**' },
        { type: 'realtime', pattern: 'lib/realtime/**' },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'allow',
          rules: [
            { from: 'primitive', disallow: ['screen', 'feature', 'composite'] },
            { from: 'composite', disallow: ['screen', 'feature'] },
            { from: 'realtime', disallow: ['screen', 'feature', 'composite', 'primitive'] },
          ],
        },
      ],
    },
  },
];
