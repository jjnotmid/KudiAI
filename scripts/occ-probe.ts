try { process.loadEnvFile(".env.local"); } catch { /* */ }
async function main() {
  const B = process.env.BMONI_BASE_URL ?? "https://embedded-dev.bmoni.com";
  const K = process.env.BMONI_API_KEY ?? "";
  const u = await (await fetch(`${B}/v1/users`, { method:"POST", headers:{"x-api-key":K,"content-type":"application/json"}, body: JSON.stringify({firstName:"Occ",email:`occ.${Date.now()}@example.com`,phoneNumber:`+23481${String(Date.now()).slice(-8)}`})})).json() as { user?: { bmoniUserId?: string } };
  const uid = u.user?.bmoniUserId;
  for (const term of ["business","sales","trader","teacher","engineer","developer","self"]) {
    const r = await (await fetch(`${B}/v1/users/${uid}/kyc/occupations?search=${term}`, { headers:{"x-api-key":K}})).json();
    console.log(term, "=>", JSON.stringify(r).slice(0,250));
  }
}
main().catch((e) => console.error(e));
