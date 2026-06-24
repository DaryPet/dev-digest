# Ports & adapters — adding an external dependency

Any new side effect — an external API, a CLI tool, a clock, a queue, a cache —
goes **behind a port**, never inline in a service. A service that calls
`fetch()` or `new Octokit()` directly has pulled infrastructure into the
application layer and breaks the dependency rule.

## The four steps

### 1. Define the port (the interface) in `@devdigest/shared`

The abstraction lives at the centre, so inner layers can depend on it. Add it to
`server/src/vendor/shared/adapters.ts` (or a new contract file, re-exported from
`index.ts`). Keep it minimal — only the methods the app needs.

```ts
// server/src/vendor/shared/adapters.ts
export interface NotifierClient {
  send(channel: string, message: string): Promise<void>;
}
```

### 2. Implement the adapter under `adapters/<x>/`

The adapter imports its SDK and the port. Nothing else in the app reaches into
this file.

```ts
// server/src/adapters/notifier/slack.ts
import type { NotifierClient } from '@devdigest/shared';
import { WebClient } from '@slack/web-api';

export class SlackNotifier implements NotifierClient {
  private client: WebClient;
  constructor(token: string) {
    this.client = new WebClient(token);
  }
  async send(channel: string, message: string): Promise<void> {
    await this.client.chat.postMessage({ channel, text: message });
  }
}
```

### 3. Wire it in the composition root (`platform/container.ts`)

Add a lazily-constructed getter and a `ContainerOverrides` field. Secrets are
resolved through `SecretsProvider`, mirroring `github()` / `llm()`.

```ts
export interface ContainerOverrides {
  // …existing…
  notifier?: NotifierClient;
}

// inside Container:
private _notifier?: NotifierClient;

async notifier(): Promise<NotifierClient> {
  if (this.overrides.notifier) return this.overrides.notifier;
  if (this._notifier) return this._notifier;
  const token = await this.secrets.get('SLACK_TOKEN');
  if (!token) throw new ConfigError('SLACK_TOKEN is not configured');
  this._notifier = new SlackNotifier(token);
  return this._notifier;
}
```

If the secret can change at runtime, clear the cache in
`invalidateSecretCaches()` too.

### 4. Consume it through the interface only

```ts
// modules/<name>/service.ts
const notifier = await this.container.notifier();
await notifier.send('#reviews', `Review ${reviewId} done`);
```

The service names `NotifierClient` (the port) — never `SlackNotifier`.

## Testing falls out for free

```ts
const container = new Container(config, db, {
  notifier: { send: vi.fn(async () => {}) },
});
```

No real Slack call, no network. This is exactly how the existing adapters
(`llm`, `github`, `git`, `embedder`, `codeIndex`, `repoIntel`) are mocked.

## Rules of thumb

- One port = one cohesive capability. Don't make a god-interface.
- The port is phrased in the app's language, not the SDK's. If the SDK changes,
  the adapter absorbs it; the port and every caller stay put.
- Lazy construction in the container means a feature that isn't used makes zero
  external calls (e.g. embeddings are gated *before* the client is built).
- Adapters must not import `modules/*`. If an adapter "needs" module logic, the
  abstraction is wrong — push the logic into the service.
