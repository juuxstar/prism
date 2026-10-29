import { open, readdir, readFile, stat } from 'fs/promises';
import { join }                          from 'path';

import { GitService }                 from './GitService.js';
import { BadRequestError, HttpError } from './httpErrors.js';

const SESSION_ID_PATTERN    = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TITLE_SCAN_BYTES      = 256 * 1024;
const TOOL_INPUT_MAX_CHARS  = 4000;
const TOOL_RESULT_MAX_CHARS = 4000;
const SUMMARY_MAX_CHARS     = 160;
/** Tool input fields that say in a few words what a call does, in the order they are preferred. */
const SUMMARY_INPUT_KEYS = [ 'description', 'command', 'file_path', 'path', 'pattern', 'query', 'url', 'skill', 'title', 'prompt' ];

/**
 * The Claude Code sessions recorded for a worktree, read from the transcripts Claude Code keeps under
 * `~/.claude/projects` (mounted read-only). The transcript format is internal to Claude Code and changes between
 * releases, so only the fields the agent pane shows are read and any entry that is not recognised is skipped.
 */
export class AgentSessionService {

	private projectsDir: string;
	private gitService: GitService;

	constructor(projectsDir: string, gitService: GitService) {
		this.projectsDir = projectsDir;
		this.gitService  = gitService;
	}

	/** Newest first. A worktree Claude Code has never run in has no session folder, which is not an error. */
	async listSessions(worktreePath: unknown): Promise<AgentSessionSummary[]> {
		const dir = await this.sessionsDirFor(worktreePath);
		let names: string[];
		try {
			names = await readdir(dir);
		}
		catch (error: any) {
			if (error?.code === 'ENOENT') {
				return [];
			}
			throw error;
		}
		const ids      = names.filter(name => name.endsWith('.jsonl')).map(name => name.slice(0, -'.jsonl'.length)).filter(id => SESSION_ID_PATTERN.test(id));
		const sessions = await Promise.all(ids.map(id => summarizeSession(dir, id)));
		return sessions.filter((session): session is AgentSessionSummary => Boolean(session)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	/** The id must be a session id, so a request cannot name any other file in the mount. */
	async sessionFile(worktreePath: unknown, sessionId: unknown): Promise<string> {
		if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
			throw new BadRequestError('Invalid session id');
		}
		return join(await this.sessionsDirFor(worktreePath), `${sessionId}.jsonl`);
	}

	/** Only detected checkouts are accepted, so the folder is always one Claude Code named after a worktree. */
	private async sessionsDirFor(worktreePath: unknown): Promise<string> {
		if (typeof worktreePath !== 'string' || !worktreePath) {
			throw new BadRequestError('worktreePath is required');
		}
		// Serializing is what maps each checkout to its path on the host, which Claude Code named the folder after.
		const status   = this.gitService.serializeGitWorkspaceStatus(await this.gitService.detectGitWorkspace());
		const checkout = status.checkouts.find(item => item.path === worktreePath);
		if (!checkout) {
			throw new HttpError(404, 'Worktree not found');
		}
		return join(this.projectsDir, toProjectDirName(checkout.hostPath || checkout.path));
	}

}

/**
 * Follows one transcript as Claude Code appends to it, returning only what was added since the last read.
 * A partial last line is held back until the rest of it is written.
 */
export class AgentTranscriptReader {

	private file: string;
	private offset  = 0;
	private pending = Buffer.alloc(0);

	constructor(file: string) {
		this.file = file;
	}

	async readNew(): Promise<AgentTranscriptBatch> {
		let info;
		try {
			info = await stat(this.file);
		}
		catch (error: any) {
			throw error?.code === 'ENOENT' ? new HttpError(404, 'Session not found') : error;
		}

		// A shorter file was rewritten rather than appended to, so it is read again from the start.
		const reset = info.size < this.offset;
		if (reset) {
			this.offset  = 0;
			this.pending = Buffer.alloc(0);
		}

		let chunk = Buffer.alloc(0);
		if (info.size > this.offset) {
			const handle = await open(this.file, 'r');
			try {
				const buffer        = Buffer.alloc(info.size - this.offset);
				const { bytesRead } = await handle.read(buffer, 0, buffer.length, this.offset);
				chunk               = buffer.subarray(0, bytesRead);
			}
			finally {
				await handle.close();
			}
			this.offset += chunk.length;
		}

		const data   = Buffer.concat([ this.pending, chunk ]);
		const end    = data.lastIndexOf(0x0a);
		this.pending = end === -1 ? data : data.subarray(end + 1);
		const lines  = end === -1 ? [] : data.subarray(0, end).toString('utf8').split('\n');
		return { messages : lines.flatMap(parseTranscriptLine), reset, updatedAt : info.mtime.toISOString() };
	}

}

/** Claude Code names a project's folder after its working directory, with every non-alphanumeric turned into `-`. */
function toProjectDirName(hostPath: string): string {
	return hostPath.replace(/[^a-zA-Z0-9]/g, '-');
}

async function summarizeSession(dir: string, id: string): Promise<AgentSessionSummary | null> {
	const file = join(dir, `${id}.jsonl`);
	try {
		const info = await stat(file);
		return { id, title : await readSessionTitle(dir, id, file), updatedAt : info.mtime.toISOString(), size : info.size };
	}
	catch {
		// Deleted between the listing and the stat.
		return null;
	}
}

/** The name the desktop app gave the session, else one set with `/rename`, else its first prompt. */
async function readSessionTitle(dir: string, id: string, file: string): Promise<string> {
	const desktopTitle = await readFile(join(dir, id, 'custom-title.json'), 'utf8').then(raw => JSON.parse(raw)?.customTitle).catch(() => undefined);
	if (typeof desktopTitle === 'string' && desktopTitle.trim()) {
		return desktopTitle.trim();
	}

	const handle = await open(file, 'r');
	let head: string;
	try {
		const buffer        = Buffer.alloc(TITLE_SCAN_BYTES);
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		head                = buffer.subarray(0, bytesRead).toString('utf8');
	}
	finally {
		await handle.close();
	}

	// The last line may be cut off by the scan limit.
	const lines     = head.split('\n').slice(0, -1);
	let customTitle = '';
	let firstPrompt = '';
	for (const line of lines) {
		const entry = parseJson(line);
		if (entry?.type === 'custom-title' && typeof entry.customTitle === 'string') {
			customTitle = entry.customTitle;
		}
		else if (!firstPrompt) {
			const prompt = parseTranscriptEntry(entry).find(message => message.kind === 'prompt');
			firstPrompt  = prompt && 'text' in prompt ? prompt.text : '';
		}
	}
	return truncate((customTitle || firstPrompt).replace(/\s+/g, ' ').trim(), SUMMARY_MAX_CHARS) || 'Untitled session';
}

function parseTranscriptLine(line: string): AgentMessage[] {
	return parseTranscriptEntry(parseJson(line));
}

/** Subagent and harness-only entries are left out: the pane shows the conversation as the user saw it. */
function parseTranscriptEntry(entry: any): AgentMessage[] {
	if (!entry || entry.isSidechain || entry.isMeta || (entry.type !== 'user' && entry.type !== 'assistant')) {
		return [];
	}
	const id        = String(entry.uuid || '');
	const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : undefined;
	const content   = entry.message?.content;
	const blocks    = typeof content === 'string' ? [ { type : 'text', text : content } ] : arrayOrEmpty(content);

	if (entry.type === 'assistant') {
		return blocks.flatMap((block: any, index: number): AgentMessage[] => {
			if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
				return [ { kind : 'text', id : `${id}:${index}`, timestamp, text : block.text } ];
			}
			if (block?.type === 'tool_use') {
				return [ {
					kind      : 'tool',
					id        : `${id}:${index}`,
					timestamp,
					toolUseId : String(block.id || ''),
					name      : String(block.name || 'tool'),
					summary   : summarizeToolInput(block.input),
					input     : truncate(JSON.stringify(block.input ?? {}, null, 2), TOOL_INPUT_MAX_CHARS),
				} ];
			}
			return [];
		});
	}

	const origin = typeof entry.origin?.kind === 'string' ? entry.origin.kind : undefined;
	return blocks.flatMap((block: any, index: number): AgentMessage[] => {
		if (block?.type === 'tool_result') {
			return [ {
				kind      : 'result',
				id        : `${id}:${index}`,
				timestamp,
				toolUseId : String(block.tool_use_id || ''),
				text      : truncate(toolResultText(block.content), TOOL_RESULT_MAX_CHARS),
				isError   : Boolean(block.is_error),
			} ];
		}
		if (block?.type !== 'text' || typeof block.text !== 'string') {
			return [];
		}
		const text = cleanPromptText(block.text);
		if (!text) {
			return [];
		}
		if (entry.isCompactSummary) {
			return [ { kind : 'notice', id : `${id}:${index}`, timestamp, text : 'Earlier conversation was summarized to free up context.', origin : 'compaction' } ];
		}
		// Background task results and the like arrive as user turns the user never typed; most carry a one-line summary.
		if (origin && origin !== 'human') {
			const summary = text.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim();
			return [ { kind : 'notice', id : `${id}:${index}`, timestamp, text : summary || text, origin } ];
		}
		return [ { kind : 'prompt', id : `${id}:${index}`, timestamp, text, origin } ];
	});
}

/** Drops the reminders the harness appends to prompts, and shows a slash command as it was typed. */
function cleanPromptText(raw: string): string {
	const command = raw.match(/<command-name>([\s\S]*?)<\/command-name>/);
	if (command) {
		const args = raw.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1]?.trim();
		return [ command[1].trim(), args ].filter(Boolean).join(' ');
	}
	if (/^\s*<local-command-(stdout|stderr|caveat)>/.test(raw)) {
		return '';
	}
	return raw.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
}

function summarizeToolInput(input: any): string {
	if (!input || typeof input !== 'object') {
		return '';
	}
	const key   = SUMMARY_INPUT_KEYS.find(name => typeof input[name] === 'string' && input[name].trim());
	const value = key ? input[key] : Object.values(input).find(item => typeof item === 'string' && item.trim());
	return typeof value === 'string' ? truncate(value.replace(/\s+/g, ' ').trim(), SUMMARY_MAX_CHARS) : '';
}

function toolResultText(content: unknown): string {
	if (typeof content === 'string') {
		return content;
	}
	return !Array.isArray(content) ? '' : content.map(toolResultBlockText).filter(Boolean).join('\n');
}

function toolResultBlockText(block: any): string {
	if (block?.type === 'text' && typeof block.text === 'string') {
		return block.text;
	}
	return block?.type === 'image' ? '[image]' : '';
}

function arrayOrEmpty(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function truncate(text: string, maxChars: number): string {
	return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

function parseJson(line: string): any {
	try {
		return JSON.parse(line);
	}
	catch {
		return null;
	}
}

export interface AgentSessionSummary {
	id: string;
	title: string;
	updatedAt: string;
	size: number;
}

export interface AgentTranscriptBatch {
	messages: AgentMessage[];
	/** The transcript was rewritten, so `messages` replaces what was sent before instead of following it. */
	reset: boolean;
	/** Older messages left out of a first batch, so a long session opens quickly. */
	omittedCount?: number;
	updatedAt: string;
}

export type AgentMessage =
	| { kind: 'prompt' | 'text' | 'notice'; id: string; timestamp?: string; text: string; origin?: string }
	| { kind: 'tool'; id: string; timestamp?: string; toolUseId: string; name: string; summary: string; input: string }
	| { kind: 'result'; id: string; timestamp?: string; toolUseId: string; text: string; isError: boolean };
