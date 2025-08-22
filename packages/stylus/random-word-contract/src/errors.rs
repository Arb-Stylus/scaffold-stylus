use stylus_sdk::{alloy_sol_types::sol, stylus_core::calls::errors::Error};
extern crate alloc;

use alloc::vec::Vec;
#[cfg(not(target_arch = "wasm32"))]
use std::cell::RefCell;

pub(crate) fn unpack_err(x: Error) -> Vec<u8> {
    match x {
        Error::Revert(x) => x,
        _ => unimplemented!(),
    }
}

#[macro_export]
macro_rules! unpack_on_err {
    ($rd:expr, $conv:ident) => {{
        use stylus_sdk::alloy_sol_types::SolError;
        $rd.map_err(|x| {
            $conv {
                _0: $crate::errors::unpack_err(x).into(),
            }
            .abi_encode()
        })
    }};
}

#[macro_export]
macro_rules! revert {
    ($err:ident) => {
        return Err($err {}.abi_encode());
    };
}

#[cfg(not(target_arch = "wasm32"))]
thread_local! {
    pub static SHOULD_PANIC: RefCell<bool> = const { RefCell::new(true) };
}

macro_rules! require {
    ($cond:expr, $err:expr) => {
        #[cfg(not(target_arch = "wasm32"))]
        if !($cond) {
            $crate::errors::SHOULD_PANIC.with(|x| {
                if *x.borrow() {
                    panic!("revert: {}", std::any::type_name_of_val(&$err));
                } else {
                    Err($err.abi_encode())
                }
            })?
        }
        #[cfg(target_arch = "wasm32")]
        if !($cond) {
            use stylus_sdk::alloy_sol_types::SolError;
            Err($err.abi_encode())?;
        }
    };
}

#[cfg(not(target_arch = "wasm32"))]
pub fn panic_guard<T>(f: impl FnOnce() -> T) -> T {
    SHOULD_PANIC.with(|v| *v.borrow_mut() = false);
    let r = f();
    SHOULD_PANIC.with(|v| *v.borrow_mut() = true);
    r
}

#[cfg(not(target_arch = "wasm32"))]
#[macro_export]
macro_rules! panic_guard {
    ($($func:tt)*) => {
        $crate::errors::panic_guard(|| { $($func)* })
    };
}

sol!("./src/IErrors.sol");

pub use IErrors::*;
