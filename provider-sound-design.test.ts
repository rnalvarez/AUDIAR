import { normalizeProposal } from "./provider-sound-design.ts";
const many=Array.from({length:20},(_,i)=>({description:`sonido ${i}`,rationale:"r",certainty:"possible"}));
const out=normalizeProposal({ambientes:many,efectos:[],foley:[],dialogos:[]});
if(out.ambientes.length!==6) throw new Error("proposal cap failed");
if(out.ambientes[0].id!=="ambientes-0") throw new Error("ids should be generated locally");
console.log("sound-design checks passed");
