// Quick standalone check — run with:
//   node --experimental-strip-types provider-sound-design.test.ts
import { normalizeProposal } from "./provider-sound-design.ts";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "OK  " : "FAIL"} ${label} -> ${JSON.stringify(actual)}`);
  if (!ok) failures++;
}

// --- basic shape ---
const basic = normalizeProposal({
  ambientes: [{ description: "lluvia exterior", rationale: "se ve pavimento mojado", certainty: "probable" }],
  efectos: [],
  foley: [],
  dialogos: [{ description: "ninguna fuente evidente", rationale: "no hay personas en cuadro", certainty: "observed" }],
});
check("keeps a well-formed ambientes entry", basic.ambientes.length, 1);
check("generates a stable id", basic.ambientes[0].id, "ambientes-0");
check("tags the category on the item itself", basic.ambientes[0].category, "ambientes");
check("dialogos can legitimately be an 'absence' entry", basic.dialogos[0].description, "ninguna fuente evidente");

// --- certainty safety (reused from provider-vision, re-checked at this layer) ---
const badCertainty = normalizeProposal({
  efectos: [{ description: "puerta cerrándose", certainty: "definitely-real" }],
});
check("unrecognized certainty never becomes 'observed'", badCertainty.efectos[0].certainty, "possible");

// --- the overload cap is the point of this whole file ---
const oversized = {
  ambientes: Array.from({ length: 40 }, (_, i) => ({ description: `sonido ${i}`, certainty: "possible" })),
};
const capped = normalizeProposal(oversized);
check("caps a 40-item response down to the max", capped.ambientes.length <= 6, true);
check("cap is exactly 6, not just 'smaller'", capped.ambientes.length, 6);

// --- resilience ---
check("empty-description entries are dropped, not kept as blanks", normalizeProposal({ foley: [{ certainty: "observed" }] }).foley, []);
check("missing category key becomes empty array, not thrown", normalizeProposal({}).dialogos, []);
check("null input never throws", normalizeProposal(null).ambientes, []);
check("non-array category value becomes empty array", normalizeProposal({ efectos: "not an array" }).efectos, []);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
