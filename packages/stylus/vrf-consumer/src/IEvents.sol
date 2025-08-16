// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/* ~~~~~~ EVENTS ~~~~~~ */

interface IEvents {
    event LockedUpTokens(address indexed recipient, uint256 indexed amount);

    event RandomnessRequested(uint256 indexed ticketNo);

    event RandomnessResolved(uint256 indexed ticketNo);

    event UserReceivedNFT(
        address indexed nft,
        uint256 indexed id,
        uint256 indexed usdAmount,
        uint256 refunded,
        address recipient
    );

    event UserRefunded(
        address indexed user,
        uint256 indexed amount,
        uint256 indexed rebate
    );

    event UserRebated(address indexed user, uint256 indexed amount);
}
