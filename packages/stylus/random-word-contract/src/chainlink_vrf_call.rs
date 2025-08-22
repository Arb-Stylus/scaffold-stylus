use stylus_sdk::{
    alloy_primitives::{Address, Bytes, U256},
    alloy_sol_types::{sol, SolCall},
    stylus_core::calls::{context::Call, CallAccess},
};

use crate::errors::*;
extern crate alloc;

use alloc::vec::Vec;
sol!("./src/IVRFV2PlusWrapper.sol");

// Calls "calculateRequestPrice" from Chainlink's IVRFV2PlusWrapper.
pub fn calculate_request_price_native(
    access: &dyn CallAccess,
    addr: Address,
    callback_gas_limit: u32,
    num_words: u32,
) -> Result<U256, Vec<u8>> {
    Ok(U256::from_le_slice(&unpack_on_err!(
        access.static_call(
            &Call::new(),
            addr,
            &IVRFV2PlusWrapper::calculateRequestPriceNativeCall {
                _callbackGasLimit: callback_gas_limit,
                _numWords: num_words,
            }
            .abi_encode()
        ),
        ErrChainlinkVRF
    )?))
}

pub fn request_random_words_in_native(
    access: &dyn CallAccess,
    addr: Address,
    value: U256,
    callback_gas_limit: u32,
    request_confirmations: u16,
    num_words: u32,
    extra_args: Bytes,
) -> Result<U256, Vec<u8>> {
    Ok(U256::from_le_slice(&unpack_on_err!(
        access.call(
            &Call::new().value(value),
            addr,
            &IVRFV2PlusWrapper::requestRandomWordsInNativeCall {
                _callbackGasLimit: callback_gas_limit,
                _requestConfirmations: request_confirmations,
                _numWords: num_words,
                extraArgs: extra_args,
            }
            .abi_encode()
        ),
        ErrChainlinkVRF
    )?))
}
