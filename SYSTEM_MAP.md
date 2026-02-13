# SYSTEM_MAP.md - idegy Vector Fix v2.5

## Overview

**idegy Vector Fix** is a web application with two modes:

1. **Vectorize** — Converts raster images (PNG, JPG, PDF) into clean, scalable vector graphics (SVG, AI/EPS, PNG) using the **Smoothing Vectorizer** which produces pinpoint-accurate colors with smooth edges and individual element selectability in Adobe Illustrator.
2. **Clean up only** — Opens images in a canvas-based raster eraser editor. Users erase unwanted parts using magic wand, bulk color erase, or brush tools, then export as high-res PNG with transparency. Original image quality is fully preserved (no vectorization).

Built for the idegy design team to quickly process client logos.

**Live Deployment:** Vercel serverless functions at `ai-image-vectorizer.vercel.app`

---

## Where We Left Off

**Last session (2026-02-12):** Smoothing Vectorizer improvements and Vercel deployment fixes.

### What changed
- **Added** Smoothing Vectorizer as the primary vectorization engine
- **Fixed** compound path splitting - each letter/shape is now individually selectable in Illustrator
- **Added** unique IDs to all SVG paths for better Illustrator handling
- **Removed** login requirement - no authentication needed
- **Fixed** Vercel deployment using serverless functions in `/api` directory
- **Removed** native modules incompatible with Vercel (tensorflow, onnxruntime)

### Current State
- Default vectorization method is **Smoothing Vectorizer** (imagetracerjs + Bezier smoothing)
- No authentication required
- Deployed to Vercel with serverless functions
- All paths split for individual selectability in Illustrator
- Cleanup mode code exists but UI selector is removed

### Flow diagram (current)
```
VECTORIZE MODE:  Upload → Smoothing Vectorizer → SVG CleanupEditor → Download (SVG/AI/PDF/PNG)
CLEANUP MODE:    (UI disabled) Upload → RasterCleanupEditor → Download (PNG only)
SVG UPLOAD:      Upload → SVG CleanupEditor → Download (SVG/AI/PDF/PNG)
PDF UPLOAD:      Upload → Convert to PNG (client-side) → (follows vectorize mode)
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- No external API tokens required for basic vectorization

### Running Locally
```bash
# 1. Clone and install
cd ai-image-vectorizer
npm install
cd client && npm install && cd ..

# 2. Start Node.js servers
npm run dev

# 3. Open browser
# Frontend: http://localhost:5173
# Backend:  http://localhost:3000
```

### Vercel Deployment
The app is deployed to Vercel using serverless functions in the `/api` directory:
- `api/health.js` - Health check endpoint
- `api/vectorize.js` - Vectorization endpoint (uses Smoothing Vectorizer)
- `api/auth/login.js` - Auth endpoint (no longer required)

**No login required** - Authentication has been removed for easier access.

---

## Vectorization Methods

The system uses the **Smoothing Vectorizer** as the primary and default method:

| Method | Name | Quality | Speed | Requirements | Best For |
|--------|------|---------|-------|--------------|----------|
| `smooth` | **Smoothing Vectorizer (Default)** | Highest | Fast (~2-5s) | None | Brand logos, exact colors |
| `gen-pro` | Generative Reconstruction | High | Slow (~10-30s) | Python pipeline | Low-res logos |
| `vtracer` | VTracer | Medium | Instant (~10ms) | None | Simple logos |

### Method Details

#### 1. smooth (Default - Smoothing Vectorizer)
**Pipeline:** 3x Upscale → imagetracerjs → Bezier Smoothing → Compound Path Splitting → Illustrator Cleanup

The primary vectorization engine, optimized for:
- **Pinpoint color accuracy** - Preserves exact brand colors using LAB color distance
- **Smooth edges** - Catmull-Rom to Bezier curve conversion for clean paths
- **Individual selectability** - Compound paths split so each letter/shape is separately selectable in Illustrator
- **Unique path IDs** - Each path gets a unique ID for better Illustrator handling
- **No AI required** - Runs locally without external API dependencies

Key features:
- 3x upscaling before tracing for better edge detection
- imagetracerjs for exact color region preservation
- Automatic removal of opacity="0" paths (Illustrator compatibility)
- All paths split at M commands for individual element selection

#### 2. gen-pro (Generative Reconstruction)
**Pipeline:** Python AI Upscale → OpenCV Edge Preservation → Color Quantization → VTracer

Higher quality option using:
- **Real-ESRGAN** AI super-resolution (4x upscale)
- **OpenCV bilateral filter** for edge preservation
- **K-means color quantization** to solid hex codes
- **VTracer** for final vectorization

Requires the Python pipeline server running at `localhost:5000`.

#### 3. vtracer (VTracer Direct)
**Pipeline:** Direct VTracer conversion

Fast option using VTracer with:
- Multiple quality presets (logo, detailed, poster, bw, text)
- Spline-based smooth curves
- Hierarchical path stacking

---

## User Flow

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                              USER WORKFLOW                                      │
│                                                                                │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│   │  UPLOAD      │ ──▶ │  PROCESSING  │ ──▶ │   CLEANUP    │ ──▶ │  DOWNLOAD   │
│   │              │     │              │     │    EDITOR    │     │             │
│   │ Drop or      │     │ gen-pro:     │     │              │     │ Preview     │
│   │ browse       │     │ "AI preproc" │     │ SVG mode:    │     │             │
│   │ image        │     │ "Vectorizing"│     │  Click to    │     │ Vectorize:  │
│   │              │     │              │     │  select/     │     │  AI/SVG/    │
│   │ Optional:    │     │ Other:       │     │  delete/     │     │  PDF/PNG    │
│   │ -Client name │     │ "Vectorizing"│     │  recolor     │     │             │
│   │ -Project name│     │              │     │              │     │ Cleanup:    │
│   │              │     │              │     │ Raster mode: │     │  PNG only   │
│   │              │     │ (cleanup     │     │  Magic wand  │     │             │
│   │              │     │  skips this) │     │  Color erase │     │ "Upload     │
│   │              │     │              │     │  Brush       │     │  Another"   │
│   └──────────────┘     └──────────────┘     └──────────────┘     └─────────────┘
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Step 1: Upload
- Drag & drop or click to browse
- Accepts: JPG, PNG, WEBP, PDF, SVG (up to 50MB)
- PDF files are automatically converted to images (first page, client-side)
- SVG files go directly to SVG CleanupEditor
- Optional client/project names for auto-file-naming
- **Current UI:** Vectorize mode only (cleanup mode selector removed)
- Default method: `gen-pro` (Generative Reconstruction)

### Step 2: Processing (vectorize mode only)
- Background removal (if selected) via Replicate AI
- Image vectorization via selected method (default: gen-pro)
- SVG optimization with SVGO
- SVG post-processing (shape detection, gap filler)
- Quality validation and scoring
- **Cleanup mode skips this step entirely**

### Step 3: Cleanup Editor
**SVG CleanupEditor** (vectorize mode, or SVG file uploads):
- Click elements to select them
- Delete unwanted artifacts/backgrounds
- Recolor elements (presets + custom hex)
- Adjust opacity
- "+ Stack" selects overlapping elements at same position
- Quick select by color groups
- Drag-to-select marquee

**RasterCleanupEditor** (cleanup mode with raster images):
- **Magic Wand** (key `1`): Click to flood-fill erase connected pixels of similar color
- **Color Erase** (key `2`): Click a color, confirm to erase ALL matching pixels everywhere
- **Brush** (key `3`): Paint to erase manually (precision fallback)
- Tolerance slider (0-150) controls color matching sensitivity
- Brush size slider (5-150px) with visual cursor circle
- Undo: Ctrl+Z (max 20 steps, 10 for large images)
- Zoom: mouse wheel + buttons (0.25x-8x)
- Pan: Alt+drag or middle-click drag
- Checkerboard background shows transparency
- Full original image resolution preserved (capped at 4096px)

### Step 4: Download
- Preview final result on checkerboard background
- **Vectorize mode** — Download in 4 formats:
  - **AI/EPS** — Adobe Illustrator compatible (PDF-based)
  - **PDF** — Print-ready
  - **SVG** — Web, Figma, Sketch
  - **PNG** — High-resolution (2x scale, transparent)
- **Cleanup mode** — Single "Download PNG" button (high-res with transparency)
- Auto-named: `ClientName_ProjectName_YYYYMMDD_HHMMSS.ext`
- "Back to Edit" returns to editor with edits preserved

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React 19 + Vite 7)                            │
│                              http://localhost:5173                              │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                              App.jsx                                       │ │
│  │                    State Machine: upload → processing → cleanup → complete │ │
│  │                    Raster mode state: isRasterMode, originalImageUrl,      │ │
│  │                                      rasterDataUrl                        │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                          │
│         ┌────────────────────────────┼────────────────────────────┐            │
│         ▼                            ▼                            ▼            │
│  ┌─────────────┐     ┌───────────────────────────┐      ┌───────────────────┐ │
│  │   Header    │     │       SimpleUpload        │      │  DownloadResults  │ │
│  │  AuthModal  │     │       Processing          │      │  (SVG or raster   │ │
│  └─────────────┘     │  CleanupEditor (SVG mode) │      │   mode-aware)     │ │
│                       │  RasterCleanupEditor      │      └───────────────────┘ │
│                       │    (cleanup/raster mode)  │                             │
│                       └───────────────────────────┘                             │
│                                                                                 │
│  Services: api.js (Axios)          Hooks: useAuth.jsx                          │
│  Contexts: ThemeContext.jsx        Utils: exportUtils.js, pdfToImage.js        │
│  Assets: Tailwind CSS + idegy theme (dark/light mode)                          │
└────────────────────────────────────┬────────────────────────────────────────────┘
                                     │
                                     │ HTTP/REST API
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Node.js + Express 4.18)                         │
│                              http://localhost:3000                              │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                              server.js                                     │ │
│  │                Express app · Middleware stack · Route mounting             │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                          │
│         ┌────────────────────────────┼────────────────────────────┐            │
│         ▼                            ▼                            ▼            │
│  ┌─────────────────┐        ┌─────────────────┐         ┌─────────────────┐   │
│  │ vectorizeRoutes │        │  formatRoutes   │         │   authRoutes    │   │
│  │ POST /vectorize │        │ POST /convert   │         │ POST /login     │   │
│  │ POST /remove-bg │        │ GET /formats    │         │ GET /me         │   │
│  │ GET /download   │        │                 │         │ POST /refresh   │   │
│  │ GET /methods    │        │                 │         │                 │   │
│  └─────────────────┘        └─────────────────┘         └─────────────────┘   │
│           │                                                                     │
│           ▼                                                                     │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                         VECTORIZATION SERVICES                            │ │
│  │                                                                           │ │
│  │  smoothingVectorizer.js (DEFAULT) ──▶ imagetracerjs + Bezier smoothing    │ │
│  │    ├── 3x upscaling for better edge detection                             │ │
│  │    ├── imagetracerjs for exact color tracing                              │ │
│  │    ├── Catmull-Rom to Bezier curve smoothing                              │ │
│  │    ├── Compound path splitting (individual selectability)                 │ │
│  │    └── Illustrator compatibility cleanup                                  │ │
│  │                                                                           │ │
│  │  generativeReconstructionService.js ──▶ Python pipeline client            │ │
│  │  vtracerService.js ──────────────────▶ VTracer (@neplex/vectorizer)       │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                         PREPROCESSING SERVICES                            │ │
│  │                                                                           │ │
│  │  imagePreprocessor.js ───▶ Color quantization, denoise, resize            │ │
│  │  upscaleService.js ──────▶ AI upscaling via Replicate (Real-ESRGAN)       │ │
│  │  backgroundRemovalService.js ─▶ AI background removal (3 quality modes)   │ │
│  │  pdfConverter.js ────────▶ PDF to image conversion (pdfjs-dist)           │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                         POST-PROCESSING SERVICES                          │ │
│  │                                                                           │ │
│  │  svgOptimizer.js ────────▶ SVGO optimization & sanitization               │ │
│  │  svgPostProcessor.js ────▶ Shape detection, gap filler, grouping          │ │
│  │  qualityValidator.js ────▶ SVG quality scoring (0-100)                    │ │
│  │  formatConverter.js ─────▶ SVG → PDF/EPS/AI conversion                    │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                         SUPPORT SERVICES                                  │ │
│  │                                                                           │ │
│  │  authService.js ─────────▶ JWT authentication & user management           │ │
│  │  cacheService.js ────────▶ In-memory LRU caching                          │ │
│  │  storageService.js ──────▶ File upload/output management                  │ │
│  │  websocketService.js ────▶ Real-time progress updates                     │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                             MIDDLEWARE                                     │ │
│  │                                                                           │ │
│  │  security.js ─────▶ Helmet, CORS, XSS protection, request sanitization    │ │
│  │  rateLimiter.js ──▶ Per-endpoint rate limiting                            │ │
│  │  validation.js ───▶ Zod schema validation                                 │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────┬────────────────────────────────────────────┘
                                     │
                                     │ HTTP API
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         PYTHON PIPELINE (Optional)                              │
│                              http://localhost:5000                              │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  server.py (Flask)                                                         │ │
│  │  └── POST /process                                                         │ │
│  │      └── generative_reconstruction.py                                      │ │
│  │          ├── Real-ESRGAN AI super-resolution (4x upscale)                  │ │
│  │          ├── OpenCV bilateral filter (edge preservation)                   │ │
│  │          ├── Adaptive edge sharpening                                      │ │
│  │          ├── K-means color quantization (to solid hex)                     │ │
│  │          └── DPI adjustment (300+ DPI output)                              │ │
│  │                                                                            │ │
│  │  GET /health - Health check endpoint                                       │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  Requirements: Python 3.8+, PyTorch, OpenCV, basicsr (Real-ESRGAN)             │
│  GPU recommended but not required (falls back to CPU)                          │
└────────────────────────────────────┬────────────────────────────────────────────┘
                                     │
                                     │ HTTPS API
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            EXTERNAL SERVICES                                    │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                          Replicate AI Platform                             │ │
│  │                                                                           │ │
│  │  Vectorization Model: recraft-ai/recraft-vectorize                        │ │
│  │  Upscaling Model: nightmareai/real-esrgan (used by upscaleService.js)     │ │
│  │  Background Removal Models:                                               │ │
│  │    - lucataco/remove-bg (fast)                                            │ │
│  │    - cjwbw/rembg (balanced)                                               │ │
│  │    - ilkerc/rembg (quality - for hair/fur/fine details)                   │ │
│  │                                                                           │ │
│  │  Authentication: Bearer token (REPLICATE_API_TOKEN)                       │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Vectorization Pipeline Detail

### gen-pro Method (Default, Highest Quality)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    GENERATIVE RECONSTRUCTION PIPELINE                           │
│                                                                                 │
│  INPUT                                                                          │
│    │                                                                            │
│    ▼                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  1. PYTHON PIPELINE (generative_reconstruction.py)                       │   │
│  │                                                                          │   │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐      │   │
│  │  │  Real-ESRGAN    │ ─▶ │  Bilateral      │ ─▶ │   Adaptive      │      │   │
│  │  │  4x Upscale     │    │  Filter         │    │   Sharpening    │      │   │
│  │  │                 │    │  (edge-preserve)│    │                 │      │   │
│  │  └─────────────────┘    └─────────────────┘    └─────────────────┘      │   │
│  │           │                                              │               │   │
│  │           ▼                                              ▼               │   │
│  │  ┌─────────────────┐                          ┌─────────────────┐       │   │
│  │  │  K-means Color  │ ◀────────────────────────│  Denoise        │       │   │
│  │  │  Quantization   │                          │  (optional)     │       │   │
│  │  │  (8-32 colors)  │                          │                 │       │   │
│  │  └─────────────────┘                          └─────────────────┘       │   │
│  │           │                                                              │   │
│  │           ▼                                                              │   │
│  │  ┌─────────────────┐                                                    │   │
│  │  │  DPI Adjustment │                                                    │   │
│  │  │  (300 DPI)      │                                                    │   │
│  │  └─────────────────┘                                                    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│           │                                                                     │
│           ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  2. VTRACER (vtracerService.js)                                          │   │
│  │                                                                          │   │
│  │  • Logo preset (optimized for clean logos)                               │   │
│  │  • Spline-based smooth curves                                            │   │
│  │  • Hierarchical path stacking                                            │   │
│  │  • Noise filtering (filterSpeckle: 16)                                   │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│           │                                                                     │
│           ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  3. POST-PROCESSING                                                      │   │
│  │                                                                          │   │
│  │  svgOptimizer.js ──▶ SVGO optimization (remove metadata, minify)         │   │
│  │  svgPostProcessor.js ──▶ Shape detection, gap filler, grouping           │   │
│  │  qualityValidator.js ──▶ Quality score (0-100)                           │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│           │                                                                     │
│           ▼                                                                     │
│  OUTPUT (clean SVG)                                                            │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Project Directory Structure

```
ai-image-vectorizer/
│
├── server.js                    # Express server entry point (local dev)
├── vercel.json                  # Vercel deployment configuration
├── package.json                 # Backend dependencies
├── package-lock.json            # Dependency lock file
├── .env                         # Environment variables (git-ignored)
├── .env.example                 # Example environment config
├── SYSTEM_MAP.md                # This documentation file
│
├── routes/
│   ├── vectorizeRoutes.js       # /api/vectorize, /api/remove-background, /api/download, /api/methods
│   ├── formatRoutes.js          # /api/convert, /api/formats
│   └── authRoutes.js            # /api/auth/* endpoints
│
├── api/                                # Vercel serverless functions
│   ├── health.js                       # GET /api/health - Health check
│   ├── vectorize.js                    # POST /api/vectorize - Vectorization endpoint
│   └── auth/
│       └── login.js                    # POST /api/auth/login - Auth endpoint
│
├── services/
│   ├── # VECTORIZATION
│   ├── vectorizer/
│   │   └── smoothingVectorizer.js      # DEFAULT: imagetracerjs + Bezier smoothing
│   │       ├── vectorize()             # Main entry point
│   │       ├── smoothPaths()           # Catmull-Rom to Bezier conversion
│   │       ├── splitCompoundPaths()    # Split paths for individual selectability
│   │       └── cleanupForIllustrator() # Remove opacity=0, add unique IDs
│   ├── generativeReconstructionService.js  # Python pipeline client
│   ├── vtracerService.js                   # VTracer integration (@neplex/vectorizer)
│   │
│   ├── # PREPROCESSING
│   ├── imagePreprocessor.js     # Color quantization, denoise, resize
│   ├── upscaleService.js        # AI upscaling via Replicate
│   ├── backgroundRemovalService.js  # AI background removal (3 quality modes)
│   ├── pdfConverter.js          # PDF to image conversion
│   │
│   ├── # POST-PROCESSING
│   ├── svgOptimizer.js          # SVGO optimization & sanitization
│   ├── svgPostProcessor.js      # Shape detection, gap filler, grouping
│   ├── qualityValidator.js      # SVG quality scoring (0-100)
│   ├── formatConverter.js       # SVG → PDF/EPS/AI conversion
│   │
│   ├── # SUPPORT
│   ├── authService.js           # JWT auth, bcrypt hashing
│   ├── cacheService.js          # In-memory LRU cache
│   ├── storageService.js        # File management (uploads/output)
│   └── websocketService.js      # Real-time progress updates
│
├── middleware/
│   ├── index.js                 # Middleware exports
│   ├── security.js              # Helmet, CORS, sanitization
│   ├── validation.js            # Zod request validation
│   └── rateLimiter.js           # Rate limiting config
│
├── utils/
│   ├── errors.js                # Custom error classes
│   └── logger.js                # Winston logging config
│
├── python_pipeline/             # Python AI preprocessing server
│   ├── server.py                # Flask API server (port 5000)
│   ├── generative_reconstruction.py  # AI upscale + edge preservation
│   ├── requirements.txt         # Python dependencies
│   ├── setup.bat                # Windows setup script
│   ├── start_server.bat         # Windows start script
│   ├── README.md                # Python pipeline documentation
│   └── models/                  # Real-ESRGAN model weights
│
├── tests/
│   ├── run-tests.js             # Integration test runner
│   ├── test-validation.js       # SVG validation tests
│   ├── svgPostProcessor.test.js # Post-processor tests
│   └── README.md                # Testing documentation
│
├── uploads/                     # Temporary uploaded files (auto-cleaned)
├── output/                      # Generated SVG/PDF/EPS files
├── logs/                        # Winston log files
│
└── client/                      # React Frontend Application
    ├── index.html               # HTML entry point
    ├── package.json             # Frontend dependencies
    ├── vite.config.js           # Vite build configuration
    ├── tailwind.config.js       # Tailwind CSS config (dark mode, idegy colors)
    ├── postcss.config.js        # PostCSS config
    │
    ├── public/
    │   └── idegy_logo.png       # Company logo
    │
    └── src/
        ├── main.jsx             # React entry point
        ├── App.jsx              # Main app - state machine controller
        ├── index.css            # Global styles (Tailwind + dark/light theme)
        │
        ├── components/
        │   ├── SimpleUpload.jsx         # Upload zone (vectorize only, gen-pro default)
        │   ├── Processing.jsx           # Loading/status spinner
        │   ├── CleanupEditor.jsx        # SVG element editor (select/delete/recolor)
        │   ├── RasterCleanupEditor.jsx  # Canvas-based raster eraser (wand/bulk/brush)
        │   ├── DownloadResults.jsx      # Preview + download buttons (SVG or PNG mode)
        │   │
        │   ├── Layout/
        │   │   └── Header.jsx           # App header with logo, theme toggle, auth
        │   │
        │   └── Auth/
        │       └── AuthModal.jsx        # Login modal
        │
        ├── contexts/
        │   └── ThemeContext.jsx         # Dark/light theme with localStorage persistence
        │
        ├── services/
        │   └── api.js                   # Axios API client with interceptors
        │
        ├── hooks/
        │   └── useAuth.jsx              # Authentication context & hooks
        │
        └── utils/
            ├── exportUtils.js           # Client-side PDF/AI/EPS export
            └── pdfToImage.js            # Client-side PDF to PNG conversion
```

---

## API Endpoints Reference

### Vectorization Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/vectorize` | - | Convert single image to SVG (Smoothing Vectorizer) |
| `POST` | `/api/vectorize/batch` | - | Batch convert multiple images |
| `GET` | `/api/download/:filename` | - | Download converted file |
| `GET` | `/api/preview/:filename` | - | Preview SVG inline |
| `GET` | `/api/methods` | - | List vectorization methods & availability |
| `GET` | `/api/job/:jobId` | - | Get batch job status |

#### POST /api/vectorize Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `image` | File | Required | Image file (PNG, JPG, WEBP, PDF) |
| `method` | String | `gen-pro` | Vectorization method: `gen-pro`, `ai-pro`, `idegy`, `vtracer`, `ai` |
| `removeBackground` | Boolean | `false` | Remove background before vectorizing |
| `detailLevel` | String | `medium` | Detail level: `low`, `medium`, `high`, `ultra` |
| `optimize` | Boolean | `true` | Apply SVGO optimization |
| `optimizeLevel` | String | `default` | SVGO level: `minimal`, `default`, `aggressive` |
| `detectShapes` | Boolean | `true` | Detect circles, ellipses, rectangles |
| `gapFiller` | Boolean | `false` | Add strokes to prevent white lines |
| `groupBy` | String | `none` | Group paths: `none`, `color`, `layer` |
| `adobeCompatibility` | Boolean | `false` | Adobe Illustrator compatibility mode |

### Background Removal Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/remove-background` | - | AI background removal (3 quality modes) |
| `POST` | `/api/remove-background-with-mask` | - | Mask-based background removal |
| `GET` | `/api/background-removal-models` | - | List available models |

### SVG Processing Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/optimize` | - | Optimize SVG with SVGO |
| `POST` | `/api/analyze` | - | Analyze SVG quality |
| `POST` | `/api/convert/:filename` | - | Convert SVG to PDF/EPS/AI |
| `GET` | `/api/formats` | - | List export formats |

### Authentication Endpoints (Deprecated)

**Note:** Authentication has been removed as of v2.5.0. These endpoints still exist but are not required.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/login` | - | Login with email/password (not required) |
| `POST` | `/api/auth/refresh` | - | Refresh JWT token |
| `GET` | `/api/auth/me` | - | Get current user info |
| `POST` | `/api/auth/logout` | - | Logout (invalidate token) |

### System Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/health` | - | Health check with feature status |
| `GET` | `/api/stats` | - | System statistics |
| `POST` | `/api/cleanup` | - | Trigger storage cleanup |

**Note:** Cleanup mode (raster eraser) does not use any backend API endpoints. Everything happens client-side on canvas.

---

## Environment Variables

```env
# .env file configuration

# ═══════════════════════════════════════════════════════════════
# SERVER CONFIGURATION
# ═══════════════════════════════════════════════════════════════
PORT=3000
NODE_ENV=development

# ═══════════════════════════════════════════════════════════════
# OPTIONAL - Python Pipeline (for gen-pro method)
# ═══════════════════════════════════════════════════════════════
PYTHON_PIPELINE_URL=http://127.0.0.1:5000

# ═══════════════════════════════════════════════════════════════
# OPTIONAL - Replicate AI API Token (for background removal)
# Get from: https://replicate.com/account/api-tokens
# ═══════════════════════════════════════════════════════════════
REPLICATE_API_TOKEN=r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ═══════════════════════════════════════════════════════════════
# CORS CONFIGURATION
# ═══════════════════════════════════════════════════════════════
FRONTEND_URL=http://localhost:5173
PRODUCTION_URL=https://your-domain.com

# ═══════════════════════════════════════════════════════════════
# LOGGING
# ═══════════════════════════════════════════════════════════════
LOG_LEVEL=debug
```

**Note:** The default Smoothing Vectorizer requires no API tokens. External tokens are only needed for optional features like AI background removal.

---

## Technology Stack

### Backend (Node.js)

| Package | Version | Purpose |
|---------|---------|---------|
| express | 4.18.x | Web framework |
| replicate | 0.32.x | Replicate AI SDK |
| sharp | 0.33.x | Image processing & resizing |
| @neplex/vectorizer | 0.4.x | VTracer bindings (local vectorization) |
| svgo | 3.3.x | SVG optimization |
| multer | 1.4.x | File upload handling |
| jsonwebtoken | 9.0.x | JWT authentication |
| bcryptjs | 2.4.x | Password hashing |
| helmet | 8.0.x | Security headers |
| cors | 2.8.x | Cross-origin support |
| compression | 1.7.x | Gzip compression |
| express-rate-limit | 7.5.x | Rate limiting |
| zod | 3.24.x | Schema validation |
| winston | 3.17.x | Logging |
| pdfkit | 0.17.x | PDF generation |
| svg-to-pdfkit | 0.1.x | SVG to PDF conversion |
| pdfjs-dist | 4.x | PDF to image conversion (input) |
| canvas | 3.x | Node canvas for PDF rendering |

### Python Pipeline

| Package | Version | Purpose |
|---------|---------|---------|
| flask | 3.x | HTTP server |
| torch | 2.x | PyTorch for AI models |
| basicsr | 1.4.x | Real-ESRGAN implementation |
| opencv-python | 4.x | Image processing |
| numpy | 1.x | Numerical operations |
| pillow | 10.x | Image I/O |
| scikit-learn | 1.x | K-means color quantization |

### Frontend (React)

| Package | Version | Purpose |
|---------|---------|---------|
| react | 19.x | UI framework |
| react-dom | 19.x | DOM rendering |
| vite | 7.x | Build tool & dev server |
| tailwindcss | 4.x | Utility-first CSS (with dark mode) |
| axios | 1.x | HTTP client |
| jspdf | 3.x | PDF generation |
| svg2pdf.js | 2.x | SVG to PDF conversion |
| @iconify/react | 6.x | Icon library |
| pdfjs-dist | 5.x | Client-side PDF to image conversion |

---

## Output Formats

### File Naming Convention
```
{ClientName}_{ProjectName}_{YYYYMMDD}_{HHMMSS}.{ext}

Examples:
- Acme_Corp_Logo_20260127_143052.svg
- Nike_Swoosh_20260127_143052.ai
- Client_Logo_20260127_143052.png
```

### Export Formats

| Format | Extension | MIME Type | Available In | Use Case |
|--------|-----------|-----------|--------------|----------|
| SVG | `.svg` | `image/svg+xml` | Vectorize | Web, Figma, Sketch, Canva |
| AI | `.ai` (PDF-based SVG) | `application/pdf` | Vectorize | Adobe Illustrator |
| PDF | `.pdf` | `application/pdf` | Vectorize | Print |
| PNG | `.png` | `image/png` | Both modes | Social media, quick preview, raster cleanup output |

---

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| General API (`/api/*`) | 100 requests | 15 minutes |
| Vectorize (`/api/vectorize`) | 10 requests | 1 minute |
| Download (`/api/download/*`) | 50 requests | 1 minute |

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| CORS error | Port mismatch | Check `FRONTEND_URL` in .env |
| Port in use | Old process | Run `npx kill-port 3000 5173` |
| Vectorization timeout | Large image | Reduce image size before upload |
| Dark mode not working | CSS issue | Ensure `@custom-variant dark` in index.css |
| Magic wand slow | Very large image | Image capped at 4096px; reduce source image if needed |
| Can't select individual letters in Illustrator | Compound paths | Fixed in v2.5.0 - paths are now split automatically |
| Paths have opacity=0 | imagetracerjs output | Fixed in v2.5.0 - cleaned up for Illustrator compatibility |
| Vercel deployment fails | Native modules | Removed tensorflow/onnxruntime - use serverless-compatible packages |
| gen-pro not available | Python not running | Start `python python_pipeline/server.py` |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.5.0 | 2026-02-12 | **Smoothing Vectorizer** as default: imagetracerjs + Bezier smoothing + compound path splitting for individual selectability in Illustrator. Removed login requirement. Fixed Vercel deployment with serverless functions. |
| 2.4.0 | 2026-02-10 | Documentation overhaul, complete SYSTEM_MAP update |
| 2.3.0 | 2026-01-29 | Replaced bitmap tracing with raster eraser editor (magic wand, bulk color erase, brush). Removed imagetracerjs. Cleanup mode now preserves original image quality. |
| 2.2.0 | 2026-01-27 | Added PDF file support (auto-converts to image for vectorization) |
| 2.1.0 | 2026-01-27 | Dark/light theme, responsive UI, idegy branding, login-only auth |
| 2.0.1 | 2026-01-27 | Removed Potrace fallback, cleaned dead code |
| 2.0.0 | 2026-01-23 | Simplified 4-step UI flow |
| 1.x | Earlier | Full editor with batch, templates, tools |

---

*Last Updated: 2026-02-12*
*Version: 2.5.0*
