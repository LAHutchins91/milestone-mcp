import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  RECORD_GUIDANCE,
  REFUSED_UNSAVED_CRITERION,
  MilestoneRefusal,
  MilestoneUserError,
  assertMilestoneComplete,
  assertNewCriterion,
  assertNewDeliverable,
  assertNewMilestone,
  assertNewWorkItem,
  assertPaymentReleased,
  assertSavedCriterion,
  assertSavedWork,
  assertWordingWrite,
  buildMayTellClient,
  criteriaAreMet,
  labelKey,
  type ChangeKind,
  type CriterionState,
  type MayTellClient,
  type MilestoneProgress,
  type PaymentRelease,
  type PlanStatus,
  type WorkState
} from "./milestone-policy.js";

export type { ChangeKind, MayTellClient, PlanStatus };

const MAX_SETS = 50;
const PAGE_SIZE = 20;
const MAX_MILESTONES = 20;
const MAX_CRITERIA = 30;
const MAX_DELIVERABLES = 30;
const MAX_WORK = 30;
const MAX_CHANGES = 200;
const MAX_SUPPORT = 200;

export type AcceptanceCriterion = {
  id: string;
  statement: string;
  state: CriterionState;
  metAt: string | null;
};

export type Deliverable = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
};

export type WorkItem = {
  id: string;
  title: string;
  state: WorkState;
  doneAt: string | null;
  createdAt: string;
};

export type Milestone = {
  id: string;
  title: string;
  definition: string;
  sequence: number;
  status: MilestoneProgress;
  paymentRelease: PaymentRelease;
  criteria: AcceptanceCriterion[];
  deliverables: Deliverable[];
  work: WorkItem[];
  completedAt: string | null;
  paymentReleasedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MilestoneChange = {
  id: string;
  kind: ChangeKind;
  status: "proposed" | "approved";
  summary: string;
  milestoneId: string | null;
  title: string | null;
  definition: string | null;
  statement: string | null;
  detail: string | null;
  wording: string | null;
  applied: boolean;
  createdAt: string;
  approvedAt: string | null;
};

export type MilestoneSet = {
  id: string;
  clientName: string;
  projectTitle: string;
  reference: string;
  status: PlanStatus;
  approvedAt: string | null;
  clientWording: string | null;
  milestones: Milestone[];
  changes: MilestoneChange[];
  createdAt: string;
  updatedAt: string;
};

export type MilestoneSetSummary = {
  id: string;
  clientName: string;
  projectTitle: string;
  reference: string;
  status: PlanStatus;
  milestoneCount: number;
  completeCount: number;
};

export type Profile = {
  userId: string;
  subscriptionStatus: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export type MilestoneSetRecord = {
  milestoneSet: {
    id: string;
    clientName: string;
    projectTitle: string;
    reference: string;
    status: PlanStatus;
    approvedAt: string | null;
  };
  clientWording: string | null;
  milestones: Milestone[];
  mayTellClient: MayTellClient;
  approvedChanges: MilestoneChange[];
  proposedChanges: MilestoneChange[];
  guidance: string;
};

export type OpenMilestoneSetInput = {
  clientName: string;
  projectTitle: string;
  reference: string;
};

export type DefineMilestoneInput = {
  milestoneSetId: string;
  title: string;
  definition: string;
};

export type SaveCriterionInput = {
  milestoneSetId: string;
  milestoneId: string;
  statement: string;
};

export type SaveDeliverableInput = {
  milestoneSetId: string;
  milestoneId: string;
  title: string;
  detail: string;
};

export type SaveWorkInput = {
  milestoneSetId: string;
  milestoneId: string;
  title: string;
};

export type CriterionMetInput = {
  milestoneSetId: string;
  milestoneId: string;
  criterionId: string;
};

export type MilestoneIdInput = {
  milestoneSetId: string;
  milestoneId: string;
};

export type MarkWorkInput = {
  milestoneSetId: string;
  milestoneId: string;
  workItemId: string;
};

export type ClientWordingInput = {
  milestoneSetId: string;
  wording: string;
};

export type SuggestChangeInput = {
  milestoneSetId: string;
  kind: ChangeKind;
  summary: string;
  milestoneId?: string;
  title?: string;
  definition?: string;
  statement?: string;
  detail?: string;
  wording?: string;
};

type SupportRequest = { id: string; email: string; message: string; createdAt: string };

type FileData = {
  version: 1;
  profiles: Record<string, Profile>;
  milestoneSets: Record<string, MilestoneSet[]>;
  supportRequests: SupportRequest[];
};

export type MilestoneStore = {
  getProfile(userId: string): Promise<Profile>;
  updateProfile(userId: string, patch: Partial<Omit<Profile, "userId">>): Promise<Profile>;
  listMilestoneSets(userId: string, offset: number): Promise<{ milestoneSets: MilestoneSetSummary[]; nextOffset: number | null }>;
  openMilestoneSet(userId: string, input: OpenMilestoneSetInput): Promise<MilestoneSet>;
  readMilestoneSet(userId: string, milestoneSetId: string): Promise<MilestoneSetRecord>;
  defineMilestone(userId: string, input: DefineMilestoneInput): Promise<Milestone>;
  saveAcceptanceCriterion(userId: string, input: SaveCriterionInput): Promise<AcceptanceCriterion>;
  saveDeliverable(userId: string, input: SaveDeliverableInput): Promise<Deliverable>;
  saveWorkItem(userId: string, input: SaveWorkInput): Promise<WorkItem>;
  recordCriterionMet(userId: string, input: CriterionMetInput): Promise<AcceptanceCriterion>;
  declareMilestoneComplete(userId: string, input: MilestoneIdInput): Promise<Milestone>;
  declareNextPaymentReleased(userId: string, input: MilestoneIdInput): Promise<Milestone>;
  markWorkDone(userId: string, input: MarkWorkInput): Promise<WorkItem>;
  writeClientWording(userId: string, input: ClientWordingInput): Promise<{ clientWording: string }>;
  approveMilestones(userId: string, milestoneSetId: string): Promise<MilestoneSetRecord>;
  suggestMilestoneChange(userId: string, input: SuggestChangeInput): Promise<MilestoneChange>;
  acceptMilestoneChange(userId: string, milestoneSetId: string, changeId: string): Promise<MilestoneSetRecord>;
  addSupportRequest(input: { email: string; message: string }): Promise<{ id: string }>;
};

const FOREIGN_DATA_FILES = [
  [".scope", "scope.json"],
  [".retain", "retain.json"],
  [".invoice", "invoice.json"],
  [".deposit", "deposit.json"]
] as const;

export function defaultMilestoneDataPath(): string {
  return path.join(os.homedir(), ".milestone", "milestone.json");
}

export function assertMilestoneDataPath(filePath: string): string {
  const trimmed = filePath.trim();
  const expanded = trimmed === "~"
    ? os.homedir()
    : trimmed.startsWith("~/")
      ? path.join(os.homedir(), trimmed.slice(2))
      : trimmed;
  const resolved = path.resolve(expanded);
  const forbidden = FOREIGN_DATA_FILES.map(([dir, file]) => path.resolve(path.join(os.homedir(), dir, file)));
  if (forbidden.includes(resolved)) throw new MilestoneUserError("Milestone data must use its own file.");
  return resolved;
}

function emptyData(): FileData {
  return { version: 1, profiles: {}, milestoneSets: {}, supportRequests: [] };
}

function nowIso(): string {
  return new Date().toISOString();
}

function cleanText(value: string, label: string, max: number): string {
  const text = value.trim();
  if (!text || text.length > max) throw new MilestoneUserError(`${label} must be 1–${max} characters.`);
  return text;
}

function blankProfile(userId: string): Profile {
  return {
    userId,
    subscriptionStatus: "none",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false
  };
}

function summary(set: MilestoneSet): MilestoneSetSummary {
  return {
    id: set.id,
    clientName: set.clientName,
    projectTitle: set.projectTitle,
    reference: set.reference,
    status: set.status,
    milestoneCount: set.milestones.length,
    completeCount: set.milestones.filter((milestone) => milestone.status === "complete").length
  };
}

function toRecord(set: MilestoneSet): MilestoneSetRecord {
  return {
    milestoneSet: {
      id: set.id,
      clientName: set.clientName,
      projectTitle: set.projectTitle,
      reference: set.reference,
      status: set.status,
      approvedAt: set.approvedAt
    },
    clientWording: set.clientWording,
    milestones: set.milestones,
    mayTellClient: buildMayTellClient({
      status: set.status,
      clientWording: set.clientWording,
      milestones: set.milestones
    }),
    approvedChanges: set.changes.filter((change) => change.status === "approved"),
    proposedChanges: set.changes.filter((change) => change.status === "proposed"),
    guidance: RECORD_GUIDANCE
  };
}

function setsFor(data: FileData, userId: string): MilestoneSet[] {
  const rows = data.milestoneSets[userId];
  if (!rows) {
    data.milestoneSets[userId] = [];
    return data.milestoneSets[userId];
  }
  return rows;
}

function findSet(data: FileData, userId: string, milestoneSetId: string): MilestoneSet {
  const set = (data.milestoneSets[userId] ?? []).find((row) => row.id === milestoneSetId);
  if (!set) throw new MilestoneUserError("Milestone set not found");
  return set;
}

function findMilestone(set: MilestoneSet, milestoneId: string): Milestone {
  const milestone = set.milestones.find((row) => row.id === milestoneId);
  if (!milestone) throw new MilestoneUserError("Milestone not found");
  return milestone;
}

function blankChange(kind: ChangeKind, summary: string): MilestoneChange {
  const stamp = nowIso();
  return {
    id: randomUUID(),
    kind,
    status: "proposed",
    summary,
    milestoneId: null,
    title: null,
    definition: null,
    statement: null,
    detail: null,
    wording: null,
    applied: false,
    createdAt: stamp,
    approvedAt: null
  };
}

function reopenIfNeeded(milestone: Milestone, stamp: string): void {
  if (milestone.status !== "complete" && milestone.paymentRelease !== "released") return;
  milestone.status = "open";
  milestone.completedAt = null;
  milestone.paymentRelease = "held";
  milestone.paymentReleasedAt = null;
  milestone.updatedAt = stamp;
}

export function createFileMilestoneStore(filePath: string): MilestoneStore {
  const resolved = assertMilestoneDataPath(filePath);
  let chain: Promise<void> = Promise.resolve();

  async function read(): Promise<FileData> {
    try {
      const text = await readFile(resolved, "utf8");
      if (!text.trim()) return emptyData();
      const parsed = JSON.parse(text) as FileData;
      if (parsed.version !== 1 || !parsed.profiles || !parsed.milestoneSets || !Array.isArray(parsed.supportRequests)) {
        throw new MilestoneUserError("Milestone data could not be read.");
      }
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyData();
      if (error instanceof MilestoneUserError) throw error;
      throw new MilestoneUserError("Milestone data could not be read.");
    }
  }

  async function write(data: FileData): Promise<void> {
    await mkdir(path.dirname(resolved), { recursive: true });
    const tmp = path.join(path.dirname(resolved), `.${path.basename(resolved)}.${process.pid}.${randomUUID()}.tmp`);
    await writeFile(tmp, JSON.stringify(data), "utf8");
    await rename(tmp, resolved);
  }

  function enqueue<T>(fn: (data: FileData) => T, persist: boolean): Promise<T> {
    const run = chain.then(async () => {
      const data = await read();
      const result = fn(data);
      if (persist) await write(data);
      return structuredClone(result);
    });
    chain = run.then(() => undefined, () => undefined);
    return run;
  }

  return {
    getProfile(userId) {
      return enqueue((data) => data.profiles[userId] ?? blankProfile(userId), false);
    },
    updateProfile(userId, patch) {
      return enqueue((data) => {
        const current = data.profiles[userId] ?? blankProfile(userId);
        const next: Profile = { ...current, ...patch, userId };
        data.profiles[userId] = next;
        return next;
      }, true);
    },
    listMilestoneSets(userId, offset) {
      return enqueue((data) => {
        const rows = data.milestoneSets[userId] ?? [];
        const start = Math.max(0, offset);
        const page = rows.slice(start, start + PAGE_SIZE).map(summary);
        const nextOffset = start + page.length < rows.length ? start + page.length : null;
        return { milestoneSets: page, nextOffset };
      }, false);
    },
    openMilestoneSet(userId, input) {
      return enqueue((data) => {
        const rows = setsFor(data, userId);
        if (rows.length >= MAX_SETS) throw new MilestoneUserError("Milestone set limit reached.");
        const reference = cleanText(input.reference, "Reference", 40);
        if (rows.some((row) => labelKey(row.reference) === labelKey(reference))) {
          throw new MilestoneUserError("That reference is already in use.");
        }
        const stamp = nowIso();
        const set: MilestoneSet = {
          id: randomUUID(),
          clientName: cleanText(input.clientName, "Client name", 200),
          projectTitle: cleanText(input.projectTitle, "Project title", 200),
          reference,
          status: "draft",
          approvedAt: null,
          clientWording: null,
          milestones: [],
          changes: [],
          createdAt: stamp,
          updatedAt: stamp
        };
        rows.unshift(set);
        return set;
      }, true);
    },
    readMilestoneSet(userId, milestoneSetId) {
      return enqueue((data) => toRecord(findSet(data, userId, milestoneSetId)), false);
    },
    defineMilestone(userId, input) {
      return enqueue((data) => {
        const set = findSet(data, userId, input.milestoneSetId);
        assertNewMilestone(set.status);
        if (set.milestones.length >= MAX_MILESTONES) throw new MilestoneUserError("Milestone limit reached.");
        const title = cleanText(input.title, "Milestone title", 200);
        if (set.milestones.some((row) => labelKey(row.title) === labelKey(title))) {
          throw new MilestoneUserError("That milestone is already saved.");
        }
        const stamp = nowIso();
        const milestone: Milestone = {
          id: randomUUID(),
          title,
          definition: cleanText(input.definition, "Milestone definition", 2000),
          sequence: set.milestones.length + 1,
          status: "open",
          paymentRelease: "held",
          criteria: [],
          deliverables: [],
          work: [],
          completedAt: null,
          paymentReleasedAt: null,
          createdAt: stamp,
          updatedAt: stamp
        };
        set.milestones.push(milestone);
        set.updatedAt = stamp;
        return milestone;
      }, true);
    },
    saveAcceptanceCriterion(userId, input) {
      return enqueue((data) => {
        const set = findSet(data, userId, input.milestoneSetId);
        assertNewCriterion(set.status);
        const milestone = findMilestone(set, input.milestoneId);
        if (milestone.criteria.length >= MAX_CRITERIA) throw new MilestoneUserError("Acceptance criterion limit reached.");
        const statement = cleanText(input.statement, "Acceptance criterion", 500);
        if (milestone.criteria.some((row) => labelKey(row.statement) === labelKey(statement))) {
          throw new MilestoneUserError("That acceptance criterion is already saved.");
        }
        const stamp = nowIso();
        const criterion: AcceptanceCriterion = { id: randomUUID(), statement, state: "open", metAt: null };
        milestone.criteria.push(criterion);
        milestone.updatedAt = stamp;
        set.updatedAt = stamp;
        return criterion;
      }, true);
    },
    saveDeliverable(userId, input) {
      return enqueue((data) => {
        const set = findSet(data, userId, input.milestoneSetId);
        assertNewDeliverable(set.status);
        const milestone = findMilestone(set, input.milestoneId);
        if (milestone.deliverables.length >= MAX_DELIVERABLES) throw new MilestoneUserError("Deliverable limit reached.");
        const title = cleanText(input.title, "Deliverable title", 200);
        if (milestone.deliverables.some((row) => labelKey(row.title) === labelKey(title))) {
          throw new MilestoneUserError("That deliverable is already saved.");
        }
        const stamp = nowIso();
        const deliverable: Deliverable = {
          id: randomUUID(),
          title,
          detail: cleanText(input.detail, "Deliverable detail", 1000),
          createdAt: stamp
        };
        milestone.deliverables.push(deliverable);
        milestone.updatedAt = stamp;
        set.updatedAt = stamp;
        return deliverable;
      }, true);
    },
    saveWorkItem(userId, input) {
      return enqueue((data) => {
        const set = findSet(data, userId, input.milestoneSetId);
        assertNewWorkItem(set.status);
        const milestone = findMilestone(set, input.milestoneId);
        if (milestone.work.length >= MAX_WORK) throw new MilestoneUserError("Work item limit reached.");
        const title = cleanText(input.title, "Work title", 200);
        if (milestone.work.some((row) => labelKey(row.title) === labelKey(title))) {
          throw new MilestoneUserError("That work is already saved.");
        }
        const stamp = nowIso();
        const item: WorkItem = { id: randomUUID(), title, state: "open", doneAt: null, createdAt: stamp };
        milestone.work.push(item);
        milestone.updatedAt = stamp;
        set.updatedAt = stamp;
        return item;
      }, true);
    },
    recordCriterionMet(userId, input) {
      return enqueue((data) => {
        const set = findSet(data, userId, input.milestoneSetId);
        const milestone = findMilestone(set, input.milestoneId);
        const criterion = milestone.criteria.find((row) => row.id === input.criterionId);
        assertSavedCriterion(Boolean(criterion));
        if (!criterion) throw new MilestoneRefusal(REFUSED_UNSAVED_CRITERION);
        if (criterion.state === "met") return criterion;
        const stamp = nowIso();
        criterion.state = "met";
        criterion.metAt = stamp;
        milestone.updatedAt = stamp;
        set.updatedAt = stamp;
        return criterion;
      }, true);
    },
    declareMilestoneComplete(userId, input) {
      return enqueue((data) => {
        const set = findSet(data, userId, input.milestoneSetId);
        const milestone = findMilestone(set, input.milestoneId);
        const met = criteriaAreMet(milestone.criteria);
        assertMilestoneComplete({
          planStatus: set.status,
          criteriaMet: met,
          alreadyComplete: milestone.status === "complete"
        });
        if (milestone.status === "complete") return milestone;
        const stamp = nowIso();
        milestone.status = "complete";
        milestone.completedAt = stamp;
        milestone.updatedAt = stamp;
        set.updatedAt = stamp;
        return milestone;
      }, true);
    },
    declareNextPaymentReleased(userId, input) {
      return enqueue((data) => {
        const set = findSet(data, userId, input.milestoneSetId);
        const milestone = findMilestone(set, input.milestoneId);
        const met = criteriaAreMet(milestone.criteria);
        assertPaymentReleased({
          planStatus: set.status,
          criteriaMet: met,
          milestoneComplete: milestone.status === "complete",
          alreadyReleased: milestone.paymentRelease === "released"
        });
        if (milestone.paymentRelease === "released") return milestone;
        const stamp = nowIso();
        milestone.paymentRelease = "released";
        milestone.paymentReleasedAt = stamp;
        milestone.updatedAt = stamp;
        set.updatedAt = stamp;
        return milestone;
      }, true);
    },
    markWorkDone(userId, input) {
      return enqueue((data) => {
        const set = findSet(data, userId, input.milestoneSetId);
        const milestone = findMilestone(set, input.milestoneId);
        const item = milestone.work.find((row) => row.id === input.workItemId);
        assertSavedWork(Boolean(item));
        if (!item) throw new MilestoneRefusal(REFUSED_UNSAVED_WORK);
        if (item.state === "done") return item;
        const stamp = nowIso();
        item.state = "done";
        item.doneAt = stamp;
        milestone.updatedAt = stamp;
        set.updatedAt = stamp;
        return item;
      }, true);
    },
    writeClientWording(userId, input) {
      return enqueue((data) => {
        const set = findSet(data, userId, input.milestoneSetId);
        const wording = cleanText(input.wording, "Client wording", 2000);
        assertWordingWrite(set.status, set.clientWording, wording);
        const stamp = nowIso();
        set.clientWording = wording;
        set.updatedAt = stamp;
        return { clientWording: wording };
      }, true);
    },
    approveMilestones(userId, milestoneSetId) {
      return enqueue((data) => {
        const set = findSet(data, userId, milestoneSetId);
        if (set.status === "approved") return toRecord(set);
        if (set.milestones.length === 0) throw new MilestoneUserError("A milestone is required before milestones can be approved.");
        for (const milestone of set.milestones) {
          if (milestone.criteria.length === 0) {
            throw new MilestoneUserError("Saved acceptance criteria are required before milestones can be approved.");
          }
          if (milestone.deliverables.length === 0) {
            throw new MilestoneUserError("A saved deliverable is required before milestones can be approved.");
          }
          if (milestone.work.length === 0) {
            throw new MilestoneUserError("Saved work is required before milestones can be approved.");
          }
        }
        if (!set.clientWording) throw new MilestoneUserError("Client wording is required before milestones can be approved.");
        const stamp = nowIso();
        set.status = "approved";
        set.approvedAt = stamp;
        set.updatedAt = stamp;
        return toRecord(set);
      }, true);
    },
    suggestMilestoneChange(userId, input) {
      return enqueue((data) => {
        const set = findSet(data, userId, input.milestoneSetId);
        if (set.status !== "approved") throw new MilestoneUserError("Approve the milestones before suggesting a change.");
        if (set.changes.length >= MAX_CHANGES) throw new MilestoneUserError("Milestone change limit reached.");
        const summaryText = cleanText(input.summary, "Summary", 1000);
        const change = blankChange(input.kind, summaryText);
        if (input.kind === "add_milestone") {
          if (set.milestones.length >= MAX_MILESTONES) throw new MilestoneUserError("Milestone limit reached.");
          const title = cleanText(input.title ?? "", "Milestone title", 200);
          if (set.milestones.some((row) => labelKey(row.title) === labelKey(title))) {
            throw new MilestoneUserError("That milestone is already saved.");
          }
          change.title = title;
          change.definition = cleanText(input.definition ?? "", "Milestone definition", 2000);
        } else if (input.kind === "add_criterion") {
          if (!input.milestoneId) throw new MilestoneUserError("A milestone id is required.");
          const milestone = findMilestone(set, input.milestoneId);
          if (milestone.criteria.length >= MAX_CRITERIA) throw new MilestoneUserError("Acceptance criterion limit reached.");
          const statement = cleanText(input.statement ?? "", "Acceptance criterion", 500);
          if (milestone.criteria.some((row) => labelKey(row.statement) === labelKey(statement))) {
            throw new MilestoneUserError("That acceptance criterion is already saved.");
          }
          change.milestoneId = milestone.id;
          change.statement = statement;
        } else if (input.kind === "add_deliverable") {
          if (!input.milestoneId) throw new MilestoneUserError("A milestone id is required.");
          const milestone = findMilestone(set, input.milestoneId);
          if (milestone.deliverables.length >= MAX_DELIVERABLES) throw new MilestoneUserError("Deliverable limit reached.");
          const title = cleanText(input.title ?? "", "Deliverable title", 200);
          if (milestone.deliverables.some((row) => labelKey(row.title) === labelKey(title))) {
            throw new MilestoneUserError("That deliverable is already saved.");
          }
          change.milestoneId = milestone.id;
          change.title = title;
          change.detail = cleanText(input.detail ?? "", "Deliverable detail", 1000);
        } else if (input.kind === "add_work_item") {
          if (!input.milestoneId) throw new MilestoneUserError("A milestone id is required.");
          const milestone = findMilestone(set, input.milestoneId);
          if (milestone.work.length >= MAX_WORK) throw new MilestoneUserError("Work item limit reached.");
          const title = cleanText(input.title ?? "", "Work title", 200);
          if (milestone.work.some((row) => labelKey(row.title) === labelKey(title))) {
            throw new MilestoneUserError("That work is already saved.");
          }
          change.milestoneId = milestone.id;
          change.title = title;
        } else if (input.kind === "revise_client_wording") {
          const wording = cleanText(input.wording ?? "", "Client wording", 2000);
          if (wording === set.clientWording) throw new MilestoneUserError("That change does not change what the assistant may tell the client.");
          change.wording = wording;
        } else {
          throw new MilestoneUserError("Unknown milestone change.");
        }
        set.changes.unshift(change);
        set.updatedAt = change.createdAt;
        return change;
      }, true);
    },
    acceptMilestoneChange(userId, milestoneSetId, changeId) {
      return enqueue((data) => {
        const set = findSet(data, userId, milestoneSetId);
        const change = set.changes.find((row) => row.id === changeId);
        if (!change) throw new MilestoneUserError("Milestone change not found");
        if (change.applied) return toRecord(set);
        if (set.status !== "approved") throw new MilestoneUserError("Approve the milestones before suggesting a change.");
        const stamp = nowIso();
        if (change.kind === "add_milestone") {
          if (!change.title || !change.definition) throw new MilestoneUserError("That milestone could not be added.");
          if (set.milestones.length >= MAX_MILESTONES) throw new MilestoneUserError("Milestone limit reached.");
          set.milestones.push({
            id: randomUUID(),
            title: change.title,
            definition: change.definition,
            sequence: set.milestones.length + 1,
            status: "open",
            paymentRelease: "held",
            criteria: [],
            deliverables: [],
            work: [],
            completedAt: null,
            paymentReleasedAt: null,
            createdAt: stamp,
            updatedAt: stamp
          });
        } else if (change.kind === "add_criterion") {
          if (!change.milestoneId || !change.statement) throw new MilestoneUserError("That acceptance criterion could not be saved.");
          const milestone = findMilestone(set, change.milestoneId);
          if (milestone.criteria.length >= MAX_CRITERIA) throw new MilestoneUserError("Acceptance criterion limit reached.");
          milestone.criteria.push({ id: randomUUID(), statement: change.statement, state: "open", metAt: null });
          reopenIfNeeded(milestone, stamp);
          milestone.updatedAt = stamp;
        } else if (change.kind === "add_deliverable") {
          if (!change.milestoneId || !change.title || !change.detail) throw new MilestoneUserError("That deliverable could not be saved.");
          const milestone = findMilestone(set, change.milestoneId);
          if (milestone.deliverables.length >= MAX_DELIVERABLES) throw new MilestoneUserError("Deliverable limit reached.");
          milestone.deliverables.push({ id: randomUUID(), title: change.title, detail: change.detail, createdAt: stamp });
          milestone.updatedAt = stamp;
        } else if (change.kind === "add_work_item") {
          if (!change.milestoneId || !change.title) throw new MilestoneUserError("That work could not be saved.");
          const milestone = findMilestone(set, change.milestoneId);
          if (milestone.work.length >= MAX_WORK) throw new MilestoneUserError("Work item limit reached.");
          milestone.work.push({ id: randomUUID(), title: change.title, state: "open", doneAt: null, createdAt: stamp });
          milestone.updatedAt = stamp;
        } else if (change.kind === "revise_client_wording") {
          if (!change.wording) throw new MilestoneUserError("Client wording must be 1–2000 characters.");
          set.clientWording = change.wording;
        } else {
          throw new MilestoneUserError("Unknown milestone change.");
        }
        change.status = "approved";
        change.applied = true;
        change.approvedAt = stamp;
        set.updatedAt = stamp;
        return toRecord(set);
      }, true);
    },
    addSupportRequest(input) {
      return enqueue((data) => {
        const request: SupportRequest = {
          id: randomUUID(),
          email: input.email,
          message: input.message,
          createdAt: nowIso()
        };
        data.supportRequests.push(request);
        if (data.supportRequests.length > MAX_SUPPORT) data.supportRequests.splice(0, data.supportRequests.length - MAX_SUPPORT);
        return { id: request.id };
      }, true);
    }
  };
}

export function isMilestoneRefusal(error: unknown): error is MilestoneRefusal {
  return error instanceof MilestoneRefusal;
}
