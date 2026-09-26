use std::fs;
use std::io::{self, ErrorKind};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

pub type Mover = dyn Fn(&Path, &Path) -> io::Result<()> + Send + Sync;

pub fn default_mover() -> Box<Mover> {
    Box::new(|src, dst| move_with_retry(src, dst, 5, Duration::from_millis(200)))
}

/// Poll the file size until it has not changed for `quiet`. Gives up after `max`.
pub fn wait_until_stable(path: &Path, quiet: Duration, max: Duration) -> io::Result<u64> {
    let start = Instant::now();
    let mut last = fs::metadata(path)?.len();
    let mut last_change = Instant::now();
    loop {
        thread::sleep(Duration::from_millis(50));
        let now = fs::metadata(path)?.len();
        if now != last {
            last = now;
            last_change = Instant::now();
        } else if last_change.elapsed() >= quiet {
            return Ok(now);
        }
        if start.elapsed() >= max {
            return Err(io::Error::new(ErrorKind::TimedOut, "file kept changing"));
        }
    }
}

pub fn hash_file(path: &Path) -> io::Result<String> {
    let mut hasher = blake3::Hasher::new();
    let mut f = fs::File::open(path)?;
    io::copy(&mut f, &mut hasher)?;
    Ok(hasher.finalize().to_hex().to_string())
}

pub fn unique_target(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let first = dir.join(format!("{stem}.{ext}"));
    if !first.exists() {
        return first;
    }
    let mut n = 2;
    loop {
        let candidate = dir.join(format!("{stem}-{n}.{ext}"));
        if !candidate.exists() {
            return candidate;
        }
        n += 1;
    }
}

#[cfg(windows)]
const CROSS_DEVICE: i32 = 17; // ERROR_NOT_SAME_DEVICE
#[cfg(not(windows))]
const CROSS_DEVICE: i32 = 18; // EXDEV

fn is_cross_device(e: &io::Error) -> bool {
    e.raw_os_error() == Some(CROSS_DEVICE)
}

pub fn move_file(src: &Path, dst: &Path) -> io::Result<()> {
    match fs::rename(src, dst) {
        Ok(()) => Ok(()),
        Err(e) if is_cross_device(&e) => copy_verify_delete(src, dst),
        Err(e) => Err(e),
    }
}

/// Copy to a temp name beside `dst`, verify size and hash, rename into place, delete `src`.
/// Any failure before the final delete leaves `src` untouched and removes the temp file.
pub fn copy_verify_delete(src: &Path, dst: &Path) -> io::Result<()> {
    let tmp = dst.with_extension("snapnote-tmp");
    let result = (|| {
        fs::copy(src, &tmp)?;
        let (a, b) = (fs::metadata(src)?.len(), fs::metadata(&tmp)?.len());
        if a != b {
            return Err(io::Error::other(format!("size mismatch after copy: {a} vs {b}")));
        }
        if hash_file(src)? != hash_file(&tmp)? {
            return Err(io::Error::other("hash mismatch after copy"));
        }
        fs::rename(&tmp, dst)?;
        fs::remove_file(src)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

pub fn move_with_retry(src: &Path, dst: &Path, attempts: u32, backoff: Duration) -> io::Result<()> {
    let mut last = None;
    for i in 0..attempts.max(1) {
        match move_file(src, dst) {
            Ok(()) => return Ok(()),
            Err(e) => {
                last = Some(e);
                if i + 1 < attempts {
                    thread::sleep(backoff * (i + 1));
                }
            }
        }
    }
    Err(last.unwrap_or_else(|| io::Error::other("move failed")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn wait_until_stable_returns_final_size_of_a_growing_file() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("grow.png");
        fs::write(&p, b"").unwrap();
        let writer = {
            let p = p.clone();
            thread::spawn(move || {
                let mut f = fs::OpenOptions::new().append(true).open(&p).unwrap();
                for _ in 0..5 {
                    f.write_all(&[0u8; 1000]).unwrap();
                    f.flush().unwrap();
                    thread::sleep(Duration::from_millis(40));
                }
            })
        };
        let size = wait_until_stable(&p, Duration::from_millis(150), Duration::from_secs(5)).unwrap();
        writer.join().unwrap();
        assert_eq!(size, 5000);
    }

    #[test]
    fn wait_until_stable_times_out_if_never_quiet() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("busy.png");
        fs::write(&p, b"").unwrap();
        let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let writer = {
            let (p, stop) = (p.clone(), stop.clone());
            thread::spawn(move || {
                let mut f = fs::OpenOptions::new().append(true).open(&p).unwrap();
                while !stop.load(std::sync::atomic::Ordering::Relaxed) {
                    f.write_all(b"x").unwrap();
                    f.flush().unwrap();
                    thread::sleep(Duration::from_millis(20));
                }
            })
        };
        let err = wait_until_stable(&p, Duration::from_millis(200), Duration::from_millis(600)).unwrap_err();
        stop.store(true, std::sync::atomic::Ordering::Relaxed);
        writer.join().unwrap();
        assert_eq!(err.kind(), std::io::ErrorKind::TimedOut);
    }

    #[test]
    fn hash_is_stable_and_content_sensitive() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a");
        let b = dir.path().join("b");
        fs::write(&a, b"hello").unwrap();
        fs::write(&b, b"hello!").unwrap();
        assert_eq!(hash_file(&a).unwrap(), hash_file(&a).unwrap());
        assert_ne!(hash_file(&a).unwrap(), hash_file(&b).unwrap());
        assert_eq!(hash_file(&a).unwrap().len(), 64);
    }

    #[test]
    fn unique_target_adds_numeric_suffix() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(unique_target(dir.path(), "2026-09-26 x", "png"), dir.path().join("2026-09-26 x.png"));
        fs::write(dir.path().join("2026-09-26 x.png"), b"").unwrap();
        assert_eq!(unique_target(dir.path(), "2026-09-26 x", "png"), dir.path().join("2026-09-26 x-2.png"));
        fs::write(dir.path().join("2026-09-26 x-2.png"), b"").unwrap();
        assert_eq!(unique_target(dir.path(), "2026-09-26 x", "png"), dir.path().join("2026-09-26 x-3.png"));
    }

    #[test]
    fn move_file_renames_within_a_volume() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("a.png");
        let dst = dir.path().join("sub").join("b.png");
        fs::write(&src, b"data").unwrap();
        fs::create_dir_all(dst.parent().unwrap()).unwrap();
        move_file(&src, &dst).unwrap();
        assert!(!src.exists());
        assert_eq!(fs::read(&dst).unwrap(), b"data");
    }

    #[test]
    fn copy_verify_delete_moves_content_and_cleans_up() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("a.png");
        let dst = dir.path().join("b.png");
        fs::write(&src, b"payload").unwrap();
        copy_verify_delete(&src, &dst).unwrap();
        assert!(!src.exists());
        assert_eq!(fs::read(&dst).unwrap(), b"payload");
        assert!(fs::read_dir(dir.path()).unwrap().count() == 1, "no temp file left behind");
    }

    #[test]
    fn copy_verify_delete_leaves_source_when_destination_dir_is_missing() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("a.png");
        let dst = dir.path().join("missing-dir").join("b.png");
        fs::write(&src, b"payload").unwrap();
        assert!(copy_verify_delete(&src, &dst).is_err());
        assert_eq!(fs::read(&src).unwrap(), b"payload");
    }

    #[test]
    fn move_with_retry_eventually_succeeds() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("a.png");
        let dst = dir.path().join("late").join("b.png");
        fs::write(&src, b"x").unwrap();
        let mk = {
            let d = dst.parent().unwrap().to_path_buf();
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(250));
                fs::create_dir_all(d).unwrap();
            })
        };
        move_with_retry(&src, &dst, 5, Duration::from_millis(100)).unwrap();
        mk.join().unwrap();
        assert!(dst.exists());
    }
}
