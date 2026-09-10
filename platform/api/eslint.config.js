// Minimal ESLint setup whose sole purpose (for now) is enforcing the
// project's "no any" convention — tsc --noEmit checks types but silently
// allows explicit `any`. Flat config (ESLint 10+ default; .eslintrc support
// is gone as of ESLint 10) scoped to this package's own source, so it
// doesn't try to lint the rest of the monorepo.
//
// Deliberately narrow: only the @typescript-eslint parser/plugin plus the
// one rule this tooling exists to enforce. Pulling in a broader ruleset
// (e.g. typescript-eslint's "recommended") would surface unrelated
// pre-existing lint debt (unused vars, etc.) that isn't this item's scope —
// widen the ruleset deliberately later, not as a side effect of this pass.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'prisma/migrations/**'],
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.ts', 'prisma/**/*.ts'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    languageOptions: { parser: tseslint.parser },
    // The codebase has existing `eslint-disable` comments for rules (e.g.
    // no-namespace) this deliberately-narrow config doesn't enable. Without
    // this, ESLint flags those as "unused directive" noise unrelated to
    // what this pass is checking.
    linterOptions: { reportUnusedDisableDirectives: false },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
