import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
try { process.loadEnvFile(".env.local"); } catch {}
const B=process.env.BMONI_BASE_URL!,K=process.env.BMONI_API_KEY!;
async function c(m:string,p:string,b?:unknown){const r=await fetch(`${B}${p}`,{method:m,headers:{"x-api-key":K,"content-type":"application/json"},body:b===undefined?undefined:JSON.stringify(b)});return r.json();}
async function main(){
  const t0=Date.now(); const rid=Math.floor(Math.random()*1e8);
  const u=await c("POST","/v1/users",{firstName:"T",email:`t.${rid}@e.com`,phoneNumber:`+2348${String(rid).padStart(9,"0")}`}) as any;
  const uid=u.user.bmoniUserId; const t1=Date.now();
  const o=privateKeyToAccount(generatePrivateKey());
  const ch=await c("POST",`/v1/users/${uid}/smart-wallets/owner-proof-challenges`,{currency:"CNGN",userOwnerAddress:o.address}) as any;
  const t2=Date.now();
  const sig=await o.signMessage({message:ch.message}); const t3=Date.now();
  await c("POST",`/v1/users/${uid}/smart-wallets/create-managed`,{currency:"CNGN",userOwnerAddress:o.address,ownerProofChallengeId:ch.challengeId,ownerProofSignature:sig});
  const t4=Date.now();
  console.log(`createUser ${t1-t0}ms | challenge ${t2-t1}ms | sign ${t3-t2}ms | createWallet ${t4-t3}ms | TOTAL ${t4-t0}ms`);
}
main().catch(e=>console.error(e));
