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
     * @param vesting_ Vesting contract for Blind Believers which will distribute 15.00% (20,828,377,491.30 tokens) of the total supply
     * @param uni_ Uniswap (on ZRO) - Community pool, receives 66,658,051,306.89 tokens (approx. 48% of total supply)
     * @param eternalHodlers_ Eternal HODLers, receives 13,884,000,000 tokens (10% of total supply)
     * @param justHodlers_ Just HODLers, receives 13,884,000,000 tokens (10% of total supply)
     * @param airdrop_ Community Airdrop, receives 13,884,000,000 tokens (10% of total supply)
     * @param diamondHands_ Diamond Hands, receives 6,942,000,000 tokens (5% of total supply)
     * @param treasury_ Treasury, Team and VC, receives 2,082,600,000.02 tokens (approx. 1.5% of total supply)
     * @param dao_ DAO, receives 491,353,345.96 tokens (approx. 0.35% of total supply)
     * Community purchases allocated with 185,617,855.83 tokens (approx. 0.13% of total supply)
     */
    constructor(
        address vesting_,
        address uni_,
        address eternalHodlers_,
        address justHodlers_,
        address airdrop_,
        address diamondHands_,
        address treasury_,
        address dao_
    ) ERC20("DFV Token", "DFV") ERC20Permit("DFV Token") {
        // Blind Believers vesting pool 20,828,377,491.30
        _mint(vesting_,                                  20_828_377_491_300_000_000_000_000_000);
        // UNI V3 DFV/USDT 66,658,051,306.89	     
        _mint(uni_,                                      66_658_051_306_890_000_000_000_000_000);
        // Eternal HODLers 13,884,000,000.00 
        _mint(eternalHodlers_,                           13_884_000_000_000_000_000_000_000_000);
        // Just HODLers 13,884,000,000.00 
        _mint(justHodlers_,                              13_884_000_000_000_000_000_000_000_000);
        // Airdrop 13,884,000,000.00 
        _mint(airdrop_,                                  13_884_000_000_000_000_000_000_000_000);
        // Diamond Hands 6,942,000,000.00	 
        _mint(diamondHands_,                              6_942_000_000_000_000_000_000_000_000);
        // Treasury, Team and VC 2,082,600,000.02         
        _mint(treasury_,                                  2_082_600_000_020_000_000_000_000_000);
        // DAO 491,353,345.96 
        _mint(dao_,                                         491_353_345_960_000_000_000_000_000);

        // Community purchases
        _mint(0xe53B3858DB46ebf3E0eb6cC531A94E4C49C11aEF,    84_123_504_770_000_000_000_000_000);
        _mint(0xfc0b0316797021918d2a961Bbdb4589AC0723d44,    70_781_930_940_000_000_000_000_000);
        _mint(0x9B228B4F71B3Bc7e4b478251f218060D7B70Dc25,    11_111_111_000_000_000_000_000_000);
        _mint(0x9c872b16567D66B204C6396bacd109DFD2AE1560,    10_171_532_180_000_000_000_000_000);
        _mint(0x9b03C5767A86DC6A22E007815d7D725E53b51f65,     5_380_732_020_000_000_000_000_000);
        _mint(0xCe57ebEd9aC38402DcAA44f65a1c9b04e26b8283,     1_002_351_480_000_000_000_000_000);
        _mint(0xa0f08163F032309aF1FB0Ff51435b9C70a4EF436,       748_652_460_000_000_000_000_000); 
        _mint(0x01031Ea895B673925344535796C928791f461750,       694_209_000_000_000_000_000_000);
        _mint(0x2cA84d4aD49205F8E286B8295448c47bc413589a,       489_007_860_000_000_000_000_000);
        _mint(0xac2332BDd1f29E86B3a282cBe3BEE4Aa338D35E2,       393_077_090_000_000_000_000_000);
        _mint(0x6ff356D67b2499fb8DA1fc00EA445044D2d4fe15,       323_458_450_000_000_000_000_000);
        _mint(0x5b29e11DF0cEa32F89332929933A803CC4c5741d,       182_420_730_000_000_000_000_000);
        _mint(0x000000fee13a103A10D593b9AE06b3e05F2E7E1c,       112_655_630_000_000_000_000_000);
        _mint(0x7AfA9D836d2fCCf172b66622625e56404E465dBD,        92_736_610_000_000_000_000_000);
        _mint(0x84Dc6f8A9CB1E042A0E5A3b4a809c90BEB9d3448,         6_474_760_000_000_000_000_000);
        _mint(0xC1D8A1ad8110E75a616307444Ca6D6582919201E,         2_552_630_000_000_000_000_000);
        _mint(0x8504a563Be3C2218fB20F8090f473a8CDE22B906,           898_280_000_000_000_000_000);
        _mint(0x1F9eeea6B5a4eEeCa060BC82C82EEFf4a8676c4F,           280_790_000_000_000_000_000);
        _mint(0x000000d40B595B94918a28b27d1e2C66F43A51d3,           141_060_000_000_000_000_000);
        _mint(0xA3785AFC932826BffA229fF5cf187BE3786a77a6,           100_000_000_000_000_000_000);
        _mint(0xF13176eCE4ed8d9aa4C335cD4f247458D4863FE4,            27_890_000_000_000_000_000);
        _mint(0x1f2F10D1C40777AE1Da742455c65828FF36Df387,               200_000_000_000_000_000);
        // _mint(0xdF80e38699bb963a91c5F04F83378A597995932a,                                     0);

        require(
            totalSupply() == 138_840_000_000_000_000_000_000_000_000,
            "Total supply mismatch"
        );
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
