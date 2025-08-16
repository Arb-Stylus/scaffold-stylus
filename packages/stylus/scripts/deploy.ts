import deployStylusContract from "./deploy_contract";
import { getDeploymentConfig, printDeployedAddresses } from "./utils/";
import { DeployOptions } from "./utils/type";
import { config as dotenvConfig } from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { arbitrumNitro } from "../../nextjs/utils/scaffold-stylus/supportedChains";

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

  // Deploy a single contract
  await deployStylusContract({
    contract: "your-contract",
    constructorArgs: [config.deployerAddress!],
    ...deployOptions,
  });

  if (
    (config.chain?.id || arbitrumNitro.id) === String(arbitrumSepolia.id) ||
    (config.chain?.id || arbitrumNitro.id) === String(arbitrum.id)
  ) {
    const VRF_WRAPPER_ADDRESS =
      (config.chain?.id || arbitrumSepolia.id) === String(arbitrumSepolia.id)
        ? "0x29576aB8152A09b9DC634804e4aDE73dA1f3a3CC"
        : "0x14632CD5c12eC5875D41350B55e825c54406BaaB";

    console.log(`🔗 Chainlink VRF Wrapper Address: ${VRF_WRAPPER_ADDRESS}`);

    await deployStylusContract({
      contract: "vrf-consumer",
      constructorArgs: [VRF_WRAPPER_ADDRESS, 1000000, 3],
      ...deployOptions,
    });
  } else {
    console.warn("🔗 Chainlink VRF Wrapper Address: Not supported in Devnode");
  }

  /// Deploy your contract with a custom name
  // await deployStylusContract({
  //   contract: "your-contract",
  //   constructorArgs: [config.deployerAddress],
  //   name: "my-contract",
  //   ...deployOptions,
  // });

  // Print the deployed addresses
  console.log("\n\n");
  printDeployedAddresses(config.deploymentDir, config.chain?.id);
}
