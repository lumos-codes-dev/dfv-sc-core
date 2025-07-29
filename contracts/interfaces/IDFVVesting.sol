// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IDFVVesting
 * @notice Interface for the DFV Vesting contract
 */
interface IDFVVesting {
    /// @notice Structure to define a vesting schedule
    /// @param start The timestamp when the vesting timeline starts.
    /// @param cliffDuration The duration of the cliff period in seconds.
    /// @param vestingDuration The total duration of the vesting period in seconds.
    struct Schedule {
        uint256 start;
        uint256 cliffDuration;
        uint256 vestingDuration;
    }

    /// @notice Structure which describe vesting pool
    /// @param amount The total amount of tokens to be vested.
    /// @param schedule The vesting schedule.
    /// @param initialUnlock The percentage of tokens that can be claimed immediately after the cliff.
    /// @param claimed The amount of tokens that have already been claimed.
    struct Pool {
        uint256 amount;
        Schedule schedule;
        uint256 initialUnlock;
        uint256 claimed;
    }

    /// @notice Event emitted when a new vesting pool is created
    /// @param beneficiary The address of the beneficiary who will receive the vested tokens.
    /// @param pool The details of the created vesting pool.
    event VestingPoolCreated(address indexed beneficiary, Pool pool);

    /// @notice Event emitted when tokens are claimed by a beneficiary
    /// @param beneficiary The address of the beneficiary who claimed the tokens.
    /// @param amount The amount of tokens claimed.
    event Claim(address indexed beneficiary, uint256 amount);

    /// @notice Event emitted when unused tokens are withdrawn from the contract by the owner
    /// @param token The address of the token being withdrawn.
    /// @param amount The amount of tokens withdrawn.
    event WithdrawUnusedTokens(IERC20 indexed token, uint256 amount);

    /// @dev Error thrown when a zero address is provided
    error ZeroAddress();

    /// @dev Error thrown when a zero amount is provided or calculated
    error ZeroAmount();

    /// @dev Error thrown when the start time of a vesting schedule is in the past
    error StartMustBeInFuture();

    /// @dev Error thrown when the length of arrays do not match
    error ArraysLengthMismatch();

    /// @dev Error thrown when no allocations are found for a beneficiary during a claim
    error NoAllocationsFound();

    /// @dev Error thrown when the initial unlock percentage exceeds the limit 100% (10000 basis points)
    error InitialUnlockExceedsLimit();

    /// @notice Function to create a new vesting pool
    /// @param beneficiary_ The address of the beneficiary who will receive the vested tokens
    /// @param amount_ The total amount of tokens to be vested
    /// @param schedule_ The vesting schedule defining start, cliff duration, and vesting
    /// @param initialUnlock_ The percentage of tokens that can be claimed immediately after the cliff
    function createVestingPool(
        address beneficiary_,
        uint256 amount_,
        Schedule calldata schedule_,
        uint256 initialUnlock_
    ) external;

    /// @notice Function to create vesting pools for multiple beneficiaries
    /// @param beneficiaries_ An array of addresses of beneficiaries who will receive the vested tokens
    /// @param amounts_ An array of total amounts of tokens to be vested for each beneficiary
    /// @param schedule_ The vesting schedule defining start, cliff duration, and vesting duration
    /// @param initialUnlock_ The percentage of tokens that can be claimed immediately after the cliff
    function createVestingPoolBatch(
        address[] calldata beneficiaries_,
        uint256[] calldata amounts_,
        Schedule calldata schedule_,
        uint256 initialUnlock_
    ) external;

    /// @notice Function to claim vested tokens for the caller
    /// @dev It claims amount of tokens from all vesting pools of the caller
    function claim() external;

    /// @notice Function to claim vested tokens for a specific beneficiary
    /// @param beneficiary_ The address of the beneficiary who will receive the claimed tokens
    /// @dev It claims amount of tokens from all vesting pools of the specified beneficiary
    /// @dev This function can be called by any address to pay transaction fee for the beneficiary
    function claimFor(address beneficiary_) external;

    /// @notice Function to withdraw unused tokens from the contract by the owner
    /// @param token_ The address of the token to be withdrawn
    /// @dev It transfers the unused tokens to the owner, excluding the total vested amount
    function withdrawUnusedTokens(IERC20 token_) external;

    /// @notice Function to get the total claimable amount for a specific beneficiary
    /// @param beneficiary_ The address of the beneficiary for whom to calculate the claimable amount
    /// @return amount The total amount of tokens that can be claimed by the beneficiary
    function getClaimableAmount(address beneficiary_) external view returns (uint256 amount);
}
