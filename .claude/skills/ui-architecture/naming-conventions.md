# Naming Conventions

| What | Convention | Example |
|---|---|---|
| Component (file + export) | PascalCase | `UserProfileCard.tsx` |
| Non-component file | kebab-case | `format-date.ts` |
| Custom hook | camelCase, `use` prefix | `useAuth.ts`, `useFormState.ts` |
| Utility function | camelCase, verb prefix (`get`/`is`/`has`/`should`) | `getFormattedDate()`, `isValidEmail()` |
| Constant / enum value | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Boolean prop | `is`/`has`/`can`/`should` prefix | `isVisible`, `canEdit` |
| Event-handler prop | `on` prefix | `onClick`, `onUserLogin` |

Components are the one exception to kebab-case file naming — keep them
PascalCase so the file name matches the export and JSX usage 1:1.

## Why the `use` prefix on hooks isn't just style

`eslint-plugin-react-hooks` identifies hooks **by the `use` prefix** to
enforce the rules of hooks (only call at the top level, never inside a
condition/loop/nested function). A function that calls `useState` internally
but isn't named `useSomething` won't get linted as a hook — the rule simply
won't fire. So this is a correctness convention, not a cosmetic one.

Name hooks for what they return/do, specifically — `useFetchUserOrders` over
`useData`. A vague hook name is a sign it's doing too many unrelated things.

## Be consistent, not clever

The value of any naming convention is that someone can predict a name without
opening the file. Pick the rules above (or the project's existing ones) and
apply them uniformly — a codebase with three different casing styles for
utils is worse than one with a slightly different but consistent style.
