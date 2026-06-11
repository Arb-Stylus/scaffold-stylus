#!/bin/bash

if [ -z "$1" ]; then
    echo "Error: Module name is required"
    echo "Usage: $0 <module_name>"
    exit 1
fi

MODULE_NAME="$1"
MODULE_NAME_UNDERSCORE=$(echo "$MODULE_NAME" | tr '-' '_')
# Convert underscore_separated to PascalCase (e.g. counter_test -> CounterTest)
MODULE_NAME_PASCAL=$(echo "$MODULE_NAME_UNDERSCORE" | perl -pe 's/(^|_)(.)/\u$2/g')

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../contracts" && pwd)"
MODULE_DIR="$WORKSPACE_ROOT/$MODULE_NAME"

if [ -d "$MODULE_DIR" ]; then
    echo "Error: Directory '$MODULE_NAME' already exists"
    exit 1
fi

echo "Creating new workspace member: $MODULE_NAME"

mkdir -p "$MODULE_DIR/src"
mkdir -p "$MODULE_DIR/.cargo"

# Write .cargo/config.toml
cat > "$MODULE_DIR/.cargo/config.toml" << 'CONFIGEOF'
[target.wasm32-unknown-unknown]
rustflags = [
  "-C", "link-arg=-zstack-size=32768",
  "-C", "target-feature=-reference-types",
  "-C", "target-feature=+bulk-memory",
]

[target.aarch64-apple-darwin]
rustflags = [
"-C", "link-arg=-undefined",
"-C", "link-arg=dynamic_lookup",
]

[target.x86_64-apple-darwin]
rustflags = [
"-C", "link-arg=-undefined",
"-C", "link-arg=dynamic_lookup",
]
CONFIGEOF

# Write Cargo.toml
cat > "$MODULE_DIR/Cargo.toml" << CARGOEOF
[package]
name = "$MODULE_NAME"
version = "0.1.0"
edition = "2021"
license = "MIT OR Apache-2.0"
keywords = ["arbitrum", "ethereum", "stylus", "alloy"]
description = "Stylus contract scaffolded by scaffold-stylus"

[dependencies]
alloy-primitives = "=0.8.20"
alloy-sol-types = "=0.8.20"
stylus-sdk = "0.9.0"
hex = { version = "0.4", default-features = false }
openzeppelin-stylus = "0.3.0"

[dev-dependencies]
alloy-primitives = { version = "=0.8.20", features = ["sha3-keccak"] }
tokio = { version = "1.12.0", features = ["full"] }
ethers = "2.0"
eyre = "0.6.8"
stylus-sdk = { version = "0.9.0", features = ["stylus-test"] }

[features]
default = ["mini-alloc"]
export-abi = ["openzeppelin-stylus/export-abi"]
debug = ["stylus-sdk/debug"]
mini-alloc = ["stylus-sdk/mini-alloc"]

[[bin]]
name = "$MODULE_NAME"
path = "src/main.rs"

[lib]
crate-type = ["lib", "cdylib"]
CARGOEOF

# Write src/lib.rs
cat > "$MODULE_DIR/src/lib.rs" << LIBEOF
#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
#![cfg_attr(not(any(test, feature = "export-abi")), no_std)]

#[macro_use]
extern crate alloc;

use alloc::vec::Vec;
use stylus_sdk::{alloy_primitives::U256, prelude::*};

sol_storage! {
    #[entrypoint]
    pub struct $MODULE_NAME_PASCAL {
        uint256 number;
    }
}

#[public]
impl $MODULE_NAME_PASCAL {
    pub fn number(&self) -> U256 {
        self.number.get()
    }

    pub fn set_number(&mut self, new_number: U256) {
        self.number.set(new_number);
    }
}
LIBEOF

# Write src/main.rs
cat > "$MODULE_DIR/src/main.rs" << MAINEOF
#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]

#[cfg(not(any(test, feature = "export-abi")))]
#[no_mangle]
pub extern "C" fn main() {}

#[cfg(feature = "export-abi")]
fn main() {
    ${MODULE_NAME_UNDERSCORE}::print_from_args();
}
MAINEOF

# Write Stylus.toml
cat > "$MODULE_DIR/Stylus.toml" << STYLUSEOF
[contract]
name = "$MODULE_NAME"
STYLUSEOF

echo "New workspace member '$MODULE_NAME' created successfully"
echo ""
echo "Next steps:"
echo "  1. Write your contract logic in $MODULE_NAME/src/lib.rs"
echo "  2. Deploy: yarn deploy --network sepolia --contract $MODULE_NAME"
echo ""
echo "Note: members=['*'] in contracts/Cargo.toml auto-discovers new modules — no manual wiring needed."
