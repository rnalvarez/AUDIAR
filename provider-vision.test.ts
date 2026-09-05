import { normalizeAnalysis } from "./provider-vision.ts";
const out=normalizeAnalysis({sceneDescription:"calle",place:{text:"ciudad",certainty:"bad"},ambience:[{text:"lluvia",certainty:"observed"},{text:"","certainty":"observed"}]});
if(out.place.certainty!=="possible") throw new Error("invalid certainty should become possible");
if(out.ambience.length!==1) throw new Error("empty cues should be removed");
console.log("vision checks passed");
