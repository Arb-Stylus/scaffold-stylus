//!
//! Random Word Contract in Stylus Rust
//!
//! A smart contract that uses Chainlink VRF to return random words from a predefined list.
//! This is a simplified implementation that demonstrates the concept without complex error handling.
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
    alloy_primitives::{Address, Bytes, U16, U256, U32},
    alloy_sol_types::sol,
    call::Call,
    prelude::*,
    stylus_core::log,
};

// Import error and event interfaces
sol!("./src/IErrors.sol");

// Define contract error types
#[derive(SolidityError)]
pub enum RandomWordError {
    NotSetup(IErrors::ErrNotSetup),
    AlreadySetup(IErrors::ErrAlreadySetup),
    InsufficientPayment(IErrors::ErrNoValue),
    ChainlinkVRFError(IErrors::ErrChainlinkVRF),
    InvalidRequest(IErrors::ErrInvalidRecipient),
}

// Define the RandomWordRequested and Fulfilled events
sol! {
    event RandomWordRequested(address indexed requester, uint256 indexed requestId, uint256 payment);
    event RandomWordFulfilled(address indexed requester, uint256 indexed requestId, uint256 word);
}

sol_interface! {
    interface IVRFV2PlusWrapper {
        function calculateRequestPriceNative(uint32 _callbackGasLimit, uint32 _numWords) external view returns (uint256);
        function requestRandomWordsInNative(uint32 _callbackGasLimit, uint16 _requestConfirmations, uint32 _numWords, bytes calldata extraArgs) external payable returns (uint256 requestId);
        function link() external view returns (address);
        function linkNativeFeed() external view returns (address);
    }
}

// Define persistent storage using the Solidity ABI.
sol_storage! {
    #[entrypoint]
    pub struct RandomWordContract {
        // Chainlink VRF configuration
        address vrf_wrapper;
        uint32 callback_gas_limit;
        uint16 request_confirmations;

        // Contract state
        bool is_setup;

        // Request tracking
        mapping(uint256 => address) request_to_sender;
        mapping(uint256 => uint256) pending_requests;

        // Results storage
        mapping(address => string) last_random_word;
        mapping(address => uint256) user_request_count;
    }
}

/// Declare that `RandomWordContract` is a contract with the following external methods.
#[public]
impl RandomWordContract {
    /// Constructor to initialize the contract
    #[constructor]
    pub fn constructor(
        &mut self,
        vrf_wrapper: Address,
        callback_gas_limit: u32,
        request_confirmations: u16,
    ) -> Result<(), RandomWordError> {
        // Check if already setup
        if self.is_setup.get() {
            return Err(RandomWordError::AlreadySetup(IErrors::ErrAlreadySetup {}));
        }

        // Set up VRF configuration
        self.vrf_wrapper.set(vrf_wrapper);
        self.callback_gas_limit.set(U32::from(callback_gas_limit));
        self.request_confirmations
            .set(U16::from(request_confirmations));

        // Mark as setup
        self.is_setup.set(true);

        Ok(())
    }

    /// Request a random word from Chainlink VRF
    #[payable]
    pub fn request_random_word(&mut self) -> Result<U256, RandomWordError> {
        // Check if contract is setup
        if !self.is_setup.get() {
            return Err(RandomWordError::NotSetup(IErrors::ErrNotSetup {}));
        }

        let sender = self.vm().msg_sender();
        let payment = self.vm().msg_value();

        // For simplicity, we'll use a fixed gas limit and confirmations
        let gas_limit = self.callback_gas_limit.get().try_into().unwrap_or(10000u32);
        let confirmations = self.request_confirmations.get().try_into().unwrap_or(3u16);

        let external_contract = IVRFV2PlusWrapper::new(self.vrf_wrapper.get());
        let config = Call::new_in(self);

        // Calculate required payment
        let required_payment =
            match external_contract.calculate_request_price_native(config, gas_limit, 1) {
                Ok(price) => price,
                Err(e) => {
                    return Err(RandomWordError::ChainlinkVRFError(
                        IErrors::ErrChainlinkVRF {
                            _0: Bytes::from(format!("{:?}", e)),
                        },
                    ))
                }
            };

        // Check payment
        if payment < required_payment {
            return Err(RandomWordError::InsufficientPayment(IErrors::ErrNoValue {}));
        }

        // Request randomness from Chainlink VRF
        let config = Call::new_in(self);
        let request_id = match external_contract.request_random_words_in_native(
            config,
            gas_limit,
            confirmations,
            1,
            Bytes::new(),
        ) {
            Ok(request_id) => request_id,
            Err(e) => {
                return Err(RandomWordError::ChainlinkVRFError(
                    IErrors::ErrChainlinkVRF {
                        _0: Bytes::from(format!("{:?}", e)),
                    },
                ))
            }
        };

        // Store request mapping
        self.request_to_sender.insert(request_id, sender);
        self.pending_requests.insert(request_id, U256::from(1));

        // Increment user request count
        let current_count = self.user_request_count.get(sender);
        self.user_request_count
            .insert(sender, current_count + U256::from(1));

        // Emit event
        log(
            self.vm(),
            RandomWordRequested {
                requester: sender,
                requestId: request_id,
                payment,
            },
        );

        Ok(request_id)
    }

    /// Fulfill randomness callback - called by Chainlink VRF
    pub fn fulfill_random_words(
        &mut self,
        request_id: U256,
        random_words: Vec<U256>,
    ) -> Result<(), RandomWordError> {
        // Check if request exists
        if self.pending_requests.get(request_id) == U256::ZERO {
            return Err(RandomWordError::InvalidRequest(
                IErrors::ErrInvalidRecipient {
                    sender: self.vm().msg_sender(),
                },
            ));
        }

        // Get the original requester
        let requester = self.request_to_sender.get(request_id);

        // Get random word from the list
        if let Some(random_word) = random_words.first() {
            // Remove pending request
            self.pending_requests.insert(request_id, U256::ZERO);

            // Emit fulfillment event
            log(
                self.vm(),
                RandomWordFulfilled {
                    requester,
                    requestId: request_id,
                    word: *random_word,
                },
            );
        }

        Ok(())
    }

    /// Get VRF wrapper address
    pub fn get_vrf_wrapper(&self) -> Address {
        self.vrf_wrapper.get()
    }
}
