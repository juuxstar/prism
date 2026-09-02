import DOMPurify  from 'dompurify';
import { marked } from 'marked';

marked.setOptions({ gfm : true, breaks : false });

let linkHookInstalled = false;

function ensureExternalLinkAttrs(): void {
	if (linkHookInstalled || typeof window === 'undefined') {
		return;
	}
	DOMPurify.addHook('afterSanitizeAttributes', node => {
		if (node.tagName !== 'A' || !(node instanceof HTMLAnchorElement)) {
			return;
		}
		const href = node.getAttribute('href');
		if (!href) {
			return;
		}
		if (/^https?:\/\//i.test(href)) {
			node.setAttribute('target', '_blank');
			node.setAttribute('rel', 'noopener noreferrer');
		}
	});
	linkHookInstalled = true;
}

/** Renders GitHub-flavored markdown to sanitized HTML for `v-html`. */
export function renderGithubMarkdown(markdown: string): string {
	const src = markdown.trim();
	return !src ? '' : sanitizeMarkdownHtml(marked.parse(src, { async : false }) as string);
}

/**
 * Sanitizes markdown-derived HTML, for callers that drive `marked` themselves — the rendered diff parses
 * block by block. Keeps one DOMPurify configuration, so external links behave the same everywhere.
 */
export function sanitizeMarkdownHtml(html: string): string {
	ensureExternalLinkAttrs();
	return DOMPurify.sanitize(html);
}
