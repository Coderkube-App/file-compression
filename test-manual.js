const fs = require("fs");
const path = require("path");
const flexiMedia = require("./src/index");

// Initialize handler
const media = flexiMedia({
    uploadDir: path.join(__dirname, "test-uploads"),
    debug: true
});

async function runTests() {
    console.log("🚀 Starting manual test suite for express-file-compressor...");

    // Ensure clean output directory
    const testUploadDir = path.join(__dirname, "test-uploads");
    if (fs.existsSync(testUploadDir)) {
        fs.rmSync(testUploadDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testUploadDir);

    try {
        // --- 1. Test Image Compressor ---
        console.log("\n📷 Testing Image Compression (100x100 Red Square to WebP)...");
        // Create 100x100 red image buffer using sharp
        const sharp = require("sharp");
        const redSquareBuffer = await sharp({
            create: {
                width: 100,
                height: 100,
                channels: 3,
                background: { r: 255, g: 0, b: 0 }
            }
        })
        .png()
        .toBuffer();

        const compressedImage = await media.converters.compressImage(redSquareBuffer, {
            format: "webp",
            quality: 80
        });

        const imagePath = path.join(testUploadDir, "test-image.webp");
        fs.writeFileSync(imagePath, compressedImage);
        console.log(`✅ WebP Image created successfully: ${imagePath} (${compressedImage.length} bytes)`);

        // --- 2. Test PDF Generator/Optimiser ---
        console.log("\n📄 Testing PDF Optimization (Blank Document)...");
        const { PDFDocument } = require("pdf-lib");
        const pdfDoc = await PDFDocument.create();
        pdfDoc.addPage([400, 400]);
        const pdfBytes = await pdfDoc.save();

        const optimizedPdf = await media.converters.compressPdf(Buffer.from(pdfBytes));
        const pdfPath = path.join(testUploadDir, "test-doc.pdf");
        fs.writeFileSync(pdfPath, optimizedPdf);
        console.log(`✅ PDF optimized and written to: ${pdfPath} (${optimizedPdf.length} bytes)`);

        // --- 3. Test ZIP Creator ---
        console.log("\n🗜️ Testing ZIP Archive Compression...");
        const zipBuffer = await media.converters.compressToZip([
            { name: "image.webp", buffer: compressedImage },
            { name: "document.pdf", buffer: optimizedPdf }
        ]);

        const zipPath = path.join(testUploadDir, "archive.zip");
        fs.writeFileSync(zipPath, zipBuffer);
        console.log(`✅ ZIP archive created successfully: ${zipPath} (${zipBuffer.length} bytes)`);

        console.log("\n🎉 All local programmatic tests passed successfully!");
    } catch (error) {
        console.error("❌ Test failed:", error);
        process.exit(1);
    }
}

runTests();
