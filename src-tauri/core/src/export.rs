//! Clipboard-friendly encodings of a screenshot.

use crate::{CoreError, Result};
use std::path::Path;

/// The image as a 24-bit BMP file (BITMAPFILEHEADER + BITMAPINFOHEADER + bottom-up RGB rows),
/// the shape a `CF_BITMAP` setter expects. Alpha is dropped on purpose: screenshots are opaque,
/// and the V4/V5 headers an RGBA encode needs are not understood by every consumer.
pub fn bmp_bytes(path: &Path) -> Result<Vec<u8>> {
    let img = image::open(path).map_err(|e| CoreError::Image(e.to_string()))?.to_rgb8();
    let mut out = std::io::Cursor::new(Vec::new());
    img.write_to(&mut out, image::ImageFormat::Bmp).map_err(|e| CoreError::Image(e.to_string()))?;
    Ok(out.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bmp_bytes_is_a_24_bit_bmp_file_of_the_same_size() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.png");
        let mut img = image::RgbaImage::from_pixel(3, 2, image::Rgba([255, 0, 0, 255]));
        img.put_pixel(0, 0, image::Rgba([0, 0, 255, 0])); // transparent pixel must not break anything
        img.save(&p).unwrap();

        let bmp = bmp_bytes(&p).unwrap();
        assert_eq!(&bmp[..2], b"BM");
        let info_size = u32::from_le_bytes(bmp[14..18].try_into().unwrap());
        assert_eq!(info_size, 40, "plain BITMAPINFOHEADER, no V4/V5 alpha header");
        let width = i32::from_le_bytes(bmp[18..22].try_into().unwrap());
        let height = i32::from_le_bytes(bmp[22..26].try_into().unwrap());
        let bits = u16::from_le_bytes(bmp[28..30].try_into().unwrap());
        assert_eq!((width, height.abs(), bits), (3, 2, 24));
        let back = image::load_from_memory_with_format(&bmp, image::ImageFormat::Bmp).unwrap();
        assert_eq!((back.width(), back.height()), (3, 2));
    }

    #[test]
    fn bmp_bytes_of_a_missing_file_is_an_error() {
        assert!(bmp_bytes(Path::new("C:\\nope\\missing.png")).is_err());
    }
}
