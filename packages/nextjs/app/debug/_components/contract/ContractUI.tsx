"use client";

// @refresh reset
import { useReducer, useState } from "react";
import { ContractReadMethods } from "./ContractReadMethods";
import { ContractVariables } from "./ContractVariables";
import { ContractWriteMethods } from "./ContractWriteMethods";
import { Address, Balance } from "~~/components/scaffold-eth";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { ContractName } from "~~/utils/scaffold-eth/contract";

type ContractUIProps = {
  contractName: ContractName;
  className?: string;
};

/**
 * UI component to interface with deployed contracts.
 **/
export const ContractUI = ({ contractName, className = "" }: ContractUIProps) => {
  const [activeTab, setActiveTab] = useState("write");
  const [refreshDisplayVariables, triggerRefreshDisplayVariables] = useReducer(value => !value, false);
  const { targetNetwork } = useTargetNetwork();
  const { data: deployedContractData, isLoading: deployedContractLoading } = useDeployedContractInfo({ contractName });

  const tabs = [
    { id: "write", label: "Write" },
    { id: "read", label: "Read" },
  ];

  if (deployedContractLoading) {
    return (
      <div className="mt-14">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (!deployedContractData) {
    return (
      <p className="text-3xl mt-14">
        {`No contract found by the name of "${contractName}" on chain "${targetNetwork.name}"!`}
      </p>
    );
  }

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-6 px-6 lg:px-10 lg:gap-12 w-full max-w-7xl my-0 ${className}`}>
      <div className="col-span-5 grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
        <div className="col-span-1 flex flex-col">
          <div className="contract-card mb-6">
            <div className="flex flex-col gap-4 w-full">
              {/* Contract Title */}
              <div className="contract-title">{contractName}</div>

              <Address address={deployedContractData.address} onlyEnsOrAddress />

              {/* Balance */}
              <div className="flex items-center gap-2">
                <span className="contract-label">Balance:</span>
                <Balance
                  address={deployedContractData.address}
                  className="contract-value px-0 h-1.5 min-h-[0.375rem]"
                />
              </div>

              {/* Network */}
              {targetNetwork && (
                <div className="flex items-center gap-2">
                  <span className="contract-label">Network:</span>
                  <span className="contract-value">{targetNetwork.name}</span>
                </div>
              )}
            </div>
          </div>
          <div
            className="rounded-xl px-6 lg:px-8 py-4 shadow-lg shadow-base-300"
            style={{ border: "1px solid var(--stroke-sub-20, rgba(255, 255, 255, 0.20))" }}
          >
            <ContractVariables
              refreshDisplayVariables={refreshDisplayVariables}
              deployedContractData={deployedContractData}
            />
          </div>
        </div>
        <div className="col-span-1 lg:col-span-2 flex flex-col gap-6">
          <div className="tab-container">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="tab-text typography-uppercase">{tab.label}</span>
              </button>
            ))}
          </div>
          <div className="z-10">
            <div
              className="rounded-[16px] flex flex-col relative bg-component"
              style={{ border: "1px solid var(--stroke-sub-20, rgba(255, 255, 255, 0.20))" }}
            >
              <div className="p-5 divide-y divide-secondary">
                {activeTab === "read" && <ContractReadMethods deployedContractData={deployedContractData} />}
                {activeTab === "write" && (
                  <ContractWriteMethods
                    deployedContractData={deployedContractData}
                    onChange={triggerRefreshDisplayVariables}
                  />
                )}
              </div>
              {deployedContractLoading && (
                <div className="absolute inset-0 rounded-[5px] bg-white/20 z-10">
                  <div className="animate-spin h-4 w-4 border-2 border-[#E3066E] border-t-transparent rounded-full absolute top-4 right-4" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
