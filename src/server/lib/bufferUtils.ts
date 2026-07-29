export function bufferToText(buffer: Buffer | null): string | null {
	if (!buffer || buffer.includes(0)) {
		return null;
	}
	return buffer.toString('utf8');
}

export function bufferToBase64(buffer: Buffer | null): string | null {
	if (!buffer || buffer.length === 0) {
		return null;
	}
	return buffer.toString('base64');
}
