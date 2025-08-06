// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IDFVVesting} from "./interfaces/IDFVVesting.sol";

/**
 * @title DFVVesting
 * @notice This contract allows the owner to create vesting pools for beneficiaries and manage their vesting schedules.
 * @dev It uses OpenZeppelin's AccessControl for role-based access management and SafeERC20 for safe token transfers.
 */
contract DFVVesting is IDFVVesting, AccessControl {
    using SafeERC20 for IERC20;

    /// @notice Role identifier for addresses that can manage vesting pools
    bytes32 public constant VESTING_MANAGER_ROLE = keccak256("VESTING_MANAGER_ROLE");

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

    /// @notice Array of Blind Believers addresses
    /// @dev Initialized during contract deployment in constructor
    address[] public blindBelieversAddresses;

    /// @dev Modifier to ensure the address is not zero
    /// @param target_ The address to check
    modifier onlyNonZeroAddress(address target_) {
        require(target_ != address(0), ZeroAddress());
        _;
    }

    /// @dev Modifier to ensure the batch size is within the allowed limit
    /// @param batchSize_ The size of the batch to check
    modifier onlyCorrectBatchSize(uint256 batchSize_) {
        require(batchSize_ != 0, NoParamsProvided());
        require(batchSize_ <= MAX_BATCH_SIZE, BatchSizeExceedsLimit());
        _;
    }

    /// @notice Constructor to initialize the vesting contract with the token address and set up initial categories
    /// @param token_ The address of the token to be vested
    /// @param dao_ The address of the DAO contract which will have the DEFAULT_ADMIN_ROLE
    /// @param vestingManager_ The address of the vesting manager who will have the VESTING_MANAGER_ROLE
    constructor(address token_, address dao_, address vestingManager_) onlyNonZeroAddress(token_) {
        blindBelieversAddresses = [
            0x5279d4F55096a427b9121c6D642395a4f0Cd04a4,
            0x250e6E64276D5e9a1cA0B6C5B2B11c5139CD1Fc7,
            0xA68D88522E06c226f1a3B9D04A86d4CdaCE666fE,
            0x4Bd6300fc61Fa86b3d98A73CeE89bb54140b45e3,
            0x7b1D81Ba131F551DA2f70f7c2363b45DbD451d83,
            0xac783aEA23528862E2e4E7c9F8Bbc65bfAFe33B3,
            0xdf99908D22D2F18B50E15D962E77666da4A04717,
            0x3e46e4e203Bc6Aa3b3c6a2993C3cCEDeAF177f61,
            0xD94A8E20CbDD95D050f1356259E18C4Dd10f661A,
            0xe079E4AfB3FDd8F02B29C7A333D526b9c4C94B23,
            0x0aF20A5C0FFb89dAD55076309925014EaeBb5568,
            0x015FC9C8B333Aeb7A91Fd966bbFE6FF9A0ef8331,
            0x049E035Fb280b1df29e1c9BaE586F8E2E03311E1,
            0xE63cE53A4Ed7B5180311143AA3FE9131b4E0AB88,
            0xBD34Dc3FBb661612AAbCADaf758Caa6E22787297,
            0x60C7d0B2cD22e9D20BE93f9EFFBabF15fd599936,
            0x6068efCd7DEdDED2A8444cbb218ffE71fa022D08,
            0xF52eB9b90C0CE6B037381aEa62BfA7A1B5519D31,
            0x128c21DFE98E7478e3cc6513AEF959BBD266Ed0F,
            0x255252421d42949843e6bdB40065d39c110c8191,
            0xC5DCb0A22551FbA93e260028813F0eef25bFfeA6,
            0xEaF85B68ce6AC308946580b907C4f84d0Abb07ee,
            0x63d97917852e12F1591A39D20ba8a2547169B298,
            0x8e80410Ae2c5a394D1a81364fB932dF86Eb4992d,
            0x3068722291E90e7251D37b9b5Bc1E3D303885bb7,
            0x49e5c7645EaF21A531D933dE365ABDB01Ba3A2f6,
            0xACce9487EcF6F32325ad612df0D1f1288653905A,
            0x84240C190FB0761527bA3A490BFe2e002413CDe4,
            0xeE6343ED1b521440A3c952FCAAA1E487a0403DbC,
            0x147EC80822AFD4C6bC13aC116Ce3ae886099AB47
        ];

        token = IERC20(token_);

        _grantRole(DEFAULT_ADMIN_ROLE, dao_);
        _grantRole(VESTING_MANAGER_ROLE, dao_);
        _grantRole(VESTING_MANAGER_ROLE, vestingManager_);

        _setRoleAdmin(VESTING_MANAGER_ROLE, DEFAULT_ADMIN_ROLE);

        _initializeCategories();

        for (uint256 i; i < blindBelieversAddresses.length; ) {
            _createCategoryPool(
                CreateCategoryPoolParams({
                    category: VestingCategory.BlindBelievers,
                    beneficiary: blindBelieversAddresses[i],
                    multiplierOrAmount: 1,
                    start: 0
                })
            );

            unchecked {
                ++i;
            }
        }
    }

    /// @notice Function to create a new vesting pool for a specific category
    /// @param params_ The parameters for creating a custom vesting pool
    /// @dev See `CreateCustomVestingPoolParams` for details on the parameters
    function createCategoryPool(CreateCategoryPoolParams calldata params_) external onlyRole(VESTING_MANAGER_ROLE) {
        _createCategoryPool(params_);
    }

    /// @notice Function to create a new vesting pool
    /// @param params_ The parameters for creating a custom vesting pool
    /// @dev See `CreateCustomVestingPoolParams` for details on the parameters
    function createCustomVestingPool(
        CreateCustomVestingPoolParams calldata params_
    ) external onlyRole(VESTING_MANAGER_ROLE) {
        _createVestingPool(params_, false);
    }

    /// @notice Function to create vesting pools for multiple beneficiaries
    /// @param params_ The parameters object array for creating custom vesting pools
    /// @dev See `CreateCustomVestingPoolParams` for details on the parameters
    function createCustomVestingPoolBatch(
        CreateCustomVestingPoolParams[] calldata params_
    ) external onlyRole(VESTING_MANAGER_ROLE) onlyCorrectBatchSize(params_.length) {
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
    ) external onlyRole(VESTING_MANAGER_ROLE) onlyCorrectBatchSize(params_.length) {
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
    function withdrawUnusedTokens(IERC20 token_) external onlyRole(DEFAULT_ADMIN_ROLE) {
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

    /// @notice Internal function to initialize the vesting categories with their rules
    /// @dev This function sets up the initial rules for each vesting category
    function _initializeCategories() internal {
        categories[VestingCategory.BlindBelievers] = CategoryRules({
            totalVestedAmountLeft: 20_826_000_000 * 1e18, // 15% of total supply
            qty: 694_200_000 * 1e18,
            beneficiariesLeft: 30,
            schedule: Schedule({cliffDuration: 0, periodDuration: 1 seconds, periodCount: 31_104_000}),
            initialUnlockPercent: 0
        });

        categories[VestingCategory.EternalHODLers] = CategoryRules({
            totalVestedAmountLeft: 13_884_000_000 * 1e18, // 10% of total supply
            qty: 69_420_000 * 1e18,
            beneficiariesLeft: 200,
            schedule: Schedule({cliffDuration: 0, periodDuration: 1 minutes, periodCount: 518_400}),
            initialUnlockPercent: 0
        });

        categories[VestingCategory.DiamondHands] = CategoryRules({
            totalVestedAmountLeft: 6_942_000_000 * 1e18, // 5% of total supply
            qty: 6_942_000 * 1e18,
            beneficiariesLeft: 1000,
            schedule: Schedule({cliffDuration: 0, periodDuration: 5 minutes, periodCount: 103_680}),
            initialUnlockPercent: 0
        });

        categories[VestingCategory.JustHODLers] = CategoryRules({
            totalVestedAmountLeft: 13_884_000_000 * 1e18, // 10% of total supply
            qty: 694_200 * 1e18,
            beneficiariesLeft: 20000,
            schedule: Schedule({cliffDuration: 0, periodDuration: 1 hours, periodCount: 8_640}),
            initialUnlockPercent: 0
        });

        categories[VestingCategory.CommunityAirdrop] = CategoryRules({
            totalVestedAmountLeft: 13_884_000_000 * 1e18, // 10% of total supply
            qty: 0,
            beneficiariesLeft: 10000,
            schedule: Schedule({cliffDuration: 0, periodDuration: 1 seconds, periodCount: 31_104_000}),
            initialUnlockPercent: 0
        });
    }

    /// @notice Internal function to create a vesting pool for a specific category
    /// @param params_ The parameters for creating a custom vesting pool
    /// @dev It checks if the category has enough allocation left and if there are beneficiaries left
    /// @dev It updates the category's allocation and beneficiaries count
    function _createCategoryPool(CreateCategoryPoolParams memory params_) internal {
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
                initialUnlockPercent: category.initialUnlockPercent
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
        require(params_.initialUnlockPercent <= BASIS_POINTS_DENOMINATOR, InitialUnlockExceedsLimit());

        Pool memory pool = Pool({
            amount: params_.amount,
            start: params_.start > block.timestamp ? params_.start : block.timestamp,
            schedule: params_.schedule,
            initialUnlockPercent: params_.initialUnlockPercent,
            claimed: 0,
            isCategory: isCategory_
        });
        pools[params_.beneficiary].push(pool);
        totalVested += params_.amount;

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
        uint256 initialAmount = (totalAmount * pool_.initialUnlockPercent) / BASIS_POINTS_DENOMINATOR;

        uint256 passedPeriods = (currentTimestamp - pool_.start - schedule.cliffDuration) / schedule.periodDuration;

        return
            passedPeriods >= schedule.periodCount
                ? totalAmount
                : (((totalAmount - initialAmount) * (passedPeriods)) / schedule.periodCount) + initialAmount;
    }
}
