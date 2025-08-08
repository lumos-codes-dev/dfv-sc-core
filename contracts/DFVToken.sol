// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

/**
 * @title DFVToken
 * @notice This contract implements a governance token with voting capabilities and permit functionality.
 * @dev It extends OpenZeppelin's ERC20, ERC20Permit, and ERC20Votes contracts.
 */
contract DFVToken is ERC20, ERC20Permit, ERC20Votes {
    /**
     * @notice Constructor to initialize the DFVToken contract
     * @dev Sets the token name and symbol and mints an initial supply
     * @dev The initial supply is set to 138,840,000,000 tokens with 18 decimals
     * @param vesting_ Vesting contract which will distribute 50% (69,420,000,000 tokens) of the tokens:
     * Blind Believers - 15% of the total supply (20,826,000,000 tokens)
     * Eternal HODLers - 10% of the total supply (13,884,000,000 tokens)
     * Diamond Hands - 10% of the total supply (13,884,000,000 tokens)
     * Just HODLers - 10% of the total supply (13,884,000,000 tokens)
     * Community Airdrop - 5% of the total supply (6,942,000,000 tokens)
     * @param treasury_ The address of the treasury which will hold a portion of the tokens:
     * Uniswap (on ZRO) - Community pool - 48.5% of the total supply (67,337,400,000 tokens)
     * Treasury - 0.5% of the total supply (694,200,000 tokens)
     * @param team_ The address of the team which will hold 0.5% (694,200,000 tokens) of the total supply
     * @param vc_ The address of the venture capital which will hold 0.5% (694,200,000 tokens) of the total supply
     */
    constructor(
        address vesting_,
        address treasury_,
        address team_,
        address vc_
    ) ERC20("DFV Token", "DFV") ERC20Permit("DFV Token") {
        _mint(vesting_, 69_420_000_000 * 10 ** decimals());
        _mint(treasury_, 68_031_600_000 * 10 ** decimals());
        _mint(team_, 694_200_000 * 10 ** decimals());
        _mint(vc_, 694_200_000 * 10 ** decimals());
    }

    /**
     * @notice Function to get the current nonce for a given owner
     * @param owner_ The address of the owner whose nonce is being queried
     * @return The current nonce for the owner
     * @dev This function overrides the nonces function from ERC20Permit and Nonces
     */
    function nonces(address owner_) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner_);
    }

    /**
     * @notice Function to get the current timepoint for voting power tracking
     * @return The current timestamp
     */
    function clock() public view override returns (uint48) {
        return uint48(block.timestamp);
    }

    /**
     * @notice Function to describe the clock mode for voting power tracking
     * @return The clock mode description
     */
    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=timestamp";
    }

    /**
     * @notice Function override the _update function to ensure compatibility with ERC20Votes
     * @param from_ The address from which tokens are being transferred
     * @param to_ The address to which tokens are being transferred
     * @param value_ The amount of tokens being transferred
     * @dev This function is required to ensure that the voting power is updated correctly
     */
    function _update(address from_, address to_, uint256 value_) internal override(ERC20, ERC20Votes) {
        super._update(from_, to_, value_);
    }
}
