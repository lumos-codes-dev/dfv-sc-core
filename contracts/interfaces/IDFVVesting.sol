// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IDFVVesting
 * @notice Interface for the DFV Vesting contract
 */
interface IDFVVesting {
    /// @notice Structure to define a vesting schedule
    /// @param cliffDuration The duration of the cliff period in seconds.
    /// @param periodDuration The duration of each vesting period in seconds.
    /// @param periodCount The number of vesting periods.
    struct Schedule {
        uint256 cliffDuration;
        uint256 periodDuration;
        uint256 periodCount;
    }

    /// @notice Structure which describe vesting pool
    /// @param amount The total amount of tokens to be vested.
    /// @param start The timestamp when the vesting timeline starts.
    /// @param schedule The vesting schedule.
    /// @param initialUnlock The percentage of tokens that can be claimed immediately after the cliff.
    /// @param claimed The amount of tokens that have already been claimed.
    struct Pool {
        uint256 amount;
        uint256 start;
        Schedule schedule;
        uint256 initialUnlock;
        uint256 claimed;
        bool isCategory;
    }

    /// @notice Enum to categorize vesting pools
    /// @dev This enum is used to categorize different types of vesting pools.
    enum VestingCategory {
        BlindBelievers,
        EternalHODLers,
        DiamondHands,
        JustHODLers,
        CommunityAirdrop
    }

    /// @notice Structure to define rules for a vesting category
    /// @param totalVestedAmountLeft The total amount of tokens left to be vested for this category.
    /// @param beneficiariesLeft The number of beneficiaries left for this category.
    /// @param schedule The vesting schedule defining cliff duration and vesting periods.
    /// @param initialUnlock The percentage of tokens that can be claimed immediately after the cliff.
    struct CategoryRules {
        uint256 totalVestedAmountLeft;
        uint256 qty;
        uint256 beneficiariesLeft;
        Schedule schedule;
        uint256 initialUnlock;
    }

    /// @notice Structure to define parameters for creating a custom vesting pool
    /// @param beneficiary The address of the beneficiary who will receive the vested tokens.
    /// @param amount The total amount of tokens to be vested for the beneficiary.
    /// @param start The timestamp when the vesting timeline starts for the beneficiary.
    /// @param schedule The vesting schedule defining cliff duration and vesting periods.
    /// @param initialUnlock The percentage of tokens that can be claimed immediately after the cliff (in basis points).
    struct CreateCustomVestingPoolParams {
        address beneficiary;
        uint256 amount;
        uint256 start;
        Schedule schedule;
        uint256 initialUnlock;
    }

    /// @notice Structure to define parameters for creating a category pool
    /// @param category The vesting category for which the pool is being created.
    /// @param beneficiary The address of the beneficiary who will receive the vested tokens.
    /// @param multiplierOrAmount The multiplier for BlindBelievers (0), EternalHODLers (1), DiamondHands
    /// (2), JustHODLers (3) categories or the amount of tokens to be vested for CommunityAirdrop (4) category.
    /// @param start The timestamp when the vesting timeline starts for the beneficiary in this category.
    struct CreateCategoryPoolParams {
        VestingCategory category;
        address beneficiary;
        uint256 multiplierOrAmount;
        uint256 start;
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

    /// @dev Error thrown when no parameters are provided for a function that requires them
    error NoParamsProvided();

    /// @dev Error thrown when the batch size exceeds the maximum allowed size
    error BatchSizeExceedsLimit();

    /// @dev Error thrown when no allocations are found for a beneficiary during a claim
    error NoAllocationsFound();

    /// @dev Error thrown when the initial unlock percentage exceeds the limit 100% (10000 basis points)
    error InitialUnlockExceedsLimit();

    /// @dev Error thrown when the total vested amount left for a category is less than the requested amount
    /// @param category The vesting category for which the allocation is insufficient
    error NotEnoughAllocationLeft(VestingCategory category);

    /// @dev Error thrown when the number of beneficiaries left for a category is zero
    /// @param category The vesting category for which there are no beneficiaries left
    error CategoryBeneficiariesAllSet(VestingCategory category);

    /// @notice Function to create a new vesting pool
    /// @param params_ The parameters for creating a custom vesting pool
    /// @dev See `CreateCustomVestingPoolParams` for details on the parameters
    function createCustomVestingPool(CreateCustomVestingPoolParams calldata params_) external;

    /// @notice Function to create vesting pools for multiple beneficiaries
    /// @param params_ The parameters object array for creating custom vesting pools
    /// @dev See `CreateCustomVestingPoolParams` for details on the parameters
    function createCustomVestingPoolBatch(CreateCustomVestingPoolParams[] calldata params_) external;

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
