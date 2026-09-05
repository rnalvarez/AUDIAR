// Quick standalone check (not a full test framework) — run with:
//   node --experimental-strip-types worker/src/providers/freesound.test.ts
import { isCommerciallySafe, searchFreesound } from "./provider-freesound.ts";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "OK  " : "FAIL"} ${label} -> ${JSON.stringify(actual)}`);
  if (!ok) failures++;
}

// --- isCommerciallySafe: the safety-critical piece ---
check("CC0 URL", isCommerciallySafe("http://creativecommons.org/publicdomain/zero/1.0/"), true);
check("CC-BY URL", isCommerciallySafe("https://creativecommons.org/licenses/by/4.0/"), true);
check("CC-BY-NC URL is rejected", isCommerciallySafe("https://creativecommons.org/licenses/by-nc/4.0/"), false);
check("CC-BY-SA URL is rejected", isCommerciallySafe("https://creativecommons.org/licenses/by-sa/4.0/"), false);
check("CC-BY-NC-SA URL is rejected", isCommerciallySafe("https://creativecommons.org/licenses/by-nc-sa/4.0/"), false);
check("Sampling+ is rejected", isCommerciallySafe("Sampling+"), false);
check("bare 'Attribution' name", isCommerciallySafe("Attribution"), true);
check("empty string is rejected", isCommerciallySafe(""), false);

// --- searchFreesound: mock fetch, verify unsafe results get dropped and safe ones survive ---
const originalFetch = globalThis.fetch;
// @ts-expect-error - test-only mock
globalThis.fetch = async (_url: string) => ({
  ok: true,
  json: async () => ({
    results: [
      {
        id: 1,
        name: "door_creak_cc0",
        tags: ["door", "creak"],
        duration: 3.2,
        license: "http://creativecommons.org/publicdomain/zero/1.0/",
        previews: { "preview-hq-mp3": "https://example.com/1.mp3" },
      },
      {
        id: 2,
        name: "door_creak_by_nc",
        tags: ["door", "creak"],
        duration: 2.8,
        license: "https://creativecommons.org/licenses/by-nc/4.0/",
        previews: { "preview-hq-mp3": "https://example.com/2.mp3" },
      },
      {
        id: 3,
        name: "door_creak_by",
        tags: ["door", "creak"],
        duration: 4.1,
        license: "https://creativecommons.org/licenses/by/4.0/",
        previews: { "preview-hq-mp3": "https://example.com/3.mp3" },
      },
    ],
  }),
});

const out = await searchFreesound({ query: "door creak", apiKey: "fake", element: "foley" });
check("filters out the by-nc result", out.results.map((r) => r.id).sort(), [1, 3]);
check("keeps element tag on the result set", out.element, "foley");

globalThis.fetch = originalFetch;

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
