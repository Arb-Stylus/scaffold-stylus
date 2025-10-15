import { arbitrum, arbitrumNova, arbitrumSepolia } from "viem/chains";
import { Address, Chain } from "viem";
import {
  arbitrumNitro,
  superposition,
  eduChainTestnet,
  superpositionTestnet,
  eduChain,
} from "../../../nextjs/utils/scaffold-stylus/supportedChains";
import * as path from "path";
import * as fs from "fs";
import { config as dotenvConfig } from "dotenv";

const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

export const SUPPORTED_NETWORKS: Record<string, Chain> = {
  arbitrum,
  arbitrumSepolia,
  arbitrumNitro: arbitrumNitro as Chain,
  arbitrumNova: arbitrumNova as Chain,
  eduChainTestnet: eduChainTestnet as unknown as Chain,
  eduChain: eduChain as unknown as Chain,
  superposition: superposition as unknown as Chain,
  superpositionTestnet: superpositionTestnet as Chain,
};

export const ALIASES: Record<string, string> = {
  mainnet: "arbitrum",
  sepolia: "arbitrumSepolia",
  devnet: "arbitrumNitro",
  nova: "arbitrumNova",
  educhainTesnet: "eduChainTestnet",
  educhain: "eduChain",
  superposition: "superposition",
  superpositionTestnet: "superpositionTestnet",
};

// TODO: add more compatible Orbit Chains here
export const ORBIT_CHAINS: Chain[] = [
  eduChain as unknown as Chain,
  eduChainTestnet as unknown as Chain,
  superposition as unknown as Chain,
  superpositionTestnet as Chain,
];

export function getChain(networkName: string): Chain | null {
  try {
    // First try exact match (for camelCase aliases)
    let actualNetworkName = ALIASES[networkName] || networkName;
    
    // If no exact match, try lowercase match (for backward compatibility)
    if (actualNetworkName === networkName) {
      actualNetworkName = ALIASES[networkName.toLowerCase()] || networkName;
    }

    const chainEntry = Object.entries(SUPPORTED_NETWORKS).find(
      ([key]) => key.toLowerCase() === actualNetworkName.toLowerCase(),
    );

    if (chainEntry) return chainEntry[1];

    const supportedNetworks = Object.keys(SUPPORTED_NETWORKS);
    console.warn(
      `⚠️  Network '${networkName}' is not supported. Supported networks: ${supportedNetworks.join(", ")}`,
    );
    return null;
  } catch (error) {
    console.error(`Error getting chain for network ${networkName}:`, error);
    return null;
  }
}

export function getPrivateKey(networkName: string): string {
  // First try exact match (for camelCase aliases)
  let actualNetworkName = ALIASES[networkName] || networkName;
  
  // If no exact match, try lowercase match (for backward compatibility)
  if (actualNetworkName === networkName) {
    actualNetworkName = ALIASES[networkName.toLowerCase()] || networkName;
  }

  switch (actualNetworkName.toLowerCase()) {
    case "arbitrum":
      if (process.env["PRIVATE_KEY_MAINNET"]) {
        return process.env["PRIVATE_KEY_MAINNET"];
      } else {
        throw new Error("PRIVATE_KEY_MAINNET is not set");
      }
    case "arbitrumsepolia":
      if (process.env["PRIVATE_KEY_SEPOLIA"]) {
        return process.env["PRIVATE_KEY_SEPOLIA"];
      } else {
        throw new Error("PRIVATE_KEY_SEPOLIA is not set");
      }
    case "arbitrumnova":
      if (process.env["PRIVATE_KEY_NOVA"]) {
        return process.env["PRIVATE_KEY_NOVA"];
      } else {
        throw new Error("PRIVATE_KEY_NOVA is not set");
      }
    case "educhaintestnet":
      if (process.env["PRIVATE_KEY_EDUCHAIN_TESTNET"]) {
        return process.env["PRIVATE_KEY_EDUCHAIN_TESTNET"];
      } else {
        throw new Error("PRIVATE_KEY_EDUCHAIN_TESTNET is not set");
      }
    case "educhain":
      if (process.env["PRIVATE_KEY_EDUCHAIN"]) {
        return process.env["PRIVATE_KEY_EDUCHAIN"];
      } else {
        throw new Error("PRIVATE_KEY_EDUCHAIN is not set");
      }
    case "superposition":
      if (process.env["PRIVATE_KEY_SUPERPOSITION"]) {
        return process.env["PRIVATE_KEY_SUPERPOSITION"];
      } else {
        throw new Error("PRIVATE_KEY_SUPERPOSITION is not set");
      }
    case "superpositiontestnet":
      if (process.env["PRIVATE_KEY_SUPERPOSITION_TESTNET"]) {
        return process.env["PRIVATE_KEY_SUPERPOSITION_TESTNET"];
      } else {
        throw new Error("PRIVATE_KEY_SUPERPOSITION_TESTNET is not set");
      }
    default:
      return (
        process.env["PRIVATE_KEY"] ||
        "0xb6b15c8cb491557369f3c7d2c287b053eb229daa9c22138887752191c9520659"
      );
  }
}

export const getAccountAddress = (networkName: string): Address | undefined => {
  // First try exact match (for camelCase aliases)
  let actualNetworkName = ALIASES[networkName] || networkName;
  
  // If no exact match, try lowercase match (for backward compatibility)
  if (actualNetworkName === networkName) {
    actualNetworkName = ALIASES[networkName.toLowerCase()] || networkName;
  }

  switch (actualNetworkName.toLowerCase()) {
    case "arbitrum":
      return process.env["ACCOUNT_ADDRESS_MAINNET"] as Address;
    case "arbitrumsepolia":
      return process.env["ACCOUNT_ADDRESS_SEPOLIA"] as Address;
    case "arbitrumnova":
      return process.env["ACCOUNT_ADDRESS_NOVA"] as Address;
    case "educhaintestnet":
      return process.env["ACCOUNT_ADDRESS_EDUCHAIN_TESTNET"] as Address;
    case "educhain":
      return process.env["ACCOUNT_ADDRESS_EDUCHAIN"] as Address;
    case "superposition":
      return process.env["ACCOUNT_ADDRESS_SUPERPOSITION"] as Address;
    case "superpositiontestnet":
      return process.env["ACCOUNT_ADDRESS_SUPERPOSITION_TESTNET"] as Address;
    default:
      return (
        (process.env["ACCOUNT_ADDRESS"] as Address) ||
        "0x3f1Eae7D46d88F08fc2F8ed27FCb2AB183EB2d0E"
      );
  }
};

export function getRpcUrlFromChain(chain: Chain): string {
  //Prefer user rpc url from env
  switch (chain.id) {
    case arbitrum.id:
      if (process.env["RPC_URL_MAINNET"]) {
        return process.env["RPC_URL_MAINNET"];
      }
      break;
    case arbitrumSepolia.id:
      if (process.env["RPC_URL_SEPOLIA"]) {
        return process.env["RPC_URL_SEPOLIA"];
      }
      break;
    case arbitrumNova.id:
      if (process.env["RPC_URL_NOVA"]) {
        return process.env["RPC_URL_NOVA"];
      }
      break;
    case eduChainTestnet.id:
      if (process.env["RPC_URL_EDUCHAIN_TESTNET"]) {
        return process.env["RPC_URL_EDUCHAIN_TESTNET"];
      }
      break;
    case eduChain.id:
      if (process.env["RPC_URL_EDUCHAIN"]) {
        return process.env["RPC_URL_EDUCHAIN"];
      }
      break;
    case superposition.id:
      if (process.env["RPC_URL_SUPERPOSITION"]) {
        return process.env["RPC_URL_SUPERPOSITION"];
      }
      break;
    case superpositionTestnet.id:
      if (process.env["RPC_URL_SUPERPOSITION_TESTNET"]) {
        return process.env["RPC_URL_SUPERPOSITION_TESTNET"];
      }
      break;
    default:
      if (process.env["RPC_URL"]) {
        return process.env["RPC_URL"];
      }
  }

  if (chain.rpcUrls?.default?.http && chain.rpcUrls.default.http.length > 0) {
    return chain.rpcUrls.default.http[0]!;
  }

  if (
    "public" in chain.rpcUrls &&
    chain.rpcUrls.public?.http &&
    chain.rpcUrls.public.http.length > 0
  ) {
    return chain.rpcUrls.public.http[0]!;
  }

  throw new Error(`No RPC URL found for chain ${chain.name}`);
}

export function getBlockExplorerUrlFromChain(chain: Chain): string | undefined {
  return (
    chain.blockExplorers?.default?.url || chain.blockExplorers?.etherscan?.url
  );
}
