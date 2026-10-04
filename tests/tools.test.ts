import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRO_REQUIRED, SIGN_IN_REQUIRED } from "../src/access.js";
import { createFileMilestoneStore, type MilestoneStore } from "../src/milestone-store.js";
import { MILESTONE_TOOL_NAMES, createMilestoneMcpServer } from "../src/milestone-tools.js";

async function connect(options: { userId: string; entitled: boolean; store: MilestoneStore }) {
  const client = new Client({ name: "milestone-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMilestoneMcpServer(options);
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ text?: string }> }).content;
  return content?.[0]?.text ?? "";
}

describe("milestone tools", () => {
  it("lists the Milestone tools", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "milestone-"));
    const client = await connect({ userId: "", entitled: false, store: createFileMilestoneStore(path.join(dir, "milestone.json")) });
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([...MILESTONE_TOOL_NAMES].sort());
    const blob = listed.tools.map((tool) => `${tool.name} ${tool.description ?? ""}`).join("\n");
    expect(blob).not.toMatch(/\$\d/);
    expect(blob.toLowerCase()).not.toContain("dollar");
  });

  it("refuses tool calls without sign-in or an active trial", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "milestone-"));
    const saved = createFileMilestoneStore(path.join(dir, "milestone.json"));
    const anonymous = await connect({ userId: "", entitled: false, store: saved });
    const signedOut = await anonymous.callTool({ name: "list_milestone_sets", arguments: {} });
    expect(signedOut.isError).toBe(true);
    expect(textOf(signedOut)).toContain(SIGN_IN_REQUIRED);

    const unpaid = await connect({ userId: "user-1", entitled: false, store: saved });
    const blocked = await unpaid.callTool({ name: "list_milestone_sets", arguments: {} });
    expect(blocked.isError).toBe(true);
    expect(textOf(blocked)).toContain(PRO_REQUIRED);
  });

  it("refuses completion, payment release, an extra deliverable, and unsaved work unless the record allows them", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "milestone-"));
    const saved = createFileMilestoneStore(path.join(dir, "milestone.json"));
    const client = await connect({ userId: "user-1", entitled: true, store: saved });
    const created = await client.callTool({
      name: "open_milestone_set",
      arguments: { clientName: "Northwind", projectTitle: "Spring launch", reference: "MS-104" }
    });
    const milestoneSetId = JSON.parse(textOf(created)).milestoneSet.id as string;
    const defined = await client.callTool({
      name: "define_milestone",
      arguments: { milestoneSetId, title: "Homepage", definition: "The public homepage is ready for review." }
    });
    const milestoneId = JSON.parse(textOf(defined)).id as string;
    const criterion = await client.callTool({
      name: "save_acceptance_criterion",
      arguments: { milestoneSetId, milestoneId, statement: "The homepage is deployed on the preview host." }
    });
    const criterionId = JSON.parse(textOf(criterion)).id as string;
    await client.callTool({
      name: "save_deliverable",
      arguments: { milestoneSetId, milestoneId, title: "Preview site", detail: "A reachable preview of the homepage." }
    });
    const work = await client.callTool({
      name: "save_work_item",
      arguments: { milestoneSetId, milestoneId, title: "Deploy the homepage" }
    });
    const workItemId = JSON.parse(textOf(work)).id as string;
    await client.callTool({
      name: "write_client_wording",
      arguments: { milestoneSetId, wording: "Milestone 1 is still open. Do not call it complete." }
    });
    await client.callTool({ name: "approve_milestones", arguments: { milestoneSetId, confirmed: true } });

    const unsaved = await client.callTool({
      name: "mark_work_done",
      arguments: { milestoneSetId, milestoneId, workItemId: randomUUID() }
    });
    expect(unsaved.isError).toBe(true);
    expect(textOf(unsaved)).toContain("not saved");
    expect(textOf(unsaved)).toContain("unsaved");

    const done = await client.callTool({
      name: "mark_work_done",
      arguments: { milestoneSetId, milestoneId, workItemId }
    });
    expect(done.isError).toBeUndefined();
    expect(JSON.parse(textOf(done)).state).toBe("done");

    const complete = await client.callTool({
      name: "declare_milestone_complete",
      arguments: { milestoneSetId, milestoneId }
    });
    expect(complete.isError).toBe(true);
    expect(textOf(complete)).toContain("Refused:");
    expect(textOf(complete)).toContain("complete");
    expect(textOf(complete)).toContain("acceptance criteria");

    const payment = await client.callTool({
      name: "declare_next_payment_released",
      arguments: { milestoneSetId, milestoneId }
    });
    expect(payment.isError).toBe(true);
    expect(textOf(payment)).toContain("next payment");
    expect(textOf(payment)).toContain("acceptance criteria");

    const extra = await client.callTool({
      name: "save_deliverable",
      arguments: { milestoneSetId, milestoneId, title: "Source archive", detail: "Files that were never approved." }
    });
    expect(extra.isError).toBe(true);
    expect(textOf(extra)).toContain("deliverable");

    const suggestion = await client.callTool({
      name: "suggest_milestone_change",
      arguments: {
        milestoneSetId,
        kind: "add_deliverable",
        summary: "Freelancer approved one more deliverable.",
        milestoneId,
        title: "Source archive",
        detail: "The exported project files."
      }
    });
    const changeId = JSON.parse(textOf(suggestion)).id as string;
    const pending = await client.callTool({ name: "read_milestone_set", arguments: { milestoneSetId } });
    expect(JSON.parse(textOf(pending)).milestones[0].deliverables).toHaveLength(1);
    expect(JSON.parse(textOf(pending)).milestones[0].status).toBe("open");
    expect(textOf(pending)).toContain("Do not tell the client");

    await client.callTool({
      name: "record_criterion_met",
      arguments: { milestoneSetId, milestoneId, criterionId }
    });
    const finished = await client.callTool({
      name: "declare_milestone_complete",
      arguments: { milestoneSetId, milestoneId }
    });
    expect(JSON.parse(textOf(finished)).status).toBe("complete");
    const released = await client.callTool({
      name: "declare_next_payment_released",
      arguments: { milestoneSetId, milestoneId }
    });
    expect(JSON.parse(textOf(released)).paymentRelease).toBe("released");

    const applied = await client.callTool({
      name: "accept_milestone_change",
      arguments: { milestoneSetId, changeId, confirmed: true }
    });
    expect(JSON.parse(textOf(applied)).milestones[0].deliverables).toHaveLength(2);
    expect(JSON.parse(textOf(applied)).milestones[0].paymentRelease).toBe("released");
  });
});
