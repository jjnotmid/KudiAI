try { process.loadEnvFile(".env.local"); } catch {}
const B=process.env.BMONI_BASE_URL!,K=process.env.BMONI_API_KEY!;
const UID="3b7cef50-6218-4dc4-81d6-10810f78f237", SW="07d2df51-2b21-4ee1-8bba-96161ed4182e", WADDR="0xDC4026Dfb6eC87a359De2aDD8dC4A40f8f9afd5D";
async function c(m:string,p:string,b?:unknown){const r=await fetch(`${B}${p}`,{method:m,headers:{"x-api-key":K,"content-type":"application/json"},body:b===undefined?undefined:JSON.stringify(b)});let j:unknown;try{j=await r.json();}catch{j=await r.text();}return{s:r.status,j};}
function show(l:string,v:{s:number;j:unknown}){console.log(`\n=== ${l} [${v.s}] ===`,JSON.stringify(v.j).slice(0,500));}
async function main(){
  show("onboarding/status", await c("GET",`/v1/users/${UID}/onboarding/status`));
  show("start-nigeria", await c("POST",`/v1/users/${UID}/onboarding/start-nigeria`,{bvn:"22222222222",ngnWalletAddress:WADDR,ngnWalletIndex:0}));
  show("onboarding/status after", await c("GET",`/v1/users/${UID}/onboarding/status`));
  const banks=(await c("GET",`/v1/users/${UID}/bank-accounts/nigerian-banks`)).j as {banks?:{bankName:string;bankCode:string}[]};
  const opay=banks.banks?.find(b=>/opay/i.test(b.bankName));
  const name="Musa Okonkwo";
  const reg=await c("POST",`/v1/users/${UID}/bank-accounts/withdrawal-accounts/nigeria`,{accountNumber:"8124966881",bankCode:opay?.bankCode,bankName:opay?.bankName,accountHolderName:name});
  const bankAccountId=(reg.j as {id?:string}).id;
  const off=await c("POST",`/v1/users/${UID}/smart-wallets/${SW}/offramp/nigeria`,{bankAccountId,fromAmount:"100"});
  show("offramp retry",off);
  const pid=((off.j as {data?:{proposalId?:string}}).data?.proposalId) ?? (off.j as {proposalId?:string}).proposalId;
  if(pid){ show("sign-payload", await c("GET",`/v1/users/${UID}/smart-wallets/proposals/${pid}/sign-payload`)); }
}
main().catch(e=>console.error(e));
