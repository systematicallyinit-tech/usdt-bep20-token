// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DemoUSDToken is ERC20, Ownable {
    uint256 public constant INITIAL_SUPPLY =
        1_000_000 * 10 ** 18;

    uint256 public constant MAX_SUPPLY =
        100_000_000 * 10 ** 18;

    constructor()
        ERC20("USD Tether", "USDT")
        Ownable(msg.sender)
    {
        _mint(msg.sender, INITIAL_SUPPLY);
    }

    /**
     * @notice Mint additional tokens.
     * @param to Wallet receiving the tokens.
     * @param amount Amount in whole DUSD tokens.
     */
    function mint(
        address to,
        uint256 amount
    ) external onlyOwner {
        require(
            to != address(0),
            "Invalid recipient"
        );

        uint256 amountWithDecimals =
            amount * 10 ** decimals();

        require(
            totalSupply() + amountWithDecimals <= MAX_SUPPLY,
            "Maximum supply exceeded"
        );

        _mint(to, amountWithDecimals);
    }

    /**
     * @notice Returns the amount still available to mint.
     */
    function remainingMintableSupply()
        external
        view
        returns (uint256)
    {
        return MAX_SUPPLY - totalSupply();
    }
}