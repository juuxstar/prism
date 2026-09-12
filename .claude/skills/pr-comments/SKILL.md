---
name: pr-comments
description: Read the unresolved review comments on a pull request, make the requested changes one commit per thread, then reply to each thread and resolve the ones that were acted on. Use when the user asks to work on PR comments, review feedback, or comments they left in PRism or on GitHub.
---

# Work a PR's review comments

Comments left in PRism and comments left on github.com are the same GitHub objects, so this
works for both. PRism stamps each comment with `<!-- review-type:... -->`
(see `formatCommentBody` in `src/client/lib/api/githubClient.ts`) — that marker is the author's
intent, so read it before deciding what to do.

## 1. Find the PR

Use the number or URL the user gave. Otherwise take the PR for the current branch:

```bash
gh pr view --json number,headRefName,headRefOid
```

If there is no PR for this branch, say so and stop.

## 2. Fetch the threads

```bash
gh api graphql -f query='
query($owner:String!,$repo:String!,$num:Int!){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$num){
      headRefOid
      reviewThreads(first:100){
        nodes{
          id isResolved isOutdated path line startLine
          comments(first:20){ nodes{ databaseId author{login} body createdAt diffHunk } }
        }
      }
    }
  }
}' -F owner=OWNER -F repo=REPO -F num=N
```

Skip a thread when any of these hold:

- `isResolved` is true
- its newest comment contains `<!-- claude-handled -->` — that is a reply from a previous run,
  so the thread is already answered and re-running must not touch it again

An `isOutdated` thread still counts: the feedback may be live even though the line moved. Read the
current file rather than trusting `diffHunk`.

## 3. Confirm the plan

List the surviving threads grouped by file, in line order — path, line, review-type, and a
one-line gist of the ask. Then work them in that order. Do not ask permission per thread.

## 4. Act, by review-type

| Marker | Action |
| --- | --- |
| `change-required` | Make the edit. |
| `suggestion` | Apply it, unless it is wrong or makes the code worse — then leave the code alone and explain in the reply. |
| `question` | Answer only. **Never** change code for a question unless the answer is "you're right, that is a bug", and say so in the reply. |

A comment with no marker was likely written on github.com: read the prose and judge which of the
three it is.

Follow the repo's own conventions while editing — `AGENTS.md` at the root, and the
`tomas-cleanup` rules in `.agents/skills/tomas-cleanup/SKILL.md` for style.

## 5. One commit per thread

Commit each thread's change on its own, before starting the next. Message in the repo's existing
style — imperative, sentence case, no prefix or scope, e.g. `Re-pair files GitHub reports as an
unrelated delete and add`. End it with the session's standard `Co-Authored-By` trailer.

Threads that produced no code change (questions, declined suggestions) get no commit.

Push once, after every commit is made — the replies cite shas, so they must exist on the remote first.

## 6. Reply, then resolve

Reply to each thread at its **first** comment's `databaseId`:

```bash
gh api repos/OWNER/REPO/pulls/N/comments/COMMENT_ID/replies -f body='...'
```

Every reply body ends with `<!-- claude-handled -->` on its own line so later runs skip the thread.
Say what was done and cite the commit sha, or say why nothing was done.

Then resolve — **only** threads where code actually changed:

```bash
gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -F id=THREAD_ID
```

Never resolve:

- a **question** — the user has to read the answer, and a resolved thread hides it
- a suggestion declined, or a thread where the ask was misread or only partly met

## 7. Report

One table: thread, what changed, commit sha, replied, resolved yes/no. Then call out anything
left open and why, so the user knows what still needs their eyes.
