const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { exec } = require("child_process");
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");
const archiver = require("archiver");

// Lazy load fluent-ffmpeg to make it an optional peer dependency
let ffmpeg;
try {
    ffmpeg = require("fluent-ffmpeg");
} catch (e) {
    // Will throw runtime error if video/audio conversion is triggered but fluent-ffmpeg isn't installed
}

/**
 * Creates a unique temp file path and writes buffer to it
 */
function createTempFile(buffer, extension) {
    const tempDir = os.tmpdir();
    const tempName = `flexi-${crypto.randomBytes(8).toString("hex")}.${extension}`;
    const tempPath = path.join(tempDir, tempName);
    fs.writeFileSync(tempPath, buffer);
    return tempPath;
}

/**
 * Safely delete files
 */
function cleanupFiles(...paths) {
    paths.forEach(p => {
        if (p && fs.existsSync(p)) {
            try {
                fs.unlinkSync(p);
            } catch (err) {
                // Ignore cleanup errors
            }
        }
    });
}

/**
 * Image Compressor & Converter using Sharp
 */
async function compressImage(buffer, options = {}) {
    const {
        format = "webp",
        quality = 75,
        width,
        height,
        fit = "inside",
        rotate = true,
        stripMetadata = true,
        extraOptions = {}
    } = options;

    let pipeline = sharp(buffer);

    if (rotate) {
        pipeline = pipeline.rotate();
    }

    if (width || height) {
        pipeline = pipeline.resize({ width, height, fit });
    }

    if (stripMetadata) {
        pipeline = pipeline.keepMetadata(); // or default to strip if not specified
    }

    // Configure format-specific optimization
    if (format === "webp") {
        pipeline = pipeline.webp({ quality, ...extraOptions });
    } else if (format === "jpeg" || format === "jpg") {
        pipeline = pipeline.jpeg({ quality, mozjpeg: true, ...extraOptions });
    } else if (format === "png") {
        pipeline = pipeline.png({ compressionLevel: 8, quality, ...extraOptions });
    } else if (format === "avif") {
        pipeline = pipeline.avif({ quality, ...extraOptions });
    } else if (format === "heif") {
        pipeline = pipeline.heif({ quality, ...extraOptions });
    } else if (format === "gif") {
        pipeline = pipeline.gif({ ...extraOptions });
    } else if (format === "tiff") {
        pipeline = pipeline.tiff({ quality, ...extraOptions });
    }

    return await pipeline.toBuffer();
}

/**
 * Video / Audio Compressor & Transcoder using FFmpeg
 */
function compressVideoAudio(buffer, inputExt, options = {}) {
    return new Promise((resolve, reject) => {
        if (!ffmpeg) {
            return reject(new Error("fluent-ffmpeg is required for video/audio processing. Please install it as a dependency."));
        }

        const {
            format = "mp4",
            videoBitrate = "1000k",
            audioBitrate = "128k",
            fps = 30,
            resolution, // e.g., '1280x720'
            codec, // e.g., 'libx264'
            audioCodec // e.g., 'aac'
        } = options;

        const tempInput = createTempFile(buffer, inputExt);
        const tempOutput = path.join(os.tmpdir(), `flexi-out-${crypto.randomBytes(8).toString("hex")}.${format}`);

        let command = ffmpeg(tempInput);

        if (codec) command.videoCodec(codec);
        if (audioCodec) command.audioCodec(audioCodec);
        if (videoBitrate) command.videoBitrate(videoBitrate);
        if (audioBitrate) command.audioBitrate(audioBitrate);
        if (fps) command.fps(fps);
        if (resolution) command.size(resolution);

        command
            .toFormat(format)
            .on("end", () => {
                try {
                    const outputBuffer = fs.readFileSync(tempOutput);
                    cleanupFiles(tempInput, tempOutput);
                    resolve(outputBuffer);
                } catch (e) {
                    cleanupFiles(tempInput, tempOutput);
                    reject(e);
                }
            })
            .on("error", (err) => {
                cleanupFiles(tempInput, tempOutput);
                reject(err);
            })
            .save(tempOutput);
    });
}

/**
 * Document (DOCX, PPTX, XLSX) to PDF Converter using LibreOffice headless mode
 */
function convertDocToPdf(buffer, inputExt) {
    return new Promise((resolve, reject) => {
        const tempInput = createTempFile(buffer, inputExt);
        const tempDir = os.tmpdir();

        // LibreOffice command: soffice --headless --convert-to pdf --outdir <dir> <file>
        const cmd = `soffice --headless --convert-to pdf --outdir "${tempDir}" "${tempInput}"`;

        exec(cmd, (err, stdout, stderr) => {
            if (err) {
                cleanupFiles(tempInput);
                return reject(new Error(`LibreOffice conversion failed: ${err.message}. Ensure LibreOffice is installed and in your PATH.`));
            }

            const inputBasename = path.basename(tempInput, `.${inputExt}`);
            const pdfPath = path.join(tempDir, `${inputBasename}.pdf`);

            try {
                if (!fs.existsSync(pdfPath)) {
                    throw new Error("Converted PDF file was not found in the output directory.");
                }
                const pdfBuffer = fs.readFileSync(pdfPath);
                cleanupFiles(tempInput, pdfPath);
                resolve(pdfBuffer);
            } catch (e) {
                cleanupFiles(tempInput, pdfPath);
                reject(e);
            }
        });
    });
}

/**
 * PDF Optimizer & Compressor using pdf-lib or Ghostscript if available
 */
async function compressPdf(buffer, options = {}) {
    const { useGhostscript = false } = options;

    if (useGhostscript) {
        return new Promise((resolve, reject) => {
            const tempInput = createTempFile(buffer, "pdf");
            const tempOutput = path.join(os.tmpdir(), `flexi-pdf-${crypto.randomBytes(8).toString("hex")}.pdf`);

            // Ghostscript pdf settings: /screen is low-resolution screen-view image (high compression)
            const cmd = `gs -sDEVICE=pdfwrite -dPDFSETTINGS=/screen -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${tempOutput}" "${tempInput}"`;

            exec(cmd, (err) => {
                if (err) {
                    cleanupFiles(tempInput, tempOutput);
                    return reject(new Error(`Ghostscript failed: ${err.message}. Ensure gs is installed and in your PATH.`));
                }

                try {
                    const outputBuffer = fs.readFileSync(tempOutput);
                    cleanupFiles(tempInput, tempOutput);
                    resolve(outputBuffer);
                } catch (e) {
                    cleanupFiles(tempInput, tempOutput);
                    reject(e);
                }
            });
        });
    }

    // Default JS-Native fallback using pdf-lib (strips metadata, copies pages to optimize)
    try {
        const srcDoc = await PDFDocument.load(buffer);
        const pdfDoc = await PDFDocument.create();
        const pages = await pdfDoc.copyPages(srcDoc, srcDoc.getPageIndices());
        pages.forEach((page) => pdfDoc.addPage(page));
        const outputBytes = await pdfDoc.save({ useObjectStreams: true });
        return Buffer.from(outputBytes);
    } catch (err) {
        throw new Error(`pdf-lib optimization failed: ${err.message}`);
    }
}

/**
 * Compresses multiple files into a single ZIP archive
 * files: Array of { name: string, buffer: Buffer }
 */
function compressToZip(files, options = {}) {
    return new Promise((resolve, reject) => {
        const { zlib = { level: 9 } } = options;
        const archive = archiver("zip", { zlib });
        const buffers = [];

        archive.on("data", (chunk) => buffers.push(chunk));
        archive.on("end", () => resolve(Buffer.concat(buffers)));
        archive.on("error", (err) => reject(err));

        files.forEach((file) => {
            archive.append(file.buffer, { name: file.name });
        });

        archive.finalize();
    });
}

module.exports = {
    compressImage,
    compressVideoAudio,
    convertDocToPdf,
    compressPdf,
    compressToZip
};
