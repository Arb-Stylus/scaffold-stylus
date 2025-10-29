//!
//! YourContract in Stylus Rust.
//!
//! A smart contract that allows changing a state variable of the contract and tracking the changes.
//! It also allows the owner to withdraw the Ether in the contract.
//!
//! This is the Stylus Rust equivalent of the Solidity YourContract.
//!

// Allow `cargo stylus export-abi` to generate a main function.
#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
#![cfg_attr(not(any(test, feature = "export-abi")), no_std)]

#[macro_use]
extern crate alloc;

use alloc::string::String;
use alloc::vec::Vec;

/// Import items from the SDK. The prelude contains common traits and macros.
use stylus_sdk::{
    alloy_primitives::{Address, U256},
    alloy_sol_types::sol,
    prelude::*,
    stylus_core::log,
};

/// Import OpenZeppelin Ownable functionality
use openzeppelin_stylus::access::ownable::{self, IOwnable, Ownable};

/// Error types for the contract
#[derive(SolidityError, Debug)]
pub enum Error {
    UnauthorizedAccount(ownable::OwnableUnauthorizedAccount),
    InvalidOwner(ownable::OwnableInvalidOwner),
}

impl From<ownable::Error> for Error {
    fn from(value: ownable::Error) -> Self {
        match value {
            ownable::Error::UnauthorizedAccount(e) => Error::UnauthorizedAccount(e),
            ownable::Error::InvalidOwner(e) => Error::InvalidOwner(e),
        }
    }
}

// Define the GreetingChange event
sol! {
    event GreetingChange(address indexed greetingSetter, string newGreeting, bool premium, uint256 value);
}

// Define persistent storage using the Solidity ABI.
// `YourContract` will be the entrypoint.
sol_storage! {
    #[entrypoint]
    pub struct YourContract {
        Ownable ownable;
        string greeting;
        bool premium;
        uint256 total_counter;
        mapping(address => uint256) user_greeting_counter;
    }
}

/// Declare that `YourContract` is a contract with the following external methods.
#[public]
#[implements(IOwnable)]
impl YourContract {
    #[constructor]
    pub fn constructor(&mut self, initial_owner: Address) -> Result<(), Error> {
        // Initialize Ownable with the initial owner using OpenZeppelin pattern
        self.ownable.constructor(initial_owner)?;
        self.greeting.set_str("Building Unstoppable Apps!!!");
        Ok(())
    }

    /// Gets the current greeting
    pub fn greeting(&self) -> String {
        self.greeting.get_string()
    }

    /// Gets the premium status
    pub fn premium(&self) -> bool {
        self.premium.get()
    }

    /// Gets the total counter
    pub fn total_counter(&self) -> U256 {
        self.total_counter.get()
    }

    /// Gets the user greeting counter for a specific address
    pub fn user_greeting_counter(&self, user: Address) -> U256 {
        self.user_greeting_counter.get(user)
    }

    /// Function that allows anyone to change the state variable "greeting" of the contract and increase the counters
    #[payable]
    pub fn set_greeting(&mut self, new_greeting: String) {
        // Change state variables
        self.greeting.set_str(&new_greeting);

        // Increment counters
        let current_total = self.total_counter.get();
        self.total_counter.set(current_total + U256::from(1));

        let sender: Address = self.vm().msg_sender();
        let current_user_count = self.user_greeting_counter.get(sender);
        self.user_greeting_counter
            .insert(sender, current_user_count + U256::from(1));

        // Set premium based on msg.value
        let msg_value = self.vm().msg_value();
        let is_premium = msg_value > U256::ZERO;
        self.premium.set(is_premium);

        // Emit the event
        log(
            self.vm(),
            GreetingChange {
                greetingSetter: sender,
                newGreeting: new_greeting,
                premium: is_premium,
                value: msg_value,
            },
        );
    }

    /// Function that allows the owner to withdraw all the Ether in the contract
    /// The function can only be called by the owner of the contract
    pub fn withdraw(&mut self) -> Result<(), Error> {
        // Check if caller is owner using OpenZeppelin's only_owner
        self.ownable.only_owner()?;

        // Get contract balance and transfer to owner using transfer_eth
        let balance = self.vm().balance(self.vm().contract_address());
        if balance > U256::ZERO {
            let owner = self.ownable.owner();
            let _ = self.vm().transfer_eth(owner, balance);
        }

        Ok(())
    }

    /// Allow contract to receive ETH (equivalent to receive() function)
    #[payable]
    pub fn receive_ether(&self) {
        // This function allows the contract to receive ETH
        // The #[payable] attribute allows it to accept value
    }
}

/// Implementation of the IOwnable interface
#[public]
impl IOwnable for YourContract {
    fn owner(&self) -> Address {
        self.ownable.owner()
    }

    fn transfer_ownership(&mut self, new_owner: Address) -> Result<(), Vec<u8>> {
        Ok(self.ownable.transfer_ownership(new_owner)?)
    }

    fn renounce_ownership(&mut self) -> Result<(), Vec<u8>> {
        Ok(self.ownable.renounce_ownership()?)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use stylus_sdk::testing::*;

    #[no_mangle]
    pub unsafe extern "C" fn emit_log(_pointer: *const u8, _len: usize, _: usize) {}
    #[no_mangle]
    pub unsafe extern "C" fn msg_sender(_sender: *mut u8) {}

    #[test]
    fn test_your_contract() {
        let vm = TestVM::default();
        let mut contract = YourContract::from(&vm);

        // Test initialization
        let owner_addr = Address::from([1u8; 20]);
        let _ = contract.constructor(owner_addr);

        assert_eq!(contract.owner(), owner_addr);
        assert_eq!(contract.greeting(), "Building Unstoppable Apps!!!");
        assert_eq!(contract.premium(), false);
        assert_eq!(contract.total_counter(), U256::ZERO);

        // Test setting greeting without payment
        contract.set_greeting("Hello World".to_string());
        assert_eq!(contract.greeting(), "Hello World");
        assert_eq!(contract.premium(), false);
        assert_eq!(contract.total_counter(), U256::from(1));

        // Test user greeting counter
        let sender = vm.msg_sender();
        assert_eq!(contract.user_greeting_counter(sender), U256::from(1));

        // Test setting greeting with payment
        vm.set_value(U256::from(100));
        contract.set_greeting("Premium Hello".to_string());
        assert_eq!(contract.greeting(), "Premium Hello");
        assert_eq!(contract.premium(), true);
        assert_eq!(contract.total_counter(), U256::from(2));
        assert_eq!(contract.user_greeting_counter(sender), U256::from(2));
    }
}
