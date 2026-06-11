import deployStylusContract from "./deploy_contract";
import {
  getDeploymentConfig,
  getRpcUrlFromChain,
  printDeployedAddresses,
} from "./utils/";
import { DeployOptions } from "./utils/type";
import { config as dotenvConfig } from "dotenv";
import * as path from "path";
import * as fs from "fs";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

/**
 * Define your deployment logic here
 */
export default async function deployScript(deployOptions: DeployOptions) {
  const config = getDeploymentConfig(deployOptions);

  console.log(`📡 Using endpoint: ${getRpcUrlFromChain(config.chain)}`);
  if (config.chain) {
    console.log(`🌐 Network: ${config.chain?.name}`);
    console.log(`🔗 Chain ID: ${config.chain?.id}`);
  }
  console.log(`🔑 Using private key: ${config.privateKey.substring(0, 10)}...`);
  console.log(`📁 Deployment directory: ${config.deploymentDir}`);
  console.log(`\n`);

  // Deploy a contract. Each deployStylusContract() call deploys ONE contract
  // (its own tx + address) and, on success, automatically:
  // 1. saves the address/tx to packages/stylus/deployments/
  // 2. runs 'cargo stylus export-abi' and writes the ABI + address into
  //    packages/nextjs/contracts/deployedContracts.ts (keyed by chainId + name),
  //    so the Next.js frontend picks it up immediately.
  await deployStylusContract({
    contract: "your-contract", // folder name under packages/stylus/contracts/
    constructorArgs: [config.deployerAddress!], // omit/empty if the contract has no #[constructor]
    ...deployOptions,
  });
  // ─── Deploying MULTIPLE contracts ─────────────────────────────────────────
  // 1. Scaffold each new contract: yarn new-module <name>
  //    (creates packages/stylus/contracts/<name>/ and auto-registers it via members=["*"])
  // 2. Add one deployStylusContract() call per contract below. They deploy
  //    sequentially in a single 'yarn deploy', and each is auto-added to
  //    deployedContracts.ts. (Stylus deploys one contract per tx/address — there is
  //    no single-tx multi-deploy; 'at once' means one command, not one transaction.)
  //
  // await deployStylusContract({
  //   contract: "counter",
  //   constructorArgs: ["42", config.deployerAddress!, true],
  //   pass your #[constructor] args in order
  //   ...deployOptions,
  // });
  //
  // Deploy the SAME crate again under a different key using 'name':
  // await deployStylusContract({
  //   contract: "your-contract",
  //   name: "your-contract-v2",
  //   constructorArgs: [config.deployerAddress!],
  //   ...deployOptions,
  // });

  // Print the deployed addresses
  console.log("\n\n");
  printDeployedAddresses(config.deploymentDir, config.chain.id.toString());
}
