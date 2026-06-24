# React & Next.js best practices — research

Собрано для будущего skill по структуре фронтенда: где жить компонентам,
константам, бизнес-логике. Существующие skills в проекте, которые уже частично
покрывают это: `.claude/skills/react-best-practices/`, `.claude/skills/next-best-practices/`.

## React

### Структура проекта / где жить компонентам

- **Feature-based структура** — рекомендуемый подход для средних/больших
  проектов: связанные компоненты, хуки, сервисы и стили группируются по
  фиче/домену (`features/auth`, `features/billing`), а не по типу файла.
  Так проще дебажить, тестировать и масштабировать.
- **Базовые папки**: `components/` (переиспользуемые UI-элементы — кнопки,
  инпуты, модалки), `features/` (фиче-специфичный код), `hooks/`,
  `pages/`, `services/` или `api/` (запросы к API), `utils/`, `assets/`,
  `styles/`.
- **Глубина вложенности** — без веской причины не больше 3-4 уровней папок.
- **components/** должен содержать только переиспользуемые между фичами/
  страницами UI-компоненты, а не всё подряд.
- Имеет смысл смешивать подходы: часть фич — отдельными доменными папками,
  часть мелкой логики — colocated прямо рядом с компонентом, который её
  использует.

Источники:
- [React Folder Structure Best Practices (2026) — Robin Wieruch](https://www.robinwieruch.de/react-folder-structure/)
- [File Structure — React (official, legacy docs)](https://legacy.reactjs.org/docs/faq-structure.html)
- [Guidelines to improve your React folder structure — Max Rozen](https://maxrozen.com/guidelines-improve-react-app-folder-structure)
- [Recommended Folder Structure for React 2025 — DEV Community](https://dev.to/pramod_boda/recommended-folder-structure-for-react-2025-48mc)
- [Folder Structure for a React JS Project — GeeksforGeeks](https://www.geeksforgeeks.org/reactjs/folder-structure-for-a-react-js-project/)
- [Delightful React File/Directory Structure — Josh W. Comeau](https://www.joshwcomeau.com/react/file-structure/)
- [How To Structure React Projects From Beginner To Advanced — Web Dev Simplified](https://blog.webdevsimplified.com/2022-07/react-folder-structure/)
- [33 React JS Best Practices For 2026 — Technostacks](https://technostacks.com/blog/react-best-practices/)

### Где жить константам

- Для небольших/средних проектов — один файл `constants.ts` в корне `src/`
  (туда же можно положить цвета, breakpoints, публичные ключи, "app data").
- Для крупных проектов — отдельная папка `constants/` или `data/`, разбитая
  по контексту: `api.ts` (URL, эндпоинты), `i18n.ts` (переводы), `routes.ts`
  и т.д. — не сваливать всё в один файл.
- Цель — убрать магические строки/числа из компонентов и не дублировать
  одни и те же значения по фичам.

Источники:
- [How to Add a Constants File to Your React Project — Medium](https://medium.com/@austinpaley32/how-to-add-a-constants-file-to-your-react-project-6ce31c015774)
- [How To Organize Constants in a Dedicated Layer in JavaScript — Semaphore](https://semaphore.io/blog/constants-layer-javascript)

### Где жить бизнес-логике (utils / хуки)

- **Custom hooks** — основной механизм инкапсуляции бизнес-логики
  (состояние, запросы, побочные эффекты), которая иначе раздувала бы тело
  компонента. Компонент остаётся "глупым" — только рендер + вызов хука.
- Внутри хуков логику стоит дальше разбивать на **чистые функции в `utils/`**,
  не привязанные к React (без `useState`/`useEffect`) — их легче
  юнит-тестировать отдельно от хука.
- Паттерн: **container vs presentational** — контейнер дёргает хуки/данные,
  презентационный компонент только принимает props и рисует UI. С хуками
  этот паттерн в основном вытеснил классовые HOC-контейнеры — кастомный хук
  (`useDogImages()`) заменяет контейнерный компонент целиком.
- Если в компоненте пара строк логики — выносить в хук/utils не обязательно,
  не усложнять заранее.
- Хуки можно компоновать (хук вызывает другой хук) для сложной логики, не
  превращая компонент в кучу useEffect-ов.
- **Atomic Design** как альтернатива/дополнение к feature-based структуре:
  atoms → molecules → organisms → templates → pages — даёт предсказуемую
  иерархию переиспользуемости, но усложняет проект если применять слишком
  строго на старте.
- Начинать с простого: хуки для логики + container/presentational для
  структуры; compound components, state reducers, HOC — только когда простые
  паттерны реально не справляются.
- Для серверного состояния — React Query/TanStack Query (а не useEffect +
  useState вручную); для сложного глобального стейта — Zustand/Redux, не
  через Context (Context — для редко меняющихся значений типа auth/theme).

Источники:
- [Separating responsibilities in your code (using React Hooks as example) — Medium](https://sairys.medium.com/react-separating-responsibilities-using-hooks-b9c90dbb3ab9)
- [Separation of concerns with React hooks — Felix Gerschau](https://felixgerschau.com/react-hooks-separation-of-concerns/)
- [Split business logic from UI using Custom hooks in React](https://raita-devs.hashnode.dev/split-business-logic-from-ui-using-custom-hooks-in-react)
- [Decoupling Business Logic from UI with Custom React Hooks — eMoosavi](https://www.emoosavi.com/blog/decoupling-business-logic-from-ui-with-custom-react-hooks)
- [Best Practices for Keeping Your React UI and Logic Separate — DhiWise](https://www.dhiwise.com/post/mastering-the-art-of-separating-ui-and-logic-in-react)
- [Structuring React Components: Best Practices For Code Organization — Nile Bits](https://www.nilebits.com/blog/2024/04/structuring-react-components/)
- [Container-presentational pattern in React — TSH](https://tsh.io/blog/container-presentational-pattern-react)
- [Container/Presentational Pattern — patterns.dev](https://www.patterns.dev/react/presentational-container-pattern/)
- [React Presentational and Container Components Using Context and Hooks — falldowngoboone](https://www.falldowngoboone.com/blog/container-component-pattern-using-context-and-hooks/)
- [React Design Patterns: Complete Guide (2026) — TurboDocx](https://www.turbodocx.com/blog/react-design-patterns)

### Naming conventions

- **Компоненты**: PascalCase, и файл, и сам компонент (`UserProfileCard.tsx`).
- **Обычные файлы** (не компоненты): kebab-case (`format-date.ts`) —
  компоненты — единственное исключение из этого правила.
- **Хуки**: обязательный префикс `use` + camelCase (`useAuth`, `useFormState`).
  Линтер React (`eslint-plugin-react-hooks`) опирается именно на этот префикс,
  чтобы проверять "rules of hooks" (вызов только на верхнем уровне, не в
  условиях/циклах) — без префикса правило не сработает.
  Название должно быть конкретным: `useFetchUserOrders` лучше, чем `useData`.
- **Утилиты**: camelCase с глагольным префиксом — `get`, `set`, `is`, `has`,
  `should` (`getFormattedDate`, `isValidEmail`).
- **Константы/enum**: UPPER_SNAKE_CASE (`MAX_RETRY_COUNT`).
- **Props**: boolean-пропсы — `is`/`has`/`can`/`should` (`isVisible`,
  `canEdit`); хендлеры — префикс `on` (`onClick`, `onUserLogin`).

Источники:
- [Naming Conventions in React for Clean & Scalable Code — Sufle.io](https://www.sufle.io/blog/naming-conventions-in-react)
- [Best practices for naming hooks & props in React — Spencer Pauly](https://www.spencerpauly.com/tech/react-naming-conventions-best-practices)
- [React Hook Naming Conventions Best Practices and Guidelines — Stackademic](https://blog.stackademic.com/react-hook-naming-conventions-best-practices-and-guidelines-32ac80c1580e)
- [Reusing Logic with Custom Hooks — react.dev (official)](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [Best Practices: How Should React Files Be Named — JavaScript in Plain English](https://javascript.plainenglish.io/best-practices-how-should-react-files-be-named-682eadc53a0e)

### Barrel-файлы (`index.ts` ре-экспорты)

- Барели (файл, который только ре-экспортирует содержимое папки) улучшают
  читаемость импортов и развязывают вызывающий код от внутренней структуры
  папки — переименование/переезд файла не требует правки импортов снаружи.
- Но у них реальная цена: **ломают tree-shaking** (бандлер не может понять,
  что нужно, а что нет, и тащит всё), увеличивают размер бандла и время
  старта dev-сервера, создают риск **циклических импортов**, ухудшают
  "go to definition" в IDE (приходишь в общий index.ts вместо конкретного файла).
- Практическая рекомендация: барели уместны на **публичной границе пакета/
  библиотеки** (один entry point). Внутри самого приложения — импортировать
  напрямую из конкретного файла, не через `index.ts` фичи/папки.

Источники:
- [Please Stop Using Barrel Files — TkDodo](https://tkdodo.eu/blog/please-stop-using-barrel-files)
- [Barrel files and why you should STOP using them now — DEV Community](https://dev.to/tassiofront/barrel-files-and-why-you-should-stop-using-them-now-bc4)
- [Barrel vs Specific Imports in React — Medium](https://matinkhani.medium.com/barrel-vs-specific-imports-in-react-a-developers-guide-to-making-the-right-choice-381b77b20391)
- [Using barrel exports to organize React components — LogRocket](https://blog.logrocket.com/using-barrel-exports-organize-react-components/)

### Где жить types/interfaces (TypeScript)

- **Co-location как главный принцип**: типы определяются там, где
  используются. Props-тип компонента — прямо в файле компонента, над самим
  компонентом (главное исключение из "выносить всё в отдельный файл").
- Для типов, общих для нескольких фич — отдельная папка `types/` с файлами
  по контексту (`api.ts`, `models.ts`), а не один огромный `types.ts`.
- **Гибридный подход** — общий/глобальный `types/` для shared-типов
  (API-контракты, доменные модели) + локальные типы рядом с конкретным
  компонентом/хуком, который их использует. Жёсткого единого стандарта нет —
  выбор зависит от размера проекта.

Источники:
- [How Should I Organize My Types as a React Developer? — Wisp CMS](https://www.wisp.blog/blog/how-should-i-organize-my-types-as-a-react-developer)
- [How to Organize Types in a React Project — Wisp CMS](https://www.wisp.blog/blog/how-to-organize-types-in-a-react-project)
- [TypeScript | Organizing and Storing Types and Interfaces](https://www.becomebetterprogrammer.com/typescript-organizing-and-storing-types-and-interfaces/)
- [A Practical Guide to Organizing Your React TypeScript Project — Medium](https://medium.com/@patricmanciya/a-practical-guide-to-organizing-your-react-typescript-project-for-scalability-and-maintainability-658eb7c2b1b6)

## Next.js

### Структура проекта / App Router

- App Router (`app/`) — стандарт с Next 13+, каждый файл в `app/` по
  умолчанию Server Component, пока явно не указан `"use client"`.
- Рекомендуемая структура: `app/` только для роутинга и страниц,
  `components/` — переиспользуемые UI-компоненты, `lib/` — утилиты и доступ
  к данным (`lib/data`, `lib/actions`), `hooks/`, `types/`, `public/`.
- **Colocation** — самая полезная привычка: всё, что нужно конкретному
  роуту (страница, её компоненты, тесты, стили), лежит рядом с этим роутом
  внутри `app/`, а не в общей папке.
- **Route groups** `(folderName)` — группировка роутов без влияния на URL.
- **Private folders** `_folderName` — colocate не-роутируемые файлы
  (хелперы, тесты) рядом с роутом без превращения их в страницы.
- Гибридный подход — часть кода группируется по фиче, часть — colocated
  внутри конкретного роута; это хорошо масштабируется при росте проекта.

Источники:
- [Getting Started: Project Structure — Next.js (official)](https://nextjs.org/docs/app/getting-started/project-structure)
- [Next.js 16 App Router Project Structure: The Definitive Guide — Makerkit](https://makerkit.dev/blog/tutorials/nextjs-app-router-project-structure)
- [Next.js Project Structure 2026: Scalable Full-Stack Template — Groovyweb](https://www.groovyweb.co/blog/nextjs-project-structure-full-stack)
- [How to Organize Your Next.js App with the App Router — Medium](https://medium.com/@aritrapaulpc/how-to-organize-your-next-js-app-with-the-app-router-best-practices-folder-structures-4bba816df061)
- [Next.js 16 App Router Folder Structure Best Practices — Dharmsy](https://www.dharmsy.com/blog/nextjs-16-app-router-folder-structure)
- [Mastering Next.js App Router: Best Practices — Medium](https://thiraphat-ps-dev.medium.com/mastering-next-js-app-router-best-practices-for-structuring-your-application-3f8cf0c76580)
- [App Router Directory Design: Project Structure Patterns — DEV Community](https://dev.to/pipipi-dev/app-router-directory-design-nextjs-project-structure-patterns-31eo)

### Бизнес-логика, Server Actions, Data Fetching

- **Разделение ответственности**: компоненты рендерят UI и обрабатывают
  взаимодействия пользователя; вся работа с данными (fetch, мутации, вызовы
  внешних API/БД) — в Server Actions / Server Components, не в компоненте.
- **Server Actions — только для мутаций** (используют POST). Для чтения
  данных — Server Components или Route Handlers, не Server Actions.
- **Data Access Layer (DAL)** — рекомендованный для новых проектов паттерн:
  отдельный server-only модуль, который инкапсулирует auth/authorization/
  доступ к БД. Server Actions/Route Handlers остаются тонкими обёртками
  над DAL, а не местом, где живёт бизнес-логика.
- Server Actions держать в отдельных файлах с директивой `"use server"`
  (на уровне файла — все экспорты файла становятся actions).
- Вход в Server Action всегда валидировать (Zod) и проверять
  auth/authorization — input нужно трактовать как вход в обычный API-эндпоинт.
- Результаты Server Actions, которые редко меняются, можно кэшировать,
  чтобы не дёргать сервер на каждый рендер.

Источники:
- [Data Fetching: Server Actions and Mutations — Next.js (official)](https://nextjs.org/docs/13/app/building-your-application/data-fetching/server-actions-and-mutations)
- [Getting Started: Fetching Data — Next.js (official)](https://nextjs.org/docs/app/getting-started/fetching-data)
- [Guides: Data Security — Next.js (official)](https://nextjs.org/docs/app/guides/data-security)
- [Next.js Server Actions: The Complete Guide (2026) — Makerkit](https://makerkit.dev/blog/tutorials/nextjs-server-actions)
- [Nextjs 15 — Actions Best Practice — Medium](https://medium.com/@lior_amsalem/nextjs-15-actions-best-practice-bf5cc023301e)
- [Fetching data in Next.js: Server actions vs server functions vs API Routes — Medium](https://medium.com/@raulcanodev/fetching-data-in-next-js-server-actions-vs-server-functions-vs-api-routes-b2016d4bfd6c)

### `lib/` vs `utils/` vs `services/` — где что хранить

- **`lib/`** — код, завязанный на конкретный фреймворк/интеграцию или
  внешнюю систему: подключение к БД (`lib/prisma.ts`), API-клиенты,
  обёртки над сторонними SDK. Часто содержит асинхронные операции и
  "тяжёлые" зависимости.
- **`utils/`** — чистые, framework-agnostic функции без побочных эффектов:
  форматирование дат, валидация строк — код, который мог бы работать в
  любом JS-проекте. Если функция могла бы жить в обычном npm-пакете без
  Next.js/React — это `utils`, не `lib`.
- **`services/`** — модули, отвечающие именно за коммуникацию с внешними
  сервисами (REST/GraphQL API, авторизация, БД-запросы более высокого
  уровня, чем сырой клиент в `lib/`).
- Главное правило независимо от точных названий папок — **выбрать одну
  конвенцию и не смешивать** её с другой внутри одного проекта; не уходить
  глубже ~3 уровней вложенности.

Источники:
- [Understanding the Role of libs and utils in a Next.js 15 Project — Medium](https://khaisastudio.medium.com/understanding-the-role-of-libs-and-utils-in-a-next-js-15-project-b1c0368ef044)
- [The Next.js Directory Structure That Scales — Bitsmiths](https://bitsmiths.studio/blogs/nextjs-directory-structure)
- [Build it better: Next.js Directory Structure (For Large Apps) — Medium](https://medium.com/@brandonlostboy/build-it-better-next-js-directory-structure-for-large-apps-3d525bca20fe)
- [The Ultimate Guide to Organizing Your Next.js 15 Project Structure — Wisp CMS](https://www.wisp.blog/blog/the-ultimate-guide-to-organizing-your-nextjs-15-project-structure)

### Environment variables / конфиг

- Только переменные с префиксом **`NEXT_PUBLIC_`** попадают в клиентский
  бандл — всё остальное остаётся server-only. Не префиксовать секреты
  `NEXT_PUBLIC_` по привычке "чтобы было видно везде".
- `.env`, `.env.development`, `.env.production` — для несекретных
  дефолтов и конфигурации по окружению. **`.env.local`** — для локальных
  секретов конкретного разработчика, по умолчанию в `.gitignore`, никогда
  не коммитится.
- В App Router серверные переменные можно безопасно читать во время
  динамического рендера — это позволяет гонять один Docker-образ через
  разные окружения, передавая разные значения снаружи, а не пересобирать
  образ под каждое окружение.
- Рекомендуемый паттерн: **отдельный config-модуль**, который на старте
  валидирует обязательные env-переменные (например, через Zod) и
  экспортирует их как типизированные константы — отказ при старте лучше,
  чем `undefined` в проде.

Источники:
- [Guides: Environment Variables — Next.js (official)](https://nextjs.org/docs/pages/building-your-application/configuring/environment-variables)
- [Configuring: Environment Variables — Next.js (official)](https://nextjs.org/docs/14/app/building-your-application/configuring/environment-variables)
- [How to Configure Environment Variables in Next.js — OneUptime](https://oneuptime.com/blog/post/2026-01-24-nextjs-environment-variables/view)
- [Best Practices for Environment Variables in Next.js — Medium](https://arnab-k.medium.com/best-practices-for-environment-variables-in-next-js-e9d7be009c5a)
- [Next.js Clean Code: Best Practices for Scalable Applications — DEV Community](https://dev.to/sizan_mahmud0_e7c3fd0cb68/nextjs-clean-code-best-practices-for-scalable-applications-2jmc)

### Error / Loading / Not-Found конвенции (file-based)

- **`error.tsx`** — обязательно Client Component (`"use client"`). В дереве
  компонентов он оборачивает в error boundary `loading.js`, `not-found.js`,
  `page.js` и вложенные `layout.js`, но **не** оборачивает `layout.js`/
  `template.js` своего же уровня — значит верхний layout (например,
  навигация) переживает ошибку дочернего сегмента.
  Ошибки всплывают к ближайшему родительскому `error.tsx` — можно расставлять
  error-границы гранулярно на разных уровнях роутов.
- **`not-found.tsx`** — глобальный в `app/not-found.tsx` + точечные в
  конкретных сегментах (`app/products/[id]/not-found.tsx`) для специфичного
  404-UI. Вызывается программно через `notFound()` из `next/navigation`.
  `notFound()` имеет приоритет перед `error.tsx`.
- **Server Actions**: оборачивать в try/catch для предсказуемой обработки
  ошибок; `redirect()` вызывать **снаружи** try/catch — он работает через
  throw, и catch-блок иначе его перехватит как ошибку.
- В проде Next.js заменяет текст серверной ошибки на хэш, чтобы не утекали
  детали (SQL-запросы, пути к файлам) — для деталей логировать на сервере,
  не показывать пользователю.

Источники:
- [App Router: Handling Errors — Next.js (official)](https://nextjs.org/learn/dashboard-app/error-handling)
- [Getting Started: Error Handling — Next.js (official)](https://nextjs.org/docs/app/getting-started/error-handling)
- [File-system conventions: error.js — Next.js (official)](https://nextjs.org/docs/app/api-reference/file-conventions/error)
- [Next.js error handling: a practical guide — Honeybadger](https://www.honeybadger.io/blog/next-js-error-handling/)
- [Next.js Error Handling Patterns — Better Stack Community](https://betterstack.com/community/guides/scaling-nodejs/error-handling-nextjs/)
- [Next.js 15: Error Handling best practices for code and routes](https://devanddeliver.com/blog/frontend/next-js-15-error-handling-best-practices-for-code-and-routes)
