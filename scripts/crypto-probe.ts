import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
try { process.loadEnvFile(".env.local"); } catch {}
const B = process.env.BMONI_BASE_URL!, K = process.env.BMONI_API_KEY!;
async function call(m: string, p: string, b?: unknown) {
  const r = await fetch(`${B}${p}`, { method: m, headers: { "x-api-key": K, "content-type": "application/json" }, body: b===undefined?undefined:JSON.stringify(b) });
  let j: unknown; try { j = await r.json(); } catch { j = await r.text(); }
  return { s: r.status, j };
}
function show(l: string, v: {s:number;j:unknown}) { console.log(`\n=== ${l} [${v.s}] ===`, JSON.stringify(v.j).slice(0,400)); }
async function main() {
  const rid = Math.floor(Math.random()*1e8);
  const u = (await call("POST","/v1/users",{firstName:"Crypto",email:`c.${rid}@e.com`,phoneNumber:`+2348${String(rid).padStart(9,"0")}`})).j as {user?:{bmoniUserId?:string}};
  const uid = u.user?.bmoniUserId!;
  const owner = privateKeyToAccount(generatePrivateKey());
  const ch = (await call("POST",`/v1/users/${uid}/smart-wallets/owner-proof-challenges`,{currency:"USDB",userOwnerAddress:owner.address})).j as {challengeId?:string;message?:string};
  if (ch.message){const sig=await owner.signMessage({message:ch.message});await call("POST",`/v1/users/${uid}/smart-wallets/create-managed`,{currency:"USDB",userOwnerAddress:owner.address,ownerProofChallengeId:ch.challengeId,ownerProofSignature:sig});}
  show("GET deposit/supported-assets", await call("GET",`/v1/deposit/supported-assets`));
  show("POST deposit/wallet {Base,USDC}", await call("POST",`/v1/users/${uid}/deposit/wallet`,{chain:"Base",currency:"USDC"}));
  show("DELETE /v1/users/:id", await call("DELETE",`/v1/users/${uid}`));
}
main().catch(e=>console.error(e));
