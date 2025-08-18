// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IVRFV2PlusWrapper {
    /**
     * @notice Calculates the price of a VRF request in native with the given callbackGasLimit at the current
     * @notice block.
     *
     * @dev This function relies on the transaction gas price which is not automatically set during
     * @dev simulation. To estimate the price at a specific gas price, use the estimatePrice function.
     *
     * @param _callbackGasLimit is the gas limit used to estimate the price.
     * @param _numWords is the number of words to request.
     */
    function calculateRequestPriceNative(
        uint32 _callbackGasLimit,
        uint32 _numWords
    ) external view returns (uint256);

    /**
     * @notice Requests randomness from the VRF V2 wrapper, paying in native token.
     *
     * @param _callbackGasLimit is the gas limit for the request.
     * @param _requestConfirmations number of request confirmations to wait before serving a request.
     * @param _numWords is the number of words to request.
     */
    function requestRandomWordsInNative(
        uint32 _callbackGasLimit,
        uint16 _requestConfirmations,
        uint32 _numWords,
        bytes calldata extraArgs
    ) external payable returns (uint256 requestId);

    function link() external view returns (address);

    function linkNativeFeed() external view returns (address);
}
