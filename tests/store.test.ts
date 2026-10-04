import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  REFUSED_COMPLETE,
  REFUSED_DELIVERABLE,
  REFUSED_DRAFT_COMPLETE,
  REFUSED_NEW_CRITERION,
  REFUSED_PAYMENT,
  REFUSED_PAYMENT_OPEN,
  REFUSED_UNSAVED_WORK,
  REFUSED_WORDING
} from "../src/milestone-policy.js";
import { assertMilestoneDataPath, createFileMilestoneStore, defaultMilestoneDataPath } from "../src/milestone-store.js";

const WORDING = "Milestone 1 is still open. Do not call it complete and do not say the next payment is released.";

async function store() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "milestone-"));
  return createFileMilestoneStore(path.join(dir, "milestone.json"));
}

async function approved() {
  const saved = await store();
  const set = await saved.openMilestoneSet("user-1", {
    clientName: "Northwind",
    projectTitle: "Spring launch",
    reference: "MS-104"
  });
  const milestone = await saved.defineMilestone("user-1", {
    milestoneSetId: set.id,
    title: "Homepage",
    definition: "The public homepage is ready for the client to review."
  });
  const first = await saved.saveAcceptanceCriterion("user-1", {
    milestoneSetId: set.id,
    milestoneId: milestone.id,
    statement: "The homepage is deployed on the preview host."
  });
  const second = await saved.saveAcceptanceCriterion("user-1", {
    milestoneSetId: set.id,
    milestoneId: milestone.id,
    statement: "The freelancer sent the preview link."
  });
  await saved.saveDeliverable("user-1", {
    milestoneSetId: set.id,
    milestoneId: milestone.id,
    title: "Preview site",
    detail: "A reachable preview of the homepage."
  });
  const work = await saved.saveWorkItem("user-1", {
    milestoneSetId: set.id,
    milestoneId: milestone.id,
    title: "Deploy the homepage"
  });
  await saved.writeClientWording("user-1", { milestoneSetId: set.id, wording: WORDING });
  await saved.approveMilestones("user-1", set.id);
  return { saved, setId: set.id, milestoneId: milestone.id, firstId: first.id, secondId: second.id, workId: work.id };
}

describe("milestone store", () => {
  it("uses its own data file and refuses other product files", () => {
    expect(defaultMilestoneDataPath()).toBe(path.join(os.homedir(), ".milestone", "milestone.json"));
    expect(assertMilestoneDataPath(defaultMilestoneDataPath())).toBe(path.resolve(defaultMilestoneDataPath()));
    expect(() => assertMilestoneDataPath(path.join(os.homedir(), ".scope", "scope.json"))).toThrow(/own file/);
    expect(() => assertMilestoneDataPath(path.join(os.homedir(), ".retain", "retain.json"))).toThrow(/own file/);
    expect(() => assertMilestoneDataPath(path.join(os.homedir(), ".invoice", "invoice.json"))).toThrow(/own file/);
    expect(() => assertMilestoneDataPath(path.join(os.homedir(), ".deposit", "deposit.json"))).toThrow(/own file/);
    expect(() => assertMilestoneDataPath("~/.scope/scope.json")).toThrow(/own file/);
    expect(() => assertMilestoneDataPath("~/.retain/retain.json")).toThrow(/own file/);
    expect(() => assertMilestoneDataPath("~/.invoice/invoice.json")).toThrow(/own file/);
    expect(() => assertMilestoneDataPath("~/.deposit/deposit.json")).toThrow(/own file/);
  });

  it("refuses completion, payment release, an extra deliverable, and unsaved work after approval", async () => {
    const { saved, setId, milestoneId, firstId, secondId, workId } = await approved();

    const savedWork = await saved.markWorkDone("user-1", { milestoneSetId: setId, milestoneId, workItemId: workId });
    expect(savedWork.state).toBe("done");
    await expect(saved.markWorkDone("user-1", {
      milestoneSetId: setId,
      milestoneId,
      workItemId: randomUUID()
    })).rejects.toThrow(REFUSED_UNSAVED_WORK);

    await expect(saved.declareMilestoneComplete("user-1", { milestoneSetId: setId, milestoneId })).rejects.toThrow(REFUSED_COMPLETE);
    await expect(saved.declareNextPaymentReleased("user-1", { milestoneSetId: setId, milestoneId })).rejects.toThrow(REFUSED_PAYMENT);
    await expect(saved.saveDeliverable("user-1", {
      milestoneSetId: setId,
      milestoneId,
      title: "Source archive",
      detail: "Files that were never approved."
    })).rejects.toThrow(REFUSED_DELIVERABLE);
    await expect(saved.saveAcceptanceCriterion("user-1", {
      milestoneSetId: setId,
      milestoneId,
      statement: "An extra unspoken requirement."
    })).rejects.toThrow(REFUSED_NEW_CRITERION);
    await expect(saved.writeClientWording("user-1", {
      milestoneSetId: setId,
      wording: "Tell the client the milestone is complete and the next payment is released."
    })).rejects.toThrow(REFUSED_WORDING);

    await saved.recordCriterionMet("user-1", { milestoneSetId: setId, milestoneId, criterionId: firstId });
    await expect(saved.declareMilestoneComplete("user-1", { milestoneSetId: setId, milestoneId })).rejects.toThrow(REFUSED_COMPLETE);

    await saved.recordCriterionMet("user-1", { milestoneSetId: setId, milestoneId, criterionId: secondId });
    await expect(saved.declareNextPaymentReleased("user-1", { milestoneSetId: setId, milestoneId })).rejects.toThrow(REFUSED_PAYMENT_OPEN);

    const complete = await saved.declareMilestoneComplete("user-1", { milestoneSetId: setId, milestoneId });
    expect(complete.status).toBe("complete");
    const released = await saved.declareNextPaymentReleased("user-1", { milestoneSetId: setId, milestoneId });
    expect(released.paymentRelease).toBe("released");
    const again = await saved.declareMilestoneComplete("user-1", { milestoneSetId: setId, milestoneId });
    expect(again.status).toBe("complete");

    const before = await saved.readMilestoneSet("user-1", setId);
    expect(before.milestoneSet.status).toBe("approved");
    expect(before.milestones[0]?.status).toBe("complete");
    expect(before.milestones[0]?.paymentRelease).toBe("released");
    expect(before.mayTellClient.milestones[0]?.acceptanceCriteriaMet).toBe(true);
    expect(before.mayTellClient.limits.join(" ")).toContain("You may say Homepage is complete");
    expect(before.mayTellClient.limits.join(" ")).toContain("next payment for Homepage is released");
    expect(before.clientWording).toBe(WORDING);
    expect(before.guidance).toContain("saved acceptance criteria");
    expect(before.milestones[0]?.deliverables).toHaveLength(1);

    const suggested = await saved.suggestMilestoneChange("user-1", {
      milestoneSetId: setId,
      kind: "add_deliverable",
      summary: "Freelancer approved one more deliverable.",
      milestoneId,
      title: "Source archive",
      detail: "The exported project files."
    });
    expect(suggested.status).toBe("proposed");
    expect(suggested.applied).toBe(false);
    expect((await saved.readMilestoneSet("user-1", setId)).milestones[0]?.deliverables).toHaveLength(1);

    const applied = await saved.acceptMilestoneChange("user-1", setId, suggested.id);
    expect(applied.milestones[0]?.deliverables.map((row) => row.title)).toContain("Source archive");
    const appliedAgain = await saved.acceptMilestoneChange("user-1", setId, suggested.id);
    expect(appliedAgain.milestones[0]?.deliverables.filter((row) => row.title === "Source archive")).toHaveLength(1);
  });

  it("reopens a complete milestone when a new acceptance criterion is accepted", async () => {
    const { saved, setId, milestoneId, firstId, secondId } = await approved();
    await saved.recordCriterionMet("user-1", { milestoneSetId: setId, milestoneId, criterionId: firstId });
    await saved.recordCriterionMet("user-1", { milestoneSetId: setId, milestoneId, criterionId: secondId });
    await saved.declareMilestoneComplete("user-1", { milestoneSetId: setId, milestoneId });
    await saved.declareNextPaymentReleased("user-1", { milestoneSetId: setId, milestoneId });
    const suggested = await saved.suggestMilestoneChange("user-1", {
      milestoneSetId: setId,
      kind: "add_criterion",
      summary: "Freelancer added one more thing done means.",
      milestoneId,
      statement: "The contact form sends a test message."
    });
    const pending = await saved.readMilestoneSet("user-1", setId);
    expect(pending.milestones[0]?.status).toBe("complete");
    const reopened = await saved.acceptMilestoneChange("user-1", setId, suggested.id);
    expect(reopened.milestones[0]?.status).toBe("open");
    expect(reopened.milestones[0]?.paymentRelease).toBe("held");
    expect(reopened.mayTellClient.limits.join(" ")).toContain("Do not tell the client Homepage is complete");
    await expect(saved.declareMilestoneComplete("user-1", { milestoneSetId: setId, milestoneId })).rejects.toThrow(REFUSED_COMPLETE);
  });

  it("refuses completion before the milestones are approved", async () => {
    const saved = await store();
    const set = await saved.openMilestoneSet("user-1", {
      clientName: "Ada",
      projectTitle: "Writing site",
      reference: "MS-9"
    });
    const milestone = await saved.defineMilestone("user-1", {
      milestoneSetId: set.id,
      title: "Draft",
      definition: "A first chapter."
    });
    const criterion = await saved.saveAcceptanceCriterion("user-1", {
      milestoneSetId: set.id,
      milestoneId: milestone.id,
      statement: "The chapter is delivered."
    });
    await saved.recordCriterionMet("user-1", { milestoneSetId: set.id, milestoneId: milestone.id, criterionId: criterion.id });
    await expect(saved.declareMilestoneComplete("user-1", { milestoneSetId: set.id, milestoneId: milestone.id })).rejects.toThrow(REFUSED_DRAFT_COMPLETE);
  });

  it("keeps each freelancer's milestones and reloads them from disk", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "milestone-"));
    const file = path.join(dir, "milestone.json");
    const first = createFileMilestoneStore(file);
    const set = await first.openMilestoneSet("user-1", {
      clientName: "Ada",
      projectTitle: "Writing site",
      reference: "MS-9"
    });
    await expect(first.readMilestoneSet("user-2", set.id)).rejects.toThrow("Milestone set not found");
    const second = createFileMilestoneStore(file);
    const listed = await second.listMilestoneSets("user-1", 0);
    expect(listed.milestoneSets[0]?.id).toBe(set.id);
    expect(listed.milestoneSets[0]?.projectTitle).toBe("Writing site");
    expect(await second.listMilestoneSets("user-2", 0)).toEqual({ milestoneSets: [], nextOffset: null });
  });
});
