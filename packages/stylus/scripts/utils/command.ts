import { spawn } from "child_process";
import { DeploymentConfig, DeployOptions } from "./type";
import { extractGasPriceFromOutput } from "./contract";

export async function buildDeployCommand(
  config: DeploymentConfig,
  deployOptions: DeployOptions,
) {
  let baseCommand = `cargo stylus deploy --endpoint='${config.chain?.rpcUrl}' --private-key='${config.privateKey}'`;

  const constructorArgs =
    deployOptions.constructorArgs && deployOptions.constructorArgs.length > 0
      ? `--constructor-args ${deployOptions.constructorArgs.map((arg) => `'${arg}'`).join(" ")}`
      : "";

  if (deployOptions.estimateGas) {
    return `${baseCommand} --estimate-gas ${constructorArgs}`;
  }

  if (!deployOptions.verify) {
    baseCommand += ` --no-verify`;
  }

  if (deployOptions.maxFee) {
    baseCommand += ` --max-fee-per-gas-gwei=${deployOptions.maxFee}`;
  }

  return `${baseCommand} ${constructorArgs}`;
}

export async function estimateGasPrice(
  config: DeploymentConfig,
  deployOptions: DeployOptions,
): Promise<string> {
  let deployCommand = `cargo stylus deploy --endpoint='${config.chain?.rpcUrl}' --private-key='${config.privateKey}' --no-verify --estimate-gas `;
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
    const outputLines: string[] = [];
    let errorLines: string[] = [];

    // Handle stdout
    if (childProcess.stdout) {
      childProcess.stdout.on("data", (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;
        const newLines = chunk.split("\n");
        outputLines.push(...newLines);
      });
    }

    // Handle stderr
    if (childProcess.stderr) {
      childProcess.stderr.on("data", (data: Buffer) => {
        const chunk = data.toString();
        errorOutput += chunk;
        const newLines = chunk.split("\n");
        errorLines.push(...newLines);
        // Keep only the last 5 lines
        if (errorLines.length > 5) {
          errorLines = errorLines.slice(-5);
        }
      });
    }

    // Handle process completion
    childProcess.on("close", (code: number | null) => {
      if (code === 0) {
        console.log(`\n✅ ${description} completed successfully!`);
        resolve(output);
      } else {
        console.error(`\n❌ ${description} failed with exit code ${code}`);
        // Print error output starting from "project metadata hash computed on deployment" or error patterns, or all logs if not found
        if (errorLines.length > 0) {
          const metadataIndex = errorLines.findIndex((line) =>
            line.includes("project metadata hash computed on deployment"),
          );
          const errorIndex = errorLines.findIndex((line) =>
            line.includes("error["),
          );

          let startIndex = -1;
          if (metadataIndex >= 0) {
            startIndex = metadataIndex;
          } else if (errorIndex >= 0) {
            startIndex = errorIndex;
          }

          if (startIndex >= 0) {
            const linesToPrint = errorLines.slice(startIndex);
            linesToPrint.forEach((line) => {
              if (line.trim()) console.error(line);
            });
          } else {
            errorLines.forEach((line) => {
              if (line.trim()) console.error(line);
            });
          }
        }
        if (errorOutput) {
          console.error(errorOutput);
        }
        reject(
          new Error(
            `Command failed with exit code ${code}. Error output: ${errorOutput}`,
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
