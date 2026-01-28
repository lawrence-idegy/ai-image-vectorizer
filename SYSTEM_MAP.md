# SYSTEM_MAP.md - idegy Vector Fix v2.2

## Overview

**idegy Vector Fix** is a web application that converts raster images (PNG, JPG, PDF) into clean, scalable vector graphics (SVG, AI/EPS, PNG). Built for the idegy design team to quickly vectorize client logos using AI-powered conversion.

### The Problem It Solves
Designers receive low-quality logo files from clients and need to convert them to vectors for print, signage, and digital use. This tool automates the conversion process using Replicate AI's recraft-vectorize model.

---

## Quick Start

### Prerequisites
- Node.js 18+
- Replicate API token (required for vectorization)

### Running Locally
```bash
# 1. Clone and install
cd ai-image-vectorizer
npm install
cd client && npm install && cd ..

# 2. Configure environment
cp .env.example .env
# Edit .env and add your REPLICATE_API_TOKEN

# 3. Start both servers
npm run dev

# 4. Open browser
# Frontend: http://localhost:5173
# Backend:  http://localhost:3000
```

### Login
- Only `@idegy.com` email addresses can login
- Contact admin to create your account

---

## User Flow (4-Step Process)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                              USER WORKFLOW                                      │
│                                                                                │
│   ┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐  │
│   │  UPLOAD  │ ──▶ │  PROCESSING  │ ──▶ │   CLEANUP    │ ──▶ │  DOWNLOAD   │  │
│   │          │     │              │     │    EDITOR    │     │             │  │
│   │ Drop or  │     │ "Removing    │     │              │     │ Preview     │  │
│   │ browse   │     │  background" │     │ Click to     │     │ AI/EPS btn  │  │
│   │ image    │     │ "Vectorizing │     │ select       │     │ SVG button  │  │
│   │          │     │  with AI..." │     │ Delete/      │     │ PNG button  │  │
│   │ Options: │     │              │     │ Recolor      │     │             │  │
│   │ -Remove  │     │              │     │              │     │ "Upload     │  │
│   │  bg?     │     │              │     │ "Done" btn   │     │  Another"   │  │
│   └──────────┘     └──────────────┘     └──────────────┘     └─────────────┘  │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Step 1: Upload
- Drag & drop or click to browse
- Accepts: JPG, PNG, WEBP, PDF (up to 50MB)
- PDF files are automatically converted to images (first page)
- Optional client/project names for auto-file-naming
- Option: Remove background (AI-powered) or keep as-is

### Step 2: Processing
- Background removal (if selected) via Replicate AI
- Image vectorization via recraft-vectorize model
- SVG optimization with SVGO
- Quality validation

### Step 3: Cleanup Editor
- Click elements to select them
- Delete unwanted artifacts/backgrounds
- Recolor elements (presets + custom hex)
- Adjust opacity
- "+ Stack" selects overlapping elements at same position
- Quick select by color groups
- Click "Done" when satisfied

### Step 4: Download
- Preview final vectorized result on checkerboard background
- Download in 3 formats:
  - **AI/EPS** - Adobe Illustrator compatible (PDF-based)
  - **SVG** - Web, Figma, Sketch
  - **PNG** - High-resolution (2x scale, transparent)
- Auto-named: `ClientName_ProjectName_YYYYMMDD_HHMMSS.ext`

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
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                          │
│         ┌────────────────────────────┼────────────────────────────┐            │
│         ▼                            ▼                            ▼            │
│  ┌─────────────┐            ┌─────────────────┐          ┌───────────────────┐ │
│  │   Header    │            │  SimpleUpload   │          │  DownloadResults  │ │
│  │  AuthModal  │            │   Processing    │          │                   │ │
│  └─────────────┘            │  CleanupEditor  │          └───────────────────┘ │
│                             └─────────────────┘                                 │
│                                                                                 │
│  Services: api.js (Axios)          Hooks: useAuth.jsx                          │
│  Contexts: ThemeContext.jsx        Utils: exportUtils.js                       │
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
│  └─────────────────┘        └─────────────────┘         └─────────────────┘   │
│           │                          │                           │             │
│           └──────────────────────────┼───────────────────────────┘             │
│                                      ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                              SERVICES                                      │ │
│  │                                                                           │ │
│  │  replicateService.js ─────▶ AI vectorization (Replicate API)              │ │
│  │  backgroundRemovalService.js ─▶ AI background removal (3 quality modes)   │ │
│  │  pdfConverter.js ────────▶ PDF to image conversion (pdfjs-dist)           │ │
│  │  svgOptimizer.js ─────────▶ SVGO optimization & sanitization              │ │
│  │  qualityValidator.js ─────▶ SVG quality scoring & validation              │ │
│  │  formatConverter.js ──────▶ SVG → PDF/EPS/AI conversion                   │ │
│  │  authService.js ──────────▶ JWT authentication & user management          │ │
│  │  cacheService.js ─────────▶ In-memory LRU caching                         │ │
│  │  storageService.js ───────▶ File upload/output management                 │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                             MIDDLEWARE                                     │ │
│  │                                                                           │ │
│  │  security.js ─────▶ Helmet, CORS, XSS protection, request sanitization    │ │
│  │  rateLimiter.js ──▶ Per-endpoint rate limiting                            │ │
│  │  validation.js ───▶ Zod schema validation                                 │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────┬────────────────────────────────────────┘
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

## Project Directory Structure

```
ai-image-vectorizer/
│
├── server.js                    # Express server entry point
├── package.json                 # Backend dependencies
├── package-lock.json            # Dependency lock file
├── .env                         # Environment variables (git-ignored)
├── .env.example                 # Example environment config
├── SYSTEM_MAP.md                # This documentation file
│
├── routes/
│   ├── vectorizeRoutes.js       # /api/vectorize, /api/remove-background, /api/download
│   ├── formatRoutes.js          # /api/convert, /api/formats
│   └── authRoutes.js            # /api/auth/* endpoints
│
├── services/
│   ├── replicateService.js      # Replicate AI API integration
│   ├── backgroundRemovalService.js  # Multi-model background removal
│   ├── pdfConverter.js          # PDF to image conversion
│   ├── svgOptimizer.js          # SVGO optimization & sanitization
│   ├── qualityValidator.js      # SVG quality scoring (0-100)
│   ├── formatConverter.js       # PDF/EPS/AI conversion
│   ├── authService.js           # JWT auth, bcrypt hashing
│   ├── cacheService.js          # In-memory LRU cache
│   └── storageService.js        # File management (uploads/output)
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
├── tests/
│   ├── run-tests.js             # Integration test runner
│   ├── test-validation.js       # SVG validation tests
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
        │   ├── SimpleUpload.jsx     # Upload zone with options
        │   ├── Processing.jsx       # Loading/status spinner
        │   ├── CleanupEditor.jsx    # SVG element editor (click to select/delete/recolor)
        │   ├── DownloadResults.jsx  # Preview + download buttons
        │   │
        │   ├── Layout/
        │   │   └── Header.jsx       # App header with logo, theme toggle, auth
        │   │
        │   └── Auth/
        │       └── AuthModal.jsx    # Login modal
        │
        ├── contexts/
        │   └── ThemeContext.jsx     # Dark/light theme with localStorage persistence
        │
        ├── services/
        │   └── api.js               # Axios API client with interceptors
        │
        ├── hooks/
        │   └── useAuth.jsx          # Authentication context & hooks
        │
        └── utils/
            └── exportUtils.js       # Client-side PDF/AI/EPS export
```

---

## API Endpoints Reference

### Vectorization Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/vectorize` | Required | Convert single image to SVG |
| `GET` | `/api/download/:filename` | - | Download converted file |
| `GET` | `/api/preview/:filename` | - | Preview SVG inline |
| `GET` | `/api/methods` | - | List vectorization methods |

### Background Removal Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/remove-background` | Required | AI background removal (3 quality modes) |
| `GET` | `/api/background-removal-models` | - | List available models |

### SVG Processing Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/optimize` | Required | Optimize SVG with SVGO |
| `POST` | `/api/analyze` | Required | Analyze SVG quality |
| `POST` | `/api/convert/:filename` | - | Convert SVG to PDF/EPS/AI |
| `GET` | `/api/formats` | - | List export formats |

### Authentication Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/login` | - | Login with email/password |
| `POST` | `/api/auth/refresh` | - | Refresh JWT token |
| `GET` | `/api/auth/me` | Required | Get current user info |
| `POST` | `/api/auth/logout` | Required | Logout (invalidate token) |

### System Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/health` | - | Health check with feature status |
| `GET` | `/api/stats` | - | System statistics |
| `POST` | `/api/cleanup` | - | Trigger storage cleanup |

---

## UI Features

### Dark/Light Theme
- Toggle button in header (sun/moon icon)
- Persists to localStorage
- Respects system preference on first visit
- All components responsive to theme:
  - Light mode: Navy buttons with white text
  - Dark mode: White buttons with navy text

### Responsive Design
- Mobile-first approach
- Breakpoints: xs (480px), sm (640px), md (768px), lg (1024px)
- Collapsible sidebar on mobile (CleanupEditor)
- Stacked layouts on small screens

### Cleanup Editor Features
- Click SVG elements to select (blue outline)
- Multi-select supported
- "+ Stack" button: Select all overlapping elements at same position
- Delete selected elements
- Recolor: Preset colors + custom color picker with hex input
- Opacity slider
- Undo support
- Quick select by color (sidebar)
- Elements grouped by color with BG/Small/All filters

---

## Brand Colors

```css
/* Defined in client/tailwind.config.js and client/src/index.css */

--color-idegy-navy: #0D2240;       /* Primary navy (logo color) */
--color-idegy-navy-light: #1A3A5C; /* Hover states */
--color-idegy-navy-dark: #081828;  /* Dark backgrounds */
--color-idegy-blue: #4A9FE5;       /* Light accent (dark mode highlights) */
--color-idegy-teal: #38BDF8;       /* Bright accent (dark mode) */
--color-idegy-red: #E63329;        /* Logo red accent */
--color-idegy-gray: #F5F7FA;       /* Light backgrounds */
```

---

## Environment Variables

```env
# .env file configuration

# ═══════════════════════════════════════════════════════════════
# REQUIRED - Replicate AI API Token
# Get from: https://replicate.com/account/api-tokens
# ═══════════════════════════════════════════════════════════════
REPLICATE_API_TOKEN=r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ═══════════════════════════════════════════════════════════════
# SERVER CONFIGURATION
# ═══════════════════════════════════════════════════════════════
PORT=3000
NODE_ENV=development

# ═══════════════════════════════════════════════════════════════
# AUTHENTICATION
# ═══════════════════════════════════════════════════════════════
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h
ALLOWED_EMAIL_DOMAINS=idegy.com

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

---

## Technology Stack

### Backend

| Package | Version | Purpose |
|---------|---------|---------|
| express | 4.18.x | Web framework |
| replicate | 0.32.x | Replicate AI SDK |
| sharp | 0.33.x | Image processing & resizing |
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

### Frontend

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

| Format | Extension | MIME Type | Use Case |
|--------|-----------|-----------|----------|
| SVG | `.svg` | `image/svg+xml` | Web, Figma, Sketch, Canva |
| AI | `.ai` (PDF-based SVG) | `application/pdf` | Adobe Illustrator |
| EPS | `.eps` | `application/postscript` | Print, legacy software |
| PNG | `.png` | `image/png` | Social media, quick preview |

---

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| General API (`/api/*`) | 100 requests | 15 minutes |
| Vectorize (`/api/vectorize`) | 10 requests | 1 minute |
| Download (`/api/download/*`) | 50 requests | 1 minute |

---

## Deployment

### Local Development
```bash
npm run dev          # Runs backend (3000) + frontend (5173) concurrently
npm run server       # Backend only with nodemon
npm run client       # Frontend only with Vite
```

### Production Build
```bash
cd client && npm run build    # Creates client/dist
npm start                      # Runs production server serving client/dist
```

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| CORS error | Port mismatch | Check `FRONTEND_URL` in .env |
| Login fails | Wrong domain | Use `@idegy.com` email |
| "AI Engine not ready" | No API token | Add `REPLICATE_API_TOKEN` to .env |
| Port in use | Old process | Run `npx kill-port 3000 5173` |
| 401 Unauthorized | Token expired | Login again |
| Vectorization timeout | Large image | Reduce image size before upload |
| Dark mode not working | CSS issue | Ensure `@custom-variant dark` in index.css |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.2.0 | 2026-01-27 | Added PDF file support (auto-converts to image for vectorization) |
| 2.1.0 | 2026-01-27 | Dark/light theme, responsive UI, idegy branding, login-only auth |
| 2.0.1 | 2026-01-27 | Removed Potrace fallback, cleaned dead code |
| 2.0.0 | 2026-01-23 | Simplified 4-step UI flow |
| 1.x | Earlier | Full editor with batch, templates, tools |

---

*Last Updated: 2026-01-27*
*Version: 2.2.0*
