// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IDFVVesting} from "./interfaces/IDFVVesting.sol";

/**
 * @title DFVVesting
 * @notice This contract allows the owner to create vesting pools for beneficiaries and manage their vesting schedules.
 * @dev It uses OpenZeppelin's Ownable for ownership management and SafeERC20 for safe token transfers.
 */
contract DFVVesting is IDFVVesting, Ownable {
    using SafeERC20 for IERC20;

    /// @notice Constant for basis points denominator
    /// @dev Used for percentage calculations, e.g., 10000 basis points = 100%
    uint256 public constant BASIS_POINTS_DENOMINATOR = 10000;

    /// @notice Constant for maximum batch size
    /// @dev Used to limit the number of beneficiaries in a single batch operation
    uint256 public constant MAX_BATCH_SIZE = 100;

    /// @dev The token that is being vested
    IERC20 public token;

    /// @notice Amount of tokens which are reserved in vestings.
    /// @dev It is using for control allocation.
    uint256 public totalVested;

    /// @notice Mapping of vesting categories to their rules.
    /// @dev This mapping defines the rules for each vesting category,
    /// including maximum amounts, maximum participants, and schedules.
    mapping(VestingCategory category => CategoryRules rules) public categories;

    /// @notice Mapping of beneficiary addresses to their vesting pools
    mapping(address beneficiary => Pool[] vestingPools) public pools;

    /// @dev Modifier to ensure the address is not zero
    /// @param target_ The address to check
    modifier onlyNonZeroAddress(address target_) {
        require(target_ != address(0), ZeroAddress());
        _;
    }

    modifier onlyCorrectBatchSize(uint256 batchSize_) {
        require(batchSize_ != 0, NoParamsProvided());
        require(batchSize_ <= MAX_BATCH_SIZE, BatchSizeExceedsLimit());
        _;
    }

    /// @notice Constructor to initialize the vesting contract with the token address and set up initial categories
    /// @param token_ The address of the token to be vested
    /// @dev It uses the Ownable constructor to set deployer as the owner
    constructor(address token_) Ownable(_msgSender()) onlyNonZeroAddress(token_) {
        token = IERC20(token_);

        // ! Hardcoded mock data
        categories[VestingCategory.BlindBelievers] = CategoryRules({
            totalVestedAmountLeft: 20_826_000_000 * 1e18, // 15% of total supply
            qty: 694_200_000 * 1e18,
            beneficiariesLeft: 30,
            // rewards will be unlocking each second during 1 year
            schedule: Schedule({cliffDuration: 0, periodDuration: 1, periodCount: 12 * 30 days}),
            initialUnlock: 0
        });

        categories[VestingCategory.EternalHODLers] = CategoryRules({
            totalVestedAmountLeft: 13_884_000_000 * 1e18, // 10% of total supply
            qty: 69_420_000 * 1e18,
            beneficiariesLeft: 200,
            schedule: Schedule({cliffDuration: 0, periodDuration: 30 days, periodCount: 12}),
            initialUnlock: 0
        });

        categories[VestingCategory.DiamondHands] = CategoryRules({
            totalVestedAmountLeft: 6_942_000_000 * 1e18, // 5% of total supply
            qty: 6_942_000 * 1e18,
            beneficiariesLeft: 1000,
            schedule: Schedule({cliffDuration: 0, periodDuration: 30 days, periodCount: 12}),
            initialUnlock: 0
        });

        categories[VestingCategory.JustHODLers] = CategoryRules({
            totalVestedAmountLeft: 13_884_000_000 * 1e18, // 10% of total supply
            qty: 694_200 * 1e18,
            beneficiariesLeft: 20000,
            schedule: Schedule({cliffDuration: 0, periodDuration: 30 days, periodCount: 12}),
            initialUnlock: 0
        });

        categories[VestingCategory.CommunityAirdrop] = CategoryRules({
            totalVestedAmountLeft: 13_884_000_000 * 1e18, // 10% of total supply
            qty: 0, // ! Needs to be specified
            beneficiariesLeft: 10000,
            schedule: Schedule({cliffDuration: 0, periodDuration: 30 days, periodCount: 12}),
            initialUnlock: 0
        });
    }

    /// @notice Function to create a new vesting pool for a specific category
    /// @param params_ The parameters for creating a custom vesting pool
    /// @dev See `CreateCustomVestingPoolParams` for details on the parameters
    function createCategoryPool(CreateCategoryPoolParams calldata params_) external onlyOwner {
        _createCategoryPool(params_);
    }

    /// @notice Function to create a new vesting pool
    /// @param params_ The parameters for creating a custom vesting pool
    /// @dev See `CreateCustomVestingPoolParams` for details on the parameters
    function createCustomVestingPool(CreateCustomVestingPoolParams calldata params_) external onlyOwner {
        _createVestingPool(params_, false);
    }

    /// @notice Function to create vesting pools for multiple beneficiaries
    /// @param params_ The parameters object array for creating custom vesting pools
    /// @dev See `CreateCustomVestingPoolParams` for details on the parameters
    function createCustomVestingPoolBatch(
        CreateCustomVestingPoolParams[] calldata params_
    ) external onlyOwner onlyCorrectBatchSize(params_.length) {
        for (uint256 i; i < params_.length; ) {
            _createVestingPool(params_[i], false);

            unchecked {
                ++i;
            }
        }
    }

    /// @notice Function to create vesting pools for multiple beneficiaries in a specific category
    /// @param params_ The parameters for creating a category pool
    /// @dev See `CreateCategoryPoolParams` for details on the parameters
    function createCategoryPoolBatch(
        CreateCategoryPoolParams[] calldata params_
    ) external onlyOwner onlyCorrectBatchSize(params_.length) {
        for (uint256 i; i < params_.length; ) {
            _createCategoryPool(params_[i]);

            unchecked {
                ++i;
            }
        }
    }

    /// @notice Function to claim vested tokens for the caller
    /// @dev It claims amount of tokens from all vesting pools of the caller
    function claim() external {
        _claimFor(_msgSender());
    }

    /// @notice Function to claim vested tokens for a specific beneficiary
    /// @param beneficiary_ The address of the beneficiary who will receive the claimed tokens
    /// @dev It claims amount of tokens from all vesting pools of the specified beneficiary
    /// @dev This function can be called by any address to pay transaction fee for the beneficiary
    function claimFor(address beneficiary_) external {
        _claimFor(beneficiary_);
    }

    /// @notice Function to withdraw unused tokens from the contract by the owner
    /// @param token_ The address of the token to be withdrawn
    /// @dev It transfers the unused tokens to the owner, excluding the total vested amount
    function withdrawUnusedTokens(IERC20 token_) external onlyOwner {
        uint256 amount = token_.balanceOf(address(this));

        if (address(token_) == address(token)) {
            amount -= totalVested;
        }

        require(amount != 0, ZeroAmount());
        token_.safeTransfer(_msgSender(), amount);

        emit WithdrawUnusedTokens(token_, amount);
    }

    /// @notice Function to get the total claimable amount for a specific beneficiary
    /// @param beneficiary_ The address of the beneficiary for whom to calculate the claimable amount
    /// @return amount The total amount of tokens that can be claimed by the beneficiary
    function getClaimableAmount(address beneficiary_) external view returns (uint256 amount) {
        Pool[] storage totalPools = pools[beneficiary_];

        for (uint256 i; i < totalPools.length; i++) {
            amount += _getClaimableAmount(totalPools[i]);
        }
    }

    /// @notice Internal function to create a vesting pool for a specific category
    /// @param params_ The parameters for creating a custom vesting pool
    /// @dev It checks if the category has enough allocation left and if there are beneficiaries left
    /// @dev It updates the category's allocation and beneficiaries count
    function _createCategoryPool(CreateCategoryPoolParams calldata params_) internal {
        CategoryRules storage category = categories[params_.category];

        uint256 amount = params_.category != VestingCategory.CommunityAirdrop
            ? category.qty * params_.multiplierOrAmount
            : params_.multiplierOrAmount;

        require(category.beneficiariesLeft != 0, CategoryBeneficiariesAllSet(params_.category));
        require(category.totalVestedAmountLeft >= amount, NotEnoughAllocationLeft(params_.category));

        category.beneficiariesLeft--;
        category.totalVestedAmountLeft -= amount;

        _createVestingPool(
            CreateCustomVestingPoolParams({
                beneficiary: params_.beneficiary,
                amount: amount,
                start: params_.start,
                schedule: category.schedule,
                initialUnlock: category.initialUnlock
            }),
            true
        );
    }

    /// @notice Internal function to create a vesting pool
    /// @param params_ The parameters for creating a custom vesting pool
    /// @dev See `CreateCustomVestingPoolParams` for details on the parameters
    /// @dev Start timestamp is set to the current block timestamp if it is less or equal to the current time
    function _createVestingPool(
        CreateCustomVestingPoolParams memory params_,
        bool isCategory_
    ) internal onlyNonZeroAddress(params_.beneficiary) {
        require(
            params_.amount != 0 && params_.schedule.periodDuration != 0 && params_.schedule.periodCount != 0,
            ZeroAmount()
        );
        require(params_.initialUnlock <= BASIS_POINTS_DENOMINATOR, InitialUnlockExceedsLimit());

        Pool memory pool = Pool({
            amount: params_.amount,
            start: params_.start > block.timestamp ? params_.start : block.timestamp,
            schedule: params_.schedule,
            initialUnlock: params_.initialUnlock,
            claimed: 0,
            isCategory: isCategory_
        });
        pools[params_.beneficiary].push(pool);
        totalVested += params_.amount;

        token.safeTransferFrom(_msgSender(), address(this), params_.amount);

        emit VestingPoolCreated(params_.beneficiary, pool);
    }

    /// @notice Internal function to claim vested tokens for a specific beneficiary
    /// @param beneficiary_ The address of the beneficiary who will receive the claimed tokens
    function _claimFor(address beneficiary_) internal onlyNonZeroAddress(beneficiary_) {
        Pool[] storage totalPools = pools[beneficiary_];
        require(totalPools.length != 0, NoAllocationsFound());

        uint256 totalAmount;

        for (uint256 i; i < totalPools.length; i++) {
            uint256 amount = _getClaimableAmount(totalPools[i]);
            if (amount != 0) {
                totalPools[i].claimed += amount;
                totalAmount += amount;
            }
        }

        require(totalAmount != 0, ZeroAmount());
        token.safeTransfer(beneficiary_, totalAmount);

        emit Claim(beneficiary_, totalAmount);
    }

    /// @notice Function to get the claimable amount for a specific vesting pool
    /// @param pool_ The vesting pool for which to calculate the claimable amount
    /// @return The amount of tokens that can be claimed from the vesting pool
    function _getClaimableAmount(Pool storage pool_) internal view returns (uint256) {
        return _calculateUnlockedAmount(pool_) - pool_.claimed;
    }

    /// @notice Function to get the unlocked amount for a specific vesting pool
    /// @param pool_ The vesting pool for which to calculate the unlocked amount
    /// @return The amount of tokens that are unlocked and can be claimed
    function _calculateUnlockedAmount(Pool memory pool_) internal view returns (uint256) {
        Schedule memory schedule = pool_.schedule;
        uint256 cliffEndTimestamp = pool_.start + schedule.cliffDuration;
        uint256 currentTimestamp = block.timestamp;

        if (currentTimestamp < cliffEndTimestamp) return 0;

        uint256 totalAmount = pool_.amount;
        uint256 initialAmount = (totalAmount * pool_.initialUnlock) / BASIS_POINTS_DENOMINATOR;

        uint256 passedPeriods = (currentTimestamp - pool_.start - schedule.cliffDuration) / schedule.periodDuration;

        return
            passedPeriods >= schedule.periodCount
                ? totalAmount
                : (((totalAmount - initialAmount) * (passedPeriods)) / schedule.periodCount) + initialAmount;
    }
}
