import * as path from "path";
import * as fs from "fs";
import {
  getExportConfig,
  ensureDeploymentDirectory,
  executeCommand,
  generateTsAbi,
  handleSolcError,
} from "./utils/";

export async function exportStylusAbi(
  contractFolder: string,
  contractName: string,
  isScript: boolean = true,
  chainId?: string,
) {
  console.log("📄 Starting Stylus ABI export...");

  // Resolve the actual filesystem path (contracts live under contracts/)
  const fsPath = path.join("contracts", contractFolder);
  const config = getExportConfig(fsPath, contractName, chainId);

  if (!config.contractAddress) {
    console.error(
      `❌ Contract address not found. Please deploy the contract first or ensure it is saved in a chain-specific deployment file in ${config.deploymentDir}`,
    );
    process.exit(1);
  }

  if (isScript) {
    console.log(`📄 Contract name: ${config.contractName}`);
    console.log(`📁 Deployment directory: ${config.deploymentDir}`);
    console.log(`📍 Contract address: ${config.contractAddress}`);
    console.log(`🔗 Chain ID: ${config.chainId}`);
  }

  try {
    ensureDeploymentDirectory(config.deploymentDir);

    // Export ABI
    // cwd is now contracts/<contract>/, so ../../ reaches packages/stylus/
    const exportCommand = `cargo stylus export-abi --output='../../${config.deploymentDir}/${config.contractFolder}' --json`;
    await executeCommand(exportCommand, fsPath, "Exporting ABI");

    console.log(
      `📄 ABI file location: ${config.deploymentDir}/${config.contractFolder}`,
    );

    const abiFilePath = path.resolve(
      config.deploymentDir,
      `${config.contractFolder}`,
    );
    if (fs.existsSync(abiFilePath)) {
      console.log(`✅ ABI file verified at: ${abiFilePath}`);
    } else {
      console.warn(
        `⚠️  ABI file not found at expected location: ${abiFilePath}`,
      );
    }

    // do not Generate TypeScript ABI when called from yarn script
    if (!isScript) {
      await generateTsAbi(
        abiFilePath,
        config.contractName,
        config.contractAddress,
        config.txHash,
        config.chainId,
      );
    }
  } catch (error) {
    handleSolcError(error as Error);
    process.exit(1);
  }
}

if (require.main === module) {
  // Get contract folder from command line args, default to 'your-contract'
  const rawContract = process.argv[2] || "your-contract";
  const contractFolder = path.join("contracts", rawContract);
  if (!fs.existsSync(contractFolder)) {
    console.error(`❌ Contract folder does not exist: ${contractFolder}`);
    process.exit(1);
  }
  exportStylusAbi(rawContract, rawContract).catch(
    (error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    },
  );
}
