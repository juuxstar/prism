export function formatDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const seconds      = totalSeconds % 60;
	const totalMinutes = Math.floor(totalSeconds / 60);
	const minutes      = totalMinutes % 60;
	const hours        = Math.floor(totalMinutes / 60);

	if (hours > 0) {
		return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
	}
	if (totalMinutes > 0) {
		return seconds > 0 ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`;
	}
	return `${totalSeconds}s`;
}

export function timeAgo(dateString: string): string {
	const now     = new Date();
	const date    = new Date(dateString);
	const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
	if (seconds < 60) {
		return 'just now';
	}
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}
	const days = Math.floor(hours / 24);
	if (days < 30) {
		return `${days}d ago`;
	}
	const months = Math.floor(days / 30);
	return `${months}mo ago`;
}

export function toCursorFileHref(path: string): string {
	const absolutePath = path.startsWith('/') ? path : `/${path}`;
	return encodeURI(`cursor://file${absolutePath}`);
}
