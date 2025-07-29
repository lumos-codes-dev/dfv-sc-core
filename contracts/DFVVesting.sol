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

    /// @dev The token that is being vested
    IERC20 public token;

    /// @notice Amount of tokens which are reserved in vestings.
    /// @dev It is using for control allocation.
    uint256 public totalVested;

    /// @notice Mapping of beneficiary addresses to their vesting pools
    mapping(address beneficiary => Pool[] vestingPools) public pools;

    /// @dev Modifier to ensure the address is not zero
    /// @param target_ The address to check
    modifier onlyNonZeroAddress(address target_) {
        require(target_ != address(0), ZeroAddress());
        _;
    }

    /// @notice Constructor to initialize the vesting contract with the token address
    /// @param token_ The address of the token to be vested
    /// @dev It uses the Ownable constructor to set deployer as the owner
    constructor(address token_) Ownable(_msgSender()) onlyNonZeroAddress(token_) {
        token = IERC20(token_);
    }

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
    ) external onlyOwner {
        _createVestingPool(beneficiary_, amount_, schedule_, initialUnlock_);
    }

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
    ) external onlyOwner {
        require(beneficiaries_.length == amounts_.length, ArraysLengthMismatch());

        for (uint256 i; i < beneficiaries_.length; i++) {
            _createVestingPool(beneficiaries_[i], amounts_[i], schedule_, initialUnlock_);
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

    /// @notice Internal function to create a vesting pool
    /// @param beneficiary_ The address of the beneficiary who will receive the vested tokens
    /// @param amount_ The total amount of tokens to be vested
    /// @param schedule_ The vesting schedule defining start, cliff duration, and vesting duration
    /// @param initialUnlock_ The percentage of tokens that can be claimed immediately after the cliff
    function _createVestingPool(
        address beneficiary_,
        uint256 amount_,
        Schedule memory schedule_,
        uint256 initialUnlock_
    ) internal onlyNonZeroAddress(beneficiary_) {
        require(amount_ != 0 && schedule_.vestingDuration != 0, ZeroAmount());
        require(schedule_.start >= block.timestamp, StartMustBeInFuture());
        require(initialUnlock_ <= BASIS_POINTS_DENOMINATOR, InitialUnlockExceedsLimit());

        Pool memory pool = Pool({amount: amount_, schedule: schedule_, initialUnlock: initialUnlock_, claimed: 0});
        pools[beneficiary_].push(pool);
        totalVested += amount_;

        token.safeTransferFrom(_msgSender(), address(this), amount_);

        emit VestingPoolCreated(beneficiary_, pool);
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
        uint256 startTimestamp = pool_.schedule.start + pool_.schedule.cliffDuration;
        uint256 currentTimestamp = block.timestamp;
        if (currentTimestamp < startTimestamp) return 0;

        uint256 totalAmount = pool_.amount;
        uint256 initialAmount = (totalAmount * pool_.initialUnlock) / BASIS_POINTS_DENOMINATOR;

        return
            currentTimestamp >= startTimestamp + pool_.schedule.vestingDuration
                ? totalAmount
                : ((totalAmount - initialAmount) * (currentTimestamp - startTimestamp)) /
                    pool_.schedule.vestingDuration +
                    initialAmount;
    }
}
