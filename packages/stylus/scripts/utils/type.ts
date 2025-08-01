import { Address } from "viem";

interface BaseCommandOptions {
  _: (string | number)[];
  $0: string;
  [x: string]: unknown;
}

export interface DeployCommandOptions
  extends BaseCommandOptions,
    DeployOptions {}

export interface DeployOptions {
  contract?: string;
  name?: string;
  constructorArgs?: string[];
  network?: string;
  estimateGas?: boolean;
  maxFee?: string;
  verify?: boolean;
}

export interface DeploymentData {
  address: Address;
  txHash: string;
}

export interface DeploymentConfig {
  deployerAddress: Address | undefined;
  privateKey: string;
  contractFolder: string;
  contractName: string;
  deploymentDir: string;
  chain?: SupportedNetworkMinimal;
}

export interface ExportConfig {
  contractFolder: string;
  contractName: string;
  deploymentDir: string;
  contractAddress: Address;
  txHash: string;
  chainId: string;
}

export interface SupportedNetworkMinimal {
  name: string;
  alias: string;
  id: string;
  rpcUrl: string;
}
