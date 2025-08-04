import { expect } from "chai";
import { ethers } from "hardhat";
import { DFVDAO, GovernanceToken, TimeLock, DFVToken, DFVVesting } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time, mine } from "@nomicfoundation/hardhat-network-helpers";

describe("DFVDAO", function () {
  let dfvDAO: DFVDAO;
  let governanceToken: GovernanceToken;
  let timeLock: TimeLock;
  let dfvToken: DFVToken;
  let dfvVesting: DFVVesting;
  let owner: SignerWithAddress;
  let proposer: SignerWithAddress;
  let voter1: SignerWithAddress;
  let voter2: SignerWithAddress;
  let recipient: SignerWithAddress;
  let addrs: SignerWithAddress[];

  const VOTING_DELAY = 1; // 1 block
  const VOTING_PERIOD = 5; // 5 blocks
  const PROPOSAL_THRESHOLD = ethers.parseEther("100000"); // 100k tokens
  const QUORUM_PERCENTAGE = 4; // 4%
  const MIN_DELAY = 3600; // 1 hour in seconds
  const GOVERNANCE_INITIAL_SUPPLY = ethers.parseEther("10000000"); // 10M tokens
  const TRANSFER_AMOUNT = ethers.parseEther("1000"); // Amount to transfer via DAO

  beforeEach(async function () {
    [owner, proposer, voter1, voter2, recipient, ...addrs] = await ethers.getSigners();

    const DFVTokenFactory = await ethers.getContractFactory("DFVToken");
    const GovernanceTokenFactory = await ethers.getContractFactory("GovernanceToken");
    const TimeLockFactory = await ethers.getContractFactory("TimeLock");
    const DFVDAOFactory = await ethers.getContractFactory("DFVDAO");
    const DFVVestingFactory = await ethers.getContractFactory("DFVVesting");

    dfvToken = await DFVTokenFactory.deploy();
    await dfvToken.waitForDeployment();

    dfvVesting = await DFVVestingFactory.deploy(await dfvToken.getAddress());
    await dfvVesting.waitForDeployment();

    governanceToken = await GovernanceTokenFactory.deploy(
      "DAO Governance Token",
      "DGT",
      GOVERNANCE_INITIAL_SUPPLY,
      owner.address
    );
    await governanceToken.waitForDeployment();

    timeLock = await TimeLockFactory.deploy(
      MIN_DELAY,
      [], // proposers (will be set to DAO)
      [], // executors (will be set to DAO)
      owner.address // admin
    );
    await timeLock.waitForDeployment();

    dfvDAO = await DFVDAOFactory.deploy(
      await governanceToken.getAddress(),
      await timeLock.getAddress(),
      VOTING_DELAY,
      VOTING_PERIOD,
      PROPOSAL_THRESHOLD,
      QUORUM_PERCENTAGE
    );
    await dfvDAO.waitForDeployment();

    await timeLock.grantRole(await timeLock.PROPOSER_ROLE(), await dfvDAO.getAddress());
    await timeLock.grantRole(await timeLock.EXECUTOR_ROLE(), await dfvDAO.getAddress());

    // Revoke admin role from owner
    await timeLock.revokeRole(await timeLock.DEFAULT_ADMIN_ROLE(), owner.address);
    await dfvVesting.transferOwnership(await timeLock.getAddress());

    await governanceToken.transfer(proposer.address, ethers.parseEther("200000"));
    await governanceToken.transfer(voter1.address, ethers.parseEther("300000"));
    await governanceToken.transfer(voter2.address, ethers.parseEther("200000"));
    await governanceToken.connect(proposer).delegate(proposer.address);
    await governanceToken.connect(voter1).delegate(voter1.address);
    await governanceToken.connect(voter2).delegate(voter2.address);

    const timelockAddress = await timeLock.getAddress();
    await dfvToken.transfer(timelockAddress, await dfvToken.totalSupply());
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
      const previousBlock = (await time.latestBlock()) - 1;
      const totalSupply = await governanceToken.totalSupply();
      const expectedQuorum = (totalSupply * BigInt(QUORUM_PERCENTAGE)) / BigInt(100);

      expect(await dfvDAO.quorum(previousBlock)).to.equal(expectedQuorum);
    });

    it("Should have DFVTokens in the timelock for testing", async function () {
      const timelockBalance = await dfvToken.balanceOf(await timeLock.getAddress());
      expect(timelockBalance).to.equal(ethers.parseEther("138840000000"));
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

      await mine(2);
    });

    it("Should successfully execute a transaction to transfer DFVToken through DAO", async function () {
      const initialTimelockBalance = await dfvToken.balanceOf(await timeLock.getAddress());
      const initialRecipientBalance = await dfvToken.balanceOf(recipient.address);

      await dfvDAO.connect(voter1).castVote(proposalId, 1);
      await dfvDAO.connect(voter2).castVote(proposalId, 1);

      await mine(VOTING_PERIOD + 1);

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

      await mine(VOTING_PERIOD + 1);
      expect(await dfvDAO.state(proposalId)).to.equal(3); // Defeated

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

      await mine(VOTING_PERIOD + 1);

      expect(await dfvDAO.state(proposalId)).to.equal(3);
    });

    it("Should emit events when proposal is executed", async function () {
      await dfvDAO.connect(voter1).castVote(proposalId, 1);
      await dfvDAO.connect(voter2).castVote(proposalId, 1);

      await mine(VOTING_PERIOD + 1);
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

      await mine(2);
    });

    it("Should allow voting on proposals", async function () {
      await expect(dfvDAO.connect(voter1).castVote(proposalId, 1))
        .to.emit(dfvDAO, "VoteCast")
        .withArgs(voter1.address, proposalId, 1, await governanceToken.getVotes(voter1.address), "");
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
      expect(votes.forVotes).to.equal(await governanceToken.getVotes(voter1.address));
      expect(votes.againstVotes).to.equal(await governanceToken.getVotes(voter2.address));
      expect(votes.abstainVotes).to.equal(0);
    });
  });

  describe("DAO Execute Vesting Pool Creation", function () {
    let proposalId: bigint;
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

      await mine(2);
      await dfvDAO.connect(voter1).castVote(approveProposalId, 1);
      await dfvDAO.connect(voter2).castVote(approveProposalId, 1);
      await mine(VOTING_PERIOD + 1);

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

      const createCategoryPoolCalldata = dfvVesting.interface.encodeFunctionData("createCategoryPool", [
        {
          category: 0, // BlindBelievers
          beneficiary: recipient.address,
          multiplierOrAmount: 1,
          start: Math.floor(Date.now() / 1000) + 3600,
        },
      ]);

      const tx = await dfvDAO
        .connect(proposer)
        .propose(
          [await dfvVesting.getAddress()],
          [0],
          [createCategoryPoolCalldata],
          "Create vesting pool for BlindBelievers category"
        );

      const receipt = await tx.wait();
      const proposalCreatedEvent = receipt?.logs.find((log: any) => log.fragment?.name === "ProposalCreated") as any;

      proposalId = proposalCreatedEvent?.args[0];

      await mine(2);
    });

    it("Should successfully execute createCategoryPool through DAO", async function () {
      const initialClaimableAmount = await dfvVesting.getClaimableAmount(recipient.address);
      expect(initialClaimableAmount).to.equal(0);

      await dfvDAO.connect(voter1).castVote(proposalId, 1);
      await dfvDAO.connect(voter2).castVote(proposalId, 1);

      await mine(VOTING_PERIOD + 1);

      expect(await dfvDAO.state(proposalId)).to.equal(4);

      const createCategoryPoolCalldata = dfvVesting.interface.encodeFunctionData("createCategoryPool", [
        {
          category: 0, // BlindBelievers
          beneficiary: recipient.address,
          multiplierOrAmount: 1,
          start: Math.floor(Date.now() / 1000) + 3600,
        },
      ]);

      await dfvDAO.queue(
        [await dfvVesting.getAddress()],
        [0],
        [createCategoryPoolCalldata],
        ethers.keccak256(ethers.toUtf8Bytes("Create vesting pool for BlindBelievers category"))
      );

      expect(await dfvDAO.state(proposalId)).to.equal(5);

      await time.increase(MIN_DELAY + 1);

      await dfvDAO.execute(
        [await dfvVesting.getAddress()],
        [0],
        [createCategoryPoolCalldata],
        ethers.keccak256(ethers.toUtf8Bytes("Create vesting pool for BlindBelievers category"))
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

      await mine(VOTING_PERIOD + 1);

      const createCategoryPoolCalldata = dfvVesting.interface.encodeFunctionData("createCategoryPool", [
        {
          category: 0, // BlindBelievers
          beneficiary: recipient.address,
          multiplierOrAmount: 1,
          start: Math.floor(Date.now() / 1000) + 3600,
        },
      ]);

      await dfvDAO.queue(
        [await dfvVesting.getAddress()],
        [0],
        [createCategoryPoolCalldata],
        ethers.keccak256(ethers.toUtf8Bytes("Create vesting pool for BlindBelievers category"))
      );

      await time.increase(MIN_DELAY + 1);

      await expect(
        dfvDAO.execute(
          [await dfvVesting.getAddress()],
          [0],
          [createCategoryPoolCalldata],
          ethers.keccak256(ethers.toUtf8Bytes("Create vesting pool for BlindBelievers category"))
        )
      )
        .to.emit(dfvVesting, "VestingPoolCreated")
        .and.to.emit(dfvDAO, "ProposalExecuted")
        .withArgs(proposalId);
    });

    it("Should allow recipient to claim vested tokens after DAO creates vesting pool", async function () {
      await dfvDAO.connect(voter1).castVote(proposalId, 1);
      await dfvDAO.connect(voter2).castVote(proposalId, 1);
      await mine(VOTING_PERIOD + 1);

      const createCategoryPoolCalldata = dfvVesting.interface.encodeFunctionData("createCategoryPool", [
        {
          category: 0, // BlindBelievers
          beneficiary: recipient.address,
          multiplierOrAmount: 1,
          start: Math.floor(Date.now() / 1000) + 3600,
        },
      ]);

      await dfvDAO.queue(
        [await dfvVesting.getAddress()],
        [0],
        [createCategoryPoolCalldata],
        ethers.keccak256(ethers.toUtf8Bytes("Create vesting pool for BlindBelievers category"))
      );

      await time.increase(MIN_DELAY + 1);

      await dfvDAO.execute(
        [await dfvVesting.getAddress()],
        [0],
        [createCategoryPoolCalldata],
        ethers.keccak256(ethers.toUtf8Bytes("Create vesting pool for BlindBelievers category"))
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

    it("Should fail if DFVVesting contract doesn't have enough tokens", async function () {
      const transferAllTokensCalldata = dfvToken.interface.encodeFunctionData("transfer", [
        owner.address,
        await dfvToken.balanceOf(await timeLock.getAddress()),
      ]);

      const transferProposalTx = await dfvDAO
        .connect(proposer)
        .propose([await dfvToken.getAddress()], [0], [transferAllTokensCalldata], "Transfer all tokens away");

      const transferReceipt = await transferProposalTx.wait();
      const transferProposalEvent = transferReceipt?.logs.find(
        (log: any) => log.fragment?.name === "ProposalCreated"
      ) as any;
      const transferProposalId = transferProposalEvent?.args[0];

      await mine(2);
      await dfvDAO.connect(voter1).castVote(transferProposalId, 1);
      await dfvDAO.connect(voter2).castVote(transferProposalId, 1);
      await mine(VOTING_PERIOD + 1);

      await dfvDAO.queue(
        [await dfvToken.getAddress()],
        [0],
        [transferAllTokensCalldata],
        ethers.keccak256(ethers.toUtf8Bytes("Transfer all tokens away"))
      );

      await time.increase(MIN_DELAY + 1);

      await dfvDAO.execute(
        [await dfvToken.getAddress()],
        [0],
        [transferAllTokensCalldata],
        ethers.keccak256(ethers.toUtf8Bytes("Transfer all tokens away"))
      );

      const createCategoryPoolCalldata = dfvVesting.interface.encodeFunctionData("createCategoryPool", [
        {
          category: 0, // BlindBelievers
          beneficiary: recipient.address,
          multiplierOrAmount: 1,
          start: Math.floor(Date.now() / 1000) + 3600,
        },
      ]);

      const newProposalTx = await dfvDAO
        .connect(proposer)
        .propose(
          [await dfvVesting.getAddress()],
          [0],
          [createCategoryPoolCalldata],
          "Create vesting pool for BlindBelievers category - should fail"
        );

      const newProposalReceipt = await newProposalTx.wait();
      const newProposalEvent = newProposalReceipt?.logs.find(
        (log: any) => log.fragment?.name === "ProposalCreated"
      ) as any;
      const newProposalId = newProposalEvent?.args[0];

      await mine(2);
      await dfvDAO.connect(voter1).castVote(newProposalId, 1);
      await dfvDAO.connect(voter2).castVote(newProposalId, 1);
      await mine(VOTING_PERIOD + 1);

      await dfvDAO.queue(
        [await dfvVesting.getAddress()],
        [0],
        [createCategoryPoolCalldata],
        ethers.keccak256(ethers.toUtf8Bytes("Create vesting pool for BlindBelievers category - should fail"))
      );

      await time.increase(MIN_DELAY + 1);

      await expect(
        dfvDAO.execute(
          [await dfvVesting.getAddress()],
          [0],
          [createCategoryPoolCalldata],
          ethers.keccak256(ethers.toUtf8Bytes("Create vesting pool for BlindBelievers category - should fail"))
        )
      ).to.be.reverted;
    });
  });
});
