import type { ErrorRequestHandler, RequestHandler } from 'express';

export class HttpError extends Error {

	status: number;

	constructor(status: number, message: string, options?: ErrorOptions) {
		super(message, options);
		this.status = status;
	}

}

export class BadRequestError extends HttpError {

	constructor(message: string, options?: ErrorOptions) {
		super(400, message, options);
	}

}

export class BadGatewayError extends HttpError {

	constructor(message: string, options?: ErrorOptions) {
		super(502, message, options);
	}

}

export class CheckoutConflictError extends HttpError {

	constructor(message: string, options?: ErrorOptions) {
		super(409, message, options);
	}

}

export function wrapAsyncRoute(handler: RequestHandler): RequestHandler {
	return function(req, res, next) {
		Promise.resolve(handler(req, res, next)).catch(next);
	};
}

export function apiErrorHandler(err: unknown, _req: Parameters<ErrorRequestHandler>[1], res: Parameters<ErrorRequestHandler>[2], next: Parameters<ErrorRequestHandler>[3]) {
	if (res.headersSent) {
		next(err);
		return;
	}

	const status  = httpStatusForError(err);
	const message = err instanceof Error ? err.message : 'Unknown error';
	if (status >= 500) {
		console.error(err);
	}
	res.status(status).json({ error : message });
}

function httpStatusForError(err: unknown): number {
	if (err instanceof HttpError) {
		return err.status;
	}
	return isBodyParserError(err) ? 400 : 500;
}

function isBodyParserError(err: unknown): boolean {
	return Boolean(
		err
			&& typeof err === 'object'
			&& 'type' in err
			&& typeof err.type === 'string'
			&& err.type.startsWith('entity.')
	);
}
