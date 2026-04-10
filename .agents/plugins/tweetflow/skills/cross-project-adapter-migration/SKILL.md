---
name: cross-project-adapter-migration
description: Migrate commands from an external CLI project into OpenCLI adapters.
---

# Cross-Project Adapter Migration

Use this skill when the user wants to import commands from another CLI project into `opencli`.

Use the TweetFlow wrapper for every `opencli` command in this skill:

```bash
../../scripts/tweetflow-opencli
```

## Preconditions

Before starting, confirm the TweetFlow runtime is available:

```bash
../../scripts/tweetflow-opencli --version
```

## Steps

1. Clone the source CLI project for analysis:

```bash
git clone <source_repo_url> /tmp/<source-cli>
```

2. Analyze the source project and list:
   - all commands
   - auth method
   - API endpoints
   - output fields

3. Check existing OpenCLI adapters for the target site:

```bash
ls src/clis/<site>/
../../scripts/tweetflow-opencli list | grep <site>
```

4. Generate a comparison matrix table (`source commands` vs `opencli existing`) and mark each command as:
   - `New`
   - `Enhance`
   - `Skip`

Ask the user to confirm which commands to migrate.

5. Implement YAML read adapters first for the simple high-ROI cases. Place them in:

```bash
src/clis/<site>/<name>.yaml
```

6. Implement TypeScript read adapters for GraphQL, pagination, signing, or similar complex cases:

```bash
src/clis/<site>/<name>.ts
```

7. Implement TypeScript write adapters with `Strategy.UI` or `Strategy.COOKIE`:

```bash
src/clis/<site>/<name>.ts
```

8. Verify the build:

```bash
npx tsc --noEmit
```

9. Verify commands are registered:

```bash
../../scripts/tweetflow-opencli list | grep <site>
```

10. Run each new command to verify it works:

```bash
../../scripts/tweetflow-opencli <site> <command> --limit 3 -f json
```

11. Update `README.md` with new command examples in the correct platform section.

12. Update `SKILL.md` command references with the new commands.

13. Commit and push:

```bash
git add -A
git commit -m "feat(<site>): migrate <N> commands from <source-cli>"
git push
```
