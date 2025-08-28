//!
//! DirectFundingConsumer in Stylus Rust
//!
//! A VRF consumer contract that requests randomness from Chainlink VRF V2+ wrapper
//! using native tokens (ETH) for payment.
//!
//! This is the Stylus Rust equivalent of the Solidity DirectFundingConsumer.
//!

// Allow `cargo stylus export-abi` to generate a main function.
#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
#![cfg_attr(not(any(test, feature = "export-abi")), no_std)]

#[macro_use]
extern crate alloc;

use alloc::vec::Vec;

/// Import items from the SDK. The prelude contains common traits and macros.
use stylus_sdk::{
    alloy_primitives::{Address, Bytes, U16, U256, U32},
    //stylus_core::calls::context::Call,
    call::Call, // Import Call from stylus_sdk::call, not from prelude
    msg,
    prelude::*,
};

// Define the RequestStatus struct
//#[derive(SolidityType)]
// pub struct RequestStatus {
//     pub paid: U256,
//     pub fulfilled: bool,
//     pub random_words: Vec<U256>,
// }

// Define persistent storage using the Solidity ABI.
sol_storage! {
    #[entrypoint]
    pub struct DirectFundingConsumer {
        address i_vrf_v2_plus_wrapper;
        mapping(uint256 => uint256) s_requests_paid;
        mapping(uint256 => uint256) s_requests_value; // store random word returned
        mapping(uint256 => bool) s_requests_fulfilled; // store if request was fulfilled (needed as the transaction may have failed)
        uint256[] request_ids;
        uint256 last_request_id;
        uint32 callback_gas_limit;
        uint16 request_confirmations;
        uint32 num_words;
    }
}

// Define the VRF V2+ Wrapper interface
sol_interface! {
    interface IVRFV2PlusWrapper {
        function calculateRequestPriceNative(uint32 _callbackGasLimit, uint32 _numWords) external view returns (uint256);
        function requestRandomWordsInNative(
            uint32 _callbackGasLimit,
            uint16 _requestConfirmations,
            uint32 _numWords,
            bytes calldata _extraArgs
        ) external payable returns (uint256 requestId);
    }
}

// // Define events
// sol_interface! {
//     event RequestSent(uint256 indexed requestId, uint32 numWords);
//     event RequestFulfilled(uint256 indexed requestId, uint256[] randomWords, uint256 payment);
//     event Received(address indexed sender, uint256 value);
// }

// // Define custom errors
// sol_interface! {
//     error OnlyVRFWrapperCanFulfill(address have, address want);
//     error RequestNotFound();
//     error WithdrawNativeFailed();
// }

/// Declare that `DirectFundingConsumer` is a contract with the following external methods.
#[public]
impl DirectFundingConsumer {
    /// Constructor - initializes the contract with VRF wrapper address
    #[constructor]
    pub fn constructor(&mut self, vrf_v2_plus_wrapper: Address) -> Result<(), Vec<u8>> {
        self.i_vrf_v2_plus_wrapper.set(vrf_v2_plus_wrapper);
        self.callback_gas_limit.set(U32::from(100000));
        self.request_confirmations.set(U16::from(3));
        self.num_words.set(U32::from(1));
        Ok(())
    }

    /// Internal function to request randomness paying in native tokens
    fn request_randomness_pay_in_native(
        &mut self,
        callback_gas_limit: u32,
        request_confirmations: u16,
        num_words: u32,
    ) -> Result<(U256, U256), Vec<u8>> {
        let wrapper_address = self.i_vrf_v2_plus_wrapper.get();

        let wrapper = IVRFV2PlusWrapper::new(wrapper_address);

        // Calculate request price
        let request_price =
            wrapper.calculate_request_price_native(&mut *self, callback_gas_limit, num_words)?;

        // Encode extra args according to VRFV2PlusClient._argsToBytes()
        // For native payment, we need proper extra args encoding
        let mut extra_args_vec = Vec::new();
        extra_args_vec.extend_from_slice(&[0x92, 0xfd, 0x13, 0x38]); // EXTRA_ARGS_V1_TAG
        extra_args_vec.extend_from_slice(&[0x00; 28]); // Padding for struct alignment
        extra_args_vec.extend_from_slice(&[0x00, 0x00, 0x00, 0x01]); // nativePayment: true
        extra_args_vec.extend_from_slice(&[0x00; 28]); // Final padding
        let extra_args = Bytes::from(extra_args_vec);

        let config = Call::new().value(request_price);

        // Request random words
        let request_id = wrapper.request_random_words_in_native(
            config,
            callback_gas_limit,
            request_confirmations,
            num_words,
            extra_args,
        )?;

        Ok((request_id, request_price))
    }

    /// Public function to request random words
    //#[payable]
    pub fn request_random_words(&mut self) -> Result<U256, Vec<u8>> {
        let callback_gas_limit = self.callback_gas_limit.get().try_into().unwrap_or(100000);
        let request_confirmations = self.request_confirmations.get().try_into().unwrap_or(3);
        let num_words = self.num_words.get().try_into().unwrap_or(1);

        let (request_id, req_price) = self.request_randomness_pay_in_native(
            callback_gas_limit,
            request_confirmations,
            num_words,
        )?;

        // Store request status
        // let random_word = U256::ZERO;
        // self.s_requests_value.insert(request_id, random_word);
        self.s_requests_fulfilled.insert(request_id, false);
        self.s_requests_paid.insert(request_id, req_price);

        // Add to request IDs array and update last request ID
        self.request_ids.push(request_id);
        self.last_request_id.set(request_id);

        // // Emit event
        // evm::log(RequestSent {
        //     requestId: request_id,
        //     numWords: U256::from(num_words),
        // });

        Ok(request_id)
    }

    /// Internal function to fulfill random words
    fn fulfill_random_words(
        &mut self,
        request_id: U256,
        random_words: Vec<U256>,
    ) -> Result<(), Vec<u8>> {
        let paid_amount = self.s_requests_paid.get(request_id);

        if paid_amount == U256::ZERO {
            return Err(alloc::vec![]);
        }

        //request_status.fulfilled = true;
        self.s_requests_fulfilled.insert(request_id, true);

        if !random_words.is_empty() {
            self.s_requests_value.insert(request_id, random_words[0]);
        }

        // // Emit event
        // evm::log(RequestFulfilled {
        //     requestId: request_id,
        //     randomWords: random_words,
        //     payment: paid_amount,
        // });

        Ok(())
    }

    /// External function called by VRF wrapper to fulfill randomness
    pub fn raw_fulfill_random_words(
        &mut self,
        request_id: U256,
        random_words: Vec<U256>,
    ) -> Result<(), Vec<u8>> {
        //let vrf_wrapper_addr = self.i_vrf_v2_plus_wrapper.get();

        // if msg::sender() != vrf_wrapper_addr {
        //     return Err(OnlyVRFWrapperCanFulfill {
        //         have: msg::sender(),
        //         want: vrf_wrapper_addr,
        //     }
        //     .encode());
        // }

        self.fulfill_random_words(request_id, random_words)
    }

    /// Get the status of a randomness request
    pub fn get_request_status(&self, request_id: U256) -> Result<(U256, bool, U256), Vec<u8>> {
        let paid = self.s_requests_paid.get(request_id);

        if paid == U256::ZERO {
            return Err(alloc::vec![]);
        }

        let fulfilled = self.s_requests_fulfilled.get(request_id);
        let random_word = if fulfilled {
            self.s_requests_value.get(request_id)
        } else {
            U256::ZERO
        };

        Ok((paid, fulfilled, random_word))
    }

    /// Get the last request ID
    pub fn get_last_request_id(&self) -> U256 {
        self.last_request_id.get()
    }

    // /// Get the native balance of the contract
    // pub fn get_balance(&self) -> U256 {
    //     contract::balance()
    // }

    // /// Withdraw native tokens
    pub fn withdraw_native(&mut self, amount: U256) -> Result<(), Vec<u8>> {
        let recipient = msg::sender();

        // Transfer the amount
        stylus_sdk::call::transfer_eth(recipient, amount)?;

        Ok(())
    }

    // // Getter functions for configuration
    // pub fn callback_gas_limit(&self) -> u32 {
    //     self.callback_gas_limit.get().try_into().unwrap_or(100000)
    // }

    // pub fn request_confirmations(&self) -> u16 {
    //     self.request_confirmations.get().try_into().unwrap_or(3)
    // }

    // pub fn num_words(&self) -> u32 {
    //     self.num_words.get().try_into().unwrap_or(1)
    // }

    pub fn i_vrf_v2_plus_wrapper(&self) -> Address {
        self.i_vrf_v2_plus_wrapper.get()
    }

    /// Get request IDs array (for querying)
    pub fn get_request_ids(&self) -> Vec<U256> {
        let mut result = Vec::new();
        for i in 0..self.request_ids.len() {
            result.push(self.request_ids.get(i).unwrap_or(U256::ZERO));
        }
        result
    }

    /// Receive function equivalent - handles incoming ETH
    #[receive]
    #[payable]
    pub fn receive(&mut self) -> Result<(), Vec<u8>> {
        // evm::log(Received {
        //     sender: msg::sender(),
        //     value: msg::value(),
        // });
        Ok(())
    }
}
