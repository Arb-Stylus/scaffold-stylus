// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IErrors {
    error ErrAlreadySetup();

    error ErrNotSetup();

    // There are no NFTs in the level/contract to distribute!
    error ErrNoNfts();

    error ErrInvalidRecipient(address sender);

    error ErrCheckedSub();

    error ErrNoValue();

    error ErrTooMuchValue();

    error ErrChainlinkVRF(bytes);

    error ErrChainlinkDecimals(bytes);

    error ErrChainlinkRound(bytes);

    error ErrChainlinkRoundUnpack();

    error ErrUnpackU8();

    error ErrChainlinkPriceNegative();

    error ErrCheckedDiv();

    error ErrCheckedMul();

    error ErrNFTTransfer(bytes);

    error ErrEthTransfer(bytes);

    error ErrNoLevel();

    error ErrNotSubmitter();

    error ErrNotChainlink();
}
