# Testing Guide - idegy AI Image Vectorizer

## How to Know If Vectorization is Working Correctly

### Quick Manual Test

1. **Start the server:**
   ```bash
   npm start
   ```

2. **Open the web interface:**
   ```
   http://localhost:3000
   ```

3. **Test Potrace (Fallback):**
   - Select "Potrace (Fallback)" method
   - Upload a simple black & white logo or line art
   - Click "Vectorize"
   - **Expected result:** Clean SVG with clear paths

4. **Test AI Vectorization:**
   - Select "AI Vectorization (Recommended)" method
   - Upload a colored logo or complex image
   - Click "Vectorize"
   - **Expected result:** High-quality SVG preserving colors and details

---

## Automated Testing

### Setup

1. **Install test dependencies (if not already):**
   ```bash
   npm install
   ```

2. **Create test images directory:**
   ```bash
   mkdir -p tests/test-images
   ```

3. **Add test images** to `tests/test-images/`:
   - `simple-logo.png` - Simple 2-3 color logo
   - `complex-illustration.png` - Detailed illustration with gradients
   - `line-art.png` - Black & white line drawing
   - `icon.png` - Simple icon (24x24 to 512x512)
   - `high-contrast.png` - High contrast black & white image

### Run Tests

```bash
node tests/run-tests.js
```

### What the Test Suite Checks

1. **SVG Validity**
   - Is valid SVG format
   - Contains proper SVG tags
   - Has viewBox attribute
   - Contains path elements

2. **Quality Metrics**
   - Path count (complexity indicator)
   - File size (efficiency)
   - Complexity level (simple/moderate/complex)

3. **Edge Case Requirements**
   - Each image type has specific requirements
   - Tests verify output meets minimum standards

---

## Key Quality Parameters

### For AI Vectorization (Recommended Method)

| Image Type | Min Paths | Max Paths | Min File Size | Expected Quality |
|------------|-----------|-----------|---------------|------------------|
| **Simple Logo** | 3 | 50 | 500 bytes | Clean, accurate colors |
| **Complex Illustration** | 50 | 5,000 | 5 KB | Detailed, preserves gradients |
| **Line Art** | 5 | 200 | 1 KB | Smooth, clean lines |
| **Photograph** | 100 | 10,000 | 10 KB | Highly detailed |
| **Icon** | 1 | 30 | 300 bytes | Simple, minimal |
| **High Contrast** | 5 | 500 | 1 KB | Sharp edges |

### For Potrace (Fallback)

| Image Type | Min Paths | Max Paths | Min File Size | Expected Quality |
|------------|-----------|-----------|---------------|------------------|
| **Simple Logo** | 3 | 50 | 500 bytes | Monochrome, clean |
| **Line Art** | 5 | 200 | 1 KB | Good for B&W only |
| **Icon** | 1 | 30 | 300 bytes | Basic shapes |
| **High Contrast** | 5 | 500 | 1 KB | Clean edges |

**Note:** Potrace is NOT recommended for:
- Colored images (converts to grayscale)
- Complex illustrations (loses detail)
- Photographs (poor quality)

---

## Expected Outputs

### ✅ Good AI Vectorization Output

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
  <path d="M150 150 L350 150 L250 350 Z" fill="#0076CE"/>
  <path d="M200 200 C250 150, 300 150, 350 200" stroke="#003C71"/>
  <!-- Multiple paths with colors and details -->
</svg>
```

**Characteristics:**
- ✓ Clean XML structure
- ✓ Proper viewBox
- ✓ Multiple paths with colors
- ✓ Smooth curves (Bezier curves)
- ✓ Preserves original colors
- ✓ Scalable without quality loss

### ✅ Good Potrace Output

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
  <path d="M100 100 L200 150 L150 200 Z" fill="#000000"/>
  <path d="M250 250 C300 200, 350 200, 400 250" fill="#000000"/>
  <!-- Clean paths, monochrome -->
</svg>
```

**Characteristics:**
- ✓ Valid SVG structure
- ✓ Clean path data
- ✓ Works well for simple shapes
- ✓ Monochrome (black/white)

### ❌ Bad Output (Problems to Watch For)

1. **Invalid SVG:**
   ```
   https://replicate.delivery/... (URL instead of SVG content)
   ```
   **Issue:** Not fetching actual SVG content

2. **Empty SVG:**
   ```xml
   <svg xmlns="http://www.w3.org/2000/svg"></svg>
   ```
   **Issue:** No paths generated

3. **Too Simple:**
   ```xml
   <svg><rect width="100" height="100"/></svg>
   ```
   **Issue:** Over-simplified, lost detail

4. **Too Complex:**
   - File size > 1MB for simple logo
   - Thousands of tiny paths
   **Issue:** Over-traced, not optimized

---

## Edge Cases to Test

### 1. **Transparent Backgrounds**
- **Test:** PNG with transparent background
- **Expected:** SVG preserves transparency
- **Check:** No white background in output

### 2. **Very Small Images**
- **Test:** 16x16 icon
- **Expected:** Still vectorizes, may have few paths
- **Check:** Scalable without pixelation

### 3. **Very Large Images**
- **Test:** 4000x4000 photo
- **Expected:** Processes but may be complex
- **Check:** Reasonable file size (<500KB)

### 4. **Low Contrast**
- **Test:** Gray on light gray
- **Expected:** AI handles well, Potrace struggles
- **Check:** Details preserved

### 5. **High Detail**
- **Test:** Detailed illustration
- **Expected:** Many paths, preserves detail
- **Check:** No loss of important features

### 6. **Gradients**
- **Test:** Image with color gradients
- **Expected:** AI preserves gradients, Potrace loses them
- **Check:** Smooth color transitions

### 7. **Text in Images**
- **Test:** Logo with text
- **Expected:** Text is readable
- **Check:** Letters are clear, not distorted

### 8. **Monochrome**
- **Test:** Pure black & white image
- **Expected:** Both methods work well
- **Check:** Clean, minimal paths

---

## Accuracy Tests

### Visual Comparison Test

1. **Upload original image** to vectorizer
2. **Download SVG output**
3. **Open both in design software** (Illustrator, Figma, Inkscape)
4. **Compare side-by-side:**
   - Colors match?
   - Shapes accurate?
   - Details preserved?
   - Edges smooth?

### Quantitative Metrics

Run automated tests to measure:

```bash
node tests/run-tests.js
```

**Metrics Checked:**
- ✓ SVG validity (must be 100%)
- ✓ Path count (within expected range)
- ✓ File size (efficient compression)
- ✓ Complexity level (appropriate for input)

### Designer Acceptance Criteria

Ask your designers to validate:

1. **Color Accuracy:** Colors match original within 5% tolerance
2. **Shape Fidelity:** Shapes are recognizable and accurate
3. **Edge Quality:** Edges are smooth, not jagged
4. **Scalability:** Can scale to 10x size without quality loss
5. **Editability:** Can be edited in Illustrator/Figma
6. **File Size:** Reasonable for web use (<200KB for typical logo)

---

## Troubleshooting

### AI Vectorization Not Working

**Symptoms:**
- Returns URL instead of SVG
- Empty results
- Error messages

**Solutions:**
1. Check API token is valid in `.env`
2. Verify server shows "AI Engine: Ready ✓"
3. Check network connection
4. Review server logs for errors

### Potrace Not Working

**Symptoms:**
- Black screen in results
- Very few or no paths
- Distorted output

**Solutions:**
1. Try simpler, higher contrast images
2. Convert image to pure black & white first
3. Increase image resolution
4. Use AI method instead for complex images

### Poor Quality Output

**For AI Method:**
- Use higher resolution source images (>500px)
- Ensure good contrast in original
- Try different image preprocessing

**For Potrace:**
- Only use for simple B&W images
- Increase contrast before upload
- Consider using AI method instead

---

## Quality Checklist

Use this checklist to validate outputs:

### AI Vectorization Quality Checklist

- [ ] SVG is valid and opens in design software
- [ ] Colors are preserved accurately
- [ ] Details are clear and sharp
- [ ] Gradients are smooth (if applicable)
- [ ] Edges are clean, not jagged
- [ ] Text is readable (if applicable)
- [ ] File size is reasonable (<500KB for typical images)
- [ ] Scales to 5x without quality loss
- [ ] Can be edited in vector software
- [ ] Meets designer approval

### Potrace Quality Checklist

- [ ] SVG is valid and opens in design software
- [ ] Shapes are recognizable
- [ ] Edges are reasonably smooth
- [ ] No major distortion
- [ ] Suitable for simple graphics only
- [ ] File size is small
- [ ] Can be edited in vector software

---

## Performance Benchmarks

### Expected Processing Times

| Image Type | Size | AI Method | Potrace |
|------------|------|-----------|---------|
| Simple Icon | 256x256 | 2-5 sec | <1 sec |
| Logo | 512x512 | 3-7 sec | 1-2 sec |
| Illustration | 1024x1024 | 5-15 sec | 2-5 sec |
| Photo | 2048x2048 | 10-30 sec | 5-10 sec |

**Note:** AI method times depend on Replicate API response time.

---

## Continuous Testing

### Recommended Testing Schedule

1. **After Setup:** Run full test suite
2. **After Code Changes:** Run affected tests
3. **Weekly:** Validate with new sample images
4. **Before Deployment:** Full regression test

### Creating Your Own Test Suite

1. Collect representative images from your use case
2. Add to `tests/test-images/`
3. Run tests and establish baseline
4. Compare future results against baseline

---

## Support

If tests consistently fail:
1. Check server logs for errors
2. Verify API configuration
3. Test with known-good sample images
4. Review test output in `tests/test-output/`
5. Check `test-report.json` for detailed metrics

For best results, use **AI Vectorization** for all production work and **Potrace** only as a free fallback for simple black & white graphics.
