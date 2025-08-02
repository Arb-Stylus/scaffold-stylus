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
    pub struct Signed {
        int8 i8val;
        int16 i16val;
        int32 i32val;
        int64 i64val;
        int128 i128val;
        int256 i256val;
    }
}

/// Declare that `Counter` is a contract with the following external methods.
#[public]
impl Signed {
    // --- int8 ---
    pub fn i8val(&self) -> I8 {
        self.i8val.get()
    }
    pub fn set_i8val(&mut self, value: I8) {
        self.i8val.set(value);
    }
    // --- int16 ---
    pub fn i16val(&self) -> I16 {
        self.i16val.get()
    }
    pub fn set_i16val(&mut self, value: I16) {
        self.i16val.set(value);
    }
    // --- int32 ---
    pub fn i32val(&self) -> I32 {
        self.i32val.get()
    }
    pub fn set_i32val(&mut self, value: I32) {
        self.i32val.set(value);
    }
    // --- int64 ---
    pub fn i64val(&self) -> I64 {
        self.i64val.get()
    }
    pub fn set_i64val(&mut self, value: I64) {
        self.i64val.set(value);
    }
    // --- int128 ---
    pub fn i128val(&self) -> I128 {
        self.i128val.get()
    }
    pub fn set_i128val(&mut self, value: I128) {
        self.i128val.set(value);
    }
    // --- int256 ---
    pub fn i256val(&self) -> I256 {
        self.i256val.get()
    }
    pub fn set_i256val(&mut self, value: I256) {
        self.i256val.set(value);
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use stylus_sdk::testing::*;

    #[test]
    fn test_signed_getters_setters() {
        let vm = TestVM::default();
        let mut contract = Signed::from(&vm);

        // int8
        let int8_val: i8 = -8i8;
        contract.set_i8val(I8::from_limbs([int8_val as u64]));
        assert_eq!(contract.i8val(), I8::from_limbs([int8_val as u64]));

        // int16
        let int16_val: i16 = -16i16;
        contract.set_i16val(I16::from_limbs([int16_val as u64]));
        assert_eq!(contract.i16val(), I16::from_limbs([int16_val as u64]));

        // int32
        let int32_val: i32 = -32i32;
        contract.set_i32val(I32::from_limbs([int32_val as u64]));
        assert_eq!(contract.i32val(), I32::from_limbs([int32_val as u64]));

        // int64
        let int64_val: i64 = -64i64;
        contract.set_i64val(I64::from_limbs([int64_val as u64]));
        assert_eq!(contract.i64val(), I64::from_limbs([int64_val as u64]));

        // int128
        let int128_val: i128 = -128i128;
        contract.set_i128val(I128::from_limbs([int128_val as u64, (int128_val >> 64) as u64]));
        assert_eq!(contract.i128val(), I128::from_limbs([int128_val as u64, (int128_val >> 64) as u64]));

        // int256
        let int256_val: i128 = -256i128;
        let int256_limbs = [int256_val as u64, ((int256_val >> 64) as u64), 0, 0];
        contract.set_i256val(I256::from_limbs(int256_limbs));
        assert_eq!(contract.i256val(), I256::from_limbs(int256_limbs));
    }
}
