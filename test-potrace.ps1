# Test Potrace vectorization
$imagePath = "Celsius_Holdings_Logo-3.jpg"
$url = "http://localhost:3000/api/vectorize"

$form = @{
    image = Get-Item -Path $imagePath
    method = "potrace"
    detailLevel = "medium"
}

try {
    Write-Host "Testing Potrace vectorization..." -ForegroundColor Cyan
    $response = Invoke-RestMethod -Uri $url -Method Post -Form $form

    if ($response.success) {
        Write-Host "✓ Potrace test PASSED" -ForegroundColor Green
        Write-Host "  Method: $($response.method)"
        Write-Host "  Output: $($response.outputFilename)"
        Write-Host "  Quality Score: $($response.quality.score)/100"
        Write-Host "  True Vector: $($response.quality.isTrueVector)"
        Write-Host "  Path Count: $($response.quality.pathCount)"

        # Check if output file exists
        if (Test-Path "output\$($response.outputFilename)") {
            Write-Host "  ✓ Output file created successfully" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Output file not found!" -ForegroundColor Red
        }
    } else {
        Write-Host "✗ Potrace test FAILED" -ForegroundColor Red
        Write-Host "  Error: $($response.message)"
    }
} catch {
    Write-Host "✗ Potrace test FAILED with exception" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)"
}
