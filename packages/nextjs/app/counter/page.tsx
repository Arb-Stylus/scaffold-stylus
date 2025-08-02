"use client";

import { useState } from "react";
import type { NextPage } from "next";
import { IntegerInput } from "~~/components/scaffold-eth";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const Counter: NextPage = () => {
  const [inputValue, setInputValue] = useState("");

  // Read the current number from the contract
  const { data: currentNumber, refetch: refetchNumber } = useScaffoldReadContract({
    contractName: "counter",
    functionName: "number",
  });

  // Write contract hooks for different operations
  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "counter" });

  const validateInput = (input: string) => {
    if (!input) {
      notification.error("Please enter a number");
      return false;
    }
    return true;
  };

  const handleSetNumber = async () => {
    if (!validateInput(inputValue)) {
      return;
    }

    try {
      await writeContractAsync({
        functionName: "setNumber",
        args: [BigInt(inputValue)],
      });
      setInputValue("");
      refetchNumber();
    } catch (error) {
      console.error("Error setting number:", error);
    }
  };

  const handleAddNumber = async () => {
    if (!validateInput(inputValue)) {
      return;
    }

    try {
      await writeContractAsync({
        functionName: "addNumber",
        args: [BigInt(inputValue)],
      });
      setInputValue("");
      refetchNumber();
    } catch (error) {
      console.error("Error adding number:", error);
    }
  };

  const handleMultiplyNumber = async () => {
    if (!validateInput(inputValue)) {
      return;
    }

    try {
      await writeContractAsync({
        functionName: "mulNumber",
        args: [BigInt(inputValue)],
      });
      setInputValue("");
      refetchNumber();
    } catch (error) {
      console.error("Error multiplying number:", error);
    }
  };

  const handleIncrement = async () => {
    try {
      await writeContractAsync({
        functionName: "increment",
      });
      refetchNumber();
    } catch (error) {
      console.error("Error incrementing:", error);
    }
  };

  return (
    <div className="flex items-center flex-col justify-center min-h-screen p-8">
      <div className="w-full max-w-md">
        {/* Header */}
        <h1 className="text-2xl font-bold text-center mb-8">Interact with Counter Contract</h1>

        {/* Current Number Display */}
        <div className="gradient-border rounded-lg p-6 mb-8 text-center">
          <div className="text-lg mb-2">Current Number:</div>
          <div className="text-3xl font-bold">{currentNumber?.toString() || "0"}</div>
        </div>

        {/* Input Field */}
        <div className="mb-6">
          <IntegerInput value={inputValue} onChange={setInputValue} placeholder="Enter a number" name="numberInput" />
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button
            onClick={handleSetNumber}
            className="btn btn-success font-semibold py-3 px-6 rounded-full transition-colors duration-200"
          >
            Set Number
          </button>
          <button
            onClick={handleAddNumber}
            className="btn btn-secondary font-semibold py-3 px-6 rounded-full transition-colors duration-200"
          >
            Add Number
          </button>
          <button
            onClick={handleMultiplyNumber}
            className="btn btn-warning font-semibold py-3 px-6 rounded-full transition-colors duration-200 col-span-2"
          >
            Multiply Number
          </button>
        </div>

        {/* Increment Button */}
        <div className="flex justify-center">
          <button
            onClick={handleIncrement}
            className="btn btn-neutral font-semibold py-3 px-8 rounded-full transition-colors duration-200"
          >
            Increment
          </button>
        </div>
      </div>
    </div>
  );
};

export default Counter;
