export interface DeviceCodeResponse {
	device_code: string;
	user_code: string;
	verification_uri: string;
	expires_in: number;
	interval: number;
}

const TOKEN_KEY = 'github_token';

let pollingAbortController: AbortController | null = null;

export function getStoredToken(): string | null {
	return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
	localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
	localStorage.removeItem(TOKEN_KEY);
}

export async function startDeviceFlow(): Promise<DeviceCodeResponse> {
	const res  = await fetch('/api/auth/device-code', { method : 'POST', headers : { 'Content-Type' : 'application/json' } });
	const data = await res.json();
	if (data.error) {
		throw new Error(data.error_description || data.error);
	}
	return {
		device_code      : data.device_code,
		user_code        : data.user_code,
		verification_uri : data.verification_uri,
		expires_in       : data.expires_in,
		interval         : data.interval || 5,
	};
}

export async function pollForToken(deviceCode: string, interval: number, expiresIn: number): Promise<string> {
	pollingAbortController = new AbortController();
	const signal           = pollingAbortController.signal;
	const deadline         = Date.now() + expiresIn * 1000;
	let pollInterval       = interval * 1000;

	while (Date.now() < deadline) {
		if (signal.aborted) {
			throw new Error('Authentication cancelled');
		}
		const delayMs = pollInterval;
		await new Promise(r => setTimeout(r, delayMs));
		if (signal.aborted) {
			throw new Error('Authentication cancelled');
		}

		try {
			const res = await fetch('/api/auth/poll-token', {
				method  : 'POST',
				headers : { 'Content-Type' : 'application/json' },
				body    : JSON.stringify({ device_code : deviceCode }),
				signal,
			});
			const data = await res.json();

			if (data.access_token) {
				storeToken(data.access_token);
				pollingAbortController = null;
				return data.access_token;
			}
			if (data.error === 'authorization_pending') {
				continue;
			}
			if (data.error === 'slow_down') {
				pollInterval += 5000;
				continue;
			}
			if (data.error === 'expired_token') {
				throw new Error('The device code has expired. Please try again.');
			}
			if (data.error === 'access_denied') {
				throw new Error('Authorization was denied by the user.');
			}
			throw new Error(data.error_description || data.error || 'Unknown error during polling');
		}
		catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				throw new Error('Authentication cancelled', { cause : err });
			}
			throw err;
		}
	}

	throw new Error('The device code has expired. Please try again.');
}

export function cancelPolling(): void {
	if (pollingAbortController) {
		pollingAbortController.abort();
		pollingAbortController = null;
	}
}
