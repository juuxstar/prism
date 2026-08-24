export function bufferToText(buffer: Buffer | null): string | null {
	return !buffer || buffer.includes(0) ? null : buffer.toString('utf8');
}

export function bufferToBase64(buffer: Buffer | null): string | null {
	return !buffer || buffer.length === 0 ? null : buffer.toString('base64');
}
