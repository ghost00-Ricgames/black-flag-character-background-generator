import fs from "node:fs";
const m=JSON.parse(fs.readFileSync(new URL("../module.json",import.meta.url),"utf8"));
function assert(condition,message){if(!condition)throw new Error(message);}
assert(m.id==="black-flag-character-background-generator","Unexpected module ID");
assert(m.socket===true,"Socket namespace must be enabled for GM-mediated requests");
assert(m.compatibility?.minimum==="14","Foundry v14 minimum required");
assert(m.relationships?.systems?.some(s=>s.id==="black-flag"&&s.type==="system"),"Missing Black Flag dependency");
for(const path of [...m.esmodules,...m.styles])assert(fs.existsSync(new URL("../"+path,import.meta.url)),"Missing "+path);
assert(m.manifest?.includes("/releases/"),"Manifest must use GitHub Releases");
assert(m.download?.includes("/releases/"),"Download must use GitHub Releases");
console.log("Manifest and module assets validated");
