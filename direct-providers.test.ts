// Quick standalone check — run with:
//   node --experimental-strip-types direct-providers.test.ts
// Verifica que la copia del lado del cliente de isCommerciallySafe (para
// el modo sin Worker) mantenga exactamente la misma garantía que la
import { isCommerciallySafeDirect } from "./direct-providers.ts";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "OK  " : "FAIL"} ${label} -> ${JSON.stringify(actual)}`);
  if (!ok) failures++;
}

check("CC0 URL", isCommerciallySafeDirect("http://creativecommons.org/publicdomain/zero/1.0/"), true);
check("CC-BY URL", isCommerciallySafeDirect("https://creativecommons.org/licenses/by/4.0/"), true);
check("CC-BY-NC URL is rejected", isCommerciallySafeDirect("https://creativecommons.org/licenses/by-nc/4.0/"), false);
check("CC-BY-SA URL is rejected", isCommerciallySafeDirect("https://creativecommons.org/licenses/by-sa/4.0/"), false);
check("Sampling+ is rejected", isCommerciallySafeDirect("Sampling+"), false);
check("empty string is rejected", isCommerciallySafeDirect(""), false);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
