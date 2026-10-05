# Dependency security

## Keep fixes in the dependency graph

Checked on 2026-10-05 against `origin/develop` (released 0.6.6). Update only affected lockfile resolutions; keep runtime source, package version, and unrelated tools unchanged. No overrides, advisory ignores, or custom cryptography.

| Package | Before | After | Route / reason |
| --- | --- | --- | --- |
| brace-expansion | 1.1.16 | 1.1.21 | minimatch 3.1.5 (ESLint / web-ext); satisfies `^1.1.7` and fixes the CPU denial-of-service advisories |
| js-yaml | 4.3.0 | 4.3.2 | @eslint/eslintrc 3.3.6; satisfies `^4.1.1` and fixes both high CPU-consumption alerts |
| esbuild | 0.27.7 | 0.28.1 | Vite 8.3.2 / unplugin 3.4.0 optional peers; fixes Windows development-server file reads |
| node-forge | 1.4.0 | 1.4.0 | web-ext 10.7.0 → @devicefarmer/adbkit 3.3.9; no published fix |

Vite already accepts esbuild `^0.27.0 || ^0.28.0`; unplugin accepts `*`. No upstream tool bump or new direct dependency is necessary. esbuild's platform packages move with esbuild. `package.json` remains unchanged.

Registry queries confirmed the selected patches exist. Current npm latest versions were brace-expansion 5.0.12, js-yaml 5.4.2, esbuild 0.28.2, node-forge 1.4.0, Vite 8.3.2, WXT 0.21.4, web-ext 10.7.0, and @devicefarmer/adbkit 3.3.9. Use the first patched compatible versions, not unrelated major upgrades.

## Tracked limitation: node-forge RSA verification

[GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) is high severity and affects node-forge through 1.4.0. GitHub reports no `first_patched_version`; npm latest is still 1.4.0. The latest adbkit still requests `^1.3.1`, and latest web-ext still depends on adbkit 3.3.9. Keep the alert open, not dismissed or suppressed. Recheck node-forge and this upstream chain when a fix ships, then update the lockfile and rerun checks.

Malformed nested DigestAlgorithm elements can permit forged RSA PKCS#1 v1.5 signatures for arbitrary messages with low-exponent RSA keys. This remains installed in development tooling through both direct web-ext and WXT's web-ext dependency. adbkit's TCP/USB authentication socket calls RSA `key.verify` on received signatures, so it is not safe to claim the vulnerable API is unreachable. Treat Android/ADB authentication tooling that processes attacker-controlled signatures as exposed until patched; avoid untrusted ADB peers. This dependency is not in the extension's production dependency graph; this update does not claim to repair node-forge or remove the development exposure.

## Verification

- `pnpm install --frozen-lockfile`: passed, including WXT prepare and esbuild postinstall.
- `pnpm run compile`: passed.
- `pnpm test`: production Chrome build and all 98 unit tests (11 files) passed.
- Full `pnpm audit --json`: before 9 advisories (7 high, 1 moderate, 1 low); after 1 high, node-forge only. Nonzero audit exit remains expected.
- `pnpm audit --prod --json`: zero advisories.
- `pnpm run test:e2e`: production Chrome build and all 24 Chromium browser tests passed.

Commands were run with the repository-pinned pnpm 11.28.3 via `corepack pnpm` on Node 24.21.0 / Linux. Only the three affected packages and esbuild platform binaries change in the lockfile.
