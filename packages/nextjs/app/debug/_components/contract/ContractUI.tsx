"use client";

// @refresh reset
import { useReducer } from "react";
import { ContractReadMethods } from "./ContractReadMethods";
import { ContractVariables } from "./ContractVariables";
import { ContractWriteMethods } from "./ContractWriteMethods";
import { Address, Balance } from "~~/components/scaffold-eth";
import { useDeployedContractInfo, useNetworkColor } from "~~/hooks/scaffold-eth";
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
  const [refreshDisplayVariables, triggerRefreshDisplayVariables] = useReducer(value => !value, false);
  const { targetNetwork } = useTargetNetwork();
  const { data: deployedContractData, isLoading: deployedContractLoading } = useDeployedContractInfo({ contractName });
  const networkColor = useNetworkColor();

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
          <div className="gradient-border shadow-md shadow-secondary rounded-xl px-6 lg:px-8 mb-6 space-y-1 py-4">
            <div className="flex">
              <div className="flex flex-col gap-1">
                <span className="font-bold">{contractName}</span>
                <Address address={deployedContractData.address} onlyEnsOrAddress />
                <div className="flex gap-1 items-center">
                  <span className="font-bold text-sm">Balance:</span>
                  <Balance address={deployedContractData.address} className="px-0 h-1.5 min-h-[0.375rem]" />
                </div>
              </div>
            </div>
            {targetNetwork && (
              <p className="my-0 text-sm">
                <span className="font-bold">Network</span>:{" "}
                <span style={{ color: networkColor }}>{targetNetwork.name}</span>
              </p>
            )}
          </div>
          <div className="gradient-border rounded-xl px-6 lg:px-8 py-4 shadow-lg shadow-base-300">
            <ContractVariables
              refreshDisplayVariables={refreshDisplayVariables}
              deployedContractData={deployedContractData}
            />
          </div>
        </div>
        <div className="col-span-1 lg:col-span-2 flex flex-col gap-6">
          <div className="z-10">
            <div
              className="flex flex-col gap-4"
              //className="relative mt-10"
            >
              {/* Read Tab */}
              {/*<div className="absolute -top-8 left-0 flex items-center z-20">*/}
              <div className="relative inline-block w-[23%]">
                {/* Botón con clip-path */}
                <div
                  className="text-white px-8 py-2 text-xl font-medium border-2 relative z-10"
                  style={{
                    backgroundColor: "#630c3a",
                    borderColor: "#E3066E",
                    clipPath: "polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 0 100%)",
                  }}
                >
                  Read
                </div>

                {/* Línea diagonal del corte */}
                <div
                  className="absolute z-20"
                  style={{
                    top: "20px", // deja espacio para el border superior
                    right: "-1px", // deja espacio para el border derecho
                    width: "28.28px", // 20 * sqrt(2)
                    height: "2px", // igual al grosor del borde
                    backgroundColor: "#E3066E",
                    transform: "rotate(45deg)",
                    transformOrigin: "top right",
                  }}
                />
              </div>

              {/*</div> */}
              {/* Gradient Container */}
              <div className="rounded-lg gradient-border min-h-[80px] flex items-center px-4 py-8 shadow-xl">
                <ContractReadMethods deployedContractData={deployedContractData} />
              </div>
            </div>
          </div>
          <div className="z-10">
            <div
              className="flex flex-col gap-4"
              //className="relative mt-10"
            >
              {/* Read Tab */}
              {/*<div className="absolute -top-8 left-0 flex items-center z-20">*/}
              <div className="relative inline-block w-[23%]">
                {/* Botón con clip-path */}
                <div
                  className="text-white px-8 py-2 text-xl font-medium border-2 relative z-10"
                  style={{
                    backgroundColor: "#630c3a",
                    borderColor: "#E3066E",
                    clipPath: "polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 0 100%)",
                  }}
                >
                  Write
                </div>

                {/* Línea diagonal del corte */}
                <div
                  className="absolute z-20"
                  style={{
                    top: "20px", // deja espacio para el border superior
                    right: "-1px", // deja espacio para el border derecho
                    width: "28.28px", // 20 * sqrt(2)
                    height: "2px", // igual al grosor del borde
                    backgroundColor: "#E3066E",
                    transform: "rotate(45deg)",
                    transformOrigin: "top right",
                  }}
                />
              </div>

              {/*</div> */}
              {/* Gradient Container */}
              <div className="gradient-border rounded-lg min-h-[80px] flex flex-col px-6 py-6 shadow-xl">
                <ContractWriteMethods
                  deployedContractData={deployedContractData}
                  onChange={triggerRefreshDisplayVariables}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
