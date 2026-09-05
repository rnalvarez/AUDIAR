const SEARCH_ENDPOINT = "https://freesound.org/apiv2/search/text/";
export interface FreesoundLayer { id:number; name:string; tags:string[]; durationSeconds:number; license:string; commerciallySafe:boolean; previewUrl:string; freesoundUrl:string; }
export interface FreesoundSearchParams { query:string; apiKey:string; element:"ambientes"|"efectos"|"foley"|"dialogos"; maxResults?:number; commercialOnly?:boolean; }
export interface FreesoundSearchResult { element:FreesoundSearchParams["element"]; query:string; results:FreesoundLayer[]; }
export function isCommerciallySafe(licenseUrlOrName:string):boolean {
  const l = licenseUrlOrName.toLowerCase();
  if (l.includes("publicdomain/zero")) return true;
  if (l.includes("licenses/by/")) return true;
  if (l === "attribution" || l === "creative commons 0" || l === "cc0") return true;
  return false;
}
function normalizeResult(raw:any):FreesoundLayer { const license=String(raw.license??""); return { id:raw.id, name:String(raw.name??""), tags:Array.isArray(raw.tags)?raw.tags:[], durationSeconds:typeof raw.duration==="number"?raw.duration:0, license, commerciallySafe:isCommerciallySafe(license), previewUrl:raw.previews?.["preview-hq-mp3"]??raw.previews?.["preview-lq-mp3"]??"", freesoundUrl:`https://freesound.org/s/${raw.id}/` }; }
export async function searchFreesound(params:FreesoundSearchParams):Promise<FreesoundSearchResult> {
  const {query,apiKey,element,maxResults=12,commercialOnly=true}=params;
  const url=new URL(SEARCH_ENDPOINT); url.searchParams.set("query",query); url.searchParams.set("token",apiKey); url.searchParams.set("fields","id,name,tags,duration,license,previews"); url.searchParams.set("page_size",String(Math.min(maxResults*3,50)));
  if(commercialOnly) url.searchParams.set("filter", 'license:("Creative Commons 0" OR "Attribution")');
  const res=await fetch(url.toString()); if(!res.ok){const body=await res.text().catch(()=>""); throw new Error(`Freesound search failed (${res.status}): ${body.slice(0,300)}`);}
  const data:any=await res.json(); let results:(FreesoundLayer[])=(Array.isArray(data.results)?data.results:[]).map(normalizeResult); if(commercialOnly) results=results.filter(r=>r.commerciallySafe); return {element,query,results:results.slice(0,maxResults)};
}
