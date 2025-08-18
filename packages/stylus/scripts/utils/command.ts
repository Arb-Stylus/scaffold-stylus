import { spawn } from "child_process";
import { DeploymentConfig, DeployOptions } from "./type";
import {
  extractGasPriceFromOutput,
  isContractHasConstructor,
} from "./contract";
import { getRpcUrlFromChain } from "./network";

export async function buildDeployCommand(
  config: DeploymentConfig,
  deployOptions: DeployOptions,
) {
  let baseCommand = `cargo stylus deploy --endpoint='${getRpcUrlFromChain(config.chain)}' --private-key='${config.privateKey}'`;

  if (deployOptions.estimateGas) {
    return `${baseCommand} --estimate-gas`;
  }

  if (deployOptions.maxFee) {
    baseCommand += ` --max-fee-per-gas-gwei=${deployOptions.maxFee}`;
  }

  if (!deployOptions.verify) {
    baseCommand += ` --no-verify`;
  } else {
    if (
      deployOptions.constructorArgs &&
      deployOptions.constructorArgs.length > 0 &&
      isContractHasConstructor(config.contractFolder)
    ) {
      throw new Error(
        "Verification is not currently supported with constructors. Please implement and use initialize() function to initialize your contracts: Refer to readme.md for tutorial",
      );
    }
  }

  if (
    deployOptions.constructorArgs &&
    deployOptions.constructorArgs.length > 0 &&
    !deployOptions.isOrbit
  ) {
    baseCommand += ` --constructor-args ${deployOptions.constructorArgs.map((arg) => `"${arg}"`).join(" ")} `;
  }

  return baseCommand;
}

export async function estimateGasPrice(
  config: DeploymentConfig,
  deployOptions: DeployOptions,
): Promise<string> {
  let deployCommand = `cargo stylus deploy --endpoint='${getRpcUrlFromChain(config.chain)}' --private-key='${config.privateKey}' --no-verify --estimate-gas `;
  if (deployOptions.constructorArgs) {
    deployCommand += ` --constructor-args='${deployOptions.constructorArgs.join(" ")}'`;
  }
  const deployOutput = await executeCommand(
    deployCommand,
    config.contractName,
    "Estimating gas price with cargo stylus",
  );
  const gasPrice = extractGasPriceFromOutput(deployOutput);
  if (gasPrice) {
    return gasPrice;
  }
  return "0";
}

export function executeCommand(
  command: string,
  cwd: string,
  description: string,
): Promise<string> {
  console.log(`\n🔄 ${description}...`);
  // Sanitize command to hide private key (create a copy to avoid modifying original)
  const sanitizedCommand = command.slice();
  console.log(
    `Executing: ${sanitizedCommand.replace(/--private-key=[^\s]+/g, "--private-key=***")}`,
  );

  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, [], {
      cwd,
      shell: true,
      stdio: ["inherit", "pipe", "pipe"],
    });

    let output = "";
    let errorOutput = "";
    let errorLines: string[] = [];

    // Handle stdout
    if (childProcess.stdout) {
      childProcess.stdout.on("data", (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;
      });
    }

    // Handle stderr
    if (childProcess.stderr) {
      childProcess.stderr.on("data", (data: Buffer) => {
        const chunk = data.toString();
        errorOutput += chunk;
        const newLines = chunk.split("\n");
        errorLines.push(...newLines);
        // Keep only the last 20 lines, just for safety
        if (errorLines.length > 20) {
          errorLines = errorLines.slice(-20);
        }
      });
    }

    // Handle process completion
    childProcess.on("close", (code: number | null) => {
      // this can extract and detect errors from docker logs because it not throw error code
      const errors = extractErrorLines(errorLines);

      if (code === 0 && !errors) {
        console.log(`\n✅ ${description} completed successfully!`);
        resolve(output);
      } else {
        console.error(`\n❌ ${description} failed with exit code ${code}`);
        // Print error output starting from "project metadata hash computed on deployment" or error patterns, or all logs if not found
        if (errors) {
          console.error(errors);
          if (
            !command.includes("--no-verify") &&
            errors.includes("mismatch number of constructor arguments")
          ) {
            errorOutput += `\nCan not verify contract with constructor arguments.\n`;
          }
        }

        reject(
          new Error(
            `Command failed with exit code ${code}. Error output: \n${errorOutput}`,
          ),
        );
      }
    });

    // Handle process errors
    childProcess.on("error", (error: Error) => {
      console.error(`\n❌ ${description} failed:`, error);
      reject(error);
    });
  });
}

function extractErrorLines(errorLines: string[]): string | null {
  let output: string = "";
  if (errorLines.length > 0) {
    const metadataIndex = errorLines.findIndex((line) =>
      line.includes("project metadata hash computed on deployment"),
    );
    const errorIndex = errorLines.findIndex(
      (line) =>
        line.toLowerCase().includes("error[") ||
        line.toLowerCase().includes("error:"),
    );

    let startIndex = -1;
    if (metadataIndex >= 0) {
      startIndex = metadataIndex;
    } else if (errorIndex >= 0) {
      startIndex = errorIndex;
    }

    if (startIndex === -1) {
      return null;
    }

    const linesToPrint = errorLines.slice(startIndex);
    linesToPrint.forEach((line) => {
      if (line.trim()) output += line + "\n";
    });
    return output;
  }
  return null;
}
