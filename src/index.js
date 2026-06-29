const fs = require("fs");
const path = require("path");
const multer = require("multer");
const converters = require("./converters");

/**
 * Default rule matching and conversion options
 */
const DEFAULT_RULES = [
    {
        name: "Image compression",
        match: (file) => file.mimetype.startsWith("image/") || ["heic", "heif", "bmp", "tiff", "svg", "png", "jpg", "jpeg", "webp"].includes(file.extension),
        convert: "image",
        options: { quality: 75 }
    },
    {
        name: "Office Docs to PDF",
        match: (file) => ["doc", "docx", "ppt", "pptx", "xls", "xlsx", "odt"].includes(file.extension),
        convert: "document",
        options: {}
    },
    {
        name: "Videos compression",
        match: (file) => file.mimetype.startsWith("video/"),
        convert: "video",
        options: { videoBitrate: "1000k" }
    },
    {
        name: "PDF optimization",
        match: (file) => file.mimetype === "application/pdf" || file.extension === "pdf",
        convert: "pdf",
        options: { useGhostscript: false }
    }
];

/**
 * Core middleware generator
 */
function flexiMediaHandler(config = {}) {
    const uploadDir = path.resolve(config.uploadDir || "./uploads");
    const rules = config.rules || DEFAULT_RULES;
    const limits = config.limits || { fileSize: 100 * 1024 * 1024 }; // Default 100MB

    // Multer Memory Storage setup
    const memoryUpload = multer({
        storage: multer.memoryStorage(),
        limits
    });

    /**
     * Save processed buffer locally
     */
    function saveLocal(buffer, filename) {
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, buffer);
        
        // Return relative path or absolute path based on configuration
        return config.relativePaths !== false 
            ? path.relative(process.cwd(), filePath).replace(/\\/g, "/")
            : filePath;
    }

    /**
     * Process a single uploaded file
     */
    async function processFile(file) {
        file.extension = file.originalname.split(".").pop().toLowerCase();
        
        let buffer = file.buffer;
        let finalFilename = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        let contentType = file.mimetype;
        let finalExtension = file.extension;

        // Find the first rule that matches this file type
        const rule = rules.find(r => r.match(file));

        if (rule) {
            try {
                if (rule.convert === "image") {
                    const format = rule.options.format || file.extension;
                    buffer = await converters.compressImage(file.buffer, { ...rule.options, format });
                    finalExtension = format;
                    contentType = `image/${format}`;
                } 
                else if (rule.convert === "video" || rule.convert === "audio") {
                    const format = rule.options.format || file.extension;
                    buffer = await converters.compressVideoAudio(file.buffer, file.extension, { ...rule.options, format });
                    finalExtension = format;
                    contentType = rule.convert === "video" ? `video/${format}` : `audio/${format}`;
                } 
                else if (rule.convert === "document") {
                    buffer = await converters.convertDocToPdf(file.buffer, file.extension);
                    finalExtension = "pdf";
                    contentType = "application/pdf";
                } 
                else if (rule.convert === "pdf") {
                    buffer = await converters.compressPdf(file.buffer, rule.options);
                    finalExtension = "pdf";
                    contentType = "application/pdf";
                }
            } catch (e) {
                if (config.debug) {
                    console.warn(`[express-file-compressor] Rule "${rule.name || rule.convert}" failed. Saving original file. Error: ${e.message}`);
                }
                // Fallback to original buffer and extension if conversion fails
                buffer = file.buffer;
                finalExtension = file.extension;
            }
        }

        finalFilename = `${finalFilename}.${finalExtension}`;
        const savedPath = saveLocal(buffer, finalFilename);

        return {
            path: savedPath,
            filename: finalFilename,
            mimetype: contentType,
            size: buffer.length
        };
    }

    /**
     * Wrap standard multer handlers
     */
    function wrap(multerHandler) {
        return (req, res, next) => {
            multerHandler(req, res, async (err) => {
                if (err) return next(err);

                const filesList = [];

                // Normalize single file to list
                if (req.file) {
                    req.files = req.files || {};
                    req.files[req.file.fieldname] = [req.file];
                }

                if (req.files) {
                    for (const field in req.files) {
                        req.files[field].forEach((f) => filesList.push(f));
                    }
                }

                // Process files sequentially
                for (const file of filesList) {
                    try {
                        const result = await processFile(file);
                        
                        // Mutate file metadata with processed path/size
                        file.path = result.path;
                        file.filename = result.filename;
                        file.mimetype = result.mimetype;
                        file.size = result.size;
                        delete file.buffer;
                    } catch (e) {
                        if (config.debug) {
                            console.error(`[express-file-compressor] Processing file "${file.originalname}" failed:`, e.message);
                        }
                    }
                }

                next();
            });
        };
    }

    return {
        single: (field) => wrap(memoryUpload.single(field)),
        array: (field, max) => wrap(memoryUpload.array(field, max)),
        fields: (fields) => wrap(memoryUpload.fields(fields)),
        any: () => wrap(memoryUpload.any()),
        converters // expose underlying converters directly
    };
}

module.exports = flexiMediaHandler;
