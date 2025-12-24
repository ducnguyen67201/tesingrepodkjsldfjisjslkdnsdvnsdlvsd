<div align="center">

<img src="docs/images/banner.png" alt="CognObserve Banner" width="100%"/>

<h3>Open Source LLM Observability Platform</h3>

<p>
<a href="#traces">Traces</a>, <a href="#alerts">alerts</a>, <a href="#prompt-management">prompt management</a>, <a href="#cost-analytics">cost analytics</a>, and <a href="#rca">root cause analysis</a><br/>
to debug and improve your LLM application.
</p>

<br/>

**[Cloud](https://cognobserve.com)** · **[Self Host](#-self-hosting)** · **[Demo](https://demo.cognobserve.com)**

[Docs](https://docs.cognobserve.com) · [Report Bug](https://github.com/cognobserve/cognobserve/issues) · [Feature Request](https://github.com/cognobserve/cognobserve/issues) · [Changelog](CHANGELOG.md) · [Roadmap](ROADMAP.md)

<br/>

[![License MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6.svg)](https://www.typescriptlang.org/)
[![Discord](https://img.shields.io/discord/1234567890?color=7289da&label=Discord&logo=discord&logoColor=white)](https://discord.gg/cognobserve)
[![Twitter Follow](https://img.shields.io/twitter/follow/cognobserve?style=social)](https://twitter.com/cognobserve)

</div>

---

CognObserve is an **open source LLM observability** platform. It helps teams collaboratively **develop, monitor, evaluate, and debug** AI applications. CognObserve can be **self-hosted in minutes** and is designed for production workloads.

<div align="center">
<img src="docs/images/demo.gif" alt="CognObserve Demo" width="90%"/>
</div>

---

## ✨ Features

- **[LLM Observability](#traces)**: Instrument your app and start ingesting traces, tracking LLM calls, embeddings, retrievals, and agent actions. Inspect and debug complex logs and user sessions with our interactive trace viewer.

- **[Prompt Management](#prompt-management)**: Centrally manage, version control, and collaboratively iterate on your prompts. With strong caching on server and client side, you can iterate on prompts without adding latency to your application.

- **[Cost Analytics](#cost-analytics)**: Track token usage and costs across models, features, and users. Set budgets and get alerts before costs spiral out of control.

- **[Smart Alerting](#alerts)**: Get notified when error rates spike, latency increases, or costs exceed thresholds. Supports Discord, Slack, Email, and webhooks.

- **[Root Cause Analysis](#rca)**: When incidents occur, AI-powered RCA automatically correlates traces, code changes, and system metrics to identify the root cause.

- **[GitHub Integration](#github)**: Link production issues to code changes. Know exactly which commit or PR caused a regression.

---

## Prompt Management

Prompt A/B testing lets you compare two prompt versions and route live traffic
to each variant while tracking usage, latency, cost, and error rate.

### Prompt A/B Testing UI (Mock)

```text
+--------------------------------------------------------------------------------+
| Prompts / Experiments                                                          |
+-------------------------------+------------------------------------------------+
| Prompt List                   | Experiment: checkout-copy-test                |
| - checkout-copy (v5)          | Status: RUNNING   Allocation: 50%             |
| - checkout-copy (v6)          | Variants:                                      |
| - onboarding (v3)             |  A (control): checkout-copy v5   Weight: 50%  |
|                               |  B:           checkout-copy v6   Weight: 50%  |
|                               |                                                |
|                               | [Compare A vs B] [Pause] [End] [Promote B]     |
|                               +------------------------------------------------+
|                               | Metrics (last 7 days)                          |
|                               |  Variant   Usage   P95 Latency   Cost   Errors |
|                               |  A         12,430  420ms         $14.22 1.2%   |
|                               |  B         12,201  398ms         $13.80 1.1%   |
|                               +------------------------------------------------+
|                               | Diff                                           |
|                               | - system: You are an expert support agent...   |
|                               | + system: You are a concise support agent...   |
+--------------------------------------------------------------------------------+
```

---

## 📦 Self Hosting

CognObserve can be self-hosted using Docker Compose:

```bash
git clone https://github.com/cognobserve/cognobserve.git
cd cognobserve
docker compose up -d
```

For detailed deployment options, see the [Self Hosting Guide](https://docs.cognobserve.com/self-hosting).

---

## 🔌 Integrations

| Integration | Supports | Description |
|-------------|----------|-------------|
| [SDK](https://docs.cognobserve.com/sdk) | JS/TS | Manual instrumentation using the SDK for full flexibility |
| [OpenAI](https://docs.cognobserve.com/integrations/openai) | JS/TS | Automated instrumentation using drop-in replacement |
| [Anthropic](https://docs.cognobserve.com/integrations/anthropic) | JS/TS | Automated instrumentation for Claude models |
| [LangChain](https://docs.cognobserve.com/integrations/langchain) | JS/TS | Callback handler for LangChain applications |
| [Vercel AI SDK](https://docs.cognobserve.com/integrations/vercel-ai) | JS/TS | Integration for Vercel AI SDK applications |
| [OpenTelemetry](https://docs.cognobserve.com/integrations/otel) | Any | Native OTLP support for any language |
| [API](https://docs.cognobserve.com/api) | Any | Directly call the public API. OpenAPI spec available |

---

## 📚 Resources

- [Documentation](https://docs.cognobserve.com)
- [API Reference](https://docs.cognobserve.com/api)
- [Blog](https://cognobserve.com/blog)
- [Discord Community](https://discord.gg/cognobserve)

---

## 👨‍💻 Contributors

<table>
<tr>
<td align="center">
<a href="https://github.com/ducnguyen67201">
<img src="https://github.com/ducnguyen67201.png" width="100px;" alt="Duc Nguyen"/>
<br />
<sub><b>Duc Nguyen</b></sub>
</a>
<br />
<sub>Creator & Maintainer</sub>
</td>
</tr>
</table>

**Duc Nguyen** — Just a guy who loves building software and shipping things that actually work. Was addicted to coffee, had to downgrade to tea (the betrayal 🍵). When not shipping code, I'm climbing rocks 🧗 — as hardcore as I ship. Built CognObserve because debugging LLMs shouldn't feel like bouldering with no pads.

[GitHub](https://github.com/ducnguyen67201) · [LinkedIn](https://www.linkedin.com/in/ducnguyen6721/)

---

<div align="center">

**Built with ❤️ for the AI community**

</div>
