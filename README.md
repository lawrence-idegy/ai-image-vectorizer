# idegy AI Image Vectorizer

A professional-grade AI-powered tool to convert raster images (PNG, JPG, WEBP) to high-quality SVG vector graphics. Built by idegy specifically for designers working with Adobe Illustrator, Photoshop, Figma, and Sketch.

## 🎯 Key Features

### Core Vectorization
- **AI-Powered Vectorization**: Professional-grade conversion using Replicate's recraft-vectorize model
- **True Vector Validation**: Guarantees genuine vector output (no embedded raster images)
- **Potrace Fallback**: Local processing for simple black & white images
- **Batch Processing**: Convert up to 20 images simultaneously

### Advanced Features
- **Background Removal**: Automatically remove backgrounds before vectorization
- **Detail Level Control**: Choose Low/Medium/High detail preservation
- **Multiple Export Formats**: SVG, PDF, EPS, and AI (Illustrator-compatible)
- **Quality Metrics**: Real-time validation with quality scores and true vector verification
- **Resolution Independence**: All outputs guaranteed to scale infinitely

### User Experience
- **Modern Interface**: Sleek design with idegy brand colors
- **Drag & Drop**: Intuitive file upload
- **Live Preview**: See results before downloading
- **Educational Help**: Built-in guide explaining vector files
- **Quality Dashboard**: Detailed metrics for every conversion

## Tech Stack

- **Backend**: Node.js + Express
- **AI API**: Replicate (recraft-ai/recraft-vectorize)
- **Fallback**: Potrace for offline processing
- **Frontend**: Vanilla JavaScript with modern UI

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
Create a `.env` file with your Replicate API token:
```
REPLICATE_API_TOKEN=your_token_here
PORT=3000
```

3. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

4. Open your browser to `http://localhost:3000`

## Usage

1. Drag and drop images or click to upload
2. Select single or batch processing
3. Choose quality settings (optional)
4. Preview the vectorized result
5. Download as SVG

## API Endpoints

- `POST /api/vectorize` - Convert single image to vector
- `POST /api/vectorize/batch` - Convert multiple images
- `GET /api/health` - Health check

## License

MIT
