# API Documentation

## Base URL
```
http://localhost:3000/api
```

## Endpoints

### 1. Health Check
Check if the server is running and Replicate API is configured.

**Endpoint:** `GET /api/health`

**Response:**
```json
{
  "status": "ok",
  "message": "AI Image Vectorizer is running",
  "replicateConfigured": true
}
```

---

### 2. Single Image Vectorization
Convert a single image to SVG vector.

**Endpoint:** `POST /api/vectorize`

**Content-Type:** `multipart/form-data`

**Parameters:**
- `image` (file, required): Image file (PNG, JPG, JPEG, WEBP, max 10MB)
- `method` (string, optional): Vectorization method - `ai` (default) or `potrace`

**Example Request:**
```bash
curl -X POST http://localhost:3000/api/vectorize \
  -F "image=@/path/to/image.png" \
  -F "method=ai"
```

**Response:**
```json
{
  "success": true,
  "message": "Image vectorized successfully",
  "method": "Replicate AI (recraft-vectorize)",
  "originalFilename": "logo.png",
  "outputFilename": "logo.svg",
  "downloadUrl": "/api/download/logo.svg",
  "svgContent": "<svg>...</svg>"
}
```

---

### 3. Batch Vectorization
Convert multiple images to SVG vectors at once.

**Endpoint:** `POST /api/vectorize/batch`

**Content-Type:** `multipart/form-data`

**Parameters:**
- `images` (files, required): Multiple image files (max 20 images)
- `method` (string, optional): Vectorization method - `ai` (default) or `potrace`

**Example Request:**
```bash
curl -X POST http://localhost:3000/api/vectorize/batch \
  -F "images=@/path/to/image1.png" \
  -F "images=@/path/to/image2.jpg" \
  -F "method=ai"
```

**Response:**
```json
{
  "success": true,
  "message": "Batch processing completed: 2/2 images vectorized",
  "method": "Replicate AI",
  "results": [
    {
      "success": true,
      "originalFilename": "image1.png",
      "outputFilename": "image1.svg",
      "downloadUrl": "/api/download/image1.svg"
    },
    {
      "success": true,
      "originalFilename": "image2.jpg",
      "outputFilename": "image2.svg",
      "downloadUrl": "/api/download/image2.svg"
    }
  ]
}
```

---

### 4. Download Vectorized File
Download a converted SVG file.

**Endpoint:** `GET /api/download/:filename`

**Example Request:**
```bash
curl -O http://localhost:3000/api/download/logo.svg
```

---

### 5. Get Available Methods
Get information about available vectorization methods.

**Endpoint:** `GET /api/methods`

**Response:**
```json
{
  "methods": [
    {
      "id": "ai",
      "name": "Replicate AI",
      "model": "recraft-ai/recraft-vectorize",
      "description": "Professional AI-powered vectorization for complex images",
      "available": true,
      "recommended": true,
      "features": [
        "Handles colored images",
        "Professional-grade quality",
        "Best for logos, illustrations, and complex graphics",
        "Compatible with Adobe Illustrator, Figma, Sketch"
      ]
    },
    {
      "id": "potrace",
      "name": "Potrace",
      "description": "Local fallback vectorization for simple black & white images",
      "available": true,
      "recommended": false
    }
  ]
}
```

---

## Error Responses

All endpoints return errors in the following format:

```json
{
  "success": false,
  "error": "Error type",
  "message": "Detailed error message"
}
```

### Common HTTP Status Codes:
- `200` - Success
- `400` - Bad Request (invalid file type, missing parameters, etc.)
- `404` - Not Found (file doesn't exist)
- `500` - Internal Server Error

---

## Usage Examples

### Node.js Example
```javascript
const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch');

async function vectorizeImage(imagePath) {
  const formData = new FormData();
  formData.append('image', fs.createReadStream(imagePath));
  formData.append('method', 'ai');

  const response = await fetch('http://localhost:3000/api/vectorize', {
    method: 'POST',
    body: formData
  });

  const result = await response.json();
  console.log(result);
}
```

### Python Example
```python
import requests

def vectorize_image(image_path):
    with open(image_path, 'rb') as f:
        files = {'image': f}
        data = {'method': 'ai'}
        response = requests.post(
            'http://localhost:3000/api/vectorize',
            files=files,
            data=data
        )
    return response.json()
```

---

## Rate Limits

There are no built-in rate limits, but consider:
- Maximum file size: 10MB per image
- Maximum batch size: 20 images per request

---

## Supported Image Formats

- PNG (.png)
- JPEG (.jpg, .jpeg)
- WebP (.webp)

---

## Best Practices

1. **Use AI method for complex images**: Logos, illustrations, colored graphics
2. **Use Potrace for simple graphics**: Black & white line art, simple logos
3. **Optimize images before upload**: Reduce file size for faster processing
4. **Batch processing**: Use batch endpoint for multiple images to improve efficiency
5. **Error handling**: Always check the `success` field in responses

---

## Troubleshooting

### "Replicate API not configured"
- Ensure `.env` file exists with valid `REPLICATE_API_TOKEN`
- Restart the server after adding the token

### "File size too large"
- Compress images before uploading
- Maximum size is 10MB per image

### "Invalid file type"
- Only PNG, JPG, JPEG, and WEBP are supported
- Convert other formats before uploading

### Vectorization quality issues
- Try using AI method instead of Potrace for better quality
- Ensure input images have good resolution
- For colored images, always use AI method
