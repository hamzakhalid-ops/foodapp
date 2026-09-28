# Claude Code skills

Third-party skills vendored verbatim so Claude Code discovers them in this repository.

| Source | Commit | License | Skills |
|--------|--------|---------|--------|
| https://github.com/JuliusBrussee/caveman (`skills/`) | `2fd153c` | MIT (`LICENSE-caveman`) | cavecrew, caveman, caveman-commit, caveman-compress, caveman-discover, caveman-evidence-review, caveman-explore, caveman-help, caveman-learn, caveman-manage, caveman-optimize, caveman-review, caveman-setup, caveman-stats, investigate-first, lean-build, migration, safe-refactor, surgical-patch, verify-and-stop |
| https://github.com/DietrichGebert/ponytail (`skills/`) | `e3ba2aa` | MIT (`LICENSE-ponytail`) | ponytail, ponytail-audit, ponytail-debt, ponytail-gain, ponytail-help, ponytail-review |

Notes:

* `caveman-setup` routes LLM API traffic through the third-party Caveman gateway (`gateway.caveman.so`) when used. QuickBite has no LLM integration; do not apply it to this codebase without an approved decision.
* `caveman-compress` includes Python scripts that call the Claude API/CLI when run.
* Skills never override `CLAUDE.md` or the specifications in `docs/`.
* Excluded from Prettier and the doc-link check (vendored content). To update, re-copy from upstream and bump the commit above.
