# CI playbook: metarouter/ion

How `ion`'s MR pipelines fail, and what fixes each failure. Built from Mike's notes on real failures. Read the failing command and message before choosing a class: failures that look alike can need opposite fixes.

## Review environments

`test-cypress` runs against a per-MR **review env**: a Kubernetes namespace named from the branch's `CI_COMMIT_REF_SLUG`, cut to 50 characters, in the `mr-review1` cluster. Its UI answers at the `review_env_url` in your item. The auto job `deploy-review-env` builds it; the manual jobs `delete-review-env-manual` and `deploy-review-env-manual` rebuild it. `test-cypress` needs the **auto** `deploy-review-env` to have succeeded; the manual deploy alone does not satisfy it. The rebuild command handles all of this.

## Classes

| Signs in the log | Class | Action |
|---|---|---|
| Cypress `cy.task('query')` fails with `connect ECONNREFUSED 127.0.0.1:5432` | Review env broken: the namespace was deleted and not redeployed | Rebuild the review env |
| Cypress fails within minutes, zero tests passing, `relation "hdb_catalog.schema_migrations" does not exist` | Review env broken: the env's Postgres has no persistent volume, and a node scale-down wiped it. Hasura does not re-apply migrations | Rebuild the review env. Retrying Cypress alone never helps |
| `deploy-review-env` fails with `BackoffLimitExceeded`; its log shows repeated `Failed to connect to <release>-hasura port 8080` and `failed to apply pool settings` | Infra, retryable: the `hasura-pool-settings` hook gives up after 12 attempts on a cold or busy node | Retry `deploy-review-env`. If it fails the same way twice, rebuild the review env |
| `reseed-review-env` fails early with `RELEASE_NAMESPACE: unbound variable` | Infra: a symptom of the auto deploy failing, not a branch bug | Retry it only after `deploy-review-env` has succeeded; otherwise fix the deploy first |
| Cypress `.click()` fails because a popup or list never appears | Unknown, leaning flaky: a re-render swallowed the click. A bigger timeout does not help | Retry once. If it fails again the same way, escalate: the spec likely needs to settle the page before clicking |
| Cypress `cy.contains` fails: "Expected to find content ... but never did", and the screenshot shows the content on the page | Infra, retryable: it arrived just too late | Retry once |
| Cypress `.click()` fails because the element is `disabled` | Unknown | Escalate with the element and the spec name |
| The `audit-log.cy.js` test "does not log a phantom Pipeline Tag Updated" fails | Infra, retryable: it depends on the review env's database state | Retry once; if it fails again, rebuild the review env |
| A Cypress run ends with nearly every test `pending` and only one failing | Read the one failure: `cypress-fail-fast` skips everything after the first failure, so the pending tests tell you nothing | Classify the single failure |
| `semver-test` fails | Code: the MR title is not `type(scope): subject` | Escalate: Mike must fix the title |
| `lint`, type check, `untested-check`, or `codeowners-check` fails | Code | Escalate with the first error |
| A unit test (`jest`, `go test`) fails with an assertion error | Code | Escalate with the test name and the assertion |

## Gotchas

- Retrying or playing a job creates a **new job instance**. Pipeline status follows the newest instance of each job name.
- GitLab's `canceling` state is not final. Do not treat a job in `canceling` as finished.
- Cypress failure screenshots stay as job artifacts for about 7 days. They are the fastest way to tell "slow" from "broken".
