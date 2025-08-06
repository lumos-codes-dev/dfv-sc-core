// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title DFVToken
 * @notice ERC20 token representing DFV
 * @dev This contract inherits from OpenZeppelin's ERC20 implementation.
 */
contract DFVToken is ERC20 {
    /**
     * @notice Constructor to initialize the DFVToken contract
     * @dev Sets the token name and symbol and mints an initial supply
     * @dev The initial supply is set to 138,840,000,000 tokens with 18 decimals
     * @dev The initial supply is minted to the deployer's address
     */
    constructor() ERC20("DFV Token", "DFV") {
        _mint(_msgSender(), 138_840_000_000 * 10 ** decimals());
    }
}
