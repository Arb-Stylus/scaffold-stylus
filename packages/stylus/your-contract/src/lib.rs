//!
//! YourContract in Stylus Rust
//!
//! A smart contract that allows changing a state variable of the contract and tracking the changes
//! It also allows the owner to withdraw the Ether in the contract
//!
//! This is the Stylus Rust equivalent of the Solidity YourContract.
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
    alloy_sol_types::sol,
    prelude::*,
};

// Define the GreetingChange event
sol! {
    event GreetingChange(address indexed greetingSetter, string newGreeting, bool premium, uint256 value);
}

// Define persistent storage using the Solidity ABI.
// `YourContract` will be the entrypoint.
sol_storage! {
    #[entrypoint]
    pub struct YourContract {
        string greeting;
        bool premium;
        uint256 total_counter;
        mapping(address => uint256) user_greeting_counter;
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
        returns (uint256 paid, bool fulfilled, uint256[] memory randomWords);
        function withdrawNative(uint256 amount) external;
    }
}

/// Declare that `VRFConsumer` is a contract with the following external methods.
#[public]
impl YourContract {
    #[constructor]
    pub fn constructor(&mut self) {
        self.greeting.set_str("Building Unstoppable Apps!!!");
        self.premium.set(false);
        self.total_counter.set(U256::ZERO);
        //Ok(())
    }

    pub fn call_view(
        &mut self,
        contract_address: Address, // 0xcdf146AcBA25d0FABaD31E65AbC2a29E6AFc02b5
        request_id: U256, //70393510205840816497009584010130973719387944079749340305195853459117421426717
    ) -> Result<bool, Vec<u8>> {
        let external_contract = IDirectFundingConsumer::new(contract_address);
        //let config = context::Call::new_in(self);
        let result = external_contract.get_request_status(self, request_id)?;
        let fulfilled = result.1;
        Ok(fulfilled)
    }
}
