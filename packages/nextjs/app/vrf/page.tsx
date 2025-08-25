"use client";

import { useState } from "react";
import type { NextPage } from "next";

import { useAccount, useChainId } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { arbitrum, arbitrumSepolia } from "viem/chains";

const ARB_SEPOLIA_CONSUMER_ADDRESS = "0xeEA5eC3da1ED9b3479Cb2f0834f4FD918eBCfCC2";
const ARB_MAINNET_CONSUMER_ADDRESS = "0x0000000000000000000000000000000000000000";

const VRFPage: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const chainId = useChainId();

  // State for VRF Consumer contract address
  const [vrfConsumerAddress] = useState<string>(() => {
    if (chainId === arbitrumSepolia.id) {
      return ARB_SEPOLIA_CONSUMER_ADDRESS;
    } else if (chainId === arbitrum.id) {
      return ARB_MAINNET_CONSUMER_ADDRESS;
    }
    return "";
  });
  const [requestId, setRequestId] = useState<string>("");

  // Contract interactions
  const { writeContractAsync: requestRandomWords, isMining: isRequestingRandom } = useScaffoldWriteContract({
    contractName: "vrf-consumer",
  });

  const { data: lastRequestId, refetch: refetchLastRequestId } = useScaffoldReadContract({
    contractName: "vrf-consumer",
    functionName: "callViewGetLastRequestId",
    args: [vrfConsumerAddress],
  });

  const { data: requestStatus } = useScaffoldReadContract({
    contractName: "vrf-consumer",
    functionName: "callViewGetRequestStatus",
    args: [vrfConsumerAddress, requestId ? BigInt(requestId) : undefined],
    watch: true,
  });

  const handleRequestRandomWords = async () => {
    try {
      await requestRandomWords({
        functionName: "callWriteRequestRandomNumber",
        args: [vrfConsumerAddress],
      });
    } catch (error) {
      console.error("Error requesting random words:", error);
    }
  };

  const handleCheckStatus = () => {
    if (lastRequestId) {
      setRequestId(lastRequestId.toString());
    }
  };

  return (
    <div className="flex items-center flex-col justify-start flex-grow pt-10 px-4">
      <div className="max-w-4xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">Chainlink VRF Integration</h1>
          <p className="text-lg text-base-content/80">Verifiable Random Function (VRF) using Stylus Smart Contracts</p>
        </div>

        {/* Network Warning */}
        <div className="alert alert-warning mb-8">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <div>
            <h3 className="font-bold">Network Compatibility Notice</h3>
            <div className="text-xs">
              Chainlink VRF contracts are only available on <strong>Arbitrum Sepolia</strong> and{" "}
              <strong>Arbitrum One</strong>. Make sure you&apos;re connected to one of these networks to interact with
              VRF services.
            </div>
            <div className="text-xs mt-2 p-2 rounded  border-black border">
              <strong>Setup (after you deploy the contracts):</strong> Update your{" "}
              <code className="bg-base-300 px-1 rounded">scaffold.config.ts</code> to include{" "}
              <code className="bg-base-300 px-1 rounded">chains.arbitrumSepolia</code> and/or{" "}
              <code className="bg-base-300 px-1 rounded">chains.arbitrum</code> in the{" "}
              <code className="bg-base-300 px-1 rounded">targetNetworks</code> array.
              <br />
              <br />
              <strong>Note:</strong> The VRF Consumer contract is deployed on Arbitrum Sepolia and Arbitrum One.
            </div>
          </div>
        </div>

        {/* What is Chainlink VRF Section */}
        <div className="card bg-base-100 shadow-xl mb-8">
          <div className="card-body">
            <h2 className="card-title text-2xl mb-4">What is Chainlink VRF?</h2>
            <div className="space-y-4 text-sm text-base-content">
              <p>
                <strong>Chainlink VRF (Verifiable Random Function)</strong> is a provably fair and verifiable random
                number generator (RNG) that enables smart contracts to access random values without compromising
                security or usability.
              </p>

              <div className="grid md:grid-cols-2 gap-4 mt-6">
                <div className="bg-base-200 p-4 rounded-lg">
                  <h3 className="font-bold text-base-content mb-2">🔒 How It Works</h3>
                  <ul className="list-disc list-inside space-y-1 text-xs text-base-content">
                    <li>Oracle nodes generate random numbers with cryptographic proof</li>
                    <li>On-chain verification ensures randomness cannot be manipulated</li>
                    <li>Direct funding model allows pay-per-request flexibility</li>
                  </ul>
                </div>

                <div className="bg-base-200 p-4 rounded-lg">
                  <h3 className="font-bold text-base-content mb-2">🎯 Use Cases</h3>
                  <ul className="list-disc list-inside space-y-1 text-xs text-base-content">
                    <li>NFT minting with random traits</li>
                    <li>Gaming applications (loot boxes, outcomes)</li>
                    <li>Fair lottery and raffle systems</li>
                    <li>Random selection processes</li>
                  </ul>
                </div>
              </div>

              <div className="alert alert-info mt-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  className="stroke-current shrink-0 w-6 h-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  ></path>
                </svg>
                <div className="text-xs">
                  <p>
                    Learn more about Chainlink VRF Direct Funding:
                    <a
                      href="https://docs.chain.link/vrf/v2-5/direct-funding/get-a-random-number"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link font-semibold ml-1 font-bold underline hover:no-underline"
                    >
                      Official Documentation
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contract Interaction Section */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Request Random Number */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title text-xl mb-4">🎲 Request Random Number</h2>

              {connectedAddress ? (
                <button
                  className="btn btn-primary w-full"
                  onClick={handleRequestRandomWords}
                  disabled={isRequestingRandom || !vrfConsumerAddress}
                >
                  <span className="flex items-center gap-2">
                    {isRequestingRandom && <span className="loading loading-spinner loading-sm"></span>}
                    Request Random Words
                  </span>
                </button>
              ) : (
                <div className="alert alert-warning">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="stroke-current shrink-0 h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                  <span className="text-xs">Please connect your wallet to request random numbers</span>
                </div>
              )}

              <div className="divider"></div>

              <div className="bg-base-200 p-3 rounded-lg">
                <h3 className="font-bold text-sm mb-2 text-base-content">💡 How to use:</h3>
                <ol className="list-decimal list-inside space-y-1 text-xs text-base-content">
                  <li>Ensure you&apos;re on Sepolia or Mainnet</li>
                  <li>Enter a valid VRF Consumer contract address</li>
                  <li>Click &quot;Request Random Words&quot; to initiate</li>
                  <li>Wait for the oracle to fulfill the request</li>
                  <li>Check the status in the panel on the right</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Check Request Status */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title text-xl mb-4">📊 Request Status</h2>

              <div className="space-y-4">
                {/* Last Request ID */}
                <div className="bg-base-200 p-3 rounded-lg">
                  <h3 className="font-bold text-sm mb-2">Latest Request ID:</h3>
                  {lastRequestId !== undefined ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <code
                          className="text-sm bg-base-300 px-2 py-1 rounded select-all cursor-pointer"
                          title="Click to select"
                        >
                          {lastRequestId.toString().length > 10
                            ? `${lastRequestId.toString().slice(0, 6)}...${lastRequestId.toString().slice(-4)}`
                            : lastRequestId.toString()}
                        </code>

                        <button
                          className="btn btn-xs btn-ghost"
                          onClick={() => navigator.clipboard.writeText(lastRequestId.toString())}
                          title="Copy full request ID"
                        >
                          📋
                        </button>
                      </div>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => refetchLastRequestId()}
                        title="Refresh latest request ID"
                      >
                        🔄
                      </button>
                      <button className="btn btn-sm btn-outline" onClick={handleCheckStatus}>
                        Check Status
                      </button>
                    </div>
                  ) : (
                    <span className="text-gray-500 text-sm">No requests found</span>
                  )}
                </div>

                {/* Manual Request ID Check */}
                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-semibold">Or check specific Request ID:</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Enter request ID to check"
                    className="input input-bordered w-full"
                    value={requestId}
                    onChange={e => setRequestId(e.target.value)}
                  />
                </div>

                {/* Request Status Display */}
                {requestStatus && requestId && (
                  <div className="bg-base-200 p-4 rounded-lg">
                    <h3 className="font-bold text-sm mb-3">
                      Request Status for ID:
                      <code
                        className="text-sm bg-base-300 px-2 py-1 rounded select-all cursor-pointer ml-1"
                        title="Click to select"
                        onClick={() => navigator.clipboard.writeText(requestId)}
                      >
                        {requestId.length > 10 ? `${requestId.slice(0, 6)}...${requestId.slice(-4)}` : requestId}
                      </code>
                      <button
                        className="btn btn-xs btn-ghost ml-1"
                        onClick={() => navigator.clipboard.writeText(requestId)}
                        title="Copy full request ID"
                      >
                        📋
                      </button>
                    </h3>
                    <div className="grid grid-cols-1 gap-2 text-xs">
                      <div className="flex justify-between">
                        <span className="font-medium">Paid Amount:</span>
                        <div className="flex items-center gap-1">
                          <code
                            className="bg-base-300 px-2 py-1 rounded text-xs select-all cursor-pointer"
                            title="Click to select"
                            onClick={() => navigator.clipboard.writeText(requestStatus[0]?.toString() || "0")}
                          >
                            {(requestStatus[0]?.toString() || "0").length > 10
                              ? `${(requestStatus[0]?.toString() || "0").slice(0, 6)}...${(requestStatus[0]?.toString() || "0").slice(-4)}`
                              : requestStatus[0]?.toString() || "0"}
                          </code>
                          <span>wei</span>
                          <button
                            className="btn btn-xs btn-ghost"
                            onClick={() => navigator.clipboard.writeText(requestStatus[0]?.toString() || "0")}
                            title="Copy full amount"
                          >
                            📋
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Fulfilled:</span>
                        <span className={`badge ${requestStatus[1] ? "badge-success" : "badge-warning"}`}>
                          {requestStatus[1] ? "Yes" : "Pending"}
                        </span>
                      </div>
                      {requestStatus[1] && (
                        <div className="flex justify-between">
                          <span className="font-medium">Random Word:</span>
                          <div className="flex items-center gap-1">
                            <code
                              className="bg-base-300 px-2 py-1 rounded text-xs select-all cursor-pointer"
                              title="Click to select"
                              onClick={() => navigator.clipboard.writeText(requestStatus[2]?.toString() || "")}
                            >
                              {(requestStatus[2]?.toString() || "").length > 10
                                ? `${(requestStatus[2]?.toString() || "").slice(0, 6)}...${(requestStatus[2]?.toString() || "").slice(-4)}`
                                : requestStatus[2]?.toString() || ""}
                            </code>
                            <button
                              className="btn btn-xs btn-ghost"
                              onClick={() => navigator.clipboard.writeText(requestStatus[2]?.toString() || "")}
                              title="Copy full random word"
                            >
                              📋
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="divider"></div>

              <div className="bg-base-200 p-3 rounded-lg">
                <h3 className="font-bold text-sm mb-2 text-base-content">ℹ️ Status Explanation:</h3>
                <ul className="list-disc list-inside space-y-1 text-xs text-base-content">
                  <li>
                    <strong>Paid Amount:</strong> ETH spent for the VRF request
                  </li>
                  <li>
                    <strong>Fulfilled:</strong> Whether oracle has provided the random number
                  </li>
                  <li>
                    <strong>Random Word:</strong> The actual random number (if fulfilled)
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Contract Information */}
        <div className="card bg-base-100 shadow-xl mt-8">
          <div className="card-body">
            <h2 className="card-title text-xl mb-4">🔧 Contract Information</h2>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-base-200 p-4 rounded-lg">
                <h3 className="font-bold text-sm mb-2 text-base-content">Stylus Contract Functions:</h3>
                <ul className="list-disc list-inside space-y-1 text-xs text-base-content">
                  <li>
                    <code>callWriteRequestRandomNumber</code> - Request random words
                  </li>
                  <li>
                    <code>callViewGetLastRequestId</code> - Get latest request ID
                  </li>
                  <li>
                    <code>callViewGetRequestStatus</code> - Check request status
                  </li>
                </ul>
              </div>

              <div className="bg-base-200 p-4 rounded-lg">
                <h3 className="font-bold text-sm mb-2 text-base-content">Your Connected Address:</h3>
                {connectedAddress ? (
                  <Address address={connectedAddress} />
                ) : (
                  <span className="text-base-content/60 text-sm">Not connected</span>
                )}
              </div>
            </div>

            <div className="alert alert-info mt-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                className="stroke-current shrink-0 w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                ></path>
              </svg>
              <div className="text-xs text-base-content">
                <p className="font-bold">For Developers:</p>
                <p>
                  This page demonstrates how to integrate Chainlink VRF with Arbitrum Stylus contracts. The Rust
                  contract acts as a proxy to interact with Chainlink&apos;s Direct Funding Consumer contract. Check out
                  the source code in <code>packages/stylus/vrf-consumer/src/lib.rs</code>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VRFPage;
