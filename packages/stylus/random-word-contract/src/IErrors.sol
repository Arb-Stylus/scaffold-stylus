// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IErrors {
    error ErrAlreadySetup();
    error ErrChainlinkVRF(bytes);
    error ErrNotSetup();
    error ErrNoValue();
    error ErrInvalidRecipient(address sender);
}
