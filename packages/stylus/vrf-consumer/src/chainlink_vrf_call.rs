use alloc::vec::Vec;
use stylus_sdk::{
    alloy_primitives::{Address, Bytes, U256},
    alloy_sol_types::{sol, SolCall},
    stylus_core::calls::{context::Call, CallAccess},
};

sol!("./src/IVRFV2PlusWrapper.sol");

// Calls "calculateRequestPrice" from Chainlink's IVRFV2PlusWrapper.
pub fn calculate_request_price_native(
    access: &dyn CallAccess,
    addr: Address,
    callback_gas_limit: u32,
    num_words: u32,
) -> Result<U256, Vec<u8>> {
    let call_data = IVRFV2PlusWrapper::calculateRequestPriceNativeCall {
        _callbackGasLimit: callback_gas_limit,
        _numWords: num_words,
    }
    .abi_encode();

    match access.static_call(&Call::new(), addr, &call_data) {
        Ok(data) => {
            if data.len() >= 32 {
                Ok(U256::from_le_slice(&data[..32]))
            } else {
                Err(b"Invalid response length".to_vec())
            }
        }
        Err(e) => Err(e.into()),
    }
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
    let call_data = IVRFV2PlusWrapper::requestRandomWordsInNativeCall {
        _callbackGasLimit: callback_gas_limit,
        _requestConfirmations: request_confirmations,
        _numWords: num_words,
        extraArgs: extra_args,
    }
    .abi_encode();

    match access.call(&Call::new().value(value), addr, &call_data) {
        Ok(data) => {
            if data.len() >= 32 {
                Ok(U256::from_le_slice(&data[..32]))
            } else {
                Err(b"Invalid response length".to_vec())
            }
        }
        Err(e) => Err(e.into()),
    }
}
