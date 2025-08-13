import { expect } from "chai";
import { ethers } from "hardhat";
import { DFVVesting, DFVToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("DFVVesting", function () {
  let dfvVesting: DFVVesting;
  let dfvToken: DFVToken;
  let owner: SignerWithAddress;
  let beneficiary1: SignerWithAddress;
  let beneficiary2: SignerWithAddress;
  let beneficiary3: SignerWithAddress;
  let addrs: SignerWithAddress[];

  const BASIS_POINTS_DENOMINATOR = 10000n;
  const TOTAL_SUPPLY = ethers.parseEther("138840000000");
  const MONTH = 30 * 24 * 60 * 60;

  beforeEach(async function () {
    [owner, beneficiary1, beneficiary2, beneficiary3, ...addrs] = await ethers.getSigners();

    const DFVTokenFactory = await ethers.getContractFactory("DFVToken");
    const DFVVestingFactory = await ethers.getContractFactory("DFVVesting");

    dfvVesting = await DFVVestingFactory.deploy(owner.address, owner.address);
    await dfvVesting.waitForDeployment();

    dfvToken = await DFVTokenFactory.deploy(dfvVesting.target, owner.address, owner.address, owner.address, owner.address, owner.address, owner.address, owner.address);
    await dfvToken.waitForDeployment();

    await dfvVesting.setVestingToken(dfvToken.target);
  });

  describe("Deployment", function () {
    it("Should set the correct token address", async function () {
      expect(await dfvVesting.token()).to.equal(await dfvToken.getAddress());
    });

    it("Should initialize categories correctly", async function () {
      const blindBelievers = await dfvVesting.categories(0);
      expect(blindBelievers.totalVestedAmountLeft).to.equal(0);
      expect(blindBelievers.beneficiariesLeft).to.equal(0);
      expect(blindBelievers.schedule.cliffDuration).to.equal(0);
      expect(blindBelievers.schedule.periodDuration).to.equal(1);
      expect(blindBelievers.schedule.periodCount).to.equal(12 * MONTH);
      expect(blindBelievers.initialUnlockPercent).to.equal(0);

      const eternalHODLers = await dfvVesting.categories(1);
      expect(eternalHODLers.totalVestedAmountLeft).to.equal(ethers.parseEther("13884000000"));
      expect(eternalHODLers.beneficiariesLeft).to.equal(200);

      const diamondHands = await dfvVesting.categories(2);
      expect(diamondHands.totalVestedAmountLeft).to.equal(ethers.parseEther("6942000000"));
      expect(diamondHands.beneficiariesLeft).to.equal(1000);

      const justHODLers = await dfvVesting.categories(3);
      expect(justHODLers.totalVestedAmountLeft).to.equal(ethers.parseEther("13884000000"));
      expect(justHODLers.beneficiariesLeft).to.equal(20000);

      const communityAirdrop = await dfvVesting.categories(4);
      expect(communityAirdrop.totalVestedAmountLeft).to.equal(ethers.parseEther("13884000000"));
      expect(communityAirdrop.beneficiariesLeft).to.equal(10000);
    });

    it("Should have not zero initial totalVested", async function () {
      expect(await dfvVesting.totalVested()).to.not.equal(0);
    });
  });

  describe("setVestingToken", function () {
    let newDfvVesting: DFVVesting;
    let newToken: DFVToken;

    beforeEach(async function () {
      const DFVVestingFactory = await ethers.getContractFactory("DFVVesting");
      newDfvVesting = await DFVVestingFactory.deploy(owner.address, owner.address);
      await newDfvVesting.waitForDeployment();

      const DFVTokenFactory = await ethers.getContractFactory("DFVToken");
      newToken = await DFVTokenFactory.deploy(owner.address, owner.address, owner.address, owner.address);
      await newToken.waitForDeployment();
    });

    it("Should set vesting token successfully when called by VESTING_MANAGER_ROLE", async function () {
      await newDfvVesting.setVestingToken(await newToken.getAddress());
      expect(await newDfvVesting.token()).to.equal(await newToken.getAddress());
    });

    it("Should revert when called by non-VESTING_MANAGER_ROLE", async function () {
      await expect(
        newDfvVesting.connect(beneficiary1).setVestingToken(await newToken.getAddress())
      ).to.be.revertedWithCustomError(newDfvVesting, "AccessControlUnauthorizedAccount");
    });

    it("Should revert when token address is zero", async function () {
      await expect(newDfvVesting.setVestingToken(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        newDfvVesting,
        "ZeroAddress"
      );
    });

    it("Should revert when token is already set", async function () {
      await newDfvVesting.setVestingToken(await newToken.getAddress());

      await expect(newDfvVesting.setVestingToken(await newToken.getAddress())).to.be.revertedWithCustomError(
        newDfvVesting,
        "TokenAlreadySet"
      );
    });

    it("Should revert when trying to set different token after first token is set", async function () {
      await newDfvVesting.setVestingToken(await newToken.getAddress());

      const DFVTokenFactory = await ethers.getContractFactory("DFVToken");
      const anotherToken = await DFVTokenFactory.deploy(owner.address, owner.address, owner.address, owner.address);
      await anotherToken.waitForDeployment();

      await expect(newDfvVesting.setVestingToken(await anotherToken.getAddress())).to.be.revertedWithCustomError(
        newDfvVesting,
        "TokenAlreadySet"
      );
    });
  });

  describe("createCustomVestingPool", function () {
    const vestingAmount = ethers.parseEther("1000");

    it("Should create a custom vesting pool successfully", async function () {
      const startTime = (await time.latest()) + 100;
      const schedule = {
        cliffDuration: MONTH,
        periodDuration: MONTH,
        periodCount: 12,
      };

      await dfvToken.approve(await dfvVesting.getAddress(), vestingAmount);

      const totalVestedBefore = await dfvVesting.totalVested();

      await expect(
        dfvVesting.createCustomVestingPool({
          beneficiary: beneficiary1.address,
          amount: vestingAmount,
          start: startTime,
          schedule,
          initialUnlockPercent: 1000,
        })
      )
        .to.emit(dfvVesting, "VestingPoolCreated")
        .withArgs(beneficiary1.address, [vestingAmount, startTime, [MONTH, MONTH, 12], 1000, 0, false]);

      expect(await dfvVesting.totalVested()).to.equal(totalVestedBefore + vestingAmount);

      const pools = await dfvVesting.pools(beneficiary1.address, 0);
      expect(pools.amount).to.equal(vestingAmount);
      expect(pools.start).to.equal(startTime);
      expect(pools.claimed).to.equal(0);
      expect(pools.isCategory).to.equal(false);
    });

    it("Should revert with zero address beneficiary", async function () {
      await dfvToken.approve(await dfvVesting.getAddress(), vestingAmount);

      await expect(
        dfvVesting.createCustomVestingPool({
          beneficiary: ethers.ZeroAddress,
          amount: vestingAmount,
          start: await time.latest(),
          schedule: { cliffDuration: 0, periodDuration: MONTH, periodCount: 12 },
          initialUnlockPercent: 0,
        })
      ).to.be.revertedWithCustomError(dfvVesting, "ZeroAddress");
    });

    it("Should revert with zero amount", async function () {
      await expect(
        dfvVesting.createCustomVestingPool({
          beneficiary: beneficiary1.address,
          amount: 0,
          start: await time.latest(),
          schedule: { cliffDuration: 0, periodDuration: MONTH, periodCount: 12 },
          initialUnlockPercent: 0,
        })
      ).to.be.revertedWithCustomError(dfvVesting, "ZeroAmount");
    });

    it("Should revert with zero period duration", async function () {
      await expect(
        dfvVesting.createCustomVestingPool({
          beneficiary: beneficiary1.address,
          amount: vestingAmount,
          start: await time.latest(),
          schedule: { cliffDuration: 0, periodDuration: 0, periodCount: 12 },
          initialUnlockPercent: 0,
        })
      ).to.be.revertedWithCustomError(dfvVesting, "ZeroAmount");
    });

    it("Should revert with zero period count", async function () {
      await expect(
        dfvVesting.createCustomVestingPool({
          beneficiary: beneficiary1.address,
          amount: vestingAmount,
          start: await time.latest(),
          schedule: { cliffDuration: 0, periodDuration: MONTH, periodCount: 0 },
          initialUnlockPercent: 0,
        })
      ).to.be.revertedWithCustomError(dfvVesting, "ZeroAmount");
    });

    it("Should revert with initial unlock exceeding limit", async function () {
      await dfvToken.approve(await dfvVesting.getAddress(), vestingAmount);

      await expect(
        dfvVesting.createCustomVestingPool({
          beneficiary: beneficiary1.address,
          amount: vestingAmount,
          start: await time.latest(),
          schedule: { cliffDuration: 0, periodDuration: MONTH, periodCount: 12 },
          initialUnlockPercent: 10001,
        })
      ).to.be.revertedWithCustomError(dfvVesting, "InitialUnlockExceedsLimit");
    });

    it("Should set start time to current timestamp if provided start is in the past", async function () {
      const pastTime = (await time.latest()) - 100;
      await dfvToken.approve(await dfvVesting.getAddress(), vestingAmount);

      await dfvVesting.createCustomVestingPool({
        beneficiary: beneficiary1.address,
        amount: vestingAmount,
        start: pastTime,
        schedule: { cliffDuration: 0, periodDuration: MONTH, periodCount: 12 },
        initialUnlockPercent: 0,
      });

      const pools = await dfvVesting.pools(beneficiary1.address, 0);
      expect(pools.start).to.be.greaterThan(pastTime);
    });

    it("Should only allow owner to create pools", async function () {
      await expect(
        dfvVesting.connect(beneficiary1).createCustomVestingPool({
          beneficiary: beneficiary1.address,
          amount: vestingAmount,
          start: await time.latest(),
          schedule: { cliffDuration: 0, periodDuration: MONTH, periodCount: 12 },
          initialUnlockPercent: 0,
        })
      ).to.be.revertedWithCustomError(dfvVesting, "AccessControlUnauthorizedAccount");
    });

    it("Should revert when contract doesn't have enough token balance", async function () {
      const largeAmount = ethers.parseEther("999999999999");

      await expect(
        dfvVesting.createCustomVestingPool({
          beneficiary: beneficiary1.address,
          amount: largeAmount,
          start: await time.latest(),
          schedule: { cliffDuration: 0, periodDuration: MONTH, periodCount: 12 },
          initialUnlockPercent: 0,
        })
      ).to.be.revertedWithCustomError(dfvVesting, "NotEnoughBalance");
    });

    it("Should revert when approved amount is insufficient for vesting pool", async function () {
      const DFVVestingFactory = await ethers.getContractFactory("DFVVesting");
      const newVesting = await DFVVestingFactory.deploy(owner.address, owner.address);
      await newVesting.waitForDeployment();

      const DFVTokenFactory = await ethers.getContractFactory("DFVToken");
      const newToken = await DFVTokenFactory.deploy(owner.address, owner.address, owner.address, owner.address);
      await newToken.waitForDeployment();

      await newVesting.setVestingToken(await newToken.getAddress());

      const requestedAmount = ethers.parseEther("2000");
      const insufficientAmount = ethers.parseEther("1000");

      await newToken.transfer(await newVesting.getAddress(), insufficientAmount);

      await expect(
        newVesting.createCustomVestingPool({
          beneficiary: beneficiary1.address,
          amount: requestedAmount,
          start: await time.latest(),
          schedule: { cliffDuration: 0, periodDuration: MONTH, periodCount: 12 },
          initialUnlockPercent: 0,
        })
      ).to.be.revertedWithCustomError(newVesting, "NotEnoughBalance");
    });
    it("Should succeed when contract has exact required balance", async function () {
      const exactAmount = ethers.parseEther("1000");

      await dfvToken.approve(await dfvVesting.getAddress(), exactAmount);

      await expect(
        dfvVesting.createCustomVestingPool({
          beneficiary: beneficiary1.address,
          amount: exactAmount,
          start: await time.latest(),
          schedule: { cliffDuration: 0, periodDuration: MONTH, periodCount: 12 },
          initialUnlockPercent: 0,
        })
      ).to.not.be.reverted;

      const pool = await dfvVesting.pools(beneficiary1.address, 0);
      expect(pool.amount).to.equal(exactAmount);
    });
  });

  describe("createCustomVestingPoolBatch", function () {
    it("Should create multiple custom vesting pools", async function () {
      const vestingAmount1 = ethers.parseEther("1000");
      const vestingAmount2 = ethers.parseEther("2000");

      await dfvToken.approve(await dfvVesting.getAddress(), vestingAmount1 + vestingAmount2);

      const params = [
        {
          beneficiary: beneficiary1.address,
          amount: vestingAmount1,
          start: (await time.latest()) + 100,
          schedule: { cliffDuration: 0, periodDuration: MONTH, periodCount: 12 },
          initialUnlockPercent: 0,
        },
        {
          beneficiary: beneficiary2.address,
          amount: vestingAmount2,
          start: (await time.latest()) + 200,
          schedule: { cliffDuration: MONTH, periodDuration: MONTH, periodCount: 6 },
          initialUnlockPercent: 500,
        },
      ];

      await dfvVesting.createCustomVestingPoolBatch(params);

      const pool1 = await dfvVesting.pools(beneficiary1.address, 0);
      expect(pool1.amount).to.equal(vestingAmount1);

      const pool2 = await dfvVesting.pools(beneficiary2.address, 0);
      expect(pool2.amount).to.equal(vestingAmount2);
    });

    it("Should revert with empty params array", async function () {
      await expect(dfvVesting.createCustomVestingPoolBatch([])).to.be.revertedWithCustomError(
        dfvVesting,
        "NoParamsProvided"
      );
    });

    it("Should revert if caller is not the owner", async function () {
      await expect(dfvVesting.connect(beneficiary1).createCustomVestingPoolBatch([])).to.be.revertedWithCustomError(
        dfvVesting,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("Should revert when batch size exceeds limit", async function () {
      const vestingAmount = ethers.parseEther("100");
      const currentTime = await time.latest();

      const params = Array(101)
        .fill(null)
        .map((_, index) => ({
          beneficiary: addrs[index % addrs.length].address,
          amount: vestingAmount,
          start: currentTime + 100,
          schedule: { cliffDuration: 0, periodDuration: MONTH, periodCount: 12 },
          initialUnlockPercent: 0,
        }));

      await expect(dfvVesting.createCustomVestingPoolBatch(params)).to.be.revertedWithCustomError(
        dfvVesting,
        "BatchSizeExceedsLimit"
      );
    });

    it("Should revert when contract doesn't have enough balance for batch creation", async function () {
      const DFVVestingFactory = await ethers.getContractFactory("DFVVesting");
      const newVesting = await DFVVestingFactory.deploy(owner.address, owner.address);
      await newVesting.waitForDeployment();

      const DFVTokenFactory = await ethers.getContractFactory("DFVToken");
      const newToken = await DFVTokenFactory.deploy(owner.address, owner.address, owner.address, owner.address);
      await newToken.waitForDeployment();

      await newVesting.setVestingToken(await newToken.getAddress());

      const vestingAmount = ethers.parseEther("1000");
      const insufficientAmount = ethers.parseEther("500");

      await newToken.transfer(await newVesting.getAddress(), insufficientAmount);

      const params = [
        {
          beneficiary: beneficiary1.address,
          amount: vestingAmount,
          start: (await time.latest()) + 100,
          schedule: { cliffDuration: 0, periodDuration: MONTH, periodCount: 12 },
          initialUnlockPercent: 0,
        },
        {
          beneficiary: beneficiary2.address,
          amount: vestingAmount,
          start: (await time.latest()) + 200,
          schedule: { cliffDuration: MONTH, periodDuration: MONTH, periodCount: 6 },
          initialUnlockPercent: 500,
        },
      ];

      await expect(newVesting.createCustomVestingPoolBatch(params)).to.be.revertedWithCustomError(
        newVesting,
        "NotEnoughBalance"
      );
    });
  });

  describe("createCategoryPool", function () {
    it("Should create a category pool for EternalHODLers", async function () {
      const multiplier = 1n;
      const expectedAmount = ethers.parseEther("69420000") * multiplier;

      await dfvToken.approve(await dfvVesting.getAddress(), expectedAmount);

      await dfvVesting.createCategoryPool({
        category: 1,
        beneficiary: beneficiary1.address,
        multiplierOrAmount: multiplier,
        start: (await time.latest()) + 100,
      });

      const pool = await dfvVesting.pools(beneficiary1.address, 0);
      expect(pool.amount).to.equal(expectedAmount);
      expect(pool.isCategory).to.equal(true);

      const category = await dfvVesting.categories(1);
      expect(category.totalVestedAmountLeft).to.equal(ethers.parseEther("13884000000") - expectedAmount);
      expect(category.beneficiariesLeft).to.equal(199);
    });

    it("Should create a category pool for CommunityAirdrop with direct amount", async function () {
      const amount = ethers.parseEther("1000");

      await dfvToken.approve(await dfvVesting.getAddress(), amount);

      await dfvVesting.createCategoryPool({
        category: 4,
        beneficiary: beneficiary1.address,
        multiplierOrAmount: amount,
        start: (await time.latest()) + 100,
      });

      const pool = await dfvVesting.pools(beneficiary1.address, 0);
      expect(pool.amount).to.equal(amount);
    });

    it("Should revert when not enough allocation left", async function () {
      const multiplier = 300n;

      await expect(
        dfvVesting.createCategoryPool({
          category: 1,
          beneficiary: beneficiary1.address,
          multiplierOrAmount: multiplier,
          start: await time.latest(),
        })
      ).to.be.revertedWithCustomError(dfvVesting, "NotEnoughAllocationLeft");
    });

    it("Should revert when contract doesn't have enough balance for category pool", async function () {
      const DFVVestingFactory = await ethers.getContractFactory("DFVVesting");
      const newVesting = await DFVVestingFactory.deploy(owner.address, owner.address);
      await newVesting.waitForDeployment();

      const DFVTokenFactory = await ethers.getContractFactory("DFVToken");
      const newToken = await DFVTokenFactory.deploy(owner.address, owner.address, owner.address, owner.address);
      await newToken.waitForDeployment();

      await newVesting.setVestingToken(await newToken.getAddress());

      const multiplier = 1n;
      const expectedAmount = ethers.parseEther("69420000") * multiplier;
      const insufficientAmount = ethers.parseEther("1000");

      await newToken.transfer(await newVesting.getAddress(), insufficientAmount);

      await expect(
        newVesting.createCategoryPool({
          category: 1,
          beneficiary: beneficiary1.address,
          multiplierOrAmount: multiplier,
          start: await time.latest(),
        })
      ).to.be.revertedWithCustomError(newVesting, "NotEnoughBalance");
    });
  });

  describe("createCategoryPoolBatch", function () {
    it("Should create multiple category pools", async function () {
      const amount1 = ethers.parseEther("69420000");
      const amount2 = ethers.parseEther("1000");

      await dfvToken.approve(await dfvVesting.getAddress(), amount1 + amount2);

      const params = [
        {
          category: 1,
          beneficiary: beneficiary1.address,
          multiplierOrAmount: 1,
          start: (await time.latest()) + 100,
        },
        {
          category: 4,
          beneficiary: beneficiary2.address,
          multiplierOrAmount: amount2,
          start: (await time.latest()) + 200,
        },
      ];

      await dfvVesting.createCategoryPoolBatch(params);

      const pool1 = await dfvVesting.pools(beneficiary1.address, 0);
      expect(pool1.amount).to.equal(amount1);

      const pool2 = await dfvVesting.pools(beneficiary2.address, 0);
      expect(pool2.amount).to.equal(amount2);
    });

    it("Should create multiple category pools #2", async function () {
      const amount1 = ethers.parseEther("69420000");
      const amount2 = ethers.parseEther("1000");

      await dfvToken.approve(await dfvVesting.getAddress(), amount1 + amount1 + amount2);

      const params = [
        {
          category: 1,
          beneficiary: beneficiary1.address,
          multiplierOrAmount: 1,
          start: (await time.latest()) + 100,
        },
        {
          category: 1,
          beneficiary: beneficiary2.address,
          multiplierOrAmount: 1,
          start: (await time.latest()) + 100,
        },
        {
          category: 4,
          beneficiary: beneficiary3.address,
          multiplierOrAmount: amount2,
          start: (await time.latest()) + 200,
        },
      ];

      await dfvVesting.createCategoryPoolBatch(params);

      const pool1 = await dfvVesting.pools(beneficiary1.address, 0);
      expect(pool1.amount).to.equal(amount1);

      const pool2 = await dfvVesting.pools(beneficiary3.address, 0);
      expect(pool2.amount).to.equal(amount2);
    });

    it("Should revert with empty params array", async function () {
      await expect(dfvVesting.createCategoryPoolBatch([])).to.be.revertedWithCustomError(
        dfvVesting,
        "NoParamsProvided"
      );
    });

    it("Should revert if caller is not the owner", async function () {
      await expect(dfvVesting.connect(beneficiary1).createCategoryPoolBatch([])).to.be.revertedWithCustomError(
        dfvVesting,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("Should revert when batch size exceeds limit", async function () {
      const amount = ethers.parseEther("1000");
      const currentTime = await time.latest();

      const params = Array(101)
        .fill(null)
        .map((_, index) => ({
          category: 4,
          beneficiary: addrs[index % addrs.length].address,
          multiplierOrAmount: amount,
          start: currentTime + 100,
        }));

      await expect(dfvVesting.createCategoryPoolBatch(params)).to.be.revertedWithCustomError(
        dfvVesting,
        "BatchSizeExceedsLimit"
      );
    });
  });

  describe("claim and claimFor", function () {
    const vestingAmount = ethers.parseEther("1200");

    beforeEach(async function () {
      await dfvToken.approve(await dfvVesting.getAddress(), vestingAmount);
      await dfvVesting.createCustomVestingPool({
        beneficiary: beneficiary1.address,
        amount: vestingAmount,
        start: await time.latest(),
        schedule: { cliffDuration: 0, periodDuration: MONTH, periodCount: 12 },
        initialUnlockPercent: 1000,
      });
    });

    it("Should allow beneficiary to claim tokens", async function () {
      await time.increase(MONTH);

      const claimableAmount = await dfvVesting.getClaimableAmount(beneficiary1.address);
      expect(claimableAmount).to.be.greaterThan(0);

      const initialBalance = await dfvToken.balanceOf(beneficiary1.address);

      await expect(dfvVesting.connect(beneficiary1).claim())
        .to.emit(dfvVesting, "Claim")
        .withArgs(beneficiary1.address, claimableAmount);

      const finalBalance = await dfvToken.balanceOf(beneficiary1.address);
      expect(finalBalance - initialBalance).to.equal(claimableAmount);
    });

    it("Should allow anyone to claim for a beneficiary", async function () {
      await time.increase(MONTH);

      const claimableAmount = await dfvVesting.getClaimableAmount(beneficiary1.address);
      const initialBalance = await dfvToken.balanceOf(beneficiary1.address);

      await dfvVesting.connect(beneficiary2).claimFor(beneficiary1.address);

      const finalBalance = await dfvToken.balanceOf(beneficiary1.address);
      expect(finalBalance - initialBalance).to.equal(claimableAmount);
    });

    it("Should calculate correct claimable amount with initial unlock", async function () {
      const expectedInitialUnlock = (vestingAmount * 1000n) / BASIS_POINTS_DENOMINATOR;
      const claimableAmount = await dfvVesting.getClaimableAmount(beneficiary1.address);
      expect(claimableAmount).to.equal(expectedInitialUnlock);
    });

    it("Should calculate correct claimable amount after one period", async function () {
      await time.increase(MONTH);

      const expectedInitialUnlock = (vestingAmount * 1000n) / BASIS_POINTS_DENOMINATOR;
      const remainingAmount = vestingAmount - expectedInitialUnlock;
      const expectedVestedAmount = remainingAmount / 12n;
      const expectedTotal = expectedInitialUnlock + expectedVestedAmount;

      const claimableAmount = await dfvVesting.getClaimableAmount(beneficiary1.address);
      expect(claimableAmount).to.equal(expectedTotal);
    });

    it("Should return full amount after all periods", async function () {
      await time.increase(MONTH * 12);

      const claimableAmount = await dfvVesting.getClaimableAmount(beneficiary1.address);
      expect(claimableAmount).to.equal(vestingAmount);
    });

    it("Should respect cliff duration", async function () {
      await dfvToken.approve(await dfvVesting.getAddress(), vestingAmount);
      await dfvVesting.createCustomVestingPool({
        beneficiary: beneficiary2.address,
        amount: vestingAmount,
        start: await time.latest(),
        schedule: { cliffDuration: MONTH * 3, periodDuration: MONTH, periodCount: 12 },
        initialUnlockPercent: 0,
      });

      await time.increase(MONTH * 2);
      let claimableAmount = await dfvVesting.getClaimableAmount(beneficiary2.address);
      expect(claimableAmount).to.equal(0);

      await time.increase(MONTH * 2);
      claimableAmount = await dfvVesting.getClaimableAmount(beneficiary2.address);
      expect(claimableAmount).to.be.greaterThan(0);
    });

    it("Should revert when no allocations found", async function () {
      await expect(dfvVesting.connect(beneficiary3).claim()).to.be.revertedWithCustomError(
        dfvVesting,
        "NoAllocationsFound"
      );
    });

    it("Should revert when zero amount to claim", async function () {
      await dfvVesting.connect(beneficiary1).claim();

      await expect(dfvVesting.connect(beneficiary1).claim()).to.be.revertedWithCustomError(dfvVesting, "ZeroAmount");
    });

    it("Should revert with zero address beneficiary", async function () {
      await expect(dfvVesting.claimFor(ethers.ZeroAddress)).to.be.revertedWithCustomError(dfvVesting, "ZeroAddress");
    });

    it("Should handle multiple pools for same beneficiary", async function () {
      await dfvToken.approve(await dfvVesting.getAddress(), vestingAmount);
      await dfvVesting.createCustomVestingPool({
        beneficiary: beneficiary1.address,
        amount: vestingAmount,
        start: await time.latest(),
        schedule: { cliffDuration: 0, periodDuration: MONTH, periodCount: 6 },
        initialUnlockPercent: 500,
      });

      await time.increase(MONTH);

      const claimableAmount = await dfvVesting.getClaimableAmount(beneficiary1.address);
      expect(claimableAmount).to.be.greaterThan(0);

      await dfvVesting.connect(beneficiary1).claim();

      const pool1 = await dfvVesting.pools(beneficiary1.address, 0);
      const pool2 = await dfvVesting.pools(beneficiary1.address, 1);
      expect(pool1.claimed).to.be.greaterThan(0);
      expect(pool2.claimed).to.be.greaterThan(0);
    });

    it("Should handle custom vesting with cliff and track claims through full cycle", async function () {
      const customVestingAmount = ethers.parseEther("10000");
      const cliffDuration = MONTH * 3;
      const periodDuration = MONTH * 2;
      const periodCount = 6;
      const initialUnlockPercent = 2000;

      await dfvToken.approve(await dfvVesting.getAddress(), customVestingAmount);

      const startTime = await time.latest();
      await dfvVesting.createCustomVestingPool({
        beneficiary: beneficiary2.address,
        amount: customVestingAmount,
        start: startTime,
        schedule: { cliffDuration, periodDuration, periodCount },
        initialUnlockPercent,
      });

      const initialUnlockAmount = (customVestingAmount * BigInt(initialUnlockPercent)) / BASIS_POINTS_DENOMINATOR;
      const remainingAmount = customVestingAmount - initialUnlockAmount;
      const amountPerPeriod = remainingAmount / BigInt(periodCount);

      let claimableAmount = await dfvVesting.getClaimableAmount(beneficiary2.address);
      expect(claimableAmount).to.equal(0);

      await time.increase(MONTH * 2);
      claimableAmount = await dfvVesting.getClaimableAmount(beneficiary2.address);
      expect(claimableAmount).to.equal(0);

      await time.increase(MONTH);
      claimableAmount = await dfvVesting.getClaimableAmount(beneficiary2.address);
      expect(claimableAmount).to.equal(initialUnlockAmount);

      let initialBalance = await dfvToken.balanceOf(beneficiary2.address);
      await dfvVesting.connect(beneficiary2).claimFor(beneficiary2.address);
      let finalBalance = await dfvToken.balanceOf(beneficiary2.address);
      expect(finalBalance - initialBalance).to.equal(initialUnlockAmount);

      let totalClaimed = initialUnlockAmount;

      for (let period = 1; period <= periodCount; period++) {
        await time.increase(periodDuration);

        const expectedClaimable = amountPerPeriod;
        claimableAmount = await dfvVesting.getClaimableAmount(beneficiary2.address);
        expect(claimableAmount).to.closeTo(expectedClaimable, 1);

        initialBalance = await dfvToken.balanceOf(beneficiary2.address);
        await dfvVesting.connect(beneficiary2).claim();
        finalBalance = await dfvToken.balanceOf(beneficiary2.address);

        expect(finalBalance - initialBalance).to.closeTo(expectedClaimable, 1);
        totalClaimed += expectedClaimable;

        const pool = await dfvVesting.pools(beneficiary2.address, 0);
        expect(pool.claimed).to.closeTo(totalClaimed, 10);

        const remainingClaimable = await dfvVesting.getClaimableAmount(beneficiary2.address);
        expect(remainingClaimable).to.equal(0);
      }

      expect(totalClaimed).to.closeTo(customVestingAmount, 10);

      claimableAmount = await dfvVesting.getClaimableAmount(beneficiary2.address);
      expect(claimableAmount).to.equal(0);

      await time.increase(MONTH * 12);
      claimableAmount = await dfvVesting.getClaimableAmount(beneficiary2.address);
      expect(claimableAmount).to.equal(0);

      const finalPool = await dfvVesting.pools(beneficiary2.address, 0);
      expect(finalPool.amount).to.equal(customVestingAmount);
      expect(finalPool.claimed).to.equal(customVestingAmount);

      finalBalance = await dfvToken.balanceOf(beneficiary2.address);
      expect(finalBalance).to.equal(customVestingAmount);
    });
  });

  describe("withdrawUnusedTokens", function () {
    it("Should allow owner to withdraw unused tokens", async function () {
      const initialBalance = await dfvToken.balanceOf(owner.address);
      const totalVested = await dfvVesting.totalVested();
      const initialContractBalance = (await dfvToken.balanceOf(dfvVesting.target)) - totalVested;

      const expectedWithdrawAmount = initialContractBalance;

      await expect(dfvVesting.withdrawUnusedTokens(dfvToken.target))
        .to.emit(dfvVesting, "WithdrawUnusedTokens")
        .withArgs(dfvToken.target, expectedWithdrawAmount);

      const finalBalance = await dfvToken.balanceOf(owner.address);
      expect(finalBalance - initialBalance).to.equal(expectedWithdrawAmount);
    });

    it("Should revert when no unused tokens to withdraw", async function () {
      const existingBalance = await dfvToken.balanceOf(await dfvVesting.getAddress());
      if (existingBalance > 0) {
        await dfvVesting.withdrawUnusedTokens(await dfvToken.getAddress());
      }

      await expect(dfvVesting.withdrawUnusedTokens(await dfvToken.getAddress())).to.be.revertedWithCustomError(
        dfvVesting,
        "ZeroAmount"
      );
    });

    it("Should only allow owner to withdraw", async function () {
      await expect(
        dfvVesting.connect(beneficiary1).withdrawUnusedTokens(await dfvToken.getAddress())
      ).to.be.revertedWithCustomError(dfvVesting, "AccessControlUnauthorizedAccount");
    });

    it("Should allow withdrawal of different tokens without vesting deduction", async function () {
      const OtherTokenFactory = await ethers.getContractFactory("DFVToken");
      const otherToken = await OtherTokenFactory.deploy(owner.address, owner.address, owner.address, owner.address);
      await otherToken.waitForDeployment();

      const amount = ethers.parseEther("1000");
      await otherToken.transfer(await dfvVesting.getAddress(), amount);

      const initialBalance = await otherToken.balanceOf(owner.address);
      await dfvVesting.withdrawUnusedTokens(await otherToken.getAddress());
      const finalBalance = await otherToken.balanceOf(owner.address);

      expect(finalBalance - initialBalance).to.equal(amount);
    });
  });

  describe("getClaimableAmount", function () {
    const vestingAmount = ethers.parseEther("1200");

    beforeEach(async function () {
      await dfvToken.approve(await dfvVesting.getAddress(), vestingAmount);
      await dfvVesting.createCustomVestingPool({
        beneficiary: beneficiary1.address,
        amount: vestingAmount,
        start: await time.latest(),
        schedule: { cliffDuration: 0, periodDuration: MONTH, periodCount: 12 },
        initialUnlockPercent: 1000,
      });
    });

    it("Should return correct claimable amount", async function () {
      const expectedInitialUnlock = (vestingAmount * 1000n) / BASIS_POINTS_DENOMINATOR;
      const claimableAmount = await dfvVesting.getClaimableAmount(beneficiary1.address);
      expect(claimableAmount).to.equal(expectedInitialUnlock);
    });

    it("Should return zero for address with no pools", async function () {
      const claimableAmount = await dfvVesting.getClaimableAmount(beneficiary2.address);
      expect(claimableAmount).to.equal(0);
    });

    it("Should decrease after claiming", async function () {
      const initialClaimable = await dfvVesting.getClaimableAmount(beneficiary1.address);
      await dfvVesting.connect(beneficiary1).claim();
      const afterClaimable = await dfvVesting.getClaimableAmount(beneficiary1.address);
      expect(afterClaimable).to.be.lessThan(initialClaimable);
    });
  });

  describe("BlindBelievers Vesting Schedule", function () {
    it("Should vest continuously over 1 year", async function () {
      const amount = ethers.parseEther("694200000");

      await time.increase(30 * 24 * 60 * 60);
      const claimableAfter30Days = await dfvVesting.getClaimableAmount("0x5279d4F55096a427b9121c6D642395a4f0Cd04a4");
      expect(claimableAfter30Days).to.be.greaterThan(0);

      await time.increase(335 * 24 * 60 * 60);
      const claimableAfter1Year = await dfvVesting.getClaimableAmount("0x5279d4F55096a427b9121c6D642395a4f0Cd04a4");
      expect(claimableAfter1Year).to.equal(amount);
    });
  });

  describe("Access Control", function () {
    it("Should revert when non-owner tries to create custom pool", async function () {
      await expect(
        dfvVesting.connect(beneficiary1).createCustomVestingPool({
          beneficiary: beneficiary1.address,
          amount: ethers.parseEther("1000"),
          start: await time.latest(),
          schedule: { cliffDuration: 0, periodDuration: MONTH, periodCount: 12 },
          initialUnlockPercent: 0,
        })
      ).to.be.revertedWithCustomError(dfvVesting, "AccessControlUnauthorizedAccount");
    });

    it("Should revert when non-owner tries to create category pool", async function () {
      await expect(
        dfvVesting.connect(beneficiary1).createCategoryPool({
          category: 0,
          beneficiary: beneficiary1.address,
          multiplierOrAmount: 1,
          start: await time.latest(),
        })
      ).to.be.revertedWithCustomError(dfvVesting, "AccessControlUnauthorizedAccount");
    });

    it("Should revert when non-owner tries to withdraw unused tokens", async function () {
      await expect(
        dfvVesting.connect(beneficiary1).withdrawUnusedTokens(await dfvToken.getAddress())
      ).to.be.revertedWithCustomError(dfvVesting, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero period count correctly", async function () {
      await expect(
        dfvVesting.createCustomVestingPool({
          beneficiary: beneficiary1.address,
          amount: ethers.parseEther("1000"),
          start: await time.latest(),
          schedule: { cliffDuration: 0, periodDuration: MONTH, periodCount: 0 },
          initialUnlockPercent: 0,
        })
      ).to.be.revertedWithCustomError(dfvVesting, "ZeroAmount");
    });

    it("Should handle very large time periods", async function () {
      const vestingAmount = ethers.parseEther("1000");
      await dfvToken.approve(await dfvVesting.getAddress(), vestingAmount);

      await dfvVesting.createCustomVestingPool({
        beneficiary: beneficiary1.address,
        amount: vestingAmount,
        start: await time.latest(),
        schedule: { cliffDuration: 0, periodDuration: MONTH, periodCount: 12 },
        initialUnlockPercent: 0,
      });

      await time.increase(MONTH * 100);

      const claimableAmount = await dfvVesting.getClaimableAmount(beneficiary1.address);
      expect(claimableAmount).to.equal(vestingAmount);
    });

    it("Should handle 100% initial unlock", async function () {
      const vestingAmount = ethers.parseEther("1000");
      await dfvToken.approve(await dfvVesting.getAddress(), vestingAmount);

      await dfvVesting.createCustomVestingPool({
        beneficiary: beneficiary1.address,
        amount: vestingAmount,
        start: await time.latest(),
        schedule: { cliffDuration: 0, periodDuration: MONTH, periodCount: 12 },
        initialUnlockPercent: 10000,
      });

      const claimableAmount = await dfvVesting.getClaimableAmount(beneficiary1.address);
      expect(claimableAmount).to.equal(vestingAmount);
    });

    it("Should handle category with zero beneficiaries left", async function () {
      const amount = ethers.parseEther("69420000");

      for (let i = 0; i < 200; i++) {
        const beneficiaryAddress = i < addrs.length ? addrs[i].address : ethers.Wallet.createRandom().address;
        await dfvVesting.createCategoryPool({
          category: 1,
          beneficiary: beneficiaryAddress,
          multiplierOrAmount: 1,
          start: await time.latest(),
        });
      }

      await expect(
        dfvVesting.createCategoryPool({
          category: 1,
          beneficiary: beneficiary1.address,
          multiplierOrAmount: 1,
          start: await time.latest(),
        })
      ).to.be.revertedWithCustomError(dfvVesting, "CategoryBeneficiariesAllSet");
    });
  });
});
