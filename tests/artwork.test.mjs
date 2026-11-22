import test from "node:test";
import assert from "node:assert/strict";
import { isDefaultArtwork, hasCustomArtwork, prepareArtwork } from "../scripts/artwork.mjs";

test("Foundry and Black Flag placeholders skip art analysis",async()=>{
  for(const path of [
    "",null,undefined,"systems/black-flag/artwork/types/pc.svg",
    "/systems/black-flag/artwork/types/pc.svg?version=1",
    "https://foundry.example/icons/svg/mystery-man.svg",
    "icons/svg/mystery-man.svg"
  ]) {
    assert.equal(isDefaultArtwork(path),true, String(path));
    let fetched=false;
    const result=await prepareArtwork(path,{fetchFn:()=>{fetched=true;throw Error("unwanted fetch")}});
    assert.equal(fetched,false);
    assert.equal(result.image,null);
    assert.equal(result.reason,"default");
  }
  assert.equal(hasCustomArtwork("worlds/test/hero.webp"),true);
});
test("custom Foundry portrait is resized and converted to JPEG",async()=>{
  let w,h,closed=false,draws=0;
  const result=await prepareArtwork("worlds/demo/portraits/hero.webp",{
    baseUrl:"https://foundry.example/game",
    fetchFn:async(url,opts)=>{
      assert.equal(new URL(url).pathname,"/worlds/demo/portraits/hero.webp");
      assert.equal(opts.method,"GET");
      return {ok:true,headers:{get:()=>null},blob:async()=>new Blob(["pngbytes"],{type:"image/png"})};
    },
    bitmapFactory:async()=>({width:2400,height:1200,close(){closed=true;}}),
    canvasFactory:()=>({
      set width(v){w=v},set height(v){h=v},
      getContext:()=>({set fillStyle(_v){},fillRect(){},drawImage(){draws++}}),
      toDataURL:()=> "data:image/jpeg;base64,YWJj"
    })
  });
  assert.equal(result.reason,"attached");
  assert.deepEqual(result.image,{type:"image",mime_type:"image/jpeg",data:"YWJj"});
  assert.equal(w,1024);
  assert.equal(h,512);
  assert.equal(draws,1);
  assert.equal(closed,true);
});
test("image fetch failure or corrupt artwork gracefully uses text-only", async()=>{
  const res=await prepareArtwork("worlds/demo/hero.png",{
    baseUrl:"https://foundry.example/game",
    fetchFn:async()=>{throw new Error("not found");}
  });
  assert.deepEqual(res,{image:null,reason:"unavailable"});
});
test("remote images and unsafe schemes are rejected without fetch",async()=>{
  for(const url of ["https://evil.example/hero.jpg","data:image/jpeg;base64,YWJj","file:///etc/passwd"]) {
    let fetched=false;
    const res=await prepareArtwork(url,{
      baseUrl:"https://foundry.example/game",
      fetchFn:async()=>{fetched=true;throw Error("bad");}
    });
    assert.deepEqual(res,{image:null,reason:"unavailable"});
    assert.equal(fetched,false);
  }
});
test("oversized image file or converted payload is silently skipped",async()=>{
  let decoded=false;
  const res=await prepareArtwork("worlds/demo/hero.png",{
    baseUrl:"https://foundry.example/game",maxSourceBytes:2,
    fetchFn:async()=>({ok:true,headers:{get:()=>null},blob:async()=>new Blob(["large file"],{type:"image/png"})}),
    bitmapFactory:async()=>{decoded=true;}
  });
  assert.deepEqual(res,{image:null,reason:"unavailable"});
  assert.equal(decoded,false);
  const large=await prepareArtwork("worlds/demo/hero.png",{
    baseUrl:"https://foundry.example/game",maxBase64Length:2,
    fetchFn:async()=>({ok:true,headers:{get:()=>null},blob:async()=>new Blob(["file"],{type:"image/png"})}),
    bitmapFactory:async()=>({width:20,height:20,close(){}}),
    canvasFactory:()=>({getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:()=>"data:image/jpeg;base64,YWJj"})
  });
  assert.deepEqual(large,{image:null,reason:"unavailable"});
});
