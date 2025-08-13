import { arbitrum, arbitrumNova, arbitrumSepolia } from "viem/chains";
import { Address, Chain } from "viem";
import { arbitrumNitro } from "../../../nextjs/utils/scaffold-stylus/supportedChains";
import * as path from "path";
import * as fs from "fs";
import { config as dotenvConfig } from "dotenv";
import { SupportedNetworkMinimal } from "./type";

const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

export const SUPPORTED_NETWORKS: Record<string, Chain> = {
  arbitrum,
  arbitrumSepolia,
  arbitrumNitro: arbitrumNitro as Chain,
  arbitrumNova: arbitrumNova as Chain,
};

export const ALIASES: Record<string, string> = {
  mainnet: "arbitrum",
  sepolia: "arbitrumSepolia",
  devnet: "arbitrumNitro",
  nova: "arbitrumNova",
};

export function getChain(networkName: string): SupportedNetworkMinimal | null {
  try {
    const actualNetworkName = ALIASES[networkName.toLowerCase()] || networkName;

    const chainEntry = Object.entries(SUPPORTED_NETWORKS).find(
      ([key]) => key.toLowerCase() === actualNetworkName.toLowerCase(),
    );

    if (chainEntry) {
      return {
        name: chainEntry[0],
        alias: getAliasFromNetworkName(chainEntry[0]),
        id: chainEntry[1].id.toString(),
        rpcUrl: getRpcUrlFromChain(chainEntry[1]),
      };
    }

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
  const actualNetworkName = ALIASES[networkName.toLowerCase()] || networkName;

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
    default:
      return (
        process.env["PRIVATE_KEY"] ||
        "0xb6b15c8cb491557369f3c7d2c287b053eb229daa9c22138887752191c9520659"
      );
  }
}

export const getAccountAddress = (networkName: string): Address | undefined => {
  const actualNetworkName = ALIASES[networkName.toLowerCase()] || networkName;
  switch (actualNetworkName.toLowerCase()) {
    case "arbitrum":
      return process.env["ACCOUNT_ADDRESS_MAINNET"] as Address;
    case "arbitrumsepolia":
      return process.env["ACCOUNT_ADDRESS_SEPOLIA"] as Address;
    case "arbitrumnova":
      return process.env["ACCOUNT_ADDRESS_NOVA"] as Address;
    default:
      return (
        (process.env["ACCOUNT_ADDRESS"] as Address) ||
        "0x3f1Eae7D46d88F08fc2F8ed27FCb2AB183EB2d0E"
      );
  }
};

function getRpcUrlFromChain(chain: Chain): string {
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

function getAliasFromNetworkName(networkName: string): string {
  return (
    Object.entries(ALIASES).find(([, alias]) => alias === networkName)?.[0] ||
    networkName
  );
}
