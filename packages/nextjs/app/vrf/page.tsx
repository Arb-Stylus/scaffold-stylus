"use client";

import { useState } from "react";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

const VRFDemo = () => {
  const { address: connectedAddress } = useAccount();
  const [requestIdInput, setRequestIdInput] = useState("");
  const [randomValuesInput, setRandomValuesInput] = useState("");
  const [wordIndexInput, setWordIndexInput] = useState("");

  // Read contract state
  const { data: isSetup } = useScaffoldReadContract({
    contractName: "random-word-contract",
    functionName: "isContractSetup",
  });

  const { data: wordCount } = useScaffoldReadContract({
    contractName: "random-word-contract",
    functionName: "getWordCount",
  });

  const { data: vrfWrapper } = useScaffoldReadContract({
    contractName: "random-word-contract",
    functionName: "getVrfWrapper",
  });

  const { data: requestPrice } = useScaffoldReadContract({
    contractName: "random-word-contract",
    functionName: "calculateRequestPrice",
  });

  const { data: userRequestCount } = useScaffoldReadContract({
    contractName: "random-word-contract",
    functionName: "getUserRequestCount",
    args: [connectedAddress],
  });

  const { data: lastRandomWord } = useScaffoldReadContract({
    contractName: "random-word-contract",
    functionName: "getLastRandomWord",
    args: [connectedAddress],
  });

  const { data: previewWord } = useScaffoldReadContract({
    contractName: "random-word-contract",
    functionName: "getWordByIndex",
    args: [BigInt(wordIndexInput)],
  });

  // Write contract functions
  const { writeContractAsync: requestRandomWord, isMining: isRequesting } = useScaffoldWriteContract({
    contractName: "random-word-contract",
  });

  const { writeContractAsync: fulfillRandomWords, isMining: isFulfilling } = useScaffoldWriteContract({
    contractName: "random-word-contract",
  });

  // Handle request random word
  const handleRequestRandomWord = async () => {
    if (!requestPrice) return;

    try {
      await requestRandomWord({
        functionName: "requestRandomWord",
        value: requestPrice,
      });
    } catch (error) {
      console.error("Error requesting random word:", error);
    }
  };

  // Handle fulfill random words (for testing)
  const handleFulfillRandomWords = async () => {
    if (!requestIdInput || !randomValuesInput) return;

    try {
      const randomValues = randomValuesInput.split(",").map(val => BigInt(val.trim()));
      await fulfillRandomWords({
        functionName: "fulfillRandomWords",
        args: [BigInt(requestIdInput), randomValues],
      });
    } catch (error) {
      console.error("Error fulfilling random words:", error);
    }
  };

  return (
    <div className="flex items-center flex-col flex-grow pt-10">
      <div className="px-5 max-w-4xl w-full">
        <h1 className="text-center">
          <span className="block text-2xl mb-2">🎲 Random Word Generator</span>
          <span className="block text-4xl font-bold">Chainlink VRF Demo</span>
        </h1>

        <div className="flex justify-center items-center space-x-2 my-4">
          <p className="my-2 font-medium">Connected Address:</p>
          <Address address={connectedAddress} />
        </div>

        {/* Contract Information */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">📊 Contract Status</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>Setup Status:</span>
                  <span className={`badge ${isSetup ? "badge-success" : "badge-error"}`}>
                    {isSetup ? "✅ Ready" : "❌ Not Setup"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Word Count:</span>
                  <span className="badge badge-info">{wordCount?.toString() || "0"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Request Price:</span>
                  <span className="badge badge-warning">
                    {requestPrice ? `${formatEther(requestPrice)} ETH` : "Loading..."}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>VRF Wrapper:</span>
                  <Address address={vrfWrapper} size="sm" />
                </div>
              </div>
            </div>
          </div>

          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">👤 Your Stats</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>Requests Made:</span>
                  <span className="badge badge-primary">{userRequestCount?.toString() || "0"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Random Word:</span>
                  <span className="badge badge-secondary">{lastRandomWord || "None yet"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          {/* Request Random Word */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">🎲 Request Random Word</h2>
              <p className="text-sm opacity-70 mb-4">
                Request a random word from the predefined list using Chainlink VRF.
              </p>
              <div className="space-y-4">
                <div className="alert alert-info">
                  <span className="text-sm">Cost: {requestPrice ? formatEther(requestPrice) : "..."} ETH</span>
                </div>
                <button
                  className={`btn btn-primary w-full ${isRequesting ? "loading" : ""}`}
                  onClick={handleRequestRandomWord}
                  disabled={!isSetup || !requestPrice || isRequesting}
                >
                  {isRequesting ? "Requesting..." : "🎲 Request Random Word"}
                </button>
              </div>
            </div>
          </div>

          {/* Word Preview */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">👀 Word Preview</h2>
              <p className="text-sm opacity-70 mb-4">
                Preview words from the list by index (0-{Number(wordCount || 0) - 1}).
              </p>
              <div className="space-y-4">
                <input
                  type="number"
                  placeholder="Enter word index (0-19)"
                  className="input input-bordered w-full"
                  value={wordIndexInput}
                  onChange={e => setWordIndexInput(e.target.value)}
                  min="0"
                  max={Number(wordCount || 0) - 1}
                />
                {previewWord && (
                  <div className="alert alert-success">
                    <span>
                      Word #{wordIndexInput}: <strong>{previewWord}</strong>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Testing/Development Section */}
        <div className="card bg-base-100 shadow-xl mt-8">
          <div className="card-body">
            <h2 className="card-title">🧪 Development & Testing</h2>
            <div className="alert alert-warning mb-4">
              <span className="text-sm">
                ⚠️ This section is for testing only. In production, fulfillRandomWords is called by Chainlink VRF.
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="label">
                  <span className="label-text">Request ID</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter request ID"
                  className="input input-bordered w-full"
                  value={requestIdInput}
                  onChange={e => setRequestIdInput(e.target.value)}
                />
              </div>
              <div>
                <label className="label">
                  <span className="label-text">Random Values (comma-separated)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., 12345, 67890"
                  className="input input-bordered w-full"
                  value={randomValuesInput}
                  onChange={e => setRandomValuesInput(e.target.value)}
                />
              </div>
            </div>

            <button
              className={`btn btn-secondary mt-4 ${isFulfilling ? "loading" : ""}`}
              onClick={handleFulfillRandomWords}
              disabled={!requestIdInput || !randomValuesInput || isFulfilling}
            >
              {isFulfilling ? "Fulfilling..." : "🔧 Fulfill Random Words (Test)"}
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="card bg-base-100 shadow-xl mt-8">
          <div className="card-body">
            <h2 className="card-title">📖 How to Modify This Contract</h2>
            <div className="space-y-4">
              <div className="collapse collapse-arrow bg-base-200">
                <input type="radio" name="instructions" defaultChecked />
                <div className="collapse-title text-xl font-medium">🛠️ Contract Customization</div>
                <div className="collapse-content">
                  <div className="space-y-3 text-sm">
                    <p>
                      <strong>1. Modify the word list:</strong>
                    </p>
                    <p>
                      Edit the <code>initialize_word_list()</code> function in <code>lib.rs</code> to add your own
                      words.
                    </p>

                    <p>
                      <strong>2. Change VRF configuration:</strong>
                    </p>
                    <p>
                      Update the constructor parameters when deploying to use different gas limits or confirmation
                      counts.
                    </p>

                    <p>
                      <strong>3. Add new functionality:</strong>
                    </p>
                    <p>• Add word categories with mappings</p>
                    <p>• Implement word difficulty levels</p>
                    <p>• Add NFT minting for rare words</p>
                    <p>• Create word combination features</p>
                  </div>
                </div>
              </div>

              <div className="collapse collapse-arrow bg-base-200">
                <input type="radio" name="instructions" />
                <div className="collapse-title text-xl font-medium">🚀 Deployment Guide</div>
                <div className="collapse-content">
                  <div className="space-y-3 text-sm">
                    <p>
                      <strong>1. Deploy the contract:</strong>
                    </p>
                    <code className="block bg-gray-100 p-2 rounded">
                      cd packages/stylus/vrf-consumer
                      <br />
                      yarn stylus:deploy --network arbitrumSepolia
                    </code>

                    <p>
                      <strong>2. Update the frontend:</strong>
                    </p>
                    <p>
                      The ABI will be automatically generated and the contract address updated in{" "}
                      <code>deployedContracts.ts</code>
                    </p>

                    <p>
                      <strong>3. Fund the contract:</strong>
                    </p>
                    <p>Send ETH to the contract address to cover VRF request costs.</p>
                  </div>
                </div>
              </div>

              <div className="collapse collapse-arrow bg-base-200">
                <input type="radio" name="instructions" />
                <div className="collapse-title text-xl font-medium">🎯 Use Cases & Extensions</div>
                <div className="collapse-content">
                  <div className="space-y-3 text-sm">
                    <p>
                      <strong>Gaming Applications:</strong>
                    </p>
                    <p>• Random dungeon generation</p>
                    <p>• Loot box contents</p>
                    <p>• Character trait assignment</p>

                    <p>
                      <strong>DeFi Applications:</strong>
                    </p>
                    <p>• Random reward distribution</p>
                    <p>• Lottery systems</p>
                    <p>• Random validator selection</p>

                    <p>
                      <strong>Educational Tools:</strong>
                    </p>
                    <p>• Vocabulary learning games</p>
                    <p>• Random quiz questions</p>
                    <p>• Study flashcard randomization</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features Overview */}
        <div className="card bg-base-100 shadow-xl mt-8 mb-8">
          <div className="card-body">
            <h2 className="card-title">✨ Contract Features</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              <div className="flex items-center space-x-3">
                <span className="text-2xl">🔗</span>
                <div>
                  <h3 className="font-semibold">Chainlink VRF</h3>
                  <p className="text-sm opacity-70">Verifiable randomness</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-2xl">💰</span>
                <div>
                  <h3 className="font-semibold">Payable Requests</h3>
                  <p className="text-sm opacity-70">ETH payment for VRF</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-2xl">📊</span>
                <div>
                  <h3 className="font-semibold">Request Tracking</h3>
                  <p className="text-sm opacity-70">Monitor user activity</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-2xl">📝</span>
                <div>
                  <h3 className="font-semibold">Word Storage</h3>
                  <p className="text-sm opacity-70">20 predefined words</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-2xl">🎯</span>
                <div>
                  <h3 className="font-semibold">Event Emission</h3>
                  <p className="text-sm opacity-70">Request & fulfill events</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-2xl">🚀</span>
                <div>
                  <h3 className="font-semibold">Stylus Rust</h3>
                  <p className="text-sm opacity-70">High-performance</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VRFDemo;
