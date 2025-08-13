#!/usr/bin/env ts-node
/**
 * Stylus Cargo Test Runner
 *
 * This script automatically finds and runs tests for all Cargo projects
 * in the stylus directory that have a Cargo.toml file.
 *
 * Features:
 * - Automatically discovers Cargo projects by looking for Cargo.toml files
 * - Excludes scripts, deployments, and node_modules directories
 * - Runs `cargo test` for each project
 * - Shows real-time output during test execution
 * - Provides a comprehensive summary of test results
 * - Exits with appropriate error codes for CI/CD integration
 *
 * Usage:
 *   npm run test
 *   or
 *   ts-node scripts/test.ts
 */
import { spawn } from "child_process";
import { promises as fs } from "fs";
import * as path from "path";

interface TestResult {
  project: string;
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Execute a command and return a promise with the result
 */
function executeCommand(
  command: string,
  cwd: string,
): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    console.log(`\n🔄 Running tests in ${path.basename(cwd)}...`);
    console.log(`Executing: ${command}`);

    const childProcess = spawn(command, [], {
      cwd,
      shell: true,
      stdio: ["inherit", "pipe", "pipe"],
    });

    let output = "";
    let errorOutput = "";

    // Handle stdout
    if (childProcess.stdout) {
      childProcess.stdout.on("data", (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;
        process.stdout.write(chunk); // Show real-time output
      });
    }

    // Handle stderr
    if (childProcess.stderr) {
      childProcess.stderr.on("data", (data: Buffer) => {
        const chunk = data.toString();
        errorOutput += chunk;
        process.stderr.write(chunk); // Show real-time errors
      });
    }

    // Handle process completion
    childProcess.on("close", (code: number | null) => {
      const success = code === 0;
      if (success) {
        console.log(
          `✅ Tests completed successfully in ${path.basename(cwd)}!`,
        );
      } else {
        console.log(
          `❌ Tests failed in ${path.basename(cwd)} with exit code ${code}`,
        );
      }

      resolve({
        success,
        output,
        ...(errorOutput && { error: errorOutput }),
      });
    });

    // Handle process errors
    childProcess.on("error", (error: Error) => {
      console.error(
        `❌ Error running tests in ${path.basename(cwd)}:`,
        error.message,
      );
      resolve({
        success: false,
        output: "",
        error: error.message,
      });
    });
  });
}

/**
 * Check if a directory contains a Cargo.toml file
 */
async function hasCargoToml(dirPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(dirPath, "Cargo.toml"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Find all Cargo projects in the stylus directory
 */
async function findCargoProjects(): Promise<string[]> {
  const stylusDir = path.resolve(__dirname, "..");
  const cargoProjects: string[] = [];

  try {
    const entries = await fs.readdir(stylusDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirName = entry.name;

        // Skip excluded directories
        if (
          dirName === "scripts" ||
          dirName === "deployments" ||
          dirName === "node_modules"
        ) {
          continue;
        }

        const dirPath = path.join(stylusDir, dirName);

        if (await hasCargoToml(dirPath)) {
          cargoProjects.push(dirPath);
        }
      }
    }
  } catch (error) {
    console.error("Error scanning for Cargo projects:", error);
  }

  return cargoProjects;
}

/**
 * Run tests for all Cargo projects
 */
async function runAllTests(): Promise<void> {
  console.log("🚀 Starting Stylus Cargo Tests...\n");

  const cargoProjects = await findCargoProjects();

  if (cargoProjects.length === 0) {
    console.log("❗ No Cargo projects found with Cargo.toml files.");
    process.exit(1);
  }

  console.log(`Found ${cargoProjects.length} Stylus Contract(s):`);
  cargoProjects.forEach((project) => {
    console.log(`  - ${path.basename(project)}`);
  });
  console.log("");

  const results: TestResult[] = [];

  // Run tests for each project
  for (const projectPath of cargoProjects) {
    const projectName = path.basename(projectPath);

    const result = await executeCommand("cargo test", projectPath);

    results.push({
      project: projectName,
      success: result.success,
      output: result.output,
      ...(result.error && { error: result.error }),
    });
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(60));

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`✅ Successful: ${successful.length}`);
  console.log(`❌ Failed: ${failed.length}`);
  console.log(`📦 Total projects: ${results.length}`);

  if (successful.length > 0) {
    console.log("\n✅ Successful projects:");
    successful.forEach((result) => {
      console.log(`  - ${result.project}`);
    });
  }

  if (failed.length > 0) {
    console.log("\n❌ Failed projects:");
    failed.forEach((result) => {
      console.log(`  - ${result.project}`);
      if (result.error) {
        console.log(`    Error: ${result.error.split("\n")[0]}`);
      }
    });
  }

  // Exit with error code if any tests failed
  if (failed.length > 0) {
    console.log("\n💥 Some tests failed!");
    process.exit(1);
  } else {
    console.log("\n🎉 All tests passed!");
    process.exit(0);
  }
}

// Main execution
if (require.main === module) {
  runAllTests().catch((error) => {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  });
}

export { runAllTests, findCargoProjects };
