# Testing the idegy AI Image Vectorizer

## Quick Start Testing

### 1. Manual Testing (Recommended First Step)

**Test Potrace:**
```
1. Start server: npm start
2. Open: http://localhost:3000
3. Select "Potrace (Fallback)"
4. Upload a simple black & white logo
5. Check result has quality score shown
6. Download and open in Illustrator/Inkscape
```

**Test AI Vectorization:**
```
1. Select "AI Vectorization (Recommended)"
2. Upload a colored logo or complex image
3. Check quality metrics (should be 70+ score)
4. Download and open in design software
5. Verify colors and details are preserved
```

### 2. Automated Testing

**Install and Run:**
```bash
# Install dependencies (if needed)
npm install

# Run automated tests
node tests/run-tests.js
```

**Expected Output:**
```
✅ Server is running
   - AI Engine: ✓ Ready

📁 Checking for test images...
   ✓ Found: simple-logo.png
   ⚠ Missing: complex-illustration.png

🚀 Running tests...
═══════════════════════════════════════

🧪 Testing: simple-logo.png (Method: ai, Case: simple-logo)
   ✓ Vectorized with Replicate AI (recraft-vectorize)
   ✓ Saved to: simple-logo_ai.svg
   📊 Metrics:
      - Valid SVG: ✓
      - Path Count: 12
      - Complexity: simple
      - File Size: 2.34 KB
   ✅ TEST PASSED

📊 TEST REPORT
═══════════════════════════════════════
📈 Summary:
   Total Tests: 2
   Passed: 2 ✅
   Failed: 0 ❌
   Pass Rate: 100%
```

## What Each Method Tests

### AI Vectorization Tests
- ✓ Preserves colors accurately
- ✓ Handles complex shapes and gradients
- ✓ Generates clean, editable paths
- ✓ Produces professional-quality output
- ✓ Maintains detail in complex images

### Potrace Tests
- ✓ Works for simple black & white images
- ✓ Generates clean monochrome paths
- ✓ Fast local processing
- ✓ Good for line art and icons
- ⚠ Not suitable for colored/complex images

## Quality Metrics Explained

### Quality Score (0-100)
- **90-100 (Excellent)**: Production-ready, high quality
- **70-89 (Good)**: Acceptable for most uses
- **50-69 (Fair)**: May need manual cleanup
- **0-49 (Poor)**: Not suitable, try different method

### Path Count
- **1-10**: Very simple (icons, basic shapes)
- **10-100**: Simple to moderate (logos, illustrations)
- **100-1000**: Complex (detailed illustrations)
- **1000+**: Very complex (photographs, detailed art)

### Complexity Levels
- **Simple**: Clean, minimal paths (best for web)
- **Moderate**: Good balance of detail and efficiency
- **Complex**: Highly detailed, may be large file
- **Very Complex**: Extremely detailed, consider optimization

### File Size Guidelines
- **<10 KB**: Excellent for web use
- **10-100 KB**: Good for most applications
- **100-500 KB**: Acceptable but consider optimization
- **>500 KB**: Very large, optimize before web use

## Testing Without Test Images

You can test with ANY images:

```bash
# Test a specific file
curl -X POST http://localhost:3000/api/vectorize \
  -F "image=@/path/to/your/image.png" \
  -F "method=ai" | jq .quality
```

Expected response includes quality metrics:
```json
{
  "quality": {
    "score": 85,
    "rating": "good",
    "complexity": "moderate",
    "pathCount": 42,
    "fileSizeKB": "12.34",
    "hasColors": true,
    "colorCount": 5,
    "warnings": [],
    "recommendations": ["✓ Excellent quality - ready for production use"]
  }
}
```

## Common Test Scenarios

### Scenario 1: Simple Logo Test
```
Image: Simple 2-3 color logo
Method: Try BOTH ai and potrace
Expected AI Result:
  - Score: 80-100
  - Paths: 5-30
  - Colors preserved
Expected Potrace Result:
  - Score: 60-80
  - Paths: 5-30
  - Monochrome only
```

### Scenario 2: Complex Illustration
```
Image: Detailed illustration with gradients
Method: AI only (Potrace will fail)
Expected Result:
  - Score: 70-100
  - Paths: 100-1000
  - Gradients preserved
  - Larger file size acceptable
```

### Scenario 3: Line Art
```
Image: Black & white line drawing
Method: Both methods work
Expected AI Result:
  - Score: 80-100
  - Cleaner paths
Expected Potrace Result:
  - Score: 70-90
  - Good quality, faster
```

## Validation Checklist

After vectorization, verify:

- [ ] SVG opens in web browser
- [ ] SVG opens in Illustrator/Figma/Inkscape
- [ ] Quality score is 70+ (or acceptable for use case)
- [ ] Colors match original (for AI method)
- [ ] Shapes are accurate
- [ ] Edges are smooth, not jagged
- [ ] File size is reasonable
- [ ] Can be edited in vector software
- [ ] Scales without quality loss

## Troubleshooting

### "AI Engine: Not configured"
```bash
# Check .env file exists with token
cat .env

# Should see:
REPLICATE_API_TOKEN=r8_your_token_here

# Restart server
npm start
```

### "Test images not found"
```bash
# Create directory and add images
mkdir -p tests/test-images
# Add your test images to this directory
```

### "Quality score is low"
- Try different image (higher resolution, better contrast)
- For colored images, use AI method only
- For simple graphics, try Potrace
- Check if source image is suitable for vectorization

### "Too many paths (complex output)"
- Normal for detailed images
- Consider simplifying source image
- Or optimize SVG after download

## Edge Cases to Test

1. **Transparent PNG**: Should preserve transparency
2. **Very small image** (16x16): May have few paths but should work
3. **Very large image** (4000x4000): May be slow but should complete
4. **Low contrast**: AI handles better than Potrace
5. **Gradients**: AI preserves, Potrace loses them
6. **Text in image**: Should remain readable
7. **Monochrome**: Both methods work well

## Performance Expectations

| Image Type | AI Method | Potrace |
|------------|-----------|---------|
| Simple icon (256x256) | 2-5 sec | <1 sec |
| Logo (512x512) | 3-7 sec | 1-2 sec |
| Illustration (1024x1024) | 5-15 sec | 2-5 sec |

## Success Criteria

**Minimum Acceptable:**
- Quality score: 50+
- Valid SVG: Yes
- Has paths: Yes
- Opens in design software: Yes

**Production Ready:**
- Quality score: 70+
- Colors accurate: Yes
- Editable paths: Yes
- File size reasonable: <200 KB for typical logo

**Excellent:**
- Quality score: 90+
- Zero warnings
- Professional appearance
- Designer approved

## Need Help?

1. Check server logs for errors
2. Review TESTING_GUIDE.md for detailed info
3. Try with known-good test images first
4. Verify API configuration in .env
5. Check test-output/ for generated files

Remember: **AI method is recommended for all production work.** Use Potrace only as a free fallback for simple black & white graphics.
