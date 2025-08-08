import { expect } from "chai";
import { ethers } from "hardhat";
import { DFVDAO, TimeLock, DFVToken, DFVVesting } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

interface Schedule {
  cliffDuration: number;
  periodDuration: number;
  periodCount: number;
}

interface CreateCustomVestingPoolParams {
  beneficiary: string;
  amount: bigint;
  start: number;
  schedule: Schedule;
  initialUnlockPercent: number;
}

describe("DFVDAO", function () {
  let dfvDAO: DFVDAO;
  let timeLock: TimeLock;
  let dfvToken: DFVToken;
  let dfvVesting: DFVVesting;
  let owner: SignerWithAddress;
  let proposer: SignerWithAddress;
  let voter1: SignerWithAddress;
  let voter2: SignerWithAddress;
  let recipient: SignerWithAddress;
  let addrs: SignerWithAddress[];

  const VOTING_DELAY = 86400;
  const VOTING_PERIOD = 432000;
  const PROPOSAL_THRESHOLD = ethers.parseEther("100000");
  const QUORUM_PERCENTAGE = 4;
  const MIN_DELAY = 3600;

  const GOVERNANCE_INITIAL_SUPPLY = ethers.parseEther("138840000000");
  const TRANSFER_AMOUNT = ethers.parseEther("1000");

  beforeEach(async function () {
    [owner, proposer, voter1, voter2, recipient, ...addrs] = await ethers.getSigners();

    const DFVTokenFactory = await ethers.getContractFactory("DFVToken");
    const TimeLockFactory = await ethers.getContractFactory("TimeLock");
    const DFVDAOFactory = await ethers.getContractFactory("DFVDAO");
    const DFVVestingFactory = await ethers.getContractFactory("DFVVesting");

    timeLock = await TimeLockFactory.deploy(MIN_DELAY, [], [], owner.address);
    await timeLock.waitForDeployment();

    dfvVesting = await DFVVestingFactory.deploy(timeLock.target, owner.address);
    await dfvVesting.waitForDeployment();

    dfvToken = await DFVTokenFactory.deploy(dfvVesting.target, owner.address, owner.address, owner.address);
    await dfvToken.waitForDeployment();

    await dfvVesting.setVestingToken(dfvToken.target);

    dfvDAO = await DFVDAOFactory.deploy(
      await dfvToken.getAddress(),
      await timeLock.getAddress(),
      VOTING_DELAY,
      VOTING_PERIOD,
      PROPOSAL_THRESHOLD,
      QUORUM_PERCENTAGE
    );
    await dfvDAO.waitForDeployment();

    await timeLock.grantRole(await timeLock.PROPOSER_ROLE(), await dfvDAO.getAddress());
    await timeLock.grantRole(await timeLock.EXECUTOR_ROLE(), await dfvDAO.getAddress());

    await timeLock.revokeRole(await timeLock.DEFAULT_ADMIN_ROLE(), owner.address);

    const params: CreateCustomVestingPoolParams[] = [
      {
        beneficiary: proposer.address,
        amount: ethers.parseEther("3000000000"),
        start: 0,
        schedule: {
          cliffDuration: 0,
          periodDuration: 1,
          periodCount: 1,
        },
        initialUnlockPercent: 0,
      },
      {
        beneficiary: voter1.address,
        amount: ethers.parseEther("2000000000"),
        start: 0,
        schedule: {
          cliffDuration: 0,
          periodDuration: 1,
          periodCount: 1,
        },
        initialUnlockPercent: 0,
      },
      {
        beneficiary: voter2.address,
        amount: ethers.parseEther("4000000000"),
        start: 0,
        schedule: {
          cliffDuration: 0,
          periodDuration: 1,
          periodCount: 1,
        },
        initialUnlockPercent: 0,
      },
      {
        beneficiary: await timeLock.getAddress(),
        amount: ethers.parseEther("1000"),
        start: 0,
        schedule: {
          cliffDuration: 0,
          periodDuration: 1,
          periodCount: 1,
        },
        initialUnlockPercent: 0,
      },
    ];

    await dfvVesting.createCustomVestingPoolBatch(params);
    await time.increase(2);

    await dfvVesting.connect(proposer).claim();
    await dfvVesting.connect(voter1).claim();
    await dfvVesting.connect(voter2).claim();
    await dfvVesting.claimFor(timeLock.target);

    await dfvToken.connect(proposer).delegate(proposer.address);
    await dfvToken.connect(voter1).delegate(voter1.address);
    await dfvToken.connect(voter2).delegate(voter2.address);
  });

  describe("Deployment", function () {
    it("Should set the correct name", async function () {
      expect(await dfvDAO.name()).to.equal("DFVDAO");
    });

    it("Should set the correct voting delay", async function () {
      expect(await dfvDAO.votingDelay()).to.equal(VOTING_DELAY);
    });

    it("Should set the correct voting period", async function () {
      expect(await dfvDAO.votingPeriod()).to.equal(VOTING_PERIOD);
    });

    it("Should set the correct proposal threshold", async function () {
      expect(await dfvDAO.proposalThreshold()).to.equal(PROPOSAL_THRESHOLD);
    });

    it("Should set the correct quorum", async function () {
      const previousTimestamp = (await time.latest()) - 1;
      const totalSupply = await dfvToken.totalSupply();
      const expectedQuorum = (totalSupply * BigInt(QUORUM_PERCENTAGE)) / BigInt(100);

      expect(await dfvDAO.quorum(previousTimestamp)).to.equal(expectedQuorum);
    });

    it("Should have DFVTokens in the timelock for testing", async function () {
      const timelockBalance = await dfvToken.balanceOf(await timeLock.getAddress());
      expect(timelockBalance).to.equal(TRANSFER_AMOUNT);
    });
  });

  describe("Proposal Creation", function () {
    it("Should allow creation of proposals with sufficient tokens", async function () {
      const transferCalldata = dfvToken.interface.encodeFunctionData("transfer", [recipient.address, TRANSFER_AMOUNT]);

      const tx = await dfvDAO
        .connect(proposer)
        .propose([await dfvToken.getAddress()], [0], [transferCalldata], "Transfer DFV tokens to recipient");

      const receipt = await tx.wait();
      const proposalCreatedEvent = receipt?.logs.find((log: any) => log.fragment?.name === "ProposalCreated") as any;

      expect(proposalCreatedEvent).to.not.be.undefined;
    });

    it("Should revert when proposal threshold is not met", async function () {
      const transferCalldata = dfvToken.interface.encodeFunctionData("transfer", [recipient.address, TRANSFER_AMOUNT]);

      await expect(
        dfvDAO
          .connect(recipient)
          .propose([await dfvToken.getAddress()], [0], [transferCalldata], "Transfer DFV tokens to recipient")
      ).to.be.revertedWithCustomError(dfvDAO, "GovernorInsufficientProposerVotes");
    });
  });

  describe("Execute Transaction to Transfer DFVToken", function () {
    let proposalId: bigint;

    beforeEach(async function () {
      const transferCalldata = dfvToken.interface.encodeFunctionData("transfer", [recipient.address, TRANSFER_AMOUNT]);

      const tx = await dfvDAO
        .connect(proposer)
        .propose([await dfvToken.getAddress()], [0], [transferCalldata], "Transfer DFV tokens to recipient");

      const receipt = await tx.wait();
      const proposalCreatedEvent = receipt?.logs.find((log: any) => log.fragment?.name === "ProposalCreated") as any;

      proposalId = proposalCreatedEvent?.args[0];

      await time.increase(VOTING_DELAY + 1);
    });

    it("Should successfully execute a transaction to transfer DFVToken through DAO", async function () {
      const initialTimelockBalance = await dfvToken.balanceOf(await timeLock.getAddress());
      const initialRecipientBalance = await dfvToken.balanceOf(recipient.address);

      await dfvDAO.connect(voter1).castVote(proposalId, 1);
      await dfvDAO.connect(voter2).castVote(proposalId, 1);

      await time.increase(VOTING_PERIOD + 1);

      expect(await dfvDAO.state(proposalId)).to.equal(4);

      const transferCalldata = dfvToken.interface.encodeFunctionData("transfer", [recipient.address, TRANSFER_AMOUNT]);

      await dfvDAO.queue(
        [await dfvToken.getAddress()],
        [0],
        [transferCalldata],
        ethers.keccak256(ethers.toUtf8Bytes("Transfer DFV tokens to recipient"))
      );

      expect(await dfvDAO.state(proposalId)).to.equal(5);

      await time.increase(MIN_DELAY + 1);
      await dfvDAO.execute(
        [await dfvToken.getAddress()],
        [0],
        [transferCalldata],
        ethers.keccak256(ethers.toUtf8Bytes("Transfer DFV tokens to recipient"))
      );

      expect(await dfvDAO.state(proposalId)).to.equal(7);

      const finalTimelockBalance = await dfvToken.balanceOf(await timeLock.getAddress());
      const finalRecipientBalance = await dfvToken.balanceOf(recipient.address);
      expect(finalTimelockBalance).to.equal(initialTimelockBalance - TRANSFER_AMOUNT);
      expect(finalRecipientBalance).to.equal(initialRecipientBalance + TRANSFER_AMOUNT);
    });

    it("Should fail execution if proposal is defeated", async function () {
      await dfvDAO.connect(voter1).castVote(proposalId, 0);
      await dfvDAO.connect(voter2).castVote(proposalId, 0);

      await time.increase(VOTING_PERIOD + 1);
      expect(await dfvDAO.state(proposalId)).to.equal(3);

      const transferCalldata = dfvToken.interface.encodeFunctionData("transfer", [recipient.address, TRANSFER_AMOUNT]);
      await expect(
        dfvDAO.queue(
          [await dfvToken.getAddress()],
          [0],
          [transferCalldata],
          ethers.keccak256(ethers.toUtf8Bytes("Transfer DFV tokens to recipient"))
        )
      ).to.be.revertedWithCustomError(dfvDAO, "GovernorUnexpectedProposalState");
    });

    it("Should fail execution if quorum is not met", async function () {
      await dfvDAO.connect(voter1).castVote(proposalId, 1);

      await time.increase(VOTING_PERIOD + 1);

      expect(await dfvDAO.state(proposalId)).to.equal(3);
    });

    it("Should emit events when proposal is executed", async function () {
      await dfvDAO.connect(voter1).castVote(proposalId, 1);
      await dfvDAO.connect(voter2).castVote(proposalId, 1);

      await time.increase(VOTING_PERIOD + 1);
      const transferCalldata = dfvToken.interface.encodeFunctionData("transfer", [recipient.address, TRANSFER_AMOUNT]);

      await dfvDAO.queue(
        [await dfvToken.getAddress()],
        [0],
        [transferCalldata],
        ethers.keccak256(ethers.toUtf8Bytes("Transfer DFV tokens to recipient"))
      );

      await time.increase(MIN_DELAY + 1);

      await expect(
        dfvDAO.execute(
          [await dfvToken.getAddress()],
          [0],
          [transferCalldata],
          ethers.keccak256(ethers.toUtf8Bytes("Transfer DFV tokens to recipient"))
        )
      )
        .to.emit(dfvDAO, "ProposalExecuted")
        .withArgs(proposalId);
    });
  });

  describe("Voting", function () {
    let proposalId: bigint;

    beforeEach(async function () {
      const transferCalldata = dfvToken.interface.encodeFunctionData("transfer", [recipient.address, TRANSFER_AMOUNT]);

      const tx = await dfvDAO
        .connect(proposer)
        .propose([await dfvToken.getAddress()], [0], [transferCalldata], "Transfer DFV tokens to recipient");

      const receipt = await tx.wait();
      const proposalCreatedEvent = receipt?.logs.find((log: any) => log.fragment?.name === "ProposalCreated") as any;

      proposalId = proposalCreatedEvent?.args[0];

      await time.increase(VOTING_DELAY + 1);
    });

    it("Should allow voting on proposals", async function () {
      await expect(dfvDAO.connect(voter1).castVote(proposalId, 1))
        .to.emit(dfvDAO, "VoteCast")
        .withArgs(voter1.address, proposalId, 1, await dfvToken.getVotes(voter1.address), "");
    });

    it("Should prevent double voting", async function () {
      await dfvDAO.connect(voter1).castVote(proposalId, 1);

      await expect(dfvDAO.connect(voter1).castVote(proposalId, 1)).to.be.revertedWithCustomError(
        dfvDAO,
        "GovernorAlreadyCastVote"
      );
    });

    it("Should calculate votes correctly", async function () {
      await dfvDAO.connect(voter1).castVote(proposalId, 1);
      await dfvDAO.connect(voter2).castVote(proposalId, 0);

      const votes = await dfvDAO.proposalVotes(proposalId);
      expect(votes.forVotes).to.equal(await dfvToken.getVotes(voter1.address));
      expect(votes.againstVotes).to.equal(await dfvToken.getVotes(voter2.address));
      expect(votes.abstainVotes).to.equal(0);
    });
  });

  describe("DAO Execute Vesting Pool Creation", function () {
    let proposalId: bigint;
    let createCategoryPoolCalldata: string;
    let vestingStartTime: number;
    const VESTING_AMOUNT = ethers.parseEther("694200000");

    beforeEach(async function () {
      const approveCalldata = dfvToken.interface.encodeFunctionData("approve", [
        await dfvVesting.getAddress(),
        VESTING_AMOUNT,
      ]);

      const approveTx = await dfvDAO
        .connect(proposer)
        .propose([await dfvToken.getAddress()], [0], [approveCalldata], "Approve DFVVesting to spend tokens");

      const approveReceipt = await approveTx.wait();
      const approveProposalEvent = approveReceipt?.logs.find(
        (log: any) => log.fragment?.name === "ProposalCreated"
      ) as any;
      const approveProposalId = approveProposalEvent?.args[0];

      await time.increase(VOTING_DELAY + 1);
      await dfvDAO.connect(voter1).castVote(approveProposalId, 1);
      await dfvDAO.connect(voter2).castVote(approveProposalId, 1);
      await time.increase(VOTING_PERIOD + 1);

      await dfvDAO.queue(
        [await dfvToken.getAddress()],
        [0],
        [approveCalldata],
        ethers.keccak256(ethers.toUtf8Bytes("Approve DFVVesting to spend tokens"))
      );

      await time.increase(MIN_DELAY + 1);

      await dfvDAO.execute(
        [await dfvToken.getAddress()],
        [0],
        [approveCalldata],
        ethers.keccak256(ethers.toUtf8Bytes("Approve DFVVesting to spend tokens"))
      );

      vestingStartTime = Math.floor(Date.now() / 1000) + 3600;

      createCategoryPoolCalldata = dfvVesting.interface.encodeFunctionData("createCategoryPool", [
        {
          category: 1,
          beneficiary: recipient.address,
          multiplierOrAmount: 1,
          start: vestingStartTime,
        },
      ]);

      const tx = await dfvDAO
        .connect(proposer)
        .propose(
          [await dfvVesting.getAddress()],
          [0],
          [createCategoryPoolCalldata],
          "Create vesting pool for EternalHODLers category"
        );

      const receipt = await tx.wait();
      const proposalCreatedEvent = receipt?.logs.find((log: any) => log.fragment?.name === "ProposalCreated") as any;

      proposalId = proposalCreatedEvent?.args[0];

      await time.increase(VOTING_DELAY + 1);
    });

    it("Should successfully execute createCategoryPool through DAO", async function () {
      const initialClaimableAmount = await dfvVesting.getClaimableAmount(recipient.address);
      expect(initialClaimableAmount).to.equal(0);

      await dfvDAO.connect(voter1).castVote(proposalId, 1);
      await dfvDAO.connect(voter2).castVote(proposalId, 1);

      await time.increase(VOTING_PERIOD + 1);

      expect(await dfvDAO.state(proposalId)).to.equal(4);

      await dfvDAO.queue(
        [await dfvVesting.getAddress()],
        [0],
        [createCategoryPoolCalldata],
        ethers.keccak256(ethers.toUtf8Bytes("Create vesting pool for EternalHODLers category"))
      );

      expect(await dfvDAO.state(proposalId)).to.equal(5);

      await time.increase(MIN_DELAY + 1);

      await dfvDAO.execute(
        [await dfvVesting.getAddress()],
        [0],
        [createCategoryPoolCalldata],
        ethers.keccak256(ethers.toUtf8Bytes("Create vesting pool for EternalHODLers category"))
      );

      expect(await dfvDAO.state(proposalId)).to.equal(7);

      await time.increase(3600 + 1);

      const claimableAmountBeforeClaim = await dfvVesting.getClaimableAmount(recipient.address);
      expect(claimableAmountBeforeClaim).to.be.greaterThan(0);

      const initialRecipientBalance = await dfvToken.balanceOf(recipient.address);
      expect(initialRecipientBalance).to.equal(0);

      await dfvVesting.connect(recipient).claim();

      const finalRecipientBalance = await dfvToken.balanceOf(recipient.address);
      expect(finalRecipientBalance).to.be.greaterThan(0);
      expect(finalRecipientBalance).to.be.greaterThanOrEqual(claimableAmountBeforeClaim);

      const remainingClaimableAmount = await dfvVesting.getClaimableAmount(recipient.address);
      expect(remainingClaimableAmount).to.be.lessThan(ethers.parseEther("1"));
    });

    it("Should emit VestingPoolCreated event when executed through DAO", async function () {
      await dfvDAO.connect(voter1).castVote(proposalId, 1);
      await dfvDAO.connect(voter2).castVote(proposalId, 1);

      await time.increase(VOTING_PERIOD + 1);

      await dfvDAO.queue(
        [await dfvVesting.getAddress()],
        [0],
        [createCategoryPoolCalldata],
        ethers.keccak256(ethers.toUtf8Bytes("Create vesting pool for EternalHODLers category"))
      );

      await time.increase(MIN_DELAY + 1);

      await expect(
        dfvDAO.execute(
          [await dfvVesting.getAddress()],
          [0],
          [createCategoryPoolCalldata],
          ethers.keccak256(ethers.toUtf8Bytes("Create vesting pool for EternalHODLers category"))
        )
      )
        .to.emit(dfvVesting, "VestingPoolCreated")
        .and.to.emit(dfvDAO, "ProposalExecuted")
        .withArgs(proposalId);
    });

    it("Should allow recipient to claim vested tokens after DAO creates vesting pool", async function () {
      await dfvDAO.connect(voter1).castVote(proposalId, 1);
      await dfvDAO.connect(voter2).castVote(proposalId, 1);
      await time.increase(VOTING_PERIOD + 1);

      await dfvDAO.queue(
        [await dfvVesting.getAddress()],
        [0],
        [createCategoryPoolCalldata],
        ethers.keccak256(ethers.toUtf8Bytes("Create vesting pool for EternalHODLers category"))
      );

      await time.increase(MIN_DELAY + 1);

      await dfvDAO.execute(
        [await dfvVesting.getAddress()],
        [0],
        [createCategoryPoolCalldata],
        ethers.keccak256(ethers.toUtf8Bytes("Create vesting pool for EternalHODLers category"))
      );

      await time.increase(3600 + 1);

      const initialRecipientBalance = await dfvToken.balanceOf(recipient.address);
      expect(initialRecipientBalance).to.equal(0);

      const claimableAmountBeforeClaim = await dfvVesting.getClaimableAmount(recipient.address);
      expect(claimableAmountBeforeClaim).to.be.greaterThan(0);

      const claimTx = await dfvVesting.connect(recipient).claim();
      const claimReceipt = await claimTx.wait();

      const claimEvent = claimReceipt?.logs.find((log: any) => log.fragment?.name === "Claim");
      expect(claimEvent).to.not.be.undefined;

      const finalRecipientBalance = await dfvToken.balanceOf(recipient.address);
      expect(finalRecipientBalance).to.be.greaterThan(0);
      expect(finalRecipientBalance).to.be.greaterThanOrEqual(claimableAmountBeforeClaim);

      const remainingClaimableAmount = await dfvVesting.getClaimableAmount(recipient.address);
      expect(remainingClaimableAmount).to.be.lessThan(ethers.parseEther("1"));

      await time.increase(30 * 24 * 3600);

      const newClaimableAmountBeforeClaim = await dfvVesting.getClaimableAmount(recipient.address);
      expect(newClaimableAmountBeforeClaim).to.be.greaterThan(0);

      const balanceBeforeSecondClaim = await dfvToken.balanceOf(recipient.address);
      await dfvVesting.connect(recipient).claim();
      const balanceAfterSecondClaim = await dfvToken.balanceOf(recipient.address);

      expect(balanceAfterSecondClaim).to.be.greaterThan(balanceBeforeSecondClaim);
      expect(balanceAfterSecondClaim - balanceBeforeSecondClaim).to.be.greaterThanOrEqual(
        newClaimableAmountBeforeClaim
      );
    });
  });

  describe("Governor Functions", function () {
    describe("proposalNeedsQueuing", function () {
      let proposalId: bigint;

      beforeEach(async function () {
        const transferCalldata = dfvToken.interface.encodeFunctionData("transfer", [
          recipient.address,
          TRANSFER_AMOUNT,
        ]);

        const tx = await dfvDAO
          .connect(proposer)
          .propose([await dfvToken.getAddress()], [0], [transferCalldata], "Transfer DFV tokens to recipient");

        const receipt = await tx.wait();
        const proposalCreatedEvent = receipt?.logs.find((log: any) => log.fragment?.name === "ProposalCreated") as any;

        proposalId = proposalCreatedEvent?.args[0];
      });

      it("Should return true for proposals that need queuing", async function () {
        expect(await dfvDAO.proposalNeedsQueuing(proposalId)).to.equal(true);
      });

      it("Should return true for different proposal types", async function () {
        const createPoolCalldata = dfvVesting.interface.encodeFunctionData("createCategoryPool", [
          {
            category: 1,
            beneficiary: recipient.address,
            multiplierOrAmount: 1,
            start: Math.floor(Date.now() / 1000) + 3600,
          },
        ]);

        const tx = await dfvDAO
          .connect(proposer)
          .propose([await dfvVesting.getAddress()], [0], [createPoolCalldata], "Create vesting pool");

        const receipt = await tx.wait();
        const proposalCreatedEvent = receipt?.logs.find((log: any) => log.fragment?.name === "ProposalCreated") as any;

        const vestingProposalId = proposalCreatedEvent?.args[0];

        expect(await dfvDAO.proposalNeedsQueuing(vestingProposalId)).to.equal(true);
      });

      it("Should return consistent results for the same proposal", async function () {
        const needsQueuing1 = await dfvDAO.proposalNeedsQueuing(proposalId);
        const needsQueuing2 = await dfvDAO.proposalNeedsQueuing(proposalId);

        expect(needsQueuing1).to.equal(needsQueuing2);
        expect(needsQueuing1).to.equal(true);
      });
    });

    describe("CLOCK_MODE", function () {
      it("Should return correct clock mode", async function () {
        const clockMode = await dfvDAO.CLOCK_MODE();
        expect(clockMode).to.equal("mode=timestamp");
      });

      it("Should be consistent with token clock mode", async function () {
        const daoClockMode = await dfvDAO.CLOCK_MODE();
        const tokenClockMode = await dfvToken.CLOCK_MODE();

        expect(daoClockMode).to.equal(tokenClockMode);
      });

      it("Should be consistent with clock function", async function () {
        const clockMode = await dfvDAO.CLOCK_MODE();
        const currentClock = await dfvDAO.clock();

        expect(clockMode).to.equal("mode=timestamp");

        const latestBlock = await ethers.provider.getBlock("latest");
        const blockTimestamp = latestBlock?.timestamp || 0;
        const clockValue = Number(currentClock);

        expect(clockValue).to.equal(blockTimestamp);
      });

      it("Should return string type", async function () {
        const clockMode = await dfvDAO.CLOCK_MODE();
        expect(typeof clockMode).to.equal("string");
        expect(clockMode.length).to.be.greaterThan(0);
      });
    });

    describe("cancel functionality", function () {
      let proposalId: bigint;
      let targets: string[];
      let values: number[];
      let calldatas: string[];
      let descriptionHash: string;

      beforeEach(async function () {
        const transferCalldata = dfvToken.interface.encodeFunctionData("transfer", [
          recipient.address,
          TRANSFER_AMOUNT,
        ]);

        targets = [await dfvToken.getAddress()];
        values = [0];
        calldatas = [transferCalldata];
        descriptionHash = ethers.keccak256(ethers.toUtf8Bytes("Transfer DFV tokens to recipient"));

        const tx = await dfvDAO
          .connect(proposer)
          .propose(targets, values, calldatas, "Transfer DFV tokens to recipient");

        const receipt = await tx.wait();
        const proposalCreatedEvent = receipt?.logs.find((log: any) => log.fragment?.name === "ProposalCreated") as any;

        proposalId = proposalCreatedEvent?.args[0];
      });

      it("Should allow proposer to cancel their own proposal", async function () {
        expect(await dfvDAO.state(proposalId)).to.equal(0);

        await expect(dfvDAO.connect(proposer).cancel(targets, values, calldatas, descriptionHash))
          .to.emit(dfvDAO, "ProposalCanceled")
          .withArgs(proposalId);

        expect(await dfvDAO.state(proposalId)).to.equal(2);
      });

      it("Should allow cancellation in pending state", async function () {
        expect(await dfvDAO.state(proposalId)).to.equal(0);

        await expect(dfvDAO.connect(proposer).cancel(targets, values, calldatas, descriptionHash))
          .to.emit(dfvDAO, "ProposalCanceled")
          .withArgs(proposalId);

        expect(await dfvDAO.state(proposalId)).to.equal(2);
      });

      it("Should prevent cancellation during active voting period", async function () {
        await time.increase(VOTING_DELAY + 1);
        expect(await dfvDAO.state(proposalId)).to.equal(1);

        await expect(
          dfvDAO.connect(proposer).cancel(targets, values, calldatas, descriptionHash)
        ).to.be.revertedWithCustomError(dfvDAO, "GovernorUnableToCancel");
      });

      it("Should prevent non-proposer from canceling proposal", async function () {
        await expect(
          dfvDAO.connect(voter1).cancel(targets, values, calldatas, descriptionHash)
        ).to.be.revertedWithCustomError(dfvDAO, "GovernorUnableToCancel");
      });

      it("Should prevent cancellation after proposal is succeeded", async function () {
        await time.increase(VOTING_DELAY + 1);
        await dfvDAO.connect(voter1).castVote(proposalId, 1);
        await dfvDAO.connect(voter2).castVote(proposalId, 1);

        await time.increase(VOTING_PERIOD + 1);
        expect(await dfvDAO.state(proposalId)).to.equal(4);

        await expect(
          dfvDAO.connect(proposer).cancel(targets, values, calldatas, descriptionHash)
        ).to.be.revertedWithCustomError(dfvDAO, "GovernorUnableToCancel");
      });

      it("Should prevent cancellation after proposal is queued", async function () {
        await time.increase(VOTING_DELAY + 1);
        await dfvDAO.connect(voter1).castVote(proposalId, 1);
        await dfvDAO.connect(voter2).castVote(proposalId, 1);

        await time.increase(VOTING_PERIOD + 1);
        await dfvDAO.queue(targets, values, calldatas, descriptionHash);
        expect(await dfvDAO.state(proposalId)).to.equal(5);

        await expect(
          dfvDAO.connect(proposer).cancel(targets, values, calldatas, descriptionHash)
        ).to.be.revertedWithCustomError(dfvDAO, "GovernorUnableToCancel");
      });

      it("Should handle cancellation with multiple operations", async function () {
        const multiTargets = [await dfvToken.getAddress(), await dfvToken.getAddress()];
        const multiValues = [0, 0];
        const multiCalldatas = [
          dfvToken.interface.encodeFunctionData("transfer", [voter1.address, TRANSFER_AMOUNT / 2n]),
          dfvToken.interface.encodeFunctionData("transfer", [voter2.address, TRANSFER_AMOUNT / 2n]),
        ];
        const multiDescriptionHash = ethers.keccak256(ethers.toUtf8Bytes("Multiple transfers"));

        const tx = await dfvDAO
          .connect(proposer)
          .propose(multiTargets, multiValues, multiCalldatas, "Multiple transfers");

        const receipt = await tx.wait();
        const proposalCreatedEvent = receipt?.logs.find((log: any) => log.fragment?.name === "ProposalCreated") as any;
        const multiProposalId = proposalCreatedEvent?.args[0];

        await expect(dfvDAO.connect(proposer).cancel(multiTargets, multiValues, multiCalldatas, multiDescriptionHash))
          .to.emit(dfvDAO, "ProposalCanceled")
          .withArgs(multiProposalId);

        expect(await dfvDAO.state(multiProposalId)).to.equal(2);
      });

      it("Should revert when canceling non-existent proposal", async function () {
        const fakeTargets = [recipient.address];
        const fakeValues = [0];
        const fakeCalldatas = ["0x"];
        const fakeDescriptionHash = ethers.keccak256(ethers.toUtf8Bytes("Fake proposal"));

        await expect(
          dfvDAO.connect(proposer).cancel(fakeTargets, fakeValues, fakeCalldatas, fakeDescriptionHash)
        ).to.be.revertedWithCustomError(dfvDAO, "GovernorNonexistentProposal");
      });
    });
  });
});
