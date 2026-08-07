import Foundation
import ImageIO
import UniformTypeIdentifiers

enum ImageCompressor {
    /// Max edge ~2560, JPEG quality ~0.82 — spirit of mobile-image-upload.ts
    static func compressIfNeeded(_ data: Data, maxEdge: CGFloat = 2560, quality: CGFloat = 0.82) -> (data: Data, mimeType: String, filename: String) {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil)
        else {
            return (data, "application/octet-stream", "upload.bin")
        }

        let width = CGFloat(cgImage.width)
        let height = CGFloat(cgImage.height)
        let longest = max(width, height)
        let scale = longest > maxEdge ? maxEdge / longest : 1
        let targetSize = CGSize(width: floor(width * scale), height: floor(height * scale))

        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let context = CGContext(
            data: nil,
            width: Int(targetSize.width),
            height: Int(targetSize.height),
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            return (data, "image/jpeg", "image.jpg")
        }
        context.interpolationQuality = .high
        context.draw(cgImage, in: CGRect(origin: .zero, size: targetSize))
        guard let scaled = context.makeImage() else {
            return (data, "image/jpeg", "image.jpg")
        }

        let mutable = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(mutable, UTType.jpeg.identifier as CFString, 1, nil) else {
            return (data, "image/jpeg", "image.jpg")
        }
        CGImageDestinationAddImage(dest, scaled, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        CGImageDestinationFinalize(dest)
        return (mutable as Data, "image/jpeg", "image.jpg")
    }
}
