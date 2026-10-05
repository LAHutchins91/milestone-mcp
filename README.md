# Milestone

Milestone keeps a freelancer's approved milestone definitions and what done means, then lets an assistant read that record before it answers. An assistant cannot say a milestone is complete, or that the next payment is released, unless the saved acceptance criteria were met. It cannot invent an extra deliverable or mark work done that was not saved.

It works with ChatGPT, Claude, Gemini, Grok, and Cursor, plus any other MCP client that can do Streamable HTTP and OAuth. It is not a ChatGPT-only plugin.

Sign in with your Milestone account when the assistant opens OAuth. Do not paste an API key or password into a header. Milestone supports dynamic client registration: leave the client id and secret empty. The protected-resource metadata at `/.well-known/oauth-protected-resource/mcp` points clients at the OAuth issuer, which registers them.

Milestone tools need Pro or an active trial. A new subscription includes a 14-day trial. This page does not list a price. Checkout shows the billing interval and payment terms.

There is no hosted production domain in this repository. Run the server yourself and use the base URL you configure. The default MCP address is `http://127.0.0.1:3000/mcp`.

## What the assistant can do

After you approve the connection, the server exposes these tools:

- list_milestone_sets
- open_milestone_set
- read_milestone_set
- define_milestone
- save_acceptance_criterion
- save_deliverable
- save_work_item
- record_criterion_met
- declare_milestone_complete
- declare_next_payment_released
- mark_work_done
- write_client_wording
- approve_milestones
- suggest_milestone_change
- accept_milestone_change

`read_milestone_set` is the read the assistant should do before it answers. It includes the milestone definitions, the acceptance criteria that say what done means, the saved deliverables and work, and what the assistant may tell the client. Draft definitions are not an approved commitment. A suggested milestone change does not change the record. After the milestones are approved, `declare_milestone_complete` refuses to call a milestone complete and `declare_next_payment_released` refuses to say the next payment is released unless every saved acceptance criterion on that milestone was met. `save_deliverable` refuses an extra deliverable, and `mark_work_done` refuses work that was not saved. Those additions go through `suggest_milestone_change` and then `accept_milestone_change`, and only when you explicitly approve that change.

The assistant only calls these tools when you and the host allow it.

## Connect

Cursor, in `~/.cursor/mcp.json` or a project `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "milestone": {
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

Do not add a headers block. Cursor registers a client and opens sign-in.

Claude Code:

```bash
claude mcp add --transport http milestone http://127.0.0.1:3000/mcp
```

Do not pass an Authorization header. Other clients use the same address, choose OAuth, and leave client id and secret empty. Steps for ChatGPT, Claude, Gemini, Grok, and Cursor are on the connect page at `/connect`.

Registry metadata for this server is in `server.json` (`io.github.LAHutchins91/milestone`). The public remote MCP URL there is `https://milestone-continuity2.vercel.app/mcp`.

## Run

```bash
npm install
npm test
npm run typecheck
npm run build
npm start
```

When stdin is a terminal, Milestone serves Streamable HTTP on port 3000. When stdin is not a terminal, it speaks MCP over stdio and still opens the HTTP port. Logs during stdio mode go to stderr so they do not mix with the protocol.

Records are stored durably in a JSON file. The default path is `~/.milestone/milestone.json`. Set `MILESTONE_DATA_PATH` to move it. One server process owns that file. Do not point it at another product's data file.

OAuth uses the same idea as a Supabase authorization server with dynamic client registration. Set these on the server process, not in an MCP header:

- `APP_BASE_URL` (default `http://localhost:3000`)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY` (Stripe catalog ids, not a product price)

Tool calls other than discovery require a signed-in account whose subscription status is `active` or `trialing`.
