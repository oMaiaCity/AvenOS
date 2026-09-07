# Repository writing standard

Status: authoritative

Repository documentation should make sense to somebody who cares about the work
avenOS helps them do before it asks them to understand Tauri, tenant grants, database
roles, or Pulumi. It must remain precise enough that a developer or operator can act
without finding a different procedure in the next guide.

These rules apply to READMEs, handbook chapters, architectural papers, examples,
errors, and operator-facing command output. A normative specification may favor exact
definitions over conversational prose, but it uses the same names and factual
boundaries.

## Begin with why the reader would care

- Open with the purpose in ordinary language and the experience it enables.
- Describe what somebody can do before listing packages, processes, protocols, or
  infrastructure.
- Do not announce personas or begin with “this repository is a monorepo.” Write one
  natural path that a curious reader can follow into deeper technical material.
- Surface a genuine blocker or important limit before a fast path would run into it.

## Reveal detail in layers

1. Explain the purpose and ordinary experience.
2. Give a short map of the available capabilities.
3. Introduce the choices, trust boundaries, and important limits.
4. Link to the document that owns the exact procedure or rule.

Start from the state a reader is likely to have. Put commands where somebody is ready
to run something, not in a section that is still explaining what a capability does.
Remove a section when another document already answers the question and the overview
does not need the answer to tell its story.

Use a table for repeated comparisons. Use a diagram only when it makes a sequence or
relationship easier to understand than a short paragraph.

## Give each document one job

- `README.md` explains the product, current experience, boundaries, limits, repository
  map, and shortest local path.
- `docs/operations/` alone owns setup, build and test, local operation, deployment,
  access, maintenance, recovery, and incident procedures.
- Normative architecture papers own their declared platform rules. Current-state maps
  describe implemented behavior and named gaps.
- Component READMEs explain component internals and link to shared procedures.
- Historical implementation plans belong in Git history.

Link to deeper material when the reader first needs it. Name what the linked section
contains; avoid bare “learn more” links.

## Sound direct, relaxed, and specific

- Use plain language, short sentences, and concrete verbs.
- Introduce a technical term when it first becomes useful and explain it once.
- State behavior instead of praising it as simple, clear, secure, reliable, or
  production-ready.
- Remove scene-setting filler, marketing claims, imagined interface copy, and project
  history that does not change the reader's action.
- Attribute actions to the component or person that performs them. Pulumi creates a
  host; an operator approves a protected run; a workflow writes a handoff file.

## State claims and limits together

- Put a limitation beside the capability it qualifies instead of collecting all
  caveats at the end.
- Describe implemented behavior in the present tense. Label planned and unsupported
  behavior explicitly.
- Distinguish a tested composition from a general guarantee. Name what an E2E test
  proves and what remains outside it.
- Separate a platform invariant from a default, a deployment choice, and a current
  implementation detail.
- Do not invent fields, actors, UI messages, recovery behavior, or guarantees that the
  code does not provide.

## Write procedures that fail safely

- State prerequisites when they become necessary, the success condition, and the safe
  stopping point.
- Put commands in copyable blocks and say where to run them.
- Name destructive effects before the command. Never hide data deletion in a generic
  cleanup step.
- Separate required actions from optional diagnostics and background explanation.
- Name secrets by identifier and purpose, never by value. State where each secret
  belongs and what consumes it.
- Ensure examples agree with the released interface and include the guards needed to
  avoid the obvious unsafe path.

## Keep project language consistent

- Follow the authoritative [product model](product-model.md). Use **Aven** for the AI
  collaborator, **avenCEO** for the current product composition, and **avenOS** for the
  open-source foundation. They are not interchangeable.
- Use **Intent** for the durable thread representing one piece of work and **Actor**
  for an executable participant in that work.
- Use **customer environment** for the stable product and lifecycle boundary and
  **customer database** for its current physical database.
- Use `next` for the staging platform environment, **production** for the customer-facing
  platform environment, and **identity** for their shared `aven.id` control plane.
- Use **local** only for resources on the developer's machine.
- Do not translate customer-database isolation into an end-to-end encryption claim or
  source availability into proven portability.

## Keep documentation correct

1. Check names, defaults, routes, roles, commands, output, and lifecycle behavior
   against the code.
2. Search all Markdown files for the old term or claim.
3. Update the owning document in the same change as a command, workflow, secret,
   public endpoint, deployment, or recovery behavior.
4. Run the documented command or identify it as an unexecuted example.
5. Follow new relative links and search references before deleting or renaming a page.
6. Remove stale instructions instead of preserving redirects. Git is the archive.
7. Follow the repository-wide `AGENTS.md` and run `bun run check:docs`.

CI checks links and headings, documented root commands, the authoritative document
set, and coverage of deployment workflow secrets and variables. It cannot prove the
meaning of prose. Semantic accuracy remains a required pull-request review.

Before merging, ask whether the opening explains why the subject matters, whether
detail arrives when it becomes useful, whether claims carry their limits, and whether
another document tells a conflicting story. Remove any sentence that does not help a
reader understand the system or act on it.
