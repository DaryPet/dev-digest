# Onion Architecture (backend) — research

Собрано для skill `.claude/skills/onion-architecture/` — он форсит единую
слоистую архитектуру для НОВЫХ бекенд-модулей в `server/`. Скил не дублирует
уже существующие `.claude/skills/fastify-best-practices/`,
`.claude/skills/drizzle-orm-patterns/`, `.claude/skills/zod/` — он стоит НАД
ними и говорит, в каком слое живёт их код и куда могут указывать импорты.

## Главный вывод: проект уже почти Onion — его надо назвать и зафорсить

Текущий стек DevDigest почти один-в-один ложится на слои Onion. Задача скила —
зафиксировать этот маппинг, сделать его обязательным шаблоном для новых модулей
и добавить инструмент, который роняет проверку при нарушении.

| Слой Onion | Где живёт сейчас | Инструмент |
|---|---|---|
| **Domain core** (чистый, без сайд-эффектов) | `reviewer-core/` — «diff → prompt → LLM → findings», единственный сайд-эффект — инъектированный `LLMProvider` | только TypeScript |
| **Ports / контракты** (абстракции) | `@devdigest/shared` (`server/src/vendor/shared`) — `LLMProvider`, `GitHubClient`, `AuthProvider`, `Embedder`, `CodeIndex`… + Zod-контракты | Zod |
| **Application services** (оркестрация юз-кейсов) | `modules/<name>/service.ts` (напр. `ReviewService`) — зависит от интерфейсов через `Container`, а не от конкретных адаптеров | — |
| **Infrastructure: data access** | `modules/<name>/repository.ts` — явно «ЕДИНСТВЕННЫЙ слой, который трогает БД» | Drizzle + postgres |
| **Infrastructure: внешние адаптеры** | `server/src/adapters/{llm,github,git,auth,secrets,embedder,codeindex,…}` — конкретные реализации портов | octokit, simple-git, anthropic/openai SDK |
| **Presentation** (доставка) | `modules/<name>/routes.ts` — Fastify-плагины, регистрируются в `modules/index.ts` | Fastify + `fastify-type-provider-zod` |
| **Composition root** (сборка всего) | `platform/container.ts` — ручной DI; тесты инжектят моки через `ContainerOverrides` | — |

Сильные сигналы Onion уже в коде:
- `reviewer-core/AGENTS.md`: *«Stay pure — no Fastify/Next/DB/fs imports. New
  side effects go behind an injected port, never inline.»*
- `repository.ts`: *«the ONLY layer touching the DB»*.
- `_shared/context.ts` (`getContext()`) централизует tenancy, чтобы scoping не
  забывали.
- `container.ts` лениво резолвит порты и — единственное место, где называются
  конкретные классы адаптеров.
- В `server/package.json` уже есть зависимость `dependency-cruiser` (сейчас
  используется только внутри dep-graph адаптера) — это ровно тот инструмент,
  чтобы ЗАФОРСИТЬ правило зависимостей.

## Ключевые best practices (внешний консенсус)

- **Единственное правило, определяющее Onion:** зависимости направлены ТОЛЬКО
  внутрь. Внутренние слои ничего не знают о внешних — никакого SQL, HTTP или
  типов фреймворка в ядре.
- Разделение слоёв достигается через **интерфейсы + dependency inversion**:
  внутренние слои зависят от абстракций, внешние их реализуют. (В проекте — это
  порты `@devdigest/shared` + контейнер.)
- **Пробел TypeScript:** в отличие от .NET, ничто не мешает разработчику
  импортировать через запрещённую границу — код всё равно скомпилируется.
  Поэтому архитектуру надо форсить инструментом (`dependency-cruiser` правила
  `forbidden` или `eslint-plugin-boundaries`), желательно в CI.
- Onion / Clean / Hexagonal — одна и та же идея под разными именами. Код
  DevDigest ближе всего к **Hexagonal ports-and-adapters в терминологии слоёв
  Onion (DDD)** — это стоит проговорить явно, чтобы скил не вводил 4-й словарь.
- Тестируемость: если соблюдать правило зависимостей, доменный код имеет 0
  зависимостей и тривиально тестируется на абстракциях (в проекте — через
  `ContainerOverrides`).

## Источники

### Onion / Clean в Node.js + TypeScript
- [Implementing SOLID and the onion architecture in Node.js with TypeScript and InversifyJS — Remo Jansen (DEV)](https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad)
- [Clean Node.js Architecture — Khalil Stemmler](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/)
- [Clean architecture with TypeScript: DDD, Onion — André Bazaglia](https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/)
- [Onion Architecture in Node.js with TypeScript — Sankhadip Samanta (Medium)](https://sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-5508612a4391)
- [onion-architecture-boilerplate (Express + TS, OOP) — Melzar (GitHub)](https://github.com/Melzar/onion-architecture-boilerplate)
- [Enforce Clean Architecture with fresh-onion — Remo Jansen (DEV)](https://dev.to/remojansen/enforce-clean-architecture-in-your-typescript-projects-with-fresh-onion-45pi)

### Onion vs Clean vs Hexagonal (сравнение)
- [Onion vs Clean vs Hexagonal Architecture — Eric Damtoft (Medium)](https://medium.com/@edamtoft/onion-vs-clean-vs-hexagonal-architecture-9ad94a27da91)
- [DDD, Hexagonal, Onion, Clean, CQRS… How I put it all together — Herberto Graça](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)
- [Hexagonal vs Clean vs Onion — Programming Pulse](https://programmingpulse.vercel.app/blog/hexagonal-vs-clean-vs-onion-architectures)
- [Clean vs Onion vs Hexagonal — CCD Akademie](https://ccd-akademie.de/en/clean-architecture-vs-onion-architecture-vs-hexagonal-architecture/)
- [Understanding Hexagonal, Clean, Onion, and Layered — Roman Glushach (Medium)](https://romanglushach.medium.com/understanding-hexagonal-clean-onion-and-traditional-layered-architectures-a-deep-dive-c0f93b8a1b96)
- [Demystifying software architecture patterns — Thoughtworks](https://www.thoughtworks.com/en-us/insights/blog/architecture/demystify-software-architecture-patterns)

### Форсирование границ в TypeScript
- [Restrict Imports in JavaScript with Dependency Cruiser — Atomic Object](https://spin.atomicobject.com/dependency-cruiser-imports/)
- [Avoid Cross Module Dependencies with Dependency Cruiser — Jakub Andrzejewski (DEV)](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b)
- [Taking Frontend Architecture Serious With Dependency-cruiser — Xebia](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/)
- [eslint-plugin-boundaries — npm](https://www.npmjs.com/package/eslint-plugin-boundaries)
- [Ensuring dependency rules with eslint-plugin-boundaries — Taynan Duarte (Medium)](https://medium.com/@taynan_duarte/ensuring-dependency-rules-in-a-nodejs-application-with-typescript-using-eslint-plugin-boundaries-68b70ce32437)
- [6 Tools for Enforcing Good Web Architecture — jmulholland.com](https://jmulholland.com/architecture-tools/)
