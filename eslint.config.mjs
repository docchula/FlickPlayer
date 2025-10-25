import { defineConfig, globalIgnores } from "eslint/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([globalIgnores(["**/node_modules/"]), {
    files: ["**/*.ts"],

    extends: compat.extends(
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:@angular-eslint/recommended",
        "plugin:@angular-eslint/template/process-inline-templates",
    ),

    rules: {
        "@angular-eslint/directive-selector": ["error", {
            type: "attribute",
            prefix: "app",
            style: "camelCase",
        }],

        "@angular-eslint/component-selector": ["error", {
            type: "element",
            prefix: "app",
            style: "kebab-case",
        }],

        "@angular-eslint/component-class-suffix": "off",
        "@typescript-eslint/ban-ts-comment": "off",
        "@typescript-eslint/no-unused-vars": "off",
        "no-prototype-builtins": "off",
    },
}, {
    files: ["**/*.html"],

    extends: compat.extends(
        "plugin:@angular-eslint/template/recommended",
        "plugin:@angular-eslint/template/accessibility",
    ),

    rules: {
        "no-undefined": "error",
        "no-var": "error",
        "prefer-const": "error",
        "func-names": "error",
        "id-length": "error",
        "newline-before-return": "error",
        "space-before-blocks": "error",
        "no-alert": "error",
        "no-console": "error",
    },
}]);