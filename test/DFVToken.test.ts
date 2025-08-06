import { expect } from "chai";
import { ethers } from "hardhat";
import { DFVToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("DFVToken", function () {
  let dfvToken: DFVToken;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;
  let addrs: SignerWithAddress[];

  const INITIAL_SUPPLY = ethers.parseEther("138840000000");
  const EXPECTED_NAME = "DFV Token";
  const EXPECTED_SYMBOL = "DFV";
  const EXPECTED_DECIMALS = 18;

  beforeEach(async function () {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    const DFVTokenFactory = await ethers.getContractFactory("DFVToken");
    dfvToken = await DFVTokenFactory.deploy(owner.address);
    await dfvToken.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right token name", async function () {
      expect(await dfvToken.name()).to.equal(EXPECTED_NAME);
    });

    it("Should set the right token symbol", async function () {
      expect(await dfvToken.symbol()).to.equal(EXPECTED_SYMBOL);
    });

    it("Should set the right number of decimals", async function () {
      expect(await dfvToken.decimals()).to.equal(EXPECTED_DECIMALS);
    });

    it("Should mint the initial supply to the vesting address", async function () {
      const vestingAddress = owner.address;
      const vestingBalance = await dfvToken.balanceOf(vestingAddress);
      expect(vestingBalance).to.equal(INITIAL_SUPPLY);
    });

    it("Should set the total supply to the initial supply", async function () {
      const totalSupply = await dfvToken.totalSupply();
      expect(totalSupply).to.equal(INITIAL_SUPPLY);
    });

    it("Should have zero balance for non-deployer addresses", async function () {
      expect(await dfvToken.balanceOf(addr1.address)).to.equal(0);
      expect(await dfvToken.balanceOf(addr2.address)).to.equal(0);
    });
  });

  describe("Token Transfer", function () {
    it("Should transfer tokens between accounts", async function () {
      const transferAmount = ethers.parseEther("1000");

      await dfvToken.transfer(addr1.address, transferAmount);

      expect(await dfvToken.balanceOf(addr1.address)).to.equal(transferAmount);
      expect(await dfvToken.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY - transferAmount);
    });

    it("Should emit Transfer event", async function () {
      const transferAmount = ethers.parseEther("1000");

      await expect(dfvToken.transfer(addr1.address, transferAmount))
        .to.emit(dfvToken, "Transfer")
        .withArgs(owner.address, addr1.address, transferAmount);
    });

    it("Should fail if sender doesn't have enough tokens", async function () {
      const initialOwnerBalance = await dfvToken.balanceOf(owner.address);
      const transferAmount = initialOwnerBalance + 1n;

      await expect(dfvToken.transfer(addr1.address, transferAmount)).to.be.revertedWithCustomError(
        dfvToken,
        "ERC20InsufficientBalance"
      );
    });

    it("Should fail when transferring to zero address", async function () {
      const transferAmount = ethers.parseEther("1000");

      await expect(dfvToken.transfer(ethers.ZeroAddress, transferAmount)).to.be.revertedWithCustomError(
        dfvToken,
        "ERC20InvalidReceiver"
      );
    });
  });

  describe("Token Allowance", function () {
    it("Should approve spending allowance", async function () {
      const approveAmount = ethers.parseEther("1000");

      await dfvToken.approve(addr1.address, approveAmount);

      expect(await dfvToken.allowance(owner.address, addr1.address)).to.equal(approveAmount);
    });

    it("Should emit Approval event", async function () {
      const approveAmount = ethers.parseEther("1000");

      await expect(dfvToken.approve(addr1.address, approveAmount))
        .to.emit(dfvToken, "Approval")
        .withArgs(owner.address, addr1.address, approveAmount);
    });

    it("Should allow transferFrom with sufficient allowance", async function () {
      const approveAmount = ethers.parseEther("1000");
      const transferAmount = ethers.parseEther("500");

      await dfvToken.approve(addr1.address, approveAmount);

      await dfvToken.connect(addr1).transferFrom(owner.address, addr2.address, transferAmount);

      expect(await dfvToken.balanceOf(addr2.address)).to.equal(transferAmount);
      expect(await dfvToken.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY - transferAmount);
      expect(await dfvToken.allowance(owner.address, addr1.address)).to.equal(approveAmount - transferAmount);
    });

    it("Should fail transferFrom with insufficient allowance", async function () {
      const approveAmount = ethers.parseEther("500");
      const transferAmount = ethers.parseEther("1000");

      await dfvToken.approve(addr1.address, approveAmount);

      await expect(
        dfvToken.connect(addr1).transferFrom(owner.address, addr2.address, transferAmount)
      ).to.be.revertedWithCustomError(dfvToken, "ERC20InsufficientAllowance");
    });

    it("Should fail transferFrom when owner has insufficient balance", async function () {
      const approveAmount = INITIAL_SUPPLY + 1n;
      const transferAmount = INITIAL_SUPPLY + 1n;

      await dfvToken.approve(addr1.address, approveAmount);

      await expect(
        dfvToken.connect(addr1).transferFrom(owner.address, addr2.address, transferAmount)
      ).to.be.revertedWithCustomError(dfvToken, "ERC20InsufficientBalance");
    });
  });

  describe("Token Supply Calculations", function () {
    it("Should have correct initial supply calculation", async function () {
      const expectedSupply = 138_840_000_000n * 10n ** 18n;
      expect(await dfvToken.totalSupply()).to.equal(expectedSupply);
    });

    it("Should maintain total supply consistency", async function () {
      const transferAmount = ethers.parseEther("1000000");

      const totalSupplyBefore = await dfvToken.totalSupply();

      await dfvToken.transfer(addr1.address, transferAmount);
      await dfvToken.connect(addr1).transfer(addr2.address, transferAmount / 2n);

      const totalSupplyAfter = await dfvToken.totalSupply();

      expect(totalSupplyAfter).to.equal(totalSupplyBefore);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero amount transfers", async function () {
      const initialBalance = await dfvToken.balanceOf(addr1.address);

      await dfvToken.transfer(addr1.address, 0);

      expect(await dfvToken.balanceOf(addr1.address)).to.equal(initialBalance);
    });

    it("Should handle zero amount approvals", async function () {
      await dfvToken.approve(addr1.address, 0);

      expect(await dfvToken.allowance(owner.address, addr1.address)).to.equal(0);
    });

    it("Should allow self-transfers", async function () {
      const transferAmount = ethers.parseEther("1000");
      const initialBalance = await dfvToken.balanceOf(owner.address);

      await dfvToken.transfer(owner.address, transferAmount);

      expect(await dfvToken.balanceOf(owner.address)).to.equal(initialBalance);
    });

    it("Should handle maximum uint256 approval", async function () {
      const maxUint256 = ethers.MaxUint256;

      await dfvToken.approve(addr1.address, maxUint256);

      expect(await dfvToken.allowance(owner.address, addr1.address)).to.equal(maxUint256);
    });
  });

  describe("Multiple Transfers Scenario", function () {
    it("Should handle complex transfer scenario", async function () {
      const amount1 = ethers.parseEther("1000000");
      const amount2 = ethers.parseEther("500000");
      const amount3 = ethers.parseEther("250000");

      await dfvToken.transfer(addr1.address, amount1);
      await dfvToken.transfer(addr2.address, amount2);

      await dfvToken.connect(addr1).transfer(addr2.address, amount3);

      expect(await dfvToken.balanceOf(addr1.address)).to.equal(amount1 - amount3);
      expect(await dfvToken.balanceOf(addr2.address)).to.equal(amount2 + amount3);
      expect(await dfvToken.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY - amount1 - amount2);

      const totalBalance =
        (await dfvToken.balanceOf(owner.address)) +
        (await dfvToken.balanceOf(addr1.address)) +
        (await dfvToken.balanceOf(addr2.address));
      expect(totalBalance).to.equal(INITIAL_SUPPLY);
    });
  });

  describe("Gas Usage", function () {
    it("Should measure gas usage for transfers", async function () {
      const transferAmount = ethers.parseEther("1000");

      const tx = await dfvToken.transfer(addr1.address, transferAmount);
      const receipt = await tx.wait();

      expect(receipt?.gasUsed).to.be.lessThan(100000);
    });

    it("Should measure gas usage for approvals", async function () {
      const approveAmount = ethers.parseEther("1000");

      const tx = await dfvToken.approve(addr1.address, approveAmount);
      const receipt = await tx.wait();

      expect(receipt?.gasUsed).to.be.lessThan(100000);
    });
  });
});
