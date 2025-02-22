module.exports = {
  env: {
    browser: true,
    es2022: true,
    jquery: true,
    es6: true,
  },
  extends: ['eslint:recommended', 'plugin:prettier/recommended'],
  overrides: [
    {
      files: ['*.js'],
      rules: {
        'max-len': ['error', { code: 80 }],
      },
    },
    {
      files: ['*.py'],
      rules: {
        'max-len': ['error', { code: 100 }],
      },
    },
    {
      files: ['*.html'],
      rules: {
        'max-len': [
          'error',
          {
            code: 120,
            ignorePattern: 's*{% if .+? %}.*?{% endif %}s*',
          },
        ],
      },
    },
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    semi: ['error', 'always'],
    'max-len': [
      'warn',
      {
        code: 80,
        tabWidth: 2,
        ignoreComments: false,
        ignoreUrls: true,
        ignoreStrings: false,
        ignoreTemplateLiterals: false,
      },
    ],
    'space-before-function-paren': [
      'error',
      {
        anonymous: 'always',
        asyncArrow: 'always',
        named: 'never',
      },
    ],
    'comma-dangle': ['error', 'always-multiline'],
    'prettier/prettier': ['error', { printWidth: 80 }],
  },
  globals: {
    quality: 'writable',
  },
};
