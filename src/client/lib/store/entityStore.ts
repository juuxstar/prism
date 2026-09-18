import { reactive } from 'vue';

/**
 * A reactive, versioned record store — the single copy of each entity the UI renders from.
 *
 * Every record carries the version of the thing it describes, which is what makes invalidation surgical. A
 * pull request's diff is keyed by its head commit, so a push invalidates the file list and the checks while
 * leaving the title, the comments and the blobs alone. Without a version the only honest answer to "is this
 * still current?" is "no", which is why the caches this replaces could only ever be cleared wholesale.
 *
 * Reads are stale-while-revalidate: a record that needs refreshing stays on screen as `revalidating` and is
 * replaced in place when the response lands, rather than being blanked while a spinner runs.
 */
export class EntityStore<T> {

	readonly name: string;
	private readonly records: Map<string, StoreRecord<T>>;
	private readonly inflight = new Map<string, Promise<T>>();
	/** How long a record may be served without revalidation when the caller cannot supply a version. Zero
	 *  means a version is always known for this collection, so age never decides freshness. */
	private readonly ttlMs: number;

	constructor(name: string, ttlMs = 0) {
		this.name    = name;
		this.ttlMs   = ttlMs;
		this.records = reactive(new Map<string, StoreRecord<T>>()) as Map<string, StoreRecord<T>>;
	}

	/** The record as it stands, for components that render whatever is in hand. Reactive. */
	peek(key: string): StoreRecord<T> | undefined {
		return this.records.get(key);
	}

	/** The data only when it describes `version` — a mismatch means the caller is holding the wrong commit. */
	peekAt(key: string, version: string): T | undefined {
		const record = this.records.get(key);
		return record && record.version === version ? record.data : undefined;
	}

	set(key: string, data: T, meta: RecordMeta = {}): StoreRecord<T> {
		const record: StoreRecord<T> = {
			data,
			version   : meta.version ?? '',
			etag      : meta.etag ?? null,
			fetchedAt : Date.now(),
			status    : 'fresh',
			error     : null,
		};
		this.records.set(key, record);
		return record;
	}

	/**
	 * Write a mutation's own result straight into the record. Used where GitHub hands back the updated entity,
	 * so the UI does not have to refetch what it was just told.
	 */
	patch(key: string, update: (data: T) => T): void {
		const record = this.records.get(key);
		if (record) {
			record.data      = update(record.data);
			record.fetchedAt = Date.now();
			record.status    = 'fresh';
			record.error     = null;
		}
	}

	clear(): void {
		this.records.clear();
		this.inflight.clear();
	}

	/**
	 * Resolve a record, fetching only when what is held cannot be the current thing.
	 *
	 * A record whose version matches is returned as-is: no request, no loading state, no flicker. Anything
	 * else goes to the network, with the previous data left in place and flagged `revalidating` so the view
	 * keeps rendering it meanwhile. Concurrent reads of the same key share one request.
	 */
	async read(options: ReadOptions<T>): Promise<T> {
		const key      = options.key;
		const version  = options.version;
		const force    = options.force ?? false;
		const existing = this.records.get(key);

		if (existing && !force && this.isCurrent(existing, version)) {
			return existing.data;
		}

		const pending = this.inflight.get(key);
		if (pending && !force) {
			return pending;
		}

		if (existing) {
			existing.status = 'revalidating';
		}

		const request = this.fetchInto(key, version, options.fetch, existing)
			.finally(() => {
				if (this.inflight.get(key) === request) {
					this.inflight.delete(key);
				}
			});
		this.inflight.set(key, request);
		return request;
	}

	private async fetchInto(
		key: string,
		version: string | undefined,
		fetcher: (previous: StoreRecord<T> | undefined) => Promise<FetchResult<T>>,
		existing: StoreRecord<T> | undefined
	): Promise<T> {
		try {
			const result = await fetcher(existing);

			// A 304 can only answer a request that carried this record's own ETag, so one arriving without a
			// record to apply it to means the record went away mid-flight — sign-out, usually. Nothing to keep.
			if (result.notModified && !existing) {
				throw new Error(`${this.name}: not-modified response with no record to keep`);
			}

			// A 304 says the bytes we hold are still the bytes GitHub has; only the record's age moves.
			if (result.notModified && existing) {
				existing.fetchedAt = Date.now();
				existing.status    = 'fresh';
				existing.error     = null;
				if (version !== undefined) {
					existing.version = version;
				}
				return existing.data;
			}

			const record = this.set(key, result.data as T, { version : result.version ?? version, etag : result.etag });
			return record.data;
		}
		catch (error: any) {
			// A failed refresh must not empty the view: the record keeps the data it had and says it is stale.
			if (existing) {
				existing.status = 'error';
				existing.error  = error?.message || 'Request failed';
			}
			throw error;
		}
	}

	private isCurrent(record: StoreRecord<T>, version: string | undefined): boolean {
		if (record.status === 'error') {
			return false;
		}
		return version !== undefined ? record.version === version : this.ttlMs > 0 && Date.now() - record.fetchedAt < this.ttlMs;
	}

}

export type RecordStatus = 'fresh' | 'revalidating' | 'error';

export interface StoreRecord<T> {
	data: T;
	/** What this data describes — a head commit, an `updated_at`, or '' when the entity has no version. */
	version: string;
	/** GitHub's entity tag, replayed as `If-None-Match` so an unchanged read costs no rate limit. */
	etag: string | null;
	fetchedAt: number;
	status: RecordStatus;
	error: string | null;
}

export interface RecordMeta {
	version?: string;
	etag?: string | null;
}

export interface FetchResult<T> {
	data?: T;
	etag?: string | null;
	/** The conditional request came back 304 — keep the data already held. */
	notModified?: boolean;
	/** Overrides the caller's version, for entities whose version is only known once fetched. */
	version?: string;
}

export interface ReadOptions<T> {
	key: string;
	/** The version the caller needs. Omit when it can only be discovered by fetching, and rely on the TTL. */
	version?: string;
	/** A user-triggered refresh: revalidate even a record that looks current. */
	force?: boolean;
	fetch: (previous: StoreRecord<T> | undefined) => Promise<FetchResult<T>>;
}
