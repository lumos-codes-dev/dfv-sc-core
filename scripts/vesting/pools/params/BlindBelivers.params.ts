import { ethers } from "hardhat";
import { VestingCategory, CreateCategoryPoolParams } from "../types";

import { list } from "./beneficiaries/BlindBelievers.beneficiaries";

export function getParams(): CreateCategoryPoolParams[] {
  return list.map((beneficiary) => ({
    category: VestingCategory.BlindBelievers,
    beneficiary,
    multiplierOrAmount: 1n,
    start: 0,
  }));
}
