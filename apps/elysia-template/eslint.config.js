import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';
import path from 'node:path';
import process from 'node:process';

const deepModulesPlugin = {
  rules: {
    'no-cross-module-internal-imports': {
      meta: {
        type: 'problem',
        docs: {
          description: "Strictly forbid importing anything from a path matching */internal/* unless the importing file is located within that exact same module's directory structure.",
        },
        schema: [],
      },
      create(context) {
        function checkImport(node, importPath) {
          if (typeof importPath !== 'string') return;
          const segments = importPath.replace(/\\/g, '/').split('/');
          if (!segments.includes('internal')) {
            return;
          }

          const filename = context.filename ?? context.getFilename();
          const normalizedFilename = filename.replace(/\\/g, '/');

          // Helper to get module name from path
          const getModuleName = (p) => {
            const match = p.match(/(?:^|\/)src\/modules\/([^/]+)/);
            return match ? match[1] : null;
          };

          const importerModule = getModuleName(normalizedFilename);

          // Resolve target path
          let resolvedPath = importPath;
          if (importPath.startsWith('.') || path.isAbsolute(importPath)) {
            resolvedPath = path.resolve(path.dirname(filename), importPath);
          } else if (importPath.startsWith('src/')) {
            const srcIndex = normalizedFilename.indexOf('/src/');
            if (srcIndex !== -1) {
              const rootPath = filename.substring(0, srcIndex);
              resolvedPath = path.resolve(rootPath, importPath);
            } else {
              resolvedPath = path.resolve(process.cwd(), importPath);
            }
          }

          const targetModule = getModuleName(resolvedPath.replace(/\\/g, '/'));

          if (targetModule && importerModule !== targetModule) {
            context.report({
              node,
              message: `Importing from the internal folder of module "${targetModule}" is not allowed from ${importerModule ? `module "${importerModule}"` : 'outside the module'}.`,
            });
          }
        }

        return {
          ImportDeclaration(node) {
            checkImport(node, node.source.value);
          },
          ExportNamedDeclaration(node) {
            if (node.source) {
              checkImport(node, node.source.value);
            }
          },
          ExportAllDeclaration(node) {
            if (node.source) {
              checkImport(node, node.source.value);
            }
          },
          ImportExpression(node) {
            if (node.source && node.source.type === 'Literal') {
              checkImport(node, node.source.value);
            }
          }
        };
      },
    },
  },
};

export default defineConfig(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    plugins: {
      'deep-modules': deepModulesPlugin,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'deep-modules/no-cross-module-internal-imports': 'error',
    },
  },
  {
    ignores: ['node_modules/', 'dist/'],
  }
);
