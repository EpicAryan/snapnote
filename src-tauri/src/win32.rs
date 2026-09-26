//! Thin Win32 calls where tao's own bookkeeping is not reliable enough.
//!
//! tao answers `is_maximized()` from a flag it updates on WM_SIZE, but it emits `Moved` from
//! WM_WINDOWPOSCHANGED first. During the move event of a maximize the flag still says "not
//! maximized" while the window already has the maximized rectangle, so anything that trusts
//! the flag at that moment records the wrong "normal" size. `IsZoomed` asks Windows instead.

#[cfg(windows)]
pub fn is_zoomed(hwnd: *mut std::ffi::c_void) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::IsZoomed;
    unsafe { IsZoomed(hwnd as _) != 0 }
}

/// Shows a (hidden) window straight into the maximized state, keeping the normal rectangle
/// Windows already holds for it. One paint instead of "appear small, then grow".
#[cfg(windows)]
pub fn show_maximized(hwnd: *mut std::ffi::c_void) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetWindowPlacement, SetWindowPlacement, SW_SHOWMAXIMIZED, WINDOWPLACEMENT};
    let mut p: WINDOWPLACEMENT = unsafe { std::mem::zeroed() };
    p.length = std::mem::size_of::<WINDOWPLACEMENT>() as u32;
    unsafe {
        if GetWindowPlacement(hwnd as _, &mut p) == 0 {
            return false;
        }
        p.showCmd = SW_SHOWMAXIMIZED as _;
        SetWindowPlacement(hwnd as _, &p) != 0
    }
}
