use crate::files;
use crate::store::paths;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq)]
pub enum WatchStatus {
    Watching(PathBuf),
    Paused { folder: PathBuf, reason: String },
}

#[derive(Debug, Clone)]
pub struct WatchConfig {
    pub folder: PathBuf,
    /// The file size must stay unchanged this long before the file counts as written.
    pub quiet: Duration,
    /// Give up waiting for a file to stabilise after this long.
    pub max_wait: Duration,
    /// How often to retry while the folder or the OS watcher is unavailable.
    pub retry: Duration,
}

pub type OnNew = Arc<dyn Fn(PathBuf) + Send + Sync>;
pub type OnStatus = Arc<dyn Fn(WatchStatus) + Send + Sync>;

pub struct WatcherHandle {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl WatcherHandle {
    pub fn stop(mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

impl Drop for WatcherHandle {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
    }
}

fn is_png(p: &Path) -> bool {
    p.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("png")).unwrap_or(false)
}

fn existing_pngs(folder: &Path) -> HashSet<PathBuf> {
    std::fs::read_dir(folder)
        .map(|rd| rd.flatten().map(|e| e.path()).filter(|p| p.is_file() && is_png(p)).collect())
        .unwrap_or_default()
}

fn interruptible_sleep(stop: &AtomicBool, d: Duration) {
    let end = Instant::now() + d;
    while Instant::now() < end && !stop.load(Ordering::SeqCst) {
        thread::sleep(Duration::from_millis(50));
    }
}

fn same_folder(path: &Path, folder: &Path) -> bool {
    path.parent()
        .map(|p| paths::norm(&p.to_string_lossy()) == paths::norm(&folder.to_string_lossy()))
        .unwrap_or(false)
}

/// Supervised watcher thread: keeps trying while the folder is unavailable, restarts on backend
/// errors, ignores files present when watching (re)starts, and calls `on_new` exactly once per
/// new PNG after it has finished being written.
pub fn spawn(config: WatchConfig, on_new: OnNew, on_status: OnStatus) -> WatcherHandle {
    let stop = Arc::new(AtomicBool::new(false));
    let stop2 = stop.clone();
    let thread = thread::spawn(move || run(config, on_new, on_status, stop2));
    WatcherHandle { stop, thread: Some(thread) }
}

fn paused(folder: &Path, reason: impl Into<String>) -> WatchStatus {
    WatchStatus::Paused { folder: folder.to_path_buf(), reason: reason.into() }
}

fn run(config: WatchConfig, on_new: OnNew, on_status: OnStatus, stop: Arc<AtomicBool>) {
    let folder = config.folder.clone();
    let mut seen: HashSet<PathBuf> = HashSet::new();
    while !stop.load(Ordering::SeqCst) {
        if !folder.is_dir() {
            on_status(paused(&folder, "folder not found"));
            interruptible_sleep(&stop, config.retry);
            continue;
        }
        let (tx, rx) = mpsc::channel::<notify::Result<Event>>();
        let mut watcher: RecommendedWatcher = match notify::recommended_watcher(move |res| {
            let _ = tx.send(res);
        }) {
            Ok(w) => w,
            Err(e) => {
                on_status(paused(&folder, e.to_string()));
                interruptible_sleep(&stop, config.retry);
                continue;
            }
        };
        if let Err(e) = watcher.watch(&folder, RecursiveMode::NonRecursive) {
            on_status(paused(&folder, e.to_string()));
            interruptible_sleep(&stop, config.retry);
            continue;
        }
        seen.extend(existing_pngs(&folder));
        on_status(WatchStatus::Watching(folder.clone()));
        let mut last_check = Instant::now();
        loop {
            if stop.load(Ordering::SeqCst) {
                return;
            }
            match rx.recv_timeout(Duration::from_millis(200)) {
                Ok(Ok(event)) => handle_event(&event, &folder, &mut seen, &config, &on_new),
                Ok(Err(e)) => {
                    on_status(paused(&folder, e.to_string()));
                    break;
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if last_check.elapsed() > Duration::from_secs(2) {
                        last_check = Instant::now();
                        if !folder.is_dir() {
                            on_status(paused(&folder, "folder disappeared"));
                            break;
                        }
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    on_status(paused(&folder, "watcher stopped"));
                    break;
                }
            }
        }
        drop(watcher);
        interruptible_sleep(&stop, config.retry);
    }
}

fn handle_event(event: &Event, folder: &Path, seen: &mut HashSet<PathBuf>, config: &WatchConfig, on_new: &OnNew) {
    for path in &event.paths {
        if !same_folder(path, folder) || !is_png(path) {
            continue;
        }
        match event.kind {
            EventKind::Remove(_) => {
                seen.remove(path);
                continue;
            }
            EventKind::Create(_) | EventKind::Modify(_) | EventKind::Any => {}
            _ => continue,
        }
        if !path.is_file() || seen.contains(path) {
            continue;
        }
        seen.insert(path.clone());
        let (p, quiet, max_wait, cb) = (path.clone(), config.quiet, config.max_wait, on_new.clone());
        thread::spawn(move || {
            if files::wait_until_stable(&p, quiet, max_wait).is_ok() && p.is_file() {
                cb(p);
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use std::sync::{mpsc, Mutex};

    fn cfg(folder: &Path) -> WatchConfig {
        WatchConfig { folder: folder.to_path_buf(), quiet: Duration::from_millis(300), max_wait: Duration::from_secs(5), retry: Duration::from_millis(200) }
    }

    struct Harness {
        events: mpsc::Receiver<PathBuf>,
        statuses: Arc<Mutex<Vec<WatchStatus>>>,
        handle: Option<WatcherHandle>,
    }

    fn start(folder: &Path) -> Harness {
        let (tx, rx) = mpsc::channel();
        let statuses = Arc::new(Mutex::new(Vec::new()));
        let st = statuses.clone();
        let handle = spawn(cfg(folder), Arc::new(move |p| { let _ = tx.send(p); }), Arc::new(move |s| st.lock().unwrap().push(s)));
        Harness { events: rx, statuses, handle: Some(handle) }
    }

    fn wait_watching(h: &Harness) {
        let end = Instant::now() + Duration::from_secs(5);
        while Instant::now() < end {
            if h.statuses.lock().unwrap().iter().any(|s| matches!(s, WatchStatus::Watching(_))) { return; }
            thread::sleep(Duration::from_millis(20));
        }
        panic!("watcher never reported Watching: {:?}", h.statuses.lock().unwrap());
    }

    fn write_in_chunks(path: &Path) {
        let mut f = fs::File::create(path).unwrap();
        for _ in 0..3 {
            f.write_all(&[7u8; 512]).unwrap();
            f.flush().unwrap();
            thread::sleep(Duration::from_millis(60));
        }
    }

    #[test]
    fn one_callback_per_file_despite_many_events() {
        let dir = tempfile::tempdir().unwrap();
        let mut h = start(dir.path());
        wait_watching(&h);
        let p = dir.path().join("Screenshot 2026-09-26 010101.png");
        write_in_chunks(&p);
        assert_eq!(h.events.recv_timeout(Duration::from_secs(5)).expect("callback"), p);
        assert!(h.events.recv_timeout(Duration::from_millis(800)).is_err(), "must not fire twice");
        h.handle.take().unwrap().stop();
    }

    #[test]
    fn existing_files_at_start_are_ignored() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("old.png"), b"x").unwrap();
        let mut h = start(dir.path());
        wait_watching(&h);
        assert!(h.events.recv_timeout(Duration::from_millis(800)).is_err());
        h.handle.take().unwrap().stop();
    }

    #[test]
    fn ignores_non_png_and_subfolders() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("sub")).unwrap();
        let mut h = start(dir.path());
        wait_watching(&h);
        fs::write(dir.path().join("notes.txt"), b"x").unwrap();
        fs::write(dir.path().join("photo.jpg"), b"x").unwrap();
        fs::write(dir.path().join("partial.png.tmp"), b"x").unwrap();
        fs::write(dir.path().join("sub").join("deep.png"), b"x").unwrap();
        assert!(h.events.recv_timeout(Duration::from_millis(1200)).is_err());
        h.handle.take().unwrap().stop();
    }

    #[test]
    fn file_removed_mid_write_is_skipped_and_watcher_survives() {
        let dir = tempfile::tempdir().unwrap();
        let mut h = start(dir.path());
        wait_watching(&h);
        let p = dir.path().join("vanish.png");
        fs::write(&p, b"start").unwrap();
        thread::sleep(Duration::from_millis(100));
        fs::remove_file(&p).unwrap();
        assert!(h.events.recv_timeout(Duration::from_millis(1200)).is_err());
        let p2 = dir.path().join("after.png");
        write_in_chunks(&p2);
        assert_eq!(h.events.recv_timeout(Duration::from_secs(5)).unwrap(), p2);
        h.handle.take().unwrap().stop();
    }

    #[test]
    fn supervisor_retries_until_folder_exists() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("later");
        let mut h = start(&folder);
        thread::sleep(Duration::from_millis(300));
        assert!(matches!(h.statuses.lock().unwrap().first(), Some(WatchStatus::Paused { .. })));
        fs::create_dir_all(&folder).unwrap();
        wait_watching(&h);
        let p = folder.join("new.png");
        write_in_chunks(&p);
        assert_eq!(h.events.recv_timeout(Duration::from_secs(5)).unwrap(), p);
        h.handle.take().unwrap().stop();
    }

    #[test]
    fn stop_returns_promptly_and_no_callbacks_follow() {
        let dir = tempfile::tempdir().unwrap();
        let mut h = start(dir.path());
        wait_watching(&h);
        let started = Instant::now();
        h.handle.take().unwrap().stop();
        assert!(started.elapsed() < Duration::from_secs(2));
        fs::write(dir.path().join("late.png"), b"x").unwrap();
        assert!(h.events.recv_timeout(Duration::from_millis(800)).is_err());
    }
}
