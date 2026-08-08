import { Abi, AbiFunction } from "abitype";
import { ReadOnlyFunctionForm } from "~~/app/debug/_components/contract";
import { Contract, ContractName, GenericContract, InheritedFunctions } from "~~/utils/scaffold-eth/contract";

export const ContractReadMethods = ({ deployedContractData }: { deployedContractData: Contract<ContractName> }) => {
  if (!deployedContractData) {
    return null;
  }

  const functionsToDisplay = (
    ((deployedContractData.abi || []) as Abi).filter(part => part.type === "function") as AbiFunction[]
  )
    .filter(fn => {
      const isQueryable =
        (fn.stateMutability === "view" || fn.stateMutability === "pure");
      return isQueryable;
    })
    .map(fn => {
      return {
        fn,
        inheritedFrom: ((deployedContractData as GenericContract)?.inheritedFunctions as InheritedFunctions)?.[fn.name],
      };
    })
    .sort((a, b) => (b.inheritedFrom ? b.inheritedFrom.localeCompare(a.inheritedFrom) : 1));

  if (!functionsToDisplay.length) {
    return <div className="py-[2px]">No read methods</div>;
  }

  return (
    <>
      {functionsToDisplay.map(({ fn, inheritedFrom }) => (
        <ReadOnlyFunctionForm
          abi={deployedContractData.abi as Abi}
          contractAddress={deployedContractData.address}
          abiFunction={fn}
          key={fn.name}
          inheritedFrom={inheritedFrom}
        />
      ))}
    </>
  );
};
