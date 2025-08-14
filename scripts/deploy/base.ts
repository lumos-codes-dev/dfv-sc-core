import { ethers } from "hardhat";
import hre from "hardhat";

async function main() {
  console.log("Starting DFVDAO deployment to Base...\n");

  const [deployer, ...addrs] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  const VESTING_MANAGER_ADDRESS = "0xdF80e38699bb963a91c5F04F83378A597995932a"; // ! Need to specify

  const UNI_ADDRESS = "0xdF80e38699bb963a91c5F04F83378A597995932a";
  // vesting is defined during deployment
  const DAO_TREASURY_ADDRESS = "0xaf786e8cdd7e4390bd629bfdec8f090268fe2934";

  // DAO parameters
  const VOTING_DELAY = 60 * 60 * 24 * 14; // 14 days in seconds
  const VOTING_PERIOD = 60 * 60 * 24 * 30; // 30 days in seconds
  const PROPOSAL_THRESHOLD = ethers.parseEther("694200000"); // 694200000 tokens (0.5% of 138,840,000,000 tokens total supply)
  const QUORUM_PERCENTAGE = 15; // 15%
  const MIN_DELAY = 60 * 60 * 24 * 14; // ! Specify minimum delay for timelock later (now is 14 days in seconds)

  // Step 1: Deploy TimeLock
  console.log("1. Deploying TimeLock...");
  const TimeLockFactory = await ethers.getContractFactory("TimeLock");
  const timeLock = await TimeLockFactory.deploy(
    MIN_DELAY,
    [], // proposers (will be set to DAO)
    [], // executors (will be set to DAO)
    deployer.address // admin
  );
  await timeLock.waitForDeployment();
  console.log("TimeLock deployed to:", await timeLock.getAddress());

  // Step 2: Deploy DFVVesting
  console.log("\n2. Deploying DFVVesting...");
  const DFVVestingFactory = await ethers.getContractFactory("DFVVesting");
  const dfvVesting = await DFVVestingFactory.deploy(await timeLock.getAddress(), VESTING_MANAGER_ADDRESS);
  await dfvVesting.waitForDeployment();
  console.log("DFVVesting deployed to:", await dfvVesting.getAddress());

  // Step 3: Deploy DFVToken
  console.log("\n3. Deploying DFVToken...");
  const DFVTokenFactory = await ethers.getContractFactory("DFVToken");
  const dfvToken = await DFVTokenFactory.deploy(dfvVesting.target, UNI_ADDRESS, DAO_TREASURY_ADDRESS);
  await dfvToken.waitForDeployment();
  console.log("DFVToken deployed to:", await dfvToken.getAddress());
  console.log("Total supply:", ethers.formatEther(await dfvToken.totalSupply()), "DFV");

  // Step 4: Set vesting token
  console.log("\n4. Setting vesting token...");
  await dfvVesting.setVestingToken(dfvToken.target);
  console.log("Vesting token set successfully");

  // Step 5: Deploy DFVDAO
  console.log("\n5. Deploying DFVDAO...");
  const DFVDAOFactory = await ethers.getContractFactory("DFVDAO");
  const dfvDAO = await DFVDAOFactory.deploy(
    await dfvToken.getAddress(),
    await timeLock.getAddress(),
    VOTING_DELAY,
    VOTING_PERIOD,
    PROPOSAL_THRESHOLD,
    QUORUM_PERCENTAGE
  );
  await dfvDAO.waitForDeployment();
  console.log("DFVDAO deployed to:", await dfvDAO.getAddress());

  // Step 6: Grant roles to DAO
  console.log("\n6. Granting roles to DAO...");
  await timeLock.grantRole(await timeLock.PROPOSER_ROLE(), await dfvDAO.getAddress());
  console.log("PROPOSER_ROLE granted to DAO");

  await timeLock.grantRole(await timeLock.EXECUTOR_ROLE(), await dfvDAO.getAddress());
  console.log("EXECUTOR_ROLE granted to DAO");

  // ! Step 7: Revoke admin role from deployer (optional for production)
  // await timeLock.revokeRole(await timeLock.DEFAULT_ADMIN_ROLE(), deployer.address);
  // console.log("DEFAULT_ADMIN_ROLE revoked from deployer");

  console.log("\n=== DEPLOYMENT SUMMARY ===");
  console.log("TimeLock:", await timeLock.getAddress());
  console.log("DFVVesting:", await dfvVesting.getAddress());
  console.log("DFVToken:", await dfvToken.getAddress());
  console.log("DFVDAO:", await dfvDAO.getAddress());

  console.log("\n=== GOVERNANCE PARAMETERS ===");
  console.log("Voting Delay:", VOTING_DELAY, "seconds (", VOTING_DELAY / 86400, "days)");
  console.log("Voting Period:", VOTING_PERIOD, "seconds (", VOTING_PERIOD / 86400, "days)");
  console.log("Proposal Threshold:", ethers.formatEther(PROPOSAL_THRESHOLD), "DFV");
  console.log("Quorum:", QUORUM_PERCENTAGE, "%");
  console.log("Timelock Delay:", MIN_DELAY, "seconds (", MIN_DELAY / 3600, "hours)");

  // Step 8: Verify contracts on BASESCAN
  // Note: Make sure BASESCAN_API_KEY is set in your .env file
  // You can get a free API key from https://basescan.org/apis
  console.log("\n=== VERIFYING CONTRACTS ON BASESCAN ===");
  console.log("Note: This requires BASESCAN_API_KEY to be set in .env file");

  if (!process.env.BASESCAN_API_KEY) {
    console.log("⚠️  BASESCAN_API_KEY not found in environment variables");
    console.log("Skipping BASESCAN verification. You can verify manually later.");
    console.log("Get your API key from: https://basescan.org/apis");

    console.log("\n📋 Manual verification commands:");
    console.log(
      `npx hardhat verify --network base ${await timeLock.getAddress()} ${MIN_DELAY} "[]" "[]" "${
        deployer.address
      }"`
    );
    console.log(
      `npx hardhat verify --network base ${await dfvVesting.getAddress()} "${await timeLock.getAddress()}" "${VESTING_MANAGER_ADDRESS}"`
    );
    console.log(
      `npx hardhat verify --network base ${await dfvToken.getAddress()} "${dfvVesting.target}" "${UNI_ADDRESS}" "${DAO_TREASURY_ADDRESS}"`
    );
    console.log(
      `npx hardhat verify --network base ${await dfvDAO.getAddress()} "${await dfvToken.getAddress()}" "${await timeLock.getAddress()}" ${VOTING_DELAY} ${VOTING_PERIOD} "${PROPOSAL_THRESHOLD.toString()}" ${QUORUM_PERCENTAGE}`
    );
  } else {
    try {
      // Wait a bit for the contracts to be indexed by BASESCAN
      console.log("Waiting for BASESCAN to index the contracts...");
      await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait 30 seconds

      // Verify TimeLock
      console.log("\n8.1. Verifying TimeLock...");
      try {
        await hre.run("verify:verify", {
          address: await timeLock.getAddress(),
          constructorArguments: [
            MIN_DELAY,
            [], // proposers
            [], // executors
            deployer.address, // admin
          ],
        });
        console.log("✅ TimeLock verified on BASESCAN");
      } catch (error: any) {
        if (error.message.includes("Already Verified")) {
          console.log("✅ TimeLock already verified on BASESCAN");
        } else {
          console.log("❌ TimeLock verification failed:", error.message);
        }
      }

      // Verify DFVVesting
      console.log("\n8.2. Verifying DFVVesting...");
      try {
        await hre.run("verify:verify", {
          address: await dfvVesting.getAddress(),
          constructorArguments: [
            await timeLock.getAddress(), // dao
            VESTING_MANAGER_ADDRESS, // vestingManager
          ],
        });
        console.log("✅ DFVVesting verified on BASESCAN");
      } catch (error: any) {
        if (error.message.includes("Already Verified")) {
          console.log("✅ DFVVesting already verified on BASESCAN");
        } else {
          console.log("❌ DFVVesting verification failed:", error.message);
        }
      }

      // Verify DFVToken
      console.log("\n8.3. Verifying DFVToken...");
      try {
        await hre.run("verify:verify", {
          address: await dfvToken.getAddress(),
          constructorArguments: [dfvVesting.target, UNI_ADDRESS, DAO_TREASURY_ADDRESS],
        });
        console.log("✅ DFVToken verified on BASESCAN");
      } catch (error: any) {
        if (error.message.includes("Already Verified")) {
          console.log("✅ DFVToken already verified on BASESCAN");
        } else {
          console.log("❌ DFVToken verification failed:", error.message);
        }
      }

      // Verify DFVDAO
      console.log("\n8.4. Verifying DFVDAO...");
      try {
        await hre.run("verify:verify", {
          address: await dfvDAO.getAddress(),
          constructorArguments: [
            await dfvToken.getAddress(),
            await timeLock.getAddress(),
            VOTING_DELAY,
            VOTING_PERIOD,
            PROPOSAL_THRESHOLD,
            QUORUM_PERCENTAGE,
          ],
        });
        console.log("✅ DFVDAO verified on BASESCAN");
      } catch (error: any) {
        if (error.message.includes("Already Verified")) {
          console.log("✅ DFVDAO already verified on BASESCAN");
        } else {
          console.log("❌ DFVDAO verification failed:", error.message);
        }
      }

      console.log("\n🎉 BASESCAN verification process completed!");
    } catch (error) {
      console.error("\n❌ General error during BASESCAN verification:", error);
      console.log("You can manually verify the contracts later using the following constructor arguments:");

      console.log("\nTimeLock constructor arguments:");
      console.log("- minDelay:", MIN_DELAY);
      console.log("- proposers: []");
      console.log("- executors: []");
      console.log("- admin:", deployer.address);

      console.log("\nDFVVesting constructor arguments:");
      console.log("- dao:", await timeLock.getAddress());
      console.log("- vestingManager:", VESTING_MANAGER_ADDRESS);

      console.log("\nDFVToken constructor arguments:");
      console.log("- vestingContract:", dfvVesting.target);
      console.log("- liquidity pool:", UNI_ADDRESS);
      console.log("- dao:", DAO_TREASURY_ADDRESS);

      console.log("\nDFVDAO constructor arguments:");
      console.log("- token:", await dfvToken.getAddress());
      console.log("- timelock:", await timeLock.getAddress());
      console.log("- votingDelay:", VOTING_DELAY);
      console.log("- votingPeriod:", VOTING_PERIOD);
      console.log("- proposalThreshold:", PROPOSAL_THRESHOLD.toString());
      console.log("- quorumPercentage:", QUORUM_PERCENTAGE);
    }
  } // Close the if statement for BASESCAN_API_KEY check

  console.log("\n=== BASESCAN LINKS ===");
  console.log("TimeLock:", `https://basescan.org/address/${await timeLock.getAddress()}`);
  console.log("DFVVesting:", `https://basescan.org/address/${await dfvVesting.getAddress()}`);
  console.log("DFVToken:", `https://basescan.org/address/${await dfvToken.getAddress()}`);
  console.log("DFVDAO:", `https://basescan.org/address/${await dfvDAO.getAddress()}`);

  console.log("\nDeployment completed successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
