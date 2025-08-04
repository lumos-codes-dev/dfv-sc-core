// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title TimeLock
 * @notice This contract implements a timelock mechanism for governance proposals.
 * @dev It extends OpenZeppelin's TimelockController to manage delayed execution of proposals.
 */
contract TimeLock is TimelockController {
    /// @notice Constructor to initialize the timelock controller
    /// @param minDelay The minimum delay for operations (in seconds)
    /// @param proposers The addresses allowed to propose operations
    /// @param executors The addresses allowed to execute operations
    /// @param admin The address of the admin (can be zero address)
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(minDelay, proposers, executors, admin) {}
}
