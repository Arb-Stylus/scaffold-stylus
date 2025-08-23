//!
//! VRFConsumer in Stylus Rust
//!
//! A smart contract that allows changing a state variable of the contract and tracking the changes
//! It also allows the owner to withdraw the Ether in the contract
//!
//! This is the Stylus Rust equivalent of the Solidity VRFConsumer.
//!

// Allow `cargo stylus export-abi` to generate a main function.
#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
#![cfg_attr(not(any(test, feature = "export-abi")), no_std)]

#[macro_use]
extern crate alloc;

use alloc::vec::Vec;

/// Import items from the SDK. The prelude contains common traits and macros.
use stylus_sdk::{
    alloy_primitives::{Address, U256},
    prelude::*,
};

// Define persistent storage using the Solidity ABI.
// `VRFConsumer` will be the entrypoint.
sol_storage! {
    #[entrypoint]
    pub struct VRFConsumer {

    }
}

sol_interface! {
    interface IDirectFundingConsumer {
        function requestRandomWords(
        bool enableNativePayment
    ) external returns (uint256);
        function getRequestStatus(
        uint256 _requestId
    )
        external
        view
        returns (uint256 paid, bool fulfilled, uint256 randomWord);
        function getLastRequestId() external view returns (uint256);
    }
}

/// Declare that `VRFConsumer` is a contract with the following external methods.
#[public]
impl VRFConsumer {
    /// @param contract_address - The address of the external vrf consumer contract: https://github.com/gianalarcon/vrf-consumer/blob/main/packages/hardhat/contracts/DirectFundingConsumer.sol#L53
    pub fn call_write_request_random_number(
        &mut self,
        contract_address: Address, // 0xeEA5eC3da1ED9b3479Cb2f0834f4FD918eBCfCC2
    ) -> Result<U256, Vec<u8>> {
        let external_contract = IDirectFundingConsumer::new(contract_address);
        let request_id = external_contract.request_random_words(&mut *self, true)?;
        Ok(request_id)
    }

    pub fn call_view_get_request_status(
        &self,
        contract_address: Address,
        request_id: U256,
    ) -> Result<(U256, bool, U256), Vec<u8>> {
        let external_contract = IDirectFundingConsumer::new(contract_address);
        let (paid, fulfilled, random_word) =
            external_contract.get_request_status(self, request_id)?;
        Ok((paid, fulfilled, random_word))
    }

    pub fn call_view_get_last_request_id(
        &self,
        contract_address: Address,
    ) -> Result<U256, Vec<u8>> {
        let external_contract = IDirectFundingConsumer::new(contract_address);
        let last_request_id = external_contract.get_last_request_id(self)?;
        Ok(last_request_id)
    }
}
