import { DecoratedRouter, Get, Post } from '@juuxstar/http-decorators';
import type { Request, Response }     from 'express';
import { unwatchFile, watchFile }     from 'fs';

import type { AgentTranscriptBatch } from '../lib/AgentSessionService.js';
import { AgentSessionService, AgentTranscriptReader } from '../lib/AgentSessionService.js';
import { GitService }                from '../lib/GitService.js';

/** Polled rather than watched for events, which Docker's bind mounts do not reliably pass through. */
const TRANSCRIPT_POLL_MS = 1000;
/** Keeps proxies from closing a stream that is quiet while the agent thinks. */
const HEARTBEAT_MS = 25_000;
/** A long session's whole history runs to megabytes; the mirror is for following the recent work. */
const FIRST_BATCH_LIMIT = 600;

/** A read-only mirror of the Claude Code sessions run in a worktree; nothing here writes to a transcript. */
export class AgentApi extends DecoratedRouter {

	private sessionService: AgentSessionService;

	constructor(projectsDir: string, workspaceDir: string, checkoutHostDir?: string) {
		super();
		this.sessionService = new AgentSessionService(projectsDir, new GitService(workspaceDir, undefined, checkoutHostDir));
	}

	@Post('/sessions')
	async sessions(req: Request, res: Response) {
		res.json(await this.sessionService.listSessions(req.body?.worktreePath));
	}

	/** Server-sent events: the whole session first, then what Claude Code appends to it, until the client leaves. */
	@Get('/stream')
	async stream(req: Request, res: Response) {
		const file   = await this.sessionService.sessionFile(req.query.worktreePath, req.query.sessionId);
		const reader = new AgentTranscriptReader(file);
		const first  = await reader.readNew();

		res.writeHead(200, {
			'Content-Type'      : 'text/event-stream',
			'Cache-Control'     : 'no-cache, no-transform',
			'Connection'        : 'keep-alive',
			'X-Accel-Buffering' : 'no',
		});
		const send = (batch: AgentTranscriptBatch) => {
			res.write(`data: ${JSON.stringify(batch)}\n\n`);
		};
		send({
			...first,
			messages     : first.messages.slice(-FIRST_BATCH_LIMIT),
			omittedCount : Math.max(0, first.messages.length - FIRST_BATCH_LIMIT),
			reset        : true,
		});

		// Reads are chained so two polls never read the same bytes.
		let reading = Promise.resolve();
		const poll  = () => {
			reading = reading.then(async () => {
				const batch = await reader.readNew();
				if (batch.messages.length || batch.reset) {
					send(batch);
				}
			}).catch(() => {
				// The file can vanish or be mid-rewrite; the next change reads it again.
			});
		};
		watchFile(file, { interval : TRANSCRIPT_POLL_MS }, poll);
		const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), HEARTBEAT_MS);

		req.on('close', () => {
			unwatchFile(file, poll);
			clearInterval(heartbeat);
		});
	}

}
