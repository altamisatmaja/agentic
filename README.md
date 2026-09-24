# agentic

A Claude Code plugin marketplace with a collection of skills.

## Install

```
/plugin marketplace add altamisatmaja/agentic
/plugin install sit-integrator@agentic
```

## Contents

| Plugin | Skill | Purpose |
|---|---|---|
| `sit-integrator` | `snap-sit-runner` | SIT/UAT test runners for SNAP BI APIs: RSA/HMAC signatures, scenarios, response codes, evidence logs, Node.js runner scaffold |
| | `aspi-devsite` | ASPI devsite & Client Simulator: credentials, utility signatures, devsite scenarios, PDF evidence |

## Layout

```
.claude-plugin/marketplace.json
plugins/
  sit-integrator/
    .claude-plugin/plugin.json
    skills/
      snap-sit-runner/   SKILL.md, references/, assets/ (runner scaffold)
      aspi-devsite/      SKILL.md, references/
```

To add a skill, create `plugins/<plugin>/skills/<name>/SKILL.md`. To add a plugin, create
`plugins/<plugin>/.claude-plugin/plugin.json` and register it in `marketplace.json`.

This repo is public: never commit credentials, private keys, cookies, internal hosts, or customer data.
