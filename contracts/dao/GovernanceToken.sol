// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GovernanceToken
 * @notice This contract implements a governance token with voting capabilities and permit functionality.
 * @dev It extends OpenZeppelin's ERC20, ERC20Permit, and ERC20Votes contracts.
 */
contract GovernanceToken is ERC20, ERC20Permit, ERC20Votes, Ownable {
    /// @notice Constructor to initialize the governance token
    /// @param name_ The name of the token
    /// @param symbol_ The symbol of the token
    /// @param initialSupply_ The initial supply of the token
    /// @param owner_ The address of the owner who will receive the initial supply
    /// @dev It sets the token name, symbol, and initial supply, and assigns ownership
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply_,
        address owner_
    ) ERC20(name_, symbol_) ERC20Permit(name_) Ownable(owner_) {
        _mint(owner_, initialSupply_);
    }

    /// @notice Function to mint tokens to a specified address
    /// @param to_ The address to which the tokens will be minted
    /// @param amount_ The amount of tokens to mint
    /// @dev Only the owner can call this function to mint new tokens
    function mint(address to_, uint256 amount_) public onlyOwner {
        _mint(to_, amount_);
    }

    /// @notice Function to get the current nonce for a given owner
    /// @param owner_ The address of the owner whose nonce is being queried
    /// @return The current nonce for the owner
    /// @dev This function overrides the nonces function from ERC20Permit and Nonces
    function nonces(address owner_) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner_);
    }

    /// @notice Function override the _update function to ensure compatibility with ERC20Votes
    /// @param from_ The address from which tokens are being transferred
    /// @param to_ The address to which tokens are being transferred
    /// @param value_ The amount of tokens being transferred
    /// @dev This function is required to ensure that the voting power is updated correctly
    function _update(address from_, address to_, uint256 value_) internal override(ERC20, ERC20Votes) {
        super._update(from_, to_, value_);
    }
}
