import { ethers } from "hardhat";

async function main() {
  console.log("Starting DFVDAO deployment to Sepolia...\n");

  const [deployer, ...addrs] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  const VESTING_MANAGER_ADDRESS = ""; // ! Need to specify

  const TREASURY_ADDRESS = ""; // ! Need to specify
  const TEAM_ADDRESS = ""; // ! Need to specify
  const VC_ADDRESS = ""; // ! Need to specify

  const VOTING_DELAY = 60 * 60 * 24 * 14; // 14 days in seconds
  const VOTING_PERIOD = 60 * 60 * 24 * 30; // 30 days in seconds
  const PROPOSAL_THRESHOLD = ethers.parseEther("694200000"); // 694200000 tokens (1.5% of 138,840,000,000 tokens total supply)
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
  const dfvToken = await DFVTokenFactory.deploy(dfvVesting.target, TREASURY_ADDRESS, TEAM_ADDRESS, VC_ADDRESS);
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

  console.log("\nDeployment completed successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
