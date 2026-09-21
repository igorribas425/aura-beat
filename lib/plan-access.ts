import { supabase } from "./supabase";

export type PlanAudience = "artist" | "venue";

export type PlanBenefits = Record<string, unknown>;

export type PlanAccess = {
  active: boolean;
  audience: PlanAudience;
  profileId: string | null;
  subscriptionId: string | null;
  status: string | null;
  planId: string | null;
  planCode: string | null;
  planName: string | null;
  monthlyPrice: number | null;
  unlimited: boolean;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  benefits: PlanBenefits;
};

type PlanAccessRpc = {
  active?: boolean;
  audience?: PlanAudience;
  profile_id?: string | null;
  subscription_id?: string | null;
  status?: string | null;
  plan_id?: string | null;
  plan_code?: string | null;
  plan_name?: string | null;
  monthly_price?: number | string | null;
  unlimited?: boolean;
  current_period_end?: string | null;
  trial_ends_at?: string | null;
  benefits?: PlanBenefits | null;
};

export const EMPTY_PLAN_ACCESS: PlanAccess = {
  active: false,
  audience: "artist",
  profileId: null,
  subscriptionId: null,
  status: null,
  planId: null,
  planCode: null,
  planName: null,
  monthlyPrice: null,
  unlimited: false,
  currentPeriodEnd: null,
  trialEndsAt: null,
  benefits: {},
};

export async function getMyPlanAccess(
  audience: PlanAudience,
): Promise<PlanAccess> {
  const { data, error } = await supabase.rpc(
    "get_my_plan_access_v1",
    {
      p_audience: audience,
    },
  );

  if (error) throw error;

  const row = (data || {}) as PlanAccessRpc;

  return {
    active: row.active === true,
    audience:
      row.audience === "venue"
        ? "venue"
        : "artist",
    profileId: row.profile_id ?? null,
    subscriptionId: row.subscription_id ?? null,
    status: row.status ?? null,
    planId: row.plan_id ?? null,
    planCode: row.plan_code ?? null,
    planName: row.plan_name ?? null,
    monthlyPrice:
      row.monthly_price === null ||
      row.monthly_price === undefined
        ? null
        : Number(row.monthly_price),
    unlimited: row.unlimited === true,
    currentPeriodEnd: row.current_period_end ?? null,
    trialEndsAt: row.trial_ends_at ?? null,
    benefits: row.benefits || {},
  };
}

export function hasPlanBenefit(
  access: PlanAccess | null,
  key: string,
) {
  return Boolean(
    access?.active &&
      access.benefits?.[key] === true,
  );
}

export function planBenefitText(
  access: PlanAccess | null,
  key: string,
) {
  if (!access?.active) return null;

  const value = access.benefits?.[key];

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return String(value);
  }

  return null;
}
