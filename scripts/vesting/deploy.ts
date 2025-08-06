import { ethers } from "hardhat";
import hre from "hardhat";

const TOKEN_ADDRESS = "0x684f17d390Fb8ac3afF784a19F9608c98d51F873";

async function main() {
  const DFVVesting = await ethers.getContractFactory("DFVVesting");
  const dfvVesting = await DFVVesting.deploy(TOKEN_ADDRESS);
  await dfvVesting.waitForDeployment();

  console.log("DFVVesting deployed to:", await dfvVesting.getAddress());

  if (process.env.ETHERSCAN_API_KEY) {
    await hre.run("verify:verify", {
      address: await dfvVesting.getAddress(),
      constructorArguments: [TOKEN_ADDRESS],
    });
    console.log("DFVVesting verified on Etherscan");
  } else {
    console.log("ETHERSCAN_API_KEY not set, skipping verification");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
