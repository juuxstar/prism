---
name: tomas-cleanup
description: Tidies a PR diff by favoring CSS utilities over bespoke styles, inlining one-off locals and tiny single-use helpers. Use when cleaning up the current branch or PR changes, before review, or when the user names tomas-cleanup or Tomas-style cleanup.
disable-model-invocation: true
---

# Tomas cleanup (PR diff)

Apply only to files/lines in the **current PR or working-tree diff** unless the user widens scope. Keep edits minimal and behavior unchanged.

## Rules (verbatim)

- use CSS utility classes as much as possible instead of adding CSS styles (especially for layout like display flex or grid)
- inline any variables used only once whose combined expressions are not longer than 100 characters
- inline any small functions/methods that are used only once. If a helper function is only called from one other function, you can also put the helper function inside the caller function at the end (after any return statements since it is hoisted)

## How to apply

1. **CSS / Vue styles**:
- Prefer existing utility classes from the project’s system (Tailwind, utility partials, etc.)
- remove redundant `display: flex`, `display: grid`, spacing, and alignment from scoped/component CSS when a utility covers the same layout
- use CSS nesting and keep class names short as their compound nested name should describe themselves (eg: instead of `.item-subitem` use nesting like `.item { .sub-item {} }`)
2. **One-off variables**: If a binding is referenced exactly once and inlining the expression is ≤100 characters total, remove the variable and use the expression at the use site.
3. **Single-use functions**: Inline small bodies at the single call site. If a helper is only used by one function, you may move the helper to the **bottom of that caller** (after `return` statements in the caller is fine in JS/TS due to hoisting for `function` declarations; match existing project patterns for `const` helpers vs `function`).

## Constraints

- Do not change public APIs, tests, or copy unless needed for the cleanup.
- If inlining would hurt readability (deep nesting, repeated side effects), leave a short comment or skip—this skill optimizes for the rules above, not maximal inlining at all costs.
