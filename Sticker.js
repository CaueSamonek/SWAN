import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";
import { execa } from "execa";
import { fileTypeFromBuffer } from "file-type";

export default async function Sticker(buffer, opts = {}) {
    const author = opts.stickerAuthor ? opts.stickerAuthor : "";
    const pack = opts.stickerPack ? opts.stickerPack : "";
    const type = opts.stickerType ? opts.stickerType : "fill";
    const quality = opts.stickerQuality ? opts.stickerQuality : 80;

    const info = await fileTypeFromBuffer(buffer);
    if (!info)
        throw Error("Unknown file type");

    if (info.mime.startsWith("video/"))
        buffer = await convertVideo(buffer);
    else if (!info.mime.startsWith("image/"))
        throw Error(`Unsupported media type: ${info.mime}`);

    const fit = type === "full" ? "contain" :
                type === "fill" ? "fill" : "cover"; // crop, circle, rounded

    let image = sharp(buffer).resize(512, 512, {fit,
                    background: { r: 0, g: 0, b: 0, alpha: 0 }}).ensureAlpha();

    if (type === "circle")
        image = image.composite([{
            input: Buffer.from(`<svg width="512" height="512">
                        <circle cx="256" cy="256" r="256" fill="white"/></svg>`),
            blend: "dest-in"
        }]);

    if (type === "rounded")
        image = image.composite([{
            blend: "dest-in",
            input: Buffer.from(`<svg width="512" height="512">
                                    <rect x="0" y="0" width="512" height="512"
                                        rx="64" ry="64" fill="white"/></svg>`),
        }]);

    const webp = await image.webp({ quality }).toBuffer();    
    return addExif(webp, author, pack)
}

// for animated stickers
async function convertVideo(buffer) {
    const { stdout } = await execa(ffmpegPath, [
        "-i", "pipe:0", "-vcodec", "libwebp", "-vf",
        "scale=512:512:force_original_aspect_ratio=decrease",
        "-loop", "0", "-an", "-f", "webp", "pipe:1"
    ], { input: buffer, encoding: null });

    return stdout;
}

// Add metadata
function addExif(webp, author, pack) {
    const json = Buffer.from(JSON.stringify({
        "sticker-pack-id": "com.swan.sticker",
        "sticker-pack-name": pack,
        "sticker-pack-publisher": author,
        "emojis": []
    }));

    const tiff = Buffer.alloc(22 + json.length);
    tiff.write("II", 0);
    tiff.writeUInt16LE(42, 2);
    tiff.writeUInt32LE(8, 4);
    tiff.writeUInt16LE(1, 8);
    tiff.writeUInt16LE(0x5741, 10);
    tiff.writeUInt16LE(7, 12);
    tiff.writeUInt32LE(json.length, 14);
    tiff.writeUInt32LE(22, 18);
    json.copy(tiff, 22);

    let exif = Buffer.concat([
        Buffer.from("EXIF"),
        Buffer.alloc(4),
        tiff
    ]);
    exif.writeUInt32LE(tiff.length, 4);
    if (exif.length % 2)
        exif = Buffer.concat([exif, Buffer.from([0])]);

    // EXIF flag in VP8X
    let body = Buffer.from(webp.subarray(12));
    body = ensureVP8X(body);
    if (body.subarray(0, 4).toString("ascii") === "VP8X")
        body[8] |= 0x08;

    const riffSize = Buffer.alloc(4);
    riffSize.writeUInt32LE(4 + body.length + exif.length); // +4 = "WEBP"

    return Buffer.concat([
        webp.subarray(0, 4),   // "RIFF"
        riffSize,
        webp.subarray(8, 12),  // "WEBP"
        body,                  // image data
        exif                   // EXIF
    ]);
}

// Adds VP8X container if sharp didn't generated it
function ensureVP8X(body) {
    const fourcc = body.subarray(0, 4).toString("ascii");
    if (fourcc === "VP8X") return body;
    if (fourcc !== "VP8 " && fourcc !== "VP8L") return body;

    const width = 512, height = 512; // always 512x512

    const vp8x = Buffer.alloc(18);
    vp8x.write("VP8X", 0);
    vp8x.writeUInt32LE(10, 4); // payload size

    let flags = 0;
    if (fourcc === "VP8L") flags |= 0x10; // VP8L supports alpha
    vp8x[8] = flags;
    // bytes 9-11 (reserved) 0 by alloc

    vp8x.writeUIntLE(width - 1, 12, 3);
    vp8x.writeUIntLE(height - 1, 15, 3);

    return Buffer.concat([vp8x, body]);
}
