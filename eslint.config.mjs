import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// `next lint` was removed in Next.js 16; ESLint runs directly with the flat config.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // React Compiler rules (eslint-plugin-react-hooks 7). Code that syncs state from the URL / localStorage in
    // effects, which these rules report. Kept visible as warnings, not errors.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  {
    // Tests build loose JSON by hand and read deep into it.
    files: ['**/*.test.{ts,tsx}'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts',
    // Copied from node_modules at build time (scripts/copy-maplibre-worker.mjs)
    'public/maplibre/**',
    // tei-tools から写した外部のコード（SaxonJS、XSL の出力が読む JS）
    'public/vendor/**', 'public/xsl-assets/**']),
]);
