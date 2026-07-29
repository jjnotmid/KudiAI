# BMONI — source of truth

- Hackathon API doc (Google Doc): https://docs.google.com/document/d/1zdmVqVD0yZgwq0jrZkZJ8oW3s5BSSSlw-NFo1vNdkYo/mobilebasic
- Interactive API reference (needs key): https://embedded-dev.bmoni.com/docs
- LLM doc index: https://bkey.mintlify.site/llms.txt
- Integration flow: https://bkey.mintlify.app/api-reference/integration-flow

Captured 2026-07-29. See `API.md` for the extracted reference and
`../BMONI_INTEGRATION_CHECKLIST.md` for what is still needed.

We do NOT yet have a real `BMONI_SANDBOX_API_KEY`. Until it exists, the app runs
on the deterministic simulator (`MONEY_PROVIDER=sim`). The live provider is wired
with the correct base URL and auth scheme so the swap is small once the key and
the card/transfer/conversion endpoints are confirmed from the interactive docs.
