// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    rules: {
      // Rules written for the React Compiler, which this app does not use. They flag working
      // patterns in screens that predate the linter (refs read during render, state set in an
      // effect). Kept as warnings so they are visible and get cleaned up screen by screen,
      // without failing CI.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/use-memo': 'warn',
      // React Native <Text> shows quotes as they are; HTML entities make no sense here.
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    ignores: ['dist/*', '.expo/*', '.claude/*', 'node_modules/*'],
  },
]);
