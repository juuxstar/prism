import { config as lcb } from "@frontlobby/eslint-config-lcb";
import pluginVue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";
import globals from "globals";
import vueEslintParser from "vue-eslint-parser";

// typescript-eslint builds one project service for the whole run from the first file that asks for it, so every
// block must pass the same options: a block with a bare `projectService: true` would drop allowDefaultProject
// whenever one of its files happened to be linted first.
const projectService = { allowDefaultProject: ["npmStart.mts"] };

export default [
	{ ignores: ["node_modules/**", "dist/**", "build/**", "eslint.config.js", "scripts/prepare-http-decorators.mjs"] },
	...lcb,
	...pluginVue.configs["flat/recommended"],

	// Type-aware parsing (LCB enables @typescript-eslint/no-floating-promises)
	{
		files: ["**/*.vue"],
		languageOptions: {
			parser: vueEslintParser,
			parserOptions: {
				parser: tseslint.parser,
				projectService,
				extraFileExtensions: [".vue"],
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		files: ["src/client/**/*.ts"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				projectService,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		// LCB v9 enables projectService globally; src/server/tsconfig.json is auto-discovered from it,
		// and setting `project` alongside it is a parse error.
		files: ["src/server/**/*.ts"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				projectService,
				tsconfigRootDir: import.meta.dirname,
			},
			globals: { ...globals.node },
		},
	},
	{
		files: ["vite.config.ts", "npmStart.mts"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				projectService,
				tsconfigRootDir: import.meta.dirname,
			},
			globals: { ...globals.node },
		},
	},

	// Project line length (LCB defaults to 150)
	{
		rules: {
			"max-len": [
				"warn",
				{
					code: 200,
					ignoreUrls: true,
					ignoreStrings: true,
					ignoreTemplateLiterals: true,
				},
			],
		},
	},

	// Multi-arg calls: if args start on one line, keep them on one line (when under max-len, collapse manually)
	{
		files: ["**/*.ts"],
		ignores: ["**/*.d.ts"],
		rules: {
			"@stylistic/function-call-argument-newline": ["error", "consistent"],
		},
	},

	// Import groups: `@/` alias instead of LCB's `$/` paths
	{
		rules: {
			"simple-import-sort/imports": [
				"error",
				{
					groups: [["^\\u0000"], ["^node:"], ["^@/"], ["^@?\\w"], ["^\\."]],
				},
			],
		},
	},

	// GitHub API snake_case + PascalCase default imports such as `Yargs` (LCB naming is stricter)
	{
		files: ["src/**/*.ts", "**/*.vue", "vite.config.ts", "npmStart.mts"],
		rules: {
			"@typescript-eslint/naming-convention": [
				"error",
				{
					selector: ["objectLiteralProperty", "objectLiteralMethod", "typeProperty", "enumMember"],
					format: null,
					modifiers: ["requiresQuotes"],
				},
				{
					selector: "enumMember",
					format: ["camelCase", "PascalCase"],
				},
				{
					selector: "variable",
					modifiers: ["const"],
					format: ["camelCase", "UPPER_CASE", "PascalCase", "snake_case"],
					leadingUnderscore: "allow",
					trailingUnderscore: "allow",
				},
				{
					selector: "function",
					modifiers: ["global", "exported"],
					format: ["camelCase", "PascalCase"],
				},
				{
					selector: ["objectLiteralProperty", "typeProperty"],
					format: ["camelCase", "snake_case", "UPPER_CASE", "PascalCase"],
					leadingUnderscore: "allow",
				},
				{
					selector: ["accessor", "objectLiteralMethod"],
					format: ["camelCase", "PascalCase"],
					leadingUnderscore: "allow",
				},
				{
					selector: "typeLike",
					format: ["PascalCase"],
				},
				{
					selector: "default",
					format: ["camelCase", "PascalCase"],
					leadingUnderscore: "allow",
					trailingUnderscore: "allow",
				},
			],
		},
	},

	// Vue 3 vs LCB’s vue2-recommended remnants; SFC fire-and-forget promises
	{
		files: ["**/*.vue"],
		rules: {
			"vue/no-multiple-template-root": "off",
			"vue/no-v-model-argument": "off",
			"vue/no-v-for-template-key": "off",
			"@typescript-eslint/no-floating-promises": "off",
			// TS function types in defineProps<> use `(args) =>` and trip core func-call-spacing
			"func-call-spacing": "off",
		},
	},

	// Client (browser)
	{
		files: ["src/client/**/*.{ts,vue}"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: { ...globals.browser },
		},
		rules: {
			"no-console": "warn",
			"@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-non-null-assertion": "off",

			"vue/multi-word-component-names": "off",
			"vue/no-v-html": "off",
			"vue/max-attributes-per-line": "off",
			"vue/singleline-html-element-content-newline": "off",
			// Its fix pads inline content with newlines, which Vue renders as spaces (e.g. around a button's symbol)
			"vue/multiline-html-element-content-newline": "off",
			"vue/html-self-closing": "off",
			"vue/component-definition-name-casing": "off",
			"vue/attributes-order": "off",
			"vue/html-indent": "off",
		},
	},
];
