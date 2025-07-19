import * as path from "path";
import * as fs from "fs";
import {
  getDeploymentConfig,
  ensureDeploymentDirectory,
  executeCommand,
  generateTsAbi,
  handleSolcError,
  generateContractAddress,
  extractDeployedAddress
} from "./utils";

export default async function deployStylusContract() {
  console.log("🚀 Starting Stylus contract deployment...");

  const config = getDeploymentConfig();

  // Generate contract address as fallback
  const fallbackAddress = generateContractAddress();
  config.contractAddress = fallbackAddress;
  console.log(`📋 Generated fallback contract address: ${config.contractAddress}`);

  console.log(`📡 Using endpoint: ${config.endpoint}`);
  if (config.network) {
    console.log(`🌐 Network specified: ${config.network}`);
  }
  console.log(`🔑 Using private key: ${config.privateKey.substring(0, 10)}...`);
  console.log(`📄 Contract name: ${config.contractName}`);
  console.log(`📁 Deployment directory: ${config.deploymentDir}`);

  try {
    // Ensure deployment directory exists
    ensureDeploymentDirectory(config.deploymentDir);

    // Step 1: Deploy the contract using cargo stylus with contract address
    // --contract-address='${config.contractAddress}' deactivated for now as it's not working. Issue https://github.com/OffchainLabs/cargo-stylus/issues/171
    const deployCommand = `cargo stylus deploy --endpoint='${config.endpoint}' --private-key='${config.privateKey}' --no-verify`;
    const deployOutput = await executeCommand(
      deployCommand,
      path.resolve(__dirname, ".."),
      "Deploying contract with cargo stylus",
    );

    // Extract the actual deployed address from the output
    const deployedAddress = extractDeployedAddress(deployOutput);
    if (deployedAddress) {
      config.contractAddress = deployedAddress;
      console.log(`📋 Contract deployed at address: ${config.contractAddress}`);
    } else {
      console.log(`📋 Using fallback address: ${config.contractAddress}`);
    }

    // Step 2: Export ABI
    try {
      const exportCommand = `cargo stylus export-abi --output='${config.deploymentDir}/${config.contractName}.txt' --json`;
      await executeCommand(exportCommand, path.resolve(__dirname, ".."), "Exporting ABI");

      console.log("\n🎉 Deployment completed successfully!");
      console.log(`📄 ABI file location: ${config.deploymentDir}/${config.contractName}.txt`);

      // Verify the ABI file was created
      const abiFilePath = path.resolve(__dirname, "..", config.deploymentDir, `${config.contractName}.txt`);
      if (fs.existsSync(abiFilePath)) {
        console.log(`✅ ABI file verified at: ${abiFilePath}`);
      } else {
        console.warn(`⚠️  ABI file not found at expected location: ${abiFilePath}`);
      }

      // Step 3: Generate Ts ABI
      await generateTsAbi(abiFilePath, config.contractName, config.contractAddress);
    } catch (exportError) {
      handleSolcError(exportError as Error, "ABI export during deployment");
      console.error("\n✅ Contract deployment was successful, but ABI export failed.");
      console.error("   You can export the ABI later using the export-abi script.");
      console.error("\n⚠️  Deployment completed but ABI export failed. You can retry ABI export later.");
    }

  } catch (error) {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  }
}

// Allow running this file directly
if (require.main === module) {
  // generateTsAbi(path.resolve(__dirname, "..", "deployments", "stylus-hello-world.txt"), "stylus-hello-world", "0x525c2aba45f66987217323e8a05ea400c65d06dc");

  deployStylusContract().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
