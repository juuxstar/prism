const IMAGE_EXTENSIONS = new Set([
	'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'tiff', 'tif',
]);

const PDF_EXTENSIONS = new Set([ 'pdf' ]);

const MIME_BY_EXTENSION: Record<string, string> = {
	png  : 'image/png',
	jpg  : 'image/jpeg',
	jpeg : 'image/jpeg',
	gif  : 'image/gif',
	webp : 'image/webp',
	svg  : 'image/svg+xml',
	bmp  : 'image/bmp',
	ico  : 'image/x-icon',
	avif : 'image/avif',
	tiff : 'image/tiff',
	tif  : 'image/tiff',
	pdf  : 'application/pdf',
};

export function fileExtension(filename: string): string {
	const base = filename.split('/').pop() ?? filename;
	const dot  = base.lastIndexOf('.');
	return dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function isPdfFile(filename: string): boolean {
	return PDF_EXTENSIONS.has(fileExtension(filename));
}

export function isImageFile(filename: string): boolean {
	return IMAGE_EXTENSIONS.has(fileExtension(filename));
}

export function isRenderableMediaFile(filename: string): boolean {
	const ext = fileExtension(filename);
	return IMAGE_EXTENSIONS.has(ext) || PDF_EXTENSIONS.has(ext);
}

export function mediaMimeType(filename: string): string | null {
	return MIME_BY_EXTENSION[fileExtension(filename)] ?? null;
}

export function base64ToDataUrl(base64: string, mimeType: string): string {
	return `data:${mimeType};base64,${base64}`;
}

export function isRenderableMediaPaths(...paths: (string | undefined | null)[]): boolean {
	return paths.some(path => typeof path === 'string' && path && isRenderableMediaFile(path));
}
