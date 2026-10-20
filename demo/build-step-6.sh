#!/usr/bin/env bash
# Regenerates demo/step-6.md: bash demo/build-step-6.sh
cd "$(dirname "$0")/.."
TE=$(node_modules/.bin/tsc -p demo/type-errors 2>&1 | grep step-6)
{
echo "# Step 6 output: typed client helpers"
echo
echo "The client imports the server app's **type** only, and \`createRoutes\` reads Elysia's route table: paths, params, query and body schemas. Routes used here (\`demo/step-6.ts\`):"
echo
echo '```ts'
sed -n '/^export const app/,/^$/p' demo/step-6.ts
echo '```'
echo
echo "## What the helpers build at runtime"
echo
bun demo/step-6.ts
echo
echo "## In a React page"
echo
echo '```tsx'
sed -n '/^export function CreateUser/,/^}/p' demo/type-errors/step-6.tsx | sed 's#// 4. Form data missing a field of the body schema#// fields() is typed by the POST /users body schema#; s#// 5. A misspelt error key#// form.errors is keyed by the same fields#'
echo '```'
echo
echo "## Type checks"
echo
echo "\`demo/type-errors/step-6.tsx\` makes five mistakes against those routes and Inertia's own \`useForm\` from \`@inertiajs/react\` 3.9.1. \`tsc\` reports:"
echo
echo '```text'
echo "$TE"
echo '```'
echo
echo "## Test run"
echo
echo '```text'
bun test 2>&1 | tail -4
echo '```'
} > demo/step-6.md
