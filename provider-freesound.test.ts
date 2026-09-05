import { isCommerciallySafe, searchFreesound } from "./provider-freesound.ts";
let failures=0;
function check(label:string,actual:unknown,expected:unknown){const ok=JSON.stringify(actual)===JSON.stringify(expected);console.log(`${ok?"OK":"FAIL"} ${label}`);if(!ok)failures++}
check("CC0",isCommerciallySafe("https://creativecommons.org/publicdomain/zero/1.0/"),true);
check("CC-BY",isCommerciallySafe("https://creativecommons.org/licenses/by/4.0/"),true);
check("CC-BY-NC",isCommerciallySafe("https://creativecommons.org/licenses/by-nc/4.0/"),false);
check("CC-BY-SA",isCommerciallySafe("https://creativecommons.org/licenses/by-sa/4.0/"),false);
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>({ok:true,json:async()=>({results:[{id:1,name:"safe",duration:1,license:"https://creativecommons.org/licenses/by/4.0/",tags:[],previews:{"preview-hq-mp3":"https://example.com/a.mp3"}},{id:2,name:"unsafe",duration:1,license:"https://creativecommons.org/licenses/by-nc/4.0/",tags:[],previews:{"preview-hq-mp3":"https://example.com/b.mp3"}}]})} as Response);
const result=await searchFreesound({query:"door",apiKey:"fake",element:"foley"});check("unsafe removed",result.results.map(r=>r.id),[1]);globalThis.fetch=originalFetch;process.exit(failures?1:0);
