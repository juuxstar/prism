/** GitHub.com status (Statuspage) — pull/API/git areas that affect PRism. */
const SUMMARY_URL          = 'https://www.githubstatus.com/api/v2/summary.json';
const DASHBOARD_COMPONENTS = [ 'Pull Requests', 'API Requests', 'Git Operations' ] as const;

interface StatuspageSummary {
	page: { updated_at: string };
	status: {
		description: string;
		indicator: string;
	};
	components: {
		name: string;
		status: string;
	}[];
}

export type GithubStatusBannerLevel = 'warning' | 'critical';

export type GithubDashboardStatusResult =
	| { showBanner: false }
	| { showBanner: true; message: string; level: GithubStatusBannerLevel; fingerprint: string };

function formatComponentStatus(status: string): string {
	return status.split('_').join(' ');
}

function keySeverity(status: string): 'ok' | 'warn' | 'bad' {
	if (status === 'operational') {
		return 'ok';
	}
	if (status === 'degraded_performance' || status === 'under_maintenance') {
		return 'warn';
	}
	return status === 'partial_outage' || status === 'major_outage' ? 'bad' : 'warn';
}

function levelFromPageIndicator(
	indicator: string
): 'ok' | 'warn' | 'bad' {
	switch (indicator) {
		case 'none':
			return 'ok';
		case 'minor':
			return 'warn';
		case 'major':
		case 'critical':
			return 'bad';
		default:
			return 'warn';
	}
}

function combinedLevel(
	page: 'ok' | 'warn' | 'bad',
	keys: ('ok' | 'warn' | 'bad')[]
): 'ok' | 'warn' | 'bad' {
	const rank = (x: 'ok' | 'warn' | 'bad'): number => {
		if (x === 'ok') {
			return 0;
		}
		return x === 'warn' ? 1 : 2;
	};
	const worst = (a: 'ok' | 'warn' | 'bad', b: 'ok' | 'warn' | 'bad') => (rank(a) >= rank(b) ? a : b);
	return keys.reduce((acc, k) => worst(acc, k), page);
}

/**
 * Fetches the public summary from githubstatus.com and reports whether PRism should show a notice.
 * Safe to call from the browser (CORS allows `*`).
 */
export async function fetchGithubDashboardStatus(): Promise<GithubDashboardStatusResult> {
	const res = await fetch(SUMMARY_URL);
	if (!res.ok) {
		return { showBanner : false };
	}
	const data      = (await res.json()) as StatuspageSummary;
	const pageLevel = levelFromPageIndicator(data.status.indicator);
	const key: { name: string; status: string }[] = [];
	for (const name of DASHBOARD_COMPONENTS) {
		const c = data.components.find(x => x.name === name);
		if (c) {
			key.push({ name, status : c.status });
		}
	}
	const keyLevels = key.map(c => keySeverity(c.status));
	const overall   = combinedLevel(pageLevel, keyLevels);
	if (overall === 'ok') {
		return { showBanner : false };
	}
	const messageParts = [ data.status.description ];
	const degradedKeys = key.filter(c => c.status !== 'operational');
	if (degradedKeys.length > 0) {
		messageParts.push(
			`PRism: ${degradedKeys.map(c => `${c.name} — ${formatComponentStatus(c.status)}`).join('; ')}`
		);
	}
	const level: GithubStatusBannerLevel = overall === 'bad' ? 'critical' : 'warning';
	const fingerprint
		= [ data.status.indicator, data.page.updated_at, key.map(c => `${c.name}:${c.status}`).join('|') ].join(
			'§'
		);
	return { showBanner : true, message : messageParts.join(' '), level, fingerprint };
}
