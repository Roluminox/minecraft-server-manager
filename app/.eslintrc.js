module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier', // Must be last - disables formatting rules that conflict with Prettier
  ],
  plugins: ['react', 'react-hooks'],
  rules: {
    // === Errors (things that are likely bugs) ===
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-undef': 'error',
    'no-console': 'off', // We use console for logging in Electron
    'no-debugger': 'warn',

    // === React ===
    'react/react-in-jsx-scope': 'off', // Not needed in React 17+
    'react/prop-types': 'off', // We'll add TypeScript later
    'react/display-name': 'off',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // === Best practices (warnings, not errors) ===
    eqeqeq: ['warn', 'smart'],
    'no-var': 'warn',
    'prefer-const': 'warn',
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-extra-boolean-cast': 'warn',

    // === Style (let Prettier handle most of this) ===
    // Prettier handles: quotes, semi, indent, trailing commas, etc.
  },
  overrides: [
    // Electron main process files
    {
      files: ['electron/**/*.js', 'core/**/*.js'],
      env: {
        browser: false,
        node: true,
      },
      rules: {
        'no-console': 'off',
      },
    },
    // Config files
    {
      files: ['*.config.js', '.eslintrc.js'],
      env: {
        node: true,
      },
    },
  ],
  ignorePatterns: ['node_modules/', 'dist/', 'dist-electron/', 'ui/dist/', '*.min.js'],
};
