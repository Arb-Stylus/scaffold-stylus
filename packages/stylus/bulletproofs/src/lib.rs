#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
#![cfg_attr(not(any(test, feature = "export-abi")), no_std)]

#[macro_use]
extern crate alloc;

use alloc::vec::Vec;
use alloc::string::String;

/// Import items from the SDK. The prelude contains common traits and macros.
use stylus_sdk::{alloy_primitives::*, prelude::*};

// Define some persistent storage using the Solidity ABI.
// `Counter` will be the entrypoint.
sol_storage! {
    #[entrypoint]
    pub struct Bulletproofs {
        bool flag;
        address addr;
        uint256 u256val;
        int256 i256val;
        bytes32 bytes32val;
        string strval;
        bytes bytesval;
    }
}

/// Declare that `Counter` is a contract with the following external methods.
#[public]
impl Bulletproofs {
    // --- bool ---
    pub fn flag(&self) -> bool {
        self.flag.get()
    }
    pub fn set_flag(&mut self, value: bool) {
        self.flag.set(value);
    }
    // --- address ---
    pub fn addr(&self) -> Address {
        self.addr.get()
    }
    pub fn set_addr(&mut self, value: Address) {
        self.addr.set(value);
    }
    // --- uint256 ---
    pub fn u256val(&self) -> U256 {
        self.u256val.get().into()
    }
    pub fn set_u256val(&mut self, value: U256) {
        self.u256val.set(value);
    }
    // --- int256 ---
    pub fn i256val(&self) -> I256 {
        self.i256val.get()
    }
    pub fn set_i256val(&mut self, value: I256) {
        self.i256val.set(value);
    }
    // --- bytes32 ---
    pub fn bytes32val(&self) -> FixedBytes<32> {
        self.bytes32val.get()
    }
    pub fn set_bytes32val(&mut self, value: FixedBytes<32>) {
        self.bytes32val.set(value);
    }
    // --- string ---
    pub fn strval(&self) -> String {
        self.strval.get_string()
    }
    pub fn set_strval(&mut self, value: String) {
        self.strval.set_str(value);
    }
    // --- bytes ---
    pub fn bytesval(&self) -> Vec<u8> {
        self.bytesval.get_bytes()
    }
    pub fn set_bytesval(&mut self, value: Vec<u8>) {
        self.bytesval.set_bytes(value);
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use stylus_sdk::testing::*;
    use alloc::{vec, string::String};

    #[test]
    fn test_bulletproofs_getters_setters() {
        let vm = TestVM::default();
        let mut contract = Bulletproofs::from(&vm);

        // bool
        contract.set_flag(true);
        assert_eq!(contract.flag(), true);

        // address
        let addr = Address::repeat_byte(0x11);
        contract.set_addr(addr);
        assert_eq!(contract.addr(), addr);

        // uint256
        contract.set_u256val(U256::from(256u64));
        assert_eq!(contract.u256val(), U256::from(256u64));

        // int256
        let int256_val: i128 = -256i128;
        let int256_limbs = [int256_val as u64, ((int256_val >> 64) as u64), 0, 0];
        contract.set_i256val(I256::from_limbs(int256_limbs));
        assert_eq!(contract.i256val(), I256::from_limbs(int256_limbs));

        // bytes32
        let bytes32 = FixedBytes::<32>::repeat_byte(0x42);
        contract.set_bytes32val(bytes32);
        assert_eq!(contract.bytes32val(), bytes32);

        // string
        let s = String::from("hello");
        contract.set_strval(s.clone());
        assert_eq!(contract.strval(), s);

        // bytes
        let b = vec![1u8, 2, 3, 4, 5];
        contract.set_bytesval(b.clone());
        assert_eq!(contract.bytesval(), b);
    }
}
