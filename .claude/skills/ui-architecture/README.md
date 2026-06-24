# ui-architecture

**Version:** 1.0.0
**Scope:** Frontend (React + Next.js)

## Focus

This skill answers one question: **where should this code live, and what
should it be called?** It covers folder structure, the boundary between
`lib/`, `utils/`, and `services/`, where constants and types belong, env/config
organization, naming conventions, and a small set of architecture-level
patterns (Data Access Layer, container/presentational at the project level,
barrel files, Atomic Design).

It does **not** cover whether a given piece of code is *correct* — that's
deliberate, to avoid duplicating two skills that already exist in this repo.

## What it's designed for

- "Where should I put this new helper/hook/constant/type?"
- "What should I name this file/hook/util?"
- Reviewing or proposing a project's folder structure for consistency.
- Deciding whether to split a feature into its own folder, whether to use a
  barrel file, or whether logic needs a Data Access Layer.

## What it's NOT designed for — and which skill to use instead

| If the question is about... | Use instead |
|---|---|
| Component purity, props/line limits, `useEffect`/memoization correctness, accessibility, Context vs state, render factories, key props | [`react-best-practices`](../react-best-practices/SKILL.md) |
| Server Components vs Server Actions vs Route Handlers, `error.tsx`/`not-found.tsx`/`loading.tsx` mechanics, RSC boundaries, async `params`/`cookies()`, routing file conventions, image/font optimization | [`next-best-practices`](../next-best-practices/SKILL.md) |

Both of those skills already touch code organization briefly (e.g.
`react-best-practices` mentions feature-based structure and file-quality
ordering; `next-best-practices` documents the `app/` special-file
conventions in depth). This skill exists for everything *around* that —
intentionally avoiding restating what they already cover.

## Why this skill exists

Built from a research pass specifically aimed at filling gaps left by the
two existing React/Next.js skills: naming conventions, `lib`/`utils`/`services`
boundaries, constants/types placement, barrel files, env/config conventions,
and the Data Access Layer pattern — none of which were covered elsewhere in
this repo's skills.

## Sources used in research

### React — folder structure / where components live
- [React Folder Structure Best Practices (2026) — Robin Wieruch](https://www.robinwieruch.de/react-folder-structure/)
- [File Structure — React (official, legacy docs)](https://legacy.reactjs.org/docs/faq-structure.html)
- [Guidelines to improve your React folder structure — Max Rozen](https://maxrozen.com/guidelines-improve-react-app-folder-structure)
- [Recommended Folder Structure for React 2025 — DEV Community](https://dev.to/pramod_boda/recommended-folder-structure-for-react-2025-48mc)
- [Folder Structure for a React JS Project — GeeksforGeeks](https://www.geeksforgeeks.org/reactjs/folder-structure-for-a-react-js-project/)
- [Delightful React File/Directory Structure — Josh W. Comeau](https://www.joshwcomeau.com/react/file-structure/)
- [How To Structure React Projects From Beginner To Advanced — Web Dev Simplified](https://blog.webdevsimplified.com/2022-07/react-folder-structure/)
- [33 React JS Best Practices For 2026 — Technostacks](https://technostacks.com/blog/react-best-practices/)

### React — constants
- [How to Add a Constants File to Your React Project — Medium](https://medium.com/@austinpaley32/how-to-add-a-constants-file-to-your-react-project-6ce31c015774)
- [How To Organize Constants in a Dedicated Layer in JavaScript — Semaphore](https://semaphore.io/blog/constants-layer-javascript)

### React — business logic separation / hooks
- [Separating responsibilities in your code (using React Hooks as example) — Medium](https://sairys.medium.com/react-separating-responsibilities-using-hooks-b9c90dbb3ab9)
- [Separation of concerns with React hooks — Felix Gerschau](https://felixgerschau.com/react-hooks-separation-of-concerns/)
- [Split business logic from UI using Custom hooks in React](https://raita-devs.hashnode.dev/split-business-logic-from-ui-using-custom-hooks-in-react)
- [Decoupling Business Logic from UI with Custom React Hooks — eMoosavi](https://www.emoosavi.com/blog/decoupling-business-logic-from-ui-with-custom-react-hooks)
- [Best Practices for Keeping Your React UI and Logic Separate — DhiWise](https://www.dhiwise.com/post/mastering-the-art-of-separating-ui-and-logic-in-react)

### React — component composition / container-presentational / atomic design
- [Structuring React Components: Best Practices For Code Organization — Nile Bits](https://www.nilebits.com/blog/2024/04/structuring-react-components/)
- [Container-presentational pattern in React — TSH](https://tsh.io/blog/container-presentational-pattern-react)
- [Container/Presentational Pattern — patterns.dev](https://www.patterns.dev/react/presentational-container-pattern/)
- [React Presentational and Container Components Using Context and Hooks — falldowngoboone](https://www.falldowngoboone.com/blog/container-component-pattern-using-context-and-hooks/)
- [React Design Patterns: Complete Guide (2026) — TurboDocx](https://www.turbodocx.com/blog/react-design-patterns)

### React — naming conventions
- [Naming Conventions in React for Clean & Scalable Code — Sufle.io](https://www.sufle.io/blog/naming-conventions-in-react)
- [Best practices for naming hooks & props in React — Spencer Pauly](https://www.spencerpauly.com/tech/react-naming-conventions-best-practices)
- [React Hook Naming Conventions Best Practices and Guidelines — Stackademic](https://blog.stackademic.com/react-hook-naming-conventions-best-practices-and-guidelines-32ac80c1580e)
- [Reusing Logic with Custom Hooks — react.dev (official)](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [Best Practices: How Should React Files Be Named — JavaScript in Plain English](https://javascript.plainenglish.io/best-practices-how-should-react-files-be-named-682eadc53a0e)

### React — barrel files
- [Please Stop Using Barrel Files — TkDodo](https://tkdodo.eu/blog/please-stop-using-barrel-files)
- [Barrel files and why you should STOP using them now — DEV Community](https://dev.to/tassiofront/barrel-files-and-why-you-should-stop-using-them-now-bc4)
- [Barrel vs Specific Imports in React — Medium](https://matinkhani.medium.com/barrel-vs-specific-imports-in-react-a-developers-guide-to-making-the-right-choice-381b77b20391)
- [Using barrel exports to organize React components — LogRocket](https://blog.logrocket.com/using-barrel-exports-organize-react-components/)

### React — types/interfaces organization
- [How Should I Organize My Types as a React Developer? — Wisp CMS](https://www.wisp.blog/blog/how-should-i-organize-my-types-as-a-react-developer)
- [How to Organize Types in a React Project — Wisp CMS](https://www.wisp.blog/blog/how-to-organize-types-in-a-react-project)
- [TypeScript | Organizing and Storing Types and Interfaces](https://www.becomebetterprogrammer.com/typescript-organizing-and-storing-types-and-interfaces/)
- [A Practical Guide to Organizing Your React TypeScript Project — Medium](https://medium.com/@patricmanciya/a-practical-guide-to-organizing-your-react-typescript-project-for-scalability-and-maintainability-658eb7c2b1b6)

### Next.js — project structure / App Router
- [Getting Started: Project Structure — Next.js (official)](https://nextjs.org/docs/app/getting-started/project-structure)
- [Next.js 16 App Router Project Structure: The Definitive Guide — Makerkit](https://makerkit.dev/blog/tutorials/nextjs-app-router-project-structure)
- [Next.js Project Structure 2026: Scalable Full-Stack Template — Groovyweb](https://www.groovyweb.co/blog/nextjs-project-structure-full-stack)
- [How to Organize Your Next.js App with the App Router — Medium](https://medium.com/@aritrapaulpc/how-to-organize-your-next-js-app-with-the-app-router-best-practices-folder-structures-4bba816df061)
- [Next.js 16 App Router Folder Structure Best Practices — Dharmsy](https://www.dharmsy.com/blog/nextjs-16-app-router-folder-structure)
- [Mastering Next.js App Router: Best Practices — Medium](https://thiraphat-ps-dev.medium.com/mastering-next-js-app-router-best-practices-for-structuring-your-application-3f8cf0c76580)
- [App Router Directory Design: Project Structure Patterns — DEV Community](https://dev.to/pipipi-dev/app-router-directory-design-nextjs-project-structure-patterns-31eo)

### Next.js — Server Actions, Data Access Layer, data fetching
- [Data Fetching: Server Actions and Mutations — Next.js (official)](https://nextjs.org/docs/13/app/building-your-application/data-fetching/server-actions-and-mutations)
- [Getting Started: Fetching Data — Next.js (official)](https://nextjs.org/docs/app/getting-started/fetching-data)
- [Guides: Data Security — Next.js (official)](https://nextjs.org/docs/app/guides/data-security)
- [Next.js Server Actions: The Complete Guide (2026) — Makerkit](https://makerkit.dev/blog/tutorials/nextjs-server-actions)
- [Nextjs 15 — Actions Best Practice — Medium](https://medium.com/@lior_amsalem/nextjs-15-actions-best-practice-bf5cc023301e)
- [Fetching data in Next.js: Server actions vs server functions vs API Routes — Medium](https://medium.com/@raulcanodev/fetching-data-in-next-js-server-actions-vs-server-functions-vs-api-routes-b2016d4bfd6c)

### Next.js — `lib/` vs `utils/` vs `services/`
- [Understanding the Role of libs and utils in a Next.js 15 Project — Medium](https://khaisastudio.medium.com/understanding-the-role-of-libs-and-utils-in-a-next-js-15-project-b1c0368ef044)
- [The Next.js Directory Structure That Scales — Bitsmiths](https://bitsmiths.studio/blogs/nextjs-directory-structure)
- [Build it better: Next.js Directory Structure (For Large Apps) — Medium](https://medium.com/@brandonlostboy/build-it-better-next-js-directory-structure-for-large-apps-3d525bca20fe)
- [The Ultimate Guide to Organizing Your Next.js 15 Project Structure — Wisp CMS](https://www.wisp.blog/blog/the-ultimate-guide-to-organizing-your-nextjs-15-project-structure)

### Next.js — environment variables / config
- [Guides: Environment Variables — Next.js (official)](https://nextjs.org/docs/pages/building-your-application/configuring/environment-variables)
- [Configuring: Environment Variables — Next.js (official)](https://nextjs.org/docs/14/app/building-your-application/configuring/environment-variables)
- [How to Configure Environment Variables in Next.js — OneUptime](https://oneuptime.com/blog/post/2026-01-24-nextjs-environment-variables/view)
- [Best Practices for Environment Variables in Next.js — Medium](https://arnab-k.medium.com/best-practices-for-environment-variables-in-next-js-e9d7be009c5a)
- [Next.js Clean Code: Best Practices for Scalable Applications — DEV Community](https://dev.to/sizan_mahmud0_e7c3fd0cb68/nextjs-clean-code-best-practices-for-scalable-applications-2jmc)

### Next.js — error/loading/not-found conventions (used to confirm overlap with `next-best-practices`, not restated here)
- [App Router: Handling Errors — Next.js (official)](https://nextjs.org/learn/dashboard-app/error-handling)
- [Getting Started: Error Handling — Next.js (official)](https://nextjs.org/docs/app/getting-started/error-handling)
- [File-system conventions: error.js — Next.js (official)](https://nextjs.org/docs/app/api-reference/file-conventions/error)
- [Next.js error handling: a practical guide — Honeybadger](https://www.honeybadger.io/blog/next-js-error-handling/)
- [Next.js Error Handling Patterns — Better Stack Community](https://betterstack.com/community/guides/scaling-nodejs/error-handling-nextjs/)
- [Next.js 15: Error Handling best practices for code and routes](https://devanddeliver.com/blog/frontend/next-js-15-error-handling-best-practices-for-code-and-routes)

Full raw research notes (including the parts that turned out to overlap with
existing skills and were therefore excluded here) are in
[`docs/research/react-nextjs-best-practices-sources.md`](../../../docs/research/react-nextjs-best-practices-sources.md).

## Changelog

- **1.0.0** — initial version: folder structure, naming conventions,
  container/presentational + DAL + barrel files + atomic design patterns.
