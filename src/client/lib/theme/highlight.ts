import hljs       from 'highlight.js/lib/core';
import bash       from 'highlight.js/lib/languages/bash';
import c          from 'highlight.js/lib/languages/c';
import cpp        from 'highlight.js/lib/languages/cpp';
import csharp     from 'highlight.js/lib/languages/csharp';
import css        from 'highlight.js/lib/languages/css';
import diff       from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go         from 'highlight.js/lib/languages/go';
import graphql    from 'highlight.js/lib/languages/graphql';
import java       from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json       from 'highlight.js/lib/languages/json';
import kotlin     from 'highlight.js/lib/languages/kotlin';
import less       from 'highlight.js/lib/languages/less';
import lua        from 'highlight.js/lib/languages/lua';
import markdown   from 'highlight.js/lib/languages/markdown';
import perl       from 'highlight.js/lib/languages/perl';
import php        from 'highlight.js/lib/languages/php';
import python     from 'highlight.js/lib/languages/python';
import ruby       from 'highlight.js/lib/languages/ruby';
import rust       from 'highlight.js/lib/languages/rust';
import scss       from 'highlight.js/lib/languages/scss';
import shell      from 'highlight.js/lib/languages/shell';
import sql        from 'highlight.js/lib/languages/sql';
import swift      from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml        from 'highlight.js/lib/languages/xml';
import yaml       from 'highlight.js/lib/languages/yaml';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('java', java);
hljs.registerLanguage('css', css);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('json', json);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('kotlin', kotlin);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('diff', diff);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('graphql', graphql);
hljs.registerLanguage('scss', scss);
hljs.registerLanguage('less', less);
hljs.registerLanguage('php', php);
hljs.registerLanguage('perl', perl);
hljs.registerLanguage('lua', lua);
hljs.registerLanguage('shell', shell);

const EXT_MAP: Record<string, string> = {
	'.ts'         : 'typescript',
	'.tsx'        : 'typescript',
	// The ESM and CommonJS variants are ordinary TypeScript; only the module system differs.
	'.mts'        : 'typescript',
	'.cts'        : 'typescript',
	'.js'         : 'javascript',
	'.jsx'        : 'javascript',
	'.mjs'        : 'javascript',
	'.cjs'        : 'javascript',
	'.vue'        : 'xml',
	'.svelte'     : 'xml',
	'.html'       : 'xml',
	'.htm'        : 'xml',
	'.xml'        : 'xml',
	'.svg'        : 'xml',
	'.py'         : 'python',
	'.pyw'        : 'python',
	'.go'         : 'go',
	'.rs'         : 'rust',
	'.java'       : 'java',
	'.css'        : 'css',
	'.scss'       : 'scss',
	'.less'       : 'less',
	'.json'       : 'json',
	'.yaml'       : 'yaml',
	'.yml'        : 'yaml',
	'.sh'         : 'bash',
	'.bash'       : 'bash',
	'.zsh'        : 'bash',
	'.sql'        : 'sql',
	'.rb'         : 'ruby',
	'.c'          : 'c',
	'.h'          : 'c',
	'.cpp'        : 'cpp',
	'.cc'         : 'cpp',
	'.cxx'        : 'cpp',
	'.hpp'        : 'cpp',
	'.hxx'        : 'cpp',
	'.cs'         : 'csharp',
	'.swift'      : 'swift',
	'.kt'         : 'kotlin',
	'.kts'        : 'kotlin',
	'.md'         : 'markdown',
	'.mdx'        : 'markdown',
	'.dockerfile' : 'dockerfile',
	'.graphql'    : 'graphql',
	'.gql'        : 'graphql',
	'.php'        : 'php',
	'.pl'         : 'perl',
	'.pm'         : 'perl',
	'.lua'        : 'lua',
};

const FILENAME_MAP: Record<string, string> = {
	'Dockerfile' : 'dockerfile',
	'Makefile'   : 'bash',
	'.gitignore' : 'bash',
	'.env'       : 'bash',
	'.bashrc'    : 'bash',
	'.zshrc'     : 'bash',
};

const MAX_LINES = 10000;

export function getLanguage(filename: string): string | undefined {
	const base = filename.split('/').pop() || '';
	if (FILENAME_MAP[base]) {
		return FILENAME_MAP[base];
	}
	const dotIdx = base.lastIndexOf('.');
	if (dotIdx === -1) {
		return undefined;
	}
	const ext = base.slice(dotIdx).toLowerCase();
	return EXT_MAP[ext];
}

export function highlightLines(code: string, filename: string): string[] | null {
	const lang = getLanguage(filename);
	if (!lang) {
		return null;
	}

	const lineCount = code.split('\n').length;
	if (lineCount > MAX_LINES) {
		return null;
	}

	try {
		const result = hljs.highlight(code, { language : lang });
		return splitHighlightedLines(result.value);
	}
	catch {
		return null;
	}
}

/**
 * Splits highlight.js output into one self-contained HTML string per line.
 *
 * highlight.js emits a single element around a construct that spans several lines (a JSDoc block,
 * a template literal, a multi-line string), so a plain split on newlines leaves the first line with
 * an unclosed tag, the middle lines with no tag at all and the last with a stray closing tag. Each
 * line is rendered on its own here, so any element still open at a line break is closed at the end
 * of that line and re-opened at the start of the next.
 */
function splitHighlightedLines(html: string): string[] {
	const lines: string[]    = [];
	const openTags: string[] = [];
	let current              = '';

	// The output only ever contains <span> elements; highlight.js escapes every other character.
	const TAG_RE = /<\/?span[^>]*>/g;
	let pos      = 0;

	for (let match = TAG_RE.exec(html); match; match = TAG_RE.exec(html)) {
		appendText(html.slice(pos, match.index));

		if (match[0].startsWith('</')) {
			openTags.pop();
		}
		else {
			openTags.push(match[0]);
		}
		current += match[0];
		pos      = match.index + match[0].length;
	}
	appendText(html.slice(pos));
	lines.push(current + '</span>'.repeat(openTags.length));

	return lines;

	function appendText(text: string) {
		const parts = text.split('\n');
		for (let i = 0; i < parts.length; i++) {
			if (i > 0) {
				lines.push(current + '</span>'.repeat(openTags.length));
				current = openTags.join('');
			}
			current += parts[i];
		}
	}
}
