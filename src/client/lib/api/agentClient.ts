export async function fetchAgentSessions(worktreePath: string): Promise<AgentSessionSummary[]> {
	const response = await fetch('/api/agent/sessions', {
		method  : 'POST',
		headers : { 'Content-Type' : 'application/json' },
		body    : JSON.stringify({ worktreePath }),
	});
	const json = await response.json().catch(() => ({}) as any);
	if (!response.ok) {
		throw new Error(typeof json.error === 'string' ? json.error : `Agent request failed: ${response.status}`);
	}
	return json;
}

/**
 * Follows a session as Claude Code writes it. The first batch is the whole session; later ones are what was
 * appended, unless `reset` says the transcript was rewritten. Returns a function that stops following.
 */
export function followAgentSession(
	worktreePath: string,
	sessionId: string,
	onBatch: (batch: AgentTranscriptBatch) => void,
	onError: () => void
): () => void {
	const query      = new URLSearchParams({ worktreePath, sessionId });
	const source     = new EventSource(`/api/agent/stream?${query}`);
	source.onmessage = event => {
		try {
			onBatch(JSON.parse(event.data));
		}
		catch {
			// A malformed batch is dropped; the next one still applies.
		}
	};
	// EventSource reconnects by itself, and the server then sends the whole session again with `reset`.
	source.onerror = () => onError();
	return () => source.close();
}

export interface AgentSessionSummary {
	id: string;
	title: string;
	updatedAt: string;
	size: number;
}

export interface AgentTranscriptBatch {
	messages: AgentMessage[];
	reset: boolean;
	/** Older messages the server left out of a first batch. */
	omittedCount?: number;
	updatedAt: string;
}

export type AgentMessage =
	| { kind: 'prompt' | 'text' | 'notice'; id: string; timestamp?: string; text: string; origin?: string }
	| { kind: 'tool'; id: string; timestamp?: string; toolUseId: string; name: string; summary: string; input: string }
	| { kind: 'result'; id: string; timestamp?: string; toolUseId: string; text: string; isError: boolean };

export type AgentToolResult = Extract<AgentMessage, { kind: 'result' }>;
