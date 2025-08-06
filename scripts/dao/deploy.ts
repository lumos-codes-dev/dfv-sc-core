import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
  const token = await GovernanceToken.deploy("DAO Token", "DAO", ethers.parseEther("1000000"), deployer.address);
  await token.waitForDeployment();

  const TimeLock = await ethers.getContractFactory("TimeLock");
  const timelock = await TimeLock.deploy(
    2 * 24 * 60 * 60, // 2 days delay
    [],
    [],
    ethers.ZeroAddress // no admin
  );
  await timelock.waitForDeployment();

  const SimpleDAO = await ethers.getContractFactory("SimpleDAO");
  const governor = await SimpleDAO.deploy(
    await token.getAddress(),
    await timelock.getAddress(),
    1 * 24 * 60 * 60, // 1 day voting delay
    7 * 24 * 60 * 60, // 1 week voting period
    ethers.parseEther("1000"), // 1000 tokens to propose
    4 // 4% quorum
  );
  await governor.waitForDeployment();

  const proposerRole = await timelock.PROPOSER_ROLE();
  const executorRole = await timelock.EXECUTOR_ROLE();
  await timelock.grantRole(proposerRole, await governor.getAddress());
  await timelock.grantRole(executorRole, await governor.getAddress());

  console.log("Token deployed to:", await token.getAddress());
  console.log("Timelock deployed to:", await timelock.getAddress());
  console.log("Governor deployed to:", await governor.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
