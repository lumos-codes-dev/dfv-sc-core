import { ethers } from "hardhat";
import hre from "hardhat";

async function main() {
  const DFVToken = await ethers.getContractFactory("DFVToken");
  const dfvToken = await DFVToken.deploy();
  await dfvToken.waitForDeployment();

  console.log("DFVToken deployed to:", await dfvToken.getAddress());

  if (process.env.ETHERSCAN_API_KEY) {
    await hre.run("verify:verify", {
      address: await dfvToken.getAddress(),
      constructorArguments: [],
    });
    console.log("DFVToken verified on Etherscan");
  } else {
    console.log("ETHERSCAN_API_KEY not set, skipping verification");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
