import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Share images are drawn to PNG at build time by next/og, which needs plain <img>.
  // Evolution tiles show card art as inline SVG data URIs, which next/image adds nothing to.
  { files: ['src/lib/og.tsx', 'src/app/evolution/shared.tsx'], rules: { '@next/next/no-img-element': 'off' } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The voting Worker has its own toolchain (Wrangler).
    "worker/**",
  ]),
]);

export default eslintConfig;
