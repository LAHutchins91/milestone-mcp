export class MilestoneRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MilestoneRefusal";
  }
}

export class MilestoneUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MilestoneUserError";
  }
}

export type PlanStatus = "draft" | "approved";

export type MilestoneProgress = "open" | "complete";

export type PaymentRelease = "held" | "released";

export type CriterionState = "open" | "met";

export type WorkState = "open" | "done";

export type ChangeKind =
  | "add_milestone"
  | "add_criterion"
  | "add_deliverable"
  | "add_work_item"
  | "revise_client_wording";

export const REFUSED_DRAFT_COMPLETE =
  "Refused: milestones are not approved. Do not tell the client a milestone is complete.";

export const REFUSED_COMPLETE =
  "Refused: do not tell the client this milestone is complete unless the saved acceptance criteria were met. declare_milestone_complete will not mark it complete.";

export const REFUSED_DRAFT_PAYMENT =
  "Refused: milestones are not approved. Do not tell the client the next payment is released.";

export const REFUSED_PAYMENT =
  "Refused: do not tell the client the next payment is released unless the saved acceptance criteria were met. declare_next_payment_released will not release it.";

export const REFUSED_PAYMENT_OPEN =
  "Refused: do not tell the client the next payment is released. The milestone is not complete. declare_next_payment_released will not release it.";

export const REFUSED_DELIVERABLE =
  "Refused: an extra deliverable was not saved on the approved milestones. save_deliverable will not invent one. Suggest an add_deliverable change and accept that change.";

export const REFUSED_UNSAVED_WORK =
  "Refused: that work was not saved. mark_work_done will not mark unsaved work done.";

export const REFUSED_NEW_MILESTONE =
  "Refused: a new milestone is not allowed after milestones are approved. Suggest an add_milestone change and accept that change. define_milestone will not add it.";

export const REFUSED_NEW_CRITERION =
  "Refused: a new acceptance criterion is not allowed after milestones are approved. Suggest an add_criterion change and accept that change. save_acceptance_criterion will not change what done means.";

export const REFUSED_NEW_WORK =
  "Refused: unsaved work cannot be added after milestones are approved. Suggest an add_work_item change and accept that change. save_work_item will not add it.";

export const REFUSED_WORDING =
  "Refused: what the assistant may tell the client stays as approved. Suggest a revise_client_wording change and accept that change. write_client_wording will not replace it.";

export const REFUSED_UNSAVED_CRITERION =
  "Refused: that acceptance criterion was not saved. record_criterion_met will not treat it as met.";

export const RECORD_GUIDANCE =
  "Answer only from this milestone set. Tell the client only what clientWording and mayTellClient allow. If they disagree, follow the stricter limit. A milestone is complete only when complete is true, and the next payment is released only when paymentReleased is true. Both require the saved acceptance criteria to be met. Draft status is not an approved commitment. Proposed milestone changes are not authorization. Do not invent a deliverable. Do not mark work done that was not saved. declare_milestone_complete and declare_next_payment_released refuse those statements when the saved acceptance criteria were not met.";

export type CriterionFact = {
  id: string;
  statement: string;
  met: boolean;
};

export type DeliverableFact = {
  id: string;
  title: string;
  detail: string;
};

export type WorkFact = {
  id: string;
  title: string;
  done: boolean;
};

export type MilestoneFact = {
  id: string;
  title: string;
  definition: string;
  sequence: number;
  complete: boolean;
  paymentReleased: boolean;
  acceptanceCriteriaMet: boolean;
  criteria: CriterionFact[];
  deliverables: DeliverableFact[];
  work: WorkFact[];
};

export type MayTellClient = {
  script: string | null;
  milestones: MilestoneFact[];
  limits: string[];
};

export type CriterionLike = { state: CriterionState };

export function labelKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function criteriaAreMet(criteria: CriterionLike[]): boolean {
  return criteria.length > 0 && criteria.every((row) => row.state === "met");
}

export function assertMilestoneComplete(input: {
  planStatus: PlanStatus;
  criteriaMet: boolean;
  alreadyComplete: boolean;
}): void {
  if (input.planStatus === "approved" && input.criteriaMet && input.alreadyComplete) return;
  if (input.planStatus !== "approved") throw new MilestoneRefusal(REFUSED_DRAFT_COMPLETE);
  if (!input.criteriaMet) throw new MilestoneRefusal(REFUSED_COMPLETE);
}

export function assertPaymentReleased(input: {
  planStatus: PlanStatus;
  criteriaMet: boolean;
  milestoneComplete: boolean;
  alreadyReleased: boolean;
}): void {
  if (input.planStatus === "approved" && input.criteriaMet && input.milestoneComplete && input.alreadyReleased) return;
  if (input.planStatus !== "approved") throw new MilestoneRefusal(REFUSED_DRAFT_PAYMENT);
  if (!input.criteriaMet) throw new MilestoneRefusal(REFUSED_PAYMENT);
  if (!input.milestoneComplete) throw new MilestoneRefusal(REFUSED_PAYMENT_OPEN);
}

export function assertNewDeliverable(status: PlanStatus): void {
  if (status === "approved") throw new MilestoneRefusal(REFUSED_DELIVERABLE);
}

export function assertSavedWork(found: boolean): void {
  if (!found) throw new MilestoneRefusal(REFUSED_UNSAVED_WORK);
}

export function assertNewMilestone(status: PlanStatus): void {
  if (status === "approved") throw new MilestoneRefusal(REFUSED_NEW_MILESTONE);
}

export function assertNewCriterion(status: PlanStatus): void {
  if (status === "approved") throw new MilestoneRefusal(REFUSED_NEW_CRITERION);
}

export function assertNewWorkItem(status: PlanStatus): void {
  if (status === "approved") throw new MilestoneRefusal(REFUSED_NEW_WORK);
}

export function assertWordingWrite(status: PlanStatus, current: string | null, next: string): void {
  if (status === "approved" && current !== next) throw new MilestoneRefusal(REFUSED_WORDING);
}

export function assertSavedCriterion(found: boolean): void {
  if (!found) throw new MilestoneRefusal(REFUSED_UNSAVED_CRITERION);
}

type MilestoneInput = {
  id: string;
  title: string;
  definition: string;
  sequence: number;
  status: MilestoneProgress;
  paymentRelease: PaymentRelease;
  criteria: Array<{ id: string; statement: string; state: CriterionState }>;
  deliverables: Array<{ id: string; title: string; detail: string }>;
  work: Array<{ id: string; title: string; state: WorkState }>;
};

export function buildMayTellClient(input: {
  status: PlanStatus;
  clientWording: string | null;
  milestones: MilestoneInput[];
}): MayTellClient {
  const milestones: MilestoneFact[] = input.milestones.map((milestone) => {
    const acceptanceCriteriaMet = criteriaAreMet(milestone.criteria);
    return {
      id: milestone.id,
      title: milestone.title,
      definition: milestone.definition,
      sequence: milestone.sequence,
      complete: milestone.status === "complete",
      paymentReleased: milestone.paymentRelease === "released",
      acceptanceCriteriaMet,
      criteria: milestone.criteria.map((criterion) => ({
        id: criterion.id,
        statement: criterion.statement,
        met: criterion.state === "met"
      })),
      deliverables: milestone.deliverables.map((deliverable) => ({
        id: deliverable.id,
        title: deliverable.title,
        detail: deliverable.detail
      })),
      work: milestone.work.map((item) => ({
        id: item.id,
        title: item.title,
        done: item.state === "done"
      }))
    };
  });

  const limits = [
    "Tell the client only the client wording and the facts in this record.",
    "Do not tell the client a milestone is complete unless complete is true.",
    "Do not tell the client the next payment is released unless paymentReleased is true.",
    "Do not invent a deliverable that is not in this record.",
    "Do not mark work done that is not saved in this record.",
    "Do not present a proposed milestone change as something the client was told."
  ];
  if (input.status !== "approved") {
    limits.push("This milestone set is still a draft. Do not present it to the client as an approved commitment.");
  }
  for (const milestone of milestones) {
    if (!milestone.complete) {
      limits.push(`Do not tell the client ${milestone.title} is complete.`);
    } else {
      limits.push(`You may say ${milestone.title} is complete because every saved acceptance criterion was met.`);
    }
    if (!milestone.paymentReleased) {
      limits.push(`Do not tell the client the next payment for ${milestone.title} is released.`);
    } else {
      limits.push(`You may say the next payment for ${milestone.title} is released because every saved acceptance criterion was met.`);
    }
    for (const criterion of milestone.criteria) {
      if (!criterion.met) limits.push(`Do not tell the client this acceptance criterion was met: ${criterion.statement}`);
    }
    for (const item of milestone.work) {
      if (!item.done) limits.push(`Do not tell the client this saved work is done: ${item.title}`);
    }
  }
  return { script: input.clientWording, milestones, limits };
}
