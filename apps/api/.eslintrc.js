module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    // Do NOT set `project` here — typed linting forces every linted file to be
    // listed in tsconfig.include, which the smoke + app e2e specs in test/
    // aren't. The few rules we use (no-unused-vars, no-explicit-any) don't
    // need type info, so untyped linting is fine and keeps the e2e tree
    // outside src/ lintable.
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: ['plugin:@typescript-eslint/recommended'],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
};
