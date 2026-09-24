import { spawn }         from 'node:child_process';
import path              from 'node:path';
import { fileURLToPath } from 'node:url';
import { styleText }     from 'node:util';

import Yargs from 'yargs';

/**
 * The one entry point for every command this project has, shaped after the sibling frontlobby project's
 * `npmStart.mts`. `package.json` keeps only the npm lifecycle hook and `start`; everything else is
 * `npm start <command>`, with `--help` generated from the declarations below.
 *
 * PRism itself only ever runs in Docker: `up`, `down`, `logs`, `build` and `deploy` all go through Compose or
 * the image. `lint` and `typecheck` read the source rather than run it, so they use the host's
 * `node_modules`, which is the same install the editor's ESLint integration reads.
 */

/** Every spawn runs from here, so `npm start` works from a subdirectory and relative paths mean one thing. */
const root = path.dirname(fileURLToPath(import.meta.url));

/** The Compose file behind each environment. Both run a container named `prism`, so only one can be up at once. */
const composeFiles: Record<Environment, string> = { dev : 'docker-compose.dev.yml', prod : 'docker-compose.yml' };

/** Up here rather than with the helpers: a `const` is not hoisted, and the yargs chain below reads it. */
const environmentPositional = {
	describe : 'dev runs Vite and the server with hot reload; prod runs the production image',
	choices  : [ 'dev', 'prod' ] as const,
	default  : 'dev' as const,
};

const yargs = Yargs(process.argv.slice(2));
const argv  = await yargs
	.scriptName('npm start')
	.usage('$0 <command> [options]')
	.command('up [env]', 'starts PRism in Docker behind the shared web-proxy (dev has Vite hot reload, prod builds the image)', builder => builder
		.positional('env', environmentPositional)
		.option('d', {
			alias    : 'detach',
			describe : 'run in the background instead of following the output',
			type     : 'boolean',
			default  : false,
		}))
	.command('down [env]', 'stops and removes the PRism container', builder => builder
		.positional('env', environmentPositional))
	.command('logs [env]', "follows the PRism container's logs", builder => builder
		.positional('env', environmentPositional))
	.command('build', 'builds the production Docker image')
	.command('deploy <target>', 'builds the linux/amd64 image, uploads it over SSH and restarts it there (needs GITHUB_CLIENT_ID)', builder => builder
		.positional('target', { describe : 'the SSH destination, e.g. ubuntu@example.com', type : 'string', demandOption : true }))
	.command('lint', 'runs ESLint over the project', builder => builder
		.option('f', { alias : 'fix', describe : 'apply the fixes ESLint can make itself', type : 'boolean', default : false }))
	.command('typecheck', 'typechecks the client and the server without emitting')
	.help('h')
	.alias('h', 'help')
	.wrap(yargs.terminalWidth())
	.demandCommand(1, 'Which command? `npm start -- --help` lists them.')
	.strict()
	.argv
;

/** The child currently running, so a termination reaches it rather than orphaning it. */
let running: ChildProcess | undefined;

// Ctrl+C already reaches the child, which shares this terminal's process group, so this process only has to
// outlive it. Forwarding it as well would be a second interrupt, which Compose reads as "kill now, skip the stop".
process.on('SIGINT', () => {});
process.on('SIGTERM', () => running?.kill('SIGTERM'));

process.exitCode = await dispatch().catch((error: Error) => {
	console.error(styleText('red', `npm start: ${error.message}`));
	return 1;
});

/** Runs the command yargs settled on, and answers with the exit code it should carry. */
async function dispatch(): Promise<number> {
	const command = String(argv._[0]);
	const env     = argv.env as Environment;

	switch (command) {
		case 'up':
			return run('docker', [ ...compose(env), 'up', ...(env === 'prod' ? [ '--build' ] : []), ...(argv.detach ? [ '--detach' ] : []) ]);
		case 'down':
			return run('docker', [ ...compose(env), 'down' ]);
		case 'logs':
			return run('docker', [ ...compose(env), 'logs', '--follow', 'prism' ]);
		case 'build':
			return run('docker', [ ...compose('prod'), 'build' ]);
		case 'deploy':
			return run('sh', [ 'scripts/deploy-image.sh', argv.target as string ]);
		case 'lint':
			return run(bin('eslint'), [ ...(argv.fix ? [ '--fix' ] : []), '.' ]);
		case 'typecheck':
			return typecheck();
		default:
			// `.strict()` rejects anything undeclared, so reaching here means a declared command lost its case.
			throw new Error(`"${command}" is a declared command with no handler — add a case for it in npmStart.mts`);
	}
}

/**
 * Both halves, even after one fails, so a long-standing error in one cannot hide what the other would report.
 * The server is only otherwise compiled inside the Docker build, so this is where its type errors surface on the host.
 */
async function typecheck(): Promise<number> {
	const checks: [ string, string, string[] ][] = [
		[ 'client', bin('vue-tsc'), [ '--noEmit' ] ],
		[ 'server', bin('tsc'), [ '--noEmit', '-p', 'src/server/tsconfig.json' ] ],
	];
	const failed: string[] = [];

	for (const [ name, command, args ] of checks) {
		console.info(styleText('blueBright', `typechecking ${name}...`));
		if (await run(command, args) !== 0) {
			failed.push(name);
		}
	}

	if (failed.length) {
		throw new Error(`typecheck failed: ${failed.join(', ')}`);
	}
	return 0;
}

function compose(env: Environment): string[] {
	return [ 'compose', '-f', composeFiles[env] ];
}

/**
 * A dependency's executable, by path. `node_modules/.bin` is on PATH only when npm is the process invoking
 * this one, and `node npmStart.mts lint` has to work as well as `npm start lint` does.
 */
function bin(name: string): string {
	return path.join(root, 'node_modules', '.bin', name);
}

/** Runs one command to completion and answers with its exit code. Never through a shell. */
function run(command: string, args: string[]): Promise<number> {
	console.info(styleText('blueBright', [ command.startsWith(root) ? path.relative(root, command) : command, ...args ].join(' ')));

	return new Promise((resolve, reject) => {
		running = spawn(command, args, { cwd : root, stdio : 'inherit', shell : false });

		running.on('error', reject);
		// A signalled child is a failed run, and its `code` is null, so it cannot be passed through as-is.
		running.on('exit', (code, signal) => {
			running = undefined;
			resolve(signal ? 1 : code ?? 1);
		});
	});
}

type Environment = 'dev' | 'prod';

type ChildProcess = ReturnType<typeof spawn>;
