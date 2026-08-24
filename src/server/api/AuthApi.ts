import { DecoratedRouter, Post }  from '@juuxstar/http-decorators';
import type { Request, Response } from 'express';

import { BadGatewayError } from '../lib/httpErrors.js';

const CLIENT_ID              = process.env.GITHUB_CLIENT_ID || 'Ov23li1HRzJJ8O56Pz5p';
const DEVICE_CODE_URL        = 'https://github.com/login/device/code';
const TOKEN_URL              = 'https://github.com/login/oauth/access_token';
const REQUIRED_GITHUB_SCOPES = [ 'repo', 'read:org' ];
const GITHUB_SCOPES          = [
	...new Set([
		...REQUIRED_GITHUB_SCOPES,
		...(process.env.GITHUB_OAUTH_SCOPES || '').split(/\s+/).filter(Boolean),
	]),
].join(' ');

export class AuthApi extends DecoratedRouter {

	@Post('/device-code')
	async createDeviceCode(_req: Request, res: Response) {
		res.json(await fetchGithubAuth(DEVICE_CODE_URL, { client_id : CLIENT_ID, scope : GITHUB_SCOPES }));
	}

	@Post('/poll-token')
	async pollToken(req: Request, res: Response) {
		const deviceCode = (req.body as { device_code?: string }).device_code;
		res.json(await fetchGithubAuth(TOKEN_URL, {
			client_id   : CLIENT_ID,
			device_code : deviceCode,
			grant_type  : 'urn:ietf:params:oauth:grant-type:device_code',
		}));
	}

}

async function fetchGithubAuth(url: string, body: Record<string, unknown>): Promise<unknown> {
	try {
		const response = await fetch(url, {
			method  : 'POST',
			headers : { 'Content-Type' : 'application/json', 'Accept' : 'application/json' },
			body    : JSON.stringify(body),
		});
		return await response.json();
	}
	catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		throw new BadGatewayError(message, { cause : err });
	}
}
