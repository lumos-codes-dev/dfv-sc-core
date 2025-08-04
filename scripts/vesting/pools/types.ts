export enum VestingCategory {
  BlindBelievers,
  EternalHODLers,
  DiamondHands,
  JustHODLers,
  CommunityAirdrop,
}

export interface CreateCategoryPoolParams {
  category: VestingCategory;
  beneficiary: string;
  multiplierOrAmount: bigint;
  start: number;
}

export interface Schedule {
  cliffDuration: number;
  periodDuration: number;
  periodCount: number;
}

export interface CreateCustomVestingPoolParams {
  beneficiary: string;
  amount: bigint;
  start: number;
  schedule: Schedule;
  initialUnlock: bigint;
}
