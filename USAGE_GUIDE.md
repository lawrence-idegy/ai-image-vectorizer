# Usage Guide - AI Image Vectorizer

## Quick Start

### 1. Installation
```bash
# Install dependencies
npm install

# Create .env file with your Replicate API token
echo "REPLICATE_API_TOKEN=your_token_here" > .env

# Start the server
npm start
```

### 2. Access the Application
Open your browser and navigate to:
```
http://localhost:3000
```

---

## Web Interface Guide

### Step 1: Choose Vectorization Method

**AI Vectorization (Recommended)**
- Best for: Complex images, logos, illustrations, colored graphics
- Quality: Professional-grade
- Processing: Cloud-based via Replicate AI

**Potrace (Fallback)**
- Best for: Simple black & white images, line art
- Quality: Good for simple graphics
- Processing: Local, offline

### Step 2: Select Processing Mode

**Single Image Mode**
- Convert one image at a time
- Ideal for testing or individual conversions
- Faster results display

**Batch Processing Mode**
- Convert up to 20 images at once
- Perfect for bulk conversions
- All images processed in parallel

### Step 3: Upload Images

**Three ways to upload:**
1. **Drag & Drop**: Drag image files directly onto the upload area
2. **Click to Browse**: Click the upload area to open file picker
3. **Multiple Selection**: Hold Ctrl/Cmd to select multiple files (batch mode)

**Supported formats:**
- PNG
- JPG/JPEG
- WebP

**Limitations:**
- Maximum file size: 10MB per image
- Maximum batch size: 20 images

### Step 4: Review Selected Files
- Preview thumbnails of selected images
- See file sizes
- Remove unwanted files before conversion
- Add more files if needed

### Step 5: Start Conversion
- Click "Vectorize Images" button
- Watch progress indicator
- Wait for processing to complete

### Step 6: Download Results
- Preview vectorized SVGs
- Download individual files
- Open in new tab for full preview
- All files compatible with Adobe Illustrator, Photoshop, Figma, Sketch

---

## Use Cases

### Logo Vectorization
**Scenario:** Convert a raster logo to vector format

**Steps:**
1. Select "AI Vectorization" method
2. Choose "Single Image" mode
3. Upload your logo (PNG/JPG)
4. Download the SVG result
5. Open in Adobe Illustrator for editing

**Tips:**
- Use high-resolution source images for best results
- AI method preserves colors and details
- Perfect for brand assets that need scaling

### Icon Set Conversion
**Scenario:** Convert multiple icon images to SVG

**Steps:**
1. Select "AI Vectorization" method
2. Choose "Batch Processing" mode
3. Upload all icon files at once (up to 20)
4. Wait for batch processing
5. Download all SVG files

**Tips:**
- Name files clearly before upload
- Use consistent source image quality
- Batch processing saves time and maintains consistency

### Illustration Vectorization
**Scenario:** Convert hand-drawn or digital art to vectors

**Steps:**
1. Select "AI Vectorization" method (highly recommended)
2. Choose appropriate mode
3. Upload your illustration
4. Review the vectorized result
5. Fine-tune in your design software if needed

**Tips:**
- AI method handles complex shapes and colors
- Works well with gradients and textures
- Great for creating scalable artwork

### Simple Line Art
**Scenario:** Convert simple black & white drawings

**Steps:**
1. Can use either method (Potrace works well here)
2. Upload your line art
3. Download SVG result
4. Use in any vector editor

**Tips:**
- Potrace is free and fast for simple graphics
- Clean, high-contrast images work best
- Perfect for technical drawings and diagrams

---

## Command Line Usage

### Using curl

**Single Image:**
```bash
curl -X POST http://localhost:3000/api/vectorize \
  -F "image=@logo.png" \
  -F "method=ai" \
  -o response.json
```

**Batch Processing:**
```bash
curl -X POST http://localhost:3000/api/vectorize/batch \
  -F "images=@image1.png" \
  -F "images=@image2.jpg" \
  -F "images=@image3.png" \
  -F "method=ai"
```

**Download Result:**
```bash
curl -O http://localhost:3000/api/download/logo.svg
```

---

## Integration Examples

### Node.js Script
```javascript
const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch');

async function convertToVector(imagePath) {
  const form = new FormData();
  form.append('image', fs.createReadStream(imagePath));
  form.append('method', 'ai');

  const response = await fetch('http://localhost:3000/api/vectorize', {
    method: 'POST',
    body: form
  });

  const result = await response.json();

  if (result.success) {
    // Save SVG to file
    fs.writeFileSync('output.svg', result.svgContent);
    console.log('Vectorized successfully!');
  }
}
```

### Automated Workflow
```bash
#!/bin/bash

# Convert all PNG files in a directory
for file in *.png; do
  echo "Converting $file..."
  curl -X POST http://localhost:3000/api/vectorize \
    -F "image=@$file" \
    -F "method=ai" \
    -o "${file%.png}.json"
done

echo "Batch conversion complete!"
```

---

## Tips for Best Results

### Image Preparation
1. **Resolution**: Use at least 500px on the smallest side
2. **Contrast**: Ensure good contrast between foreground and background
3. **Compression**: Optimize file size without losing quality
4. **Format**: PNG works best for transparency

### Method Selection
- **Use AI for:**
  - Colored images
  - Complex shapes
  - Gradients and textures
  - Professional logos
  - Detailed illustrations

- **Use Potrace for:**
  - Simple black & white images
  - Line drawings
  - Silhouettes
  - Technical diagrams
  - When cost is a concern

### Post-Processing
1. Open SVG in vector editor (Illustrator, Inkscape, Figma)
2. Refine paths if needed
3. Adjust colors
4. Optimize for file size
5. Export in required format

---

## Troubleshooting

### Poor Quality Results
- **Solution**: Try higher resolution source image
- **Solution**: Use AI method instead of Potrace
- **Solution**: Clean up the source image (remove noise, adjust contrast)

### File Too Large Error
- **Solution**: Compress image before upload
- **Solution**: Reduce image dimensions
- **Solution**: Convert to PNG format

### Server Not Starting
- **Solution**: Check if port 3000 is available
- **Solution**: Verify .env file exists with valid API token
- **Solution**: Run `npm install` to ensure dependencies are installed

### API Token Issues
- **Solution**: Get valid token from https://replicate.com
- **Solution**: Update .env file with correct token
- **Solution**: Restart server after updating token

---

## Optimization Tips

1. Use batch processing for multiple images to improve efficiency
2. Use Potrace for simple graphics when appropriate
3. Test with Potrace first for simple images, then upgrade to AI if needed
4. Optimize images before conversion to save processing time

---

## Support & Resources

- **Replicate Documentation**: https://replicate.com/docs
- **Issue Tracker**: Report bugs and feature requests
- **API Reference**: See API_DOCUMENTATION.md
- **Community**: Share tips and get help

---

## Next Steps

1. **Experiment**: Try both methods with different image types
2. **Integrate**: Add to your design workflow
3. **Automate**: Create scripts for repetitive tasks
4. **Optimize**: Fine-tune settings for your specific use case
5. **Share**: Help other designers discover this tool
