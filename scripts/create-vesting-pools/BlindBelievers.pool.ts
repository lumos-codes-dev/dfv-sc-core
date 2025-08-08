import { ethers } from "hardhat";
import hre from "hardhat";

import { DFVVesting__factory, DFVToken__factory } from "../../typechain-types";
import { CreateCategoryPoolParams, VestingCategory } from "./types";
import { getParams } from "./params/BlindBelivers.params";

// Sepolia Testnet configuration
const TOKEN_ADDRESS = "0x684f17d390Fb8ac3afF784a19F9608c98d51F873";
const VESTING_ADDRESS = "0x24E405ddC6a5a2D973546a4dbC288b37E828aA57";
const MAX_BATCH_SIZE = 100;

async function main() {
  const [owner] = await ethers.getSigners();

  const dfvToken = DFVToken__factory.connect(TOKEN_ADDRESS, owner);
  const dfvVesting = DFVVesting__factory.connect(VESTING_ADDRESS, owner);

  const qty = (await dfvVesting.categories(VestingCategory.BlindBelievers)).qty;

  const params: CreateCategoryPoolParams[] = getParams();

  const approveTx = await dfvToken.approve(dfvVesting.target, qty * BigInt(params.length));
  await approveTx.wait();

  for (let i = 0; i < params.length; i += MAX_BATCH_SIZE) {
    const batch = params.slice(i, i + MAX_BATCH_SIZE);
    const batchNumber = Math.floor(i / MAX_BATCH_SIZE) + 1;

    console.log(`Processing batch ${batchNumber} with ${batch.length} beneficiaries...`);

    try {
      const tx = await dfvVesting.createCategoryPoolBatch(batch);

      console.log(`Batch transaction hash: ${tx.hash}`);
      await tx.wait();
      console.log(`Batch ${batchNumber} processed successfully`);
    } catch (error) {
      console.error(`Error processing batch ${batchNumber}:`, error);
      throw error;
    }
  }

  const totalBatches = Math.ceil(params.length / MAX_BATCH_SIZE);
  console.log(`All ${totalBatches} batches processed successfully!`);
  console.log("Total beneficiaries processed:", params.length);
  console.log("DFVVesting contract address:", await dfvVesting.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
