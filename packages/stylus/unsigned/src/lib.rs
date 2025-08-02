#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
#![cfg_attr(not(any(test, feature = "export-abi")), no_std)]

#[macro_use]
extern crate alloc;

use alloc::vec::Vec;

/// Import items from the SDK. The prelude contains common traits and macros.
use stylus_sdk::{alloy_primitives::*, prelude::*};

// Define some persistent storage using the Solidity ABI.
// `Counter` will be the entrypoint.
sol_storage! {
    #[entrypoint]
    pub struct Unsigned {
        uint8 u8val;
        uint16 u16val;
        uint32 u32val;
        uint64 u64val;
        uint128 u128val;
        uint256 u256val;
    }
}

/// Declare that `Counter` is a contract with the following external methods.
#[public]
impl Unsigned {
    // --- uint8 ---
    pub fn u8val(&self) -> U8 {
        self.u8val.get()
    }
    pub fn set_u8val(&mut self, value: U8) {
        self.u8val.set(value);
    }
    // --- uint16 ---
    pub fn u16val(&self) -> U16 {
        self.u16val.get()
    }
    pub fn set_u16val(&mut self, value: U16) {
        self.u16val.set(value);
    }
    // --- uint32 ---
    pub fn u32val(&self) -> U32 {
        self.u32val.get()
    }
    pub fn set_u32val(&mut self, value: U32) {
        self.u32val.set(value);
    }
    // --- uint64 ---
    pub fn u64val(&self) -> U64 {
        self.u64val.get()
    }
    pub fn set_u64val(&mut self, value: U64) {
        self.u64val.set(value);
    }
    // --- uint128 ---
    pub fn u128val(&self) -> U128 {
        self.u128val.get()
    }
    pub fn set_u128val(&mut self, value: U128) {
        self.u128val.set(value);
    }
    // --- uint256 ---
    pub fn u256val(&self) -> U256 {
        self.u256val.get()
    }
    pub fn set_u256val(&mut self, value: U256) {
        self.u256val.set(value);
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use stylus_sdk::testing::*;

    #[test]
    fn test_unsigned_getters_setters() {
        let vm = TestVM::default();
        let mut contract = Unsigned::from(&vm);

        // uint8
        let uint8_val: u8 = 8u8;
        contract.set_u8val(U8::from_limbs([uint8_val as u64]));
        assert_eq!(contract.u8val(), U8::from_limbs([uint8_val as u64]));

        // uint16
        let uint16_val: u16 = 16u16;
        contract.set_u16val(U16::from_limbs([uint16_val as u64]));
        assert_eq!(contract.u16val(), U16::from_limbs([uint16_val as u64]));

        // uint32
        let uint32_val: u32 = 32u32;
        contract.set_u32val(U32::from_limbs([uint32_val as u64]));
        assert_eq!(contract.u32val(), U32::from_limbs([uint32_val as u64]));

        // uint64
        let uint64_val: u64 = 64u64;
        contract.set_u64val(U64::from_limbs([uint64_val as u64]));
        assert_eq!(contract.u64val(), U64::from_limbs([uint64_val as u64]));

        // uint128
        let uint128_val: u128 = 128u128;
        contract.set_u128val(U128::from_limbs([uint128_val as u64, (uint128_val >> 64) as u64]));
        assert_eq!(contract.u128val(), U128::from_limbs([uint128_val as u64, (uint128_val >> 64) as u64]));

        // uint256
        let uint256_val: u128 = 256u128;
        let uint256_limbs = [uint256_val as u64, ((uint256_val >> 64) as u64), 0, 0];
        contract.set_u256val(U256::from_limbs(uint256_limbs));
        assert_eq!(contract.u256val(), U256::from_limbs(uint256_limbs));
    }
}
