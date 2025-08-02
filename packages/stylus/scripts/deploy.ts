import deployStylusContract from "./deploy_contract";
import { getDeploymentConfig, printDeployedAddresses } from "./utils/";
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

  console.log(`📡 Using endpoint: ${config.chain?.rpcUrl}`);
  if (config.chain) {
    console.log(`🌐 Network: ${config.chain?.name}`);
    console.log(`🔗 Chain ID: ${config.chain?.id}`);
  }
  console.log(`🔑 Using private key: ${config.privateKey.substring(0, 10)}...`);
  console.log(`📁 Deployment directory: ${config.deploymentDir}`);
  console.log(`\n`);

  await deployStylusContract({
    contract: "your-contract",
    constructorArgs: [config.deployerAddress!],
    ...deployOptions,
  });

  await deployStylusContract({
    contract: "bulletproofs",
    ...deployOptions,
  });

  await deployStylusContract({
    contract: "counter",
    ...deployOptions,
  });

  await deployStylusContract({
    contract: "signed",
    ...deployOptions,
  });

  await deployStylusContract({
    contract: "unsigned",
    ...deployOptions,
  });

  // Print the deployed addresses
  console.log("\n\n");
  printDeployedAddresses(config.deploymentDir, config.chain?.id);
}
