// Quick standalone check — run with:
//   node --experimental-strip-types provider-vision.test.ts
import { coerceCertainty, coerceCue, coerceCueArray, normalizeAnalysis } from "./provider-vision.ts";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "OK  " : "FAIL"} ${label} -> ${JSON.stringify(actual)}`);
  if (!ok) failures++;
}

// --- coerceCertainty: the safety-critical piece ---
check("valid 'observed' passes through", coerceCertainty("observed"), "observed");
check("valid 'probable' passes through", coerceCertainty("probable"), "probable");
check("valid 'possible' passes through", coerceCertainty("possible"), "possible");
check("garbage string falls back to 'possible', not 'observed'", coerceCertainty("definitely!"), "possible");
check("undefined falls back to 'possible'", coerceCertainty(undefined), "possible");
check("number falls back to 'possible'", coerceCertainty(42), "possible");

// --- coerceCue ---
check("well-formed cue", coerceCue({ text: "lluvia", certainty: "observed" }), { text: "lluvia", certainty: "observed" });
check("missing certainty falls back to 'possible'", coerceCue({ text: "tráfico lejano" }), {
  text: "tráfico lejano",
  certainty: "possible",
});
check("missing text becomes empty string, not thrown", coerceCue({ certainty: "observed" }), {
  text: "",
  certainty: "observed",
});
check("null cue becomes empty/possible, not thrown", coerceCue(null), { text: "", certainty: "possible" });

// --- coerceCueArray ---
check(
  "drops empty-text entries after coercion",
  coerceCueArray([{ text: "pasos", certainty: "observed" }, { text: "" }, { certainty: "probable" }]),
  [{ text: "pasos", certainty: "observed" }]
);
check("non-array input becomes empty array, not thrown", coerceCueArray("not an array"), []);
check("undefined input becomes empty array", coerceCueArray(undefined), []);

// --- normalizeAnalysis: full malformed-response resilience ---
const minimal = normalizeAnalysis({ sceneDescription: "calle nocturna" });
check("minimal input: sceneDescription kept", minimal.sceneDescription, "calle nocturna");
check("minimal input: missing single cues become empty/possible", minimal.place, { text: "", certainty: "possible" });
check("minimal input: missing arrays become []", minimal.ambience, []);

const withBadCertainty = normalizeAnalysis({
  ambience: [{ text: "lluvia", certainty: "definitely-true" }],
});
check(
  "a model inventing its own certainty label never reads as 'observed'",
  withBadCertainty.ambience,
  [{ text: "lluvia", certainty: "possible" }]
);

check("completely empty object never throws", normalizeAnalysis({}).dialogue, []);
check("null input never throws", normalizeAnalysis(null).foley, []);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
