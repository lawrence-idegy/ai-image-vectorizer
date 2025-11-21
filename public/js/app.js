// State management
let selectedFiles = [];
let currentMode = 'single'; // 'single' or 'batch'
let currentMethod = 'ai'; // 'ai' or 'potrace'

// DOM elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const processingSection = document.getElementById('processingSection');
const resultsSection = document.getElementById('resultsSection');
const resultsGrid = document.getElementById('resultsGrid');
const processingStatus = document.getElementById('processingStatus');
const newConversionBtn = document.getElementById('newConversionBtn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    checkServerHealth();
});

function setupEventListeners() {
    // Method selection
    document.querySelectorAll('.method-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.method-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            currentMethod = card.dataset.method;
        });
    });

    // Mode toggle
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMode = btn.dataset.mode;
            fileInput.multiple = currentMode === 'batch';
        });
    });

    // Drop zone events
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);

    // New conversion button
    newConversionBtn.addEventListener('click', resetApp);
}

function handleDragOver(e) {
    e.preventDefault();
    dropZone.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    dropZone.classList.remove('drag-over');

    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    addFiles(files);
}

function addFiles(files) {
    const validFiles = files.filter(file => {
        const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
        const maxSize = 10 * 1024 * 1024; // 10MB

        if (!validTypes.includes(file.type)) {
            showNotification(`${file.name} is not a supported format`, 'error');
            return false;
        }

        if (file.size > maxSize) {
            showNotification(`${file.name} exceeds 10MB limit`, 'error');
            return false;
        }

        return true;
    });

    if (currentMode === 'single') {
        selectedFiles = validFiles.slice(0, 1);
    } else {
        selectedFiles = [...selectedFiles, ...validFiles].slice(0, 20);
    }

    renderFileList();
}

function renderFileList() {
    if (selectedFiles.length === 0) {
        fileList.innerHTML = '';
        return;
    }

    fileList.innerHTML = `
        ${selectedFiles.map((file, index) => `
            <div class="file-item" data-index="${index}">
                <img class="file-preview" src="${URL.createObjectURL(file)}" alt="${file.name}">
                <div class="file-info-container">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${formatFileSize(file.size)}</div>
                </div>
                <button class="file-remove" onclick="removeFile(${index})">Remove</button>
            </div>
        `).join('')}
        <button class="convert-btn" onclick="startConversion()">
            Vectorize ${selectedFiles.length} Image${selectedFiles.length > 1 ? 's' : ''}
        </button>
    `;
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    renderFileList();
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function startConversion() {
    if (selectedFiles.length === 0) return;

    // Hide upload section, show processing
    document.querySelector('.upload-section').style.display = 'none';
    processingSection.style.display = 'block';
    resultsSection.style.display = 'none';

    // Get advanced options
    const removeBackground = document.getElementById('removeBackground')?.checked || false;
    const detailLevel = document.getElementById('detailLevel')?.value || 'medium';

    try {
        const formData = new FormData();

        if (currentMode === 'single') {
            formData.append('image', selectedFiles[0]);
            formData.append('method', currentMethod);
            formData.append('removeBackground', removeBackground.toString());
            formData.append('detailLevel', detailLevel);
            processingStatus.textContent = removeBackground ? 'Removing background and converting...' : 'Converting image...';

            const response = await fetch('/api/vectorize', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Conversion failed');
            }

            displayResults([result]);
        } else {
            selectedFiles.forEach(file => {
                formData.append('images', file);
            });
            formData.append('method', currentMethod);
            formData.append('removeBackground', removeBackground.toString());
            formData.append('detailLevel', detailLevel);
            processingStatus.textContent = `Converting ${selectedFiles.length} images...`;

            const response = await fetch('/api/vectorize/batch', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Batch conversion failed');
            }

            displayResults(result.results);
        }
    } catch (error) {
        console.error('Conversion error:', error);
        showNotification(error.message, 'error');
        resetApp();
    }
}

function displayResults(results) {
    processingSection.style.display = 'none';
    resultsSection.style.display = 'block';

    resultsGrid.innerHTML = results.map((result, index) => {
        if (result.success) {
            // Create preview URL by replacing /download/ with /preview/
            const previewUrl = result.downloadUrl.replace('/download/', '/preview/');

            // Build quality metrics display
            let qualityHTML = '';
            if (result.quality) {
                const q = result.quality;
                const ratingColor = q.rating === 'excellent' ? 'var(--idegy-teal)' :
                                   q.rating === 'good' ? 'var(--idegy-blue)' :
                                   q.rating === 'fair' ? 'var(--idegy-coral)' : 'var(--error-color)';

                // True vector status with prominent display
                const vectorStatus = q.isTrueVector !== undefined ?
                    (q.isTrueVector && !q.hasEmbeddedRaster ?
                        '<div style="background: rgba(0, 178, 169, 0.15); color: var(--idegy-teal); padding: 0.5rem; border-radius: 6px; margin-bottom: 0.5rem; font-weight: 700; text-align: center;">✓ TRUE VECTOR - Scales Infinitely</div>' :
                        '<div style="background: rgba(224, 60, 49, 0.15); color: var(--error-color); padding: 0.5rem; border-radius: 6px; margin-bottom: 0.5rem; font-weight: 700; text-align: center;">✗ NOT TRUE VECTOR - Contains Pixels</div>'
                    ) : '';

                qualityHTML = `
                    <div class="quality-metrics" style="margin: 0.75rem 0; padding: 0.75rem; background: var(--surface-hover); border-radius: 8px; font-size: 0.85rem;">
                        ${vectorStatus}
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span style="font-weight: 600;">Quality Score:</span>
                            <span style="color: ${ratingColor}; font-weight: 700;">${q.score}/100 (${q.rating.toUpperCase()})</span>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem; color: var(--text-secondary);">
                            <div>Vector Elements: ${q.vectorElements || q.pathCount}</div>
                            <div>Size: ${q.fileSizeKB} KB</div>
                            <div>Complexity: ${q.complexity}</div>
                            <div>Colors: ${q.colorCount}</div>
                        </div>
                        ${q.warnings.length > 0 ? `
                            <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border);">
                                ${q.warnings.slice(0, 3).map(w => `<div style="color: var(--warning-color); font-size: 0.8rem;">${w}</div>`).join('')}
                            </div>
                        ` : ''}
                        ${q.recommendations && q.recommendations.length > 0 ? `
                            <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border);">
                                ${q.recommendations.slice(0, 2).map(r => `<div style="color: var(--text-secondary); font-size: 0.8rem;">${r}</div>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
            }

            return `
                <div class="result-card">
                    <div class="result-preview">
                        <object type="image/svg+xml" data="${previewUrl}" width="100%" height="100%">
                            SVG Preview
                        </object>
                    </div>
                    <div class="result-info">
                        <div class="result-filename">${result.originalFilename || result.outputFilename}</div>
                        <div class="result-status success">Success</div>
                        ${qualityHTML}
                        <div class="result-actions">
                            <button class="btn btn-primary" onclick="downloadFile('${result.downloadUrl}', '${result.outputFilename}')">
                                Download SVG
                            </button>
                            <button class="btn btn-secondary" onclick="showFormatOptions('${result.outputFilename}')">
                                Export As...
                            </button>
                            <button class="btn btn-secondary" onclick="previewFile('${previewUrl}')">
                                Preview
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="result-card">
                    <div class="result-preview">
                        <p style="color: var(--error-color);">Conversion failed</p>
                    </div>
                    <div class="result-info">
                        <div class="result-filename">${result.originalFilename}</div>
                        <div class="result-status error">Failed</div>
                        <p style="color: var(--text-secondary); font-size: 0.9rem;">${result.error}</p>
                    </div>
                </div>
            `;
        }
    }).join('');
}

async function downloadFile(url, filename) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Clean up
        window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
        console.error('Download failed:', error);
        showNotification('Download failed. Please try again.', 'error');
    }
}

function previewFile(url) {
    window.open(url, '_blank', 'width=800,height=600');
}

function resetApp() {
    selectedFiles = [];
    document.querySelector('.upload-section').style.display = 'block';
    processingSection.style.display = 'none';
    resultsSection.style.display = 'none';
    fileList.innerHTML = '';
    fileInput.value = '';
}

function showNotification(message, type = 'info') {
    // Simple notification - you can enhance this with a toast library
    alert(message);
}

async function checkServerHealth() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();

        if (!data.aiEngineReady) {
            console.warn('AI engine not configured. Only Potrace will be available.');
        }
    } catch (error) {
        console.error('Server health check failed:', error);
    }
}

// Format export functionality
async function showFormatOptions(filename) {
    const formats = ['pdf', 'eps', 'ai'];
    const formatNames = { pdf: 'PDF', eps: 'EPS', ai: 'AI (Illustrator)' };

    const choice = prompt(`Export ${filename} as:\n\n1. PDF (Professional printing)\n2. EPS (Legacy software)\n3. AI (Adobe Illustrator)\n\nEnter format (pdf/eps/ai):`);

    if (choice && formats.includes(choice.toLowerCase())) {
        await exportFormat(filename, choice.toLowerCase());
    }
}

async function exportFormat(filename, format) {
    try {
        const response = await fetch('/api/convert/' + filename, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ format })
        });

        const result = await response.json();

        if (result.success) {
            // Auto-download the converted file
            await downloadFile(result.downloadUrl, result.outputFilename);
            showNotification(`Exported as ${format.toUpperCase()} successfully!`, 'success');
        } else {
            showNotification(`Export failed: ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('Export error:', error);
        showNotification('Export failed. Please try again.', 'error');
    }
}

// Help modal functions
function showHelp() {
    document.getElementById('helpModal').style.display = 'flex';
}

function closeHelp() {
    document.getElementById('helpModal').style.display = 'none';
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('helpModal');
    if (event.target == modal) {
        closeHelp();
    }
};

// Global function exposure for inline onclick handlers
window.removeFile = removeFile;
window.startConversion = startConversion;
window.downloadFile = downloadFile;
window.previewFile = previewFile;
window.showFormatOptions = showFormatOptions;
window.showHelp = showHelp;
window.closeHelp = closeHelp;
