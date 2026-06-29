<p align="center">
  <img src="https://raw.githubusercontent.com/Coderkube-App/file-compression/main/assets/banner.svg" alt="Express File Compressor Banner" width="100%">
</p>

# Express File Compressor

[![GitHub repository](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/Coderkube-App/file-compression)

A flexible, drop-in wrapper over Multer memory storage designed for easy media processing, conversion, and compression on local environments. Handles Images (using `sharp`), Videos & Audios (using `fluent-ffmpeg`), Document to PDF conversion (using `LibreOffice`), PDF optimization, and ZIP generation out of the box.

---

## Features
- 🚀 **Drop-in Middleware**: Integrates directly into your existing Express/Multer endpoints.
- 🖼️ **Image Compression**: Auto-converts to WebP/AVIF, resizes, and optimizes images using `sharp`.
- 📽️ **Video & Audio**: Compress and transcode videos or audio tracks using `fluent-ffmpeg`.
- 📄 **Doc → PDF Converter**: Convert DOCX, PPTX, and XLSX files to PDF on-the-fly via headless LibreOffice.
- 🗜️ **PDF Optimizer & Zip Generator**: Compress PDFs and pack files into ZIP archives programmatically.

---

## Installation

```bash
npm install express-file-compressor
```

### System Requirements (Optional, based on features used)
* **Video/Audio processing**: Install `ffmpeg` on your host system and include `fluent-ffmpeg` in your project.
* **Document conversion**: Install `libreoffice` and ensure the `soffice` command is available in your PATH.

---

## Quick Start (Express Middleware)

```javascript
const express = require('express');
const flexiMedia = require('express-file-compressor');

const app = express();

// Initialize the media handler middleware
const media = flexiMedia({
  uploadDir: './uploads', // where processed files are stored
  debug: true
});

// Upload single file (automatic conversion to WebP for images)
app.post('/upload', media.single('file'), (req, res) => {
  res.json({
    message: "Upload and processing complete!",
    file: req.file // file.path points to the compressed file
  });
});

// Upload multiple files
app.post('/upload-multiple', media.array('photos', 5), (req, res) => {
  res.json({
    files: req.files
  });
});
```

---

## Advanced Configuration: Custom Rules

You can fully customize matching criteria, formats, and compression parameters by passing custom rules.

```javascript
const media = flexiMedia({
  uploadDir: './uploads',
  rules: [
    // 1. Process PNGs to high-quality AVIF
    {
      name: "Convert PNG to AVIF",
      match: (file) => file.mimetype === 'image/png',
      convert: 'image',
      options: { format: 'avif', quality: 80 }
    },
    // 2. Transcode heavy videos to lightweight MP4s
    {
      name: "Compress mp4 video",
      match: (file) => file.mimetype.startsWith('video/'),
      convert: 'video',
      options: { format: 'mp4', videoBitrate: '800k', resolution: '640x?' }
    },
    // 3. Keep original TXT files untouched
    {
      name: "Pass-through text files",
      match: (file) => file.extension === 'txt',
      convert: null // No conversion/compression applied
    }
  ]
});
```

---

## Direct Programmatic Usage (Without Middleware)

You can also import and use the underlying converters directly inside your application logic.

```javascript
const { converters } = require('express-file-compressor')();

// 1. Compress Image
const webpBuffer = await converters.compressImage(rawImageBuffer, {
  format: 'webp',
  quality: 80,
  width: 800
});

// 2. Convert Word Document to PDF
const pdfBuffer = await converters.convertDocToPdf(docxBuffer, 'docx');

// 3. Compress files into a ZIP
const zipBuffer = await converters.compressToZip([
  { name: 'document.pdf', buffer: pdfBuffer },
  { name: 'image.webp', buffer: webpBuffer }
]);
```

---

## License
MIT
