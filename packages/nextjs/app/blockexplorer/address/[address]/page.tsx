import fs from "fs";
import path from "path";
import { Address } from "viem";
import { AddressComponent } from "~~/app/blockexplorer/_components/AddressComponent";
import deployedContracts from "~~/contracts/deployedContracts";
import { isZeroAddress } from "~~/utils/scaffold-eth/common";
import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";
import { arbitrumNitro } from "~~/utils/scaffold-stylus/chain";

type PageProps = {
  params: Promise<{ address: Address }>;
};

async function fetchByteCodeAndAssembly(buildInfoDirectory: string, contractPath: string) {
  const buildInfoFiles = fs.readdirSync(buildInfoDirectory);
  let bytecode = "";
  let assembly = "";

  for (let i = 0; i < buildInfoFiles.length; i++) {
    const filePath = path.join(buildInfoDirectory, buildInfoFiles[i]);

    const buildInfo = JSON.parse(fs.readFileSync(filePath, "utf8"));

    if (buildInfo.output.contracts[contractPath]) {
      for (const contract in buildInfo.output.contracts[contractPath]) {
        bytecode = buildInfo.output.contracts[contractPath][contract].evm.bytecode.object;
        assembly = buildInfo.output.contracts[contractPath][contract].evm.bytecode.opcodes;
        break;
      }
    }

    if (bytecode && assembly) {
      break;
    }
  }

  return { bytecode, assembly };
}

const getContractData = async (address: Address) => {
  const contracts = deployedContracts as GenericContractsDeclaration | null;
  const chainId = arbitrumNitro.id;

  if (!contracts || !contracts[chainId] || Object.keys(contracts[chainId]).length === 0) {
    return null;
  }

  let contractPath = "";

  const buildInfoDirectory = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "..",
    "..",
    "..",
    "..",
    "stylus",
    "artifacts",
    "build-info",
  );

  if (!fs.existsSync(buildInfoDirectory)) {
    throw new Error(`Directory ${buildInfoDirectory} not found.`);
  }

  const deployedContractsOnChain = contracts[chainId];
  for (const [contractName, contractInfo] of Object.entries(deployedContractsOnChain)) {
    if (contractInfo.address.toLowerCase() === address.toLowerCase()) {
      contractPath = `contracts/${contractName}.sol`;
      break;
    }
  }

  if (!contractPath) {
    // No contract found at this address
    return null;
  }

  const { bytecode, assembly } = await fetchByteCodeAndAssembly(buildInfoDirectory, contractPath);

  return { bytecode, assembly };
};

export function generateStaticParams() {
  // An workaround to enable static exports in Next.js, generating single dummy page.
  return [{ address: "0x0000000000000000000000000000000000000000" }];
}

const AddressPage = async (props: PageProps) => {
  const params = await props.params;
  const address = params?.address as Address;

  if (isZeroAddress(address)) return null;

  const contractData: { bytecode: string; assembly: string } | null = await getContractData(address);
  return <AddressComponent address={address} contractData={contractData} />;
};

export default AddressPage;
