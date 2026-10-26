// Lets `npm test` load the app's TypeScript modules the way Next does: "@/lib/stages" is frontend/lib/stages.ts.
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) {
      const base = path.join(root, specifier.slice(2));
      const file = [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find((candidate) => existsSync(candidate));
      if (file) return next(pathToFileURL(file).href, context);
    }
    return next(specifier, context);
  },
});
