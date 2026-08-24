import { DecoratedRouter, Get, Post } from '@juuxstar/http-decorators';
import type { Request, Response }     from 'express';

import { GitService } from '../lib/GitService.js';

export class GitApi extends DecoratedRouter {

	private gitService: GitService;
	private workspaceDir: string;
	private checkoutHostDir?: string;

	constructor(workspaceDir: string, checkoutHostDir?: string) {
		super();
		this.workspaceDir    = workspaceDir;
		this.checkoutHostDir = checkoutHostDir;
		this.gitService      = new GitService(workspaceDir, undefined, checkoutHostDir);
	}

	@Get('/status')
	@Post('/status')
	async sendStatus(_req: Request, res: Response) {
		res.json(this.gitService.serializeGitWorkspaceStatus(await this.gitService.detectGitWorkspace()));
	}

	@Post('/checkout')
	async checkout(req: Request, res: Response) {
		res.json(await this.authorizedGitService(req.headers.authorization).checkoutPullRequestBranch(req.body?.pr || {}, req.body?.worktreePath));
	}

	@Post('/reset-worktree')
	async resetWorktree(req: Request, res: Response) {
		res.json(await this.authorizedGitService(req.headers.authorization).resetWorktreeToNaturalBranch(req.body?.worktreePath));
	}

	@Post('/pull-worktree')
	async pullWorktree(req: Request, res: Response) {
		res.json(await this.authorizedGitService(req.headers.authorization).pullWorktreeBranch(req.body?.worktreePath));
	}

	@Post('/local-files')
	async localFiles(req: Request, res: Response) {
		res.json(await this.gitService.fetchLocalPullRequestFiles(req.body?.pr || {}));
	}

	@Post('/local-file-content')
	async localFileContent(req: Request, res: Response) {
		res.json(await this.gitService.fetchLocalPullRequestFileContent(req.body?.pr || {}, req.body?.path, req.body?.previousPath, req.body?.status));
	}

	@Post('/local-status')
	async localStatus(req: Request, res: Response) {
		res.json(await this.authorizedGitService(req.headers.authorization).fetchLocalPullRequestStatus(req.body?.pr || {}));
	}

	@Post('/commit')
	async commit(req: Request, res: Response) {
		res.json(await this.authorizedGitService(req.headers.authorization).commitLocalPullRequestChanges(req.body?.pr || {}, req.body?.message));
	}

	@Post('/push')
	async push(req: Request, res: Response) {
		res.json(await this.authorizedGitService(req.headers.authorization).pushLocalPullRequestChanges(req.body?.pr || {}));
	}

	private authorizedGitService(authorization?: unknown): GitService {
		return new GitService(this.workspaceDir, authorization, this.checkoutHostDir);
	}

}
