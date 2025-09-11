// bpmnRenderer.ts

export function openBpmnDiagram(bpmnXml: string): void {
    // Clean and validate the BPMN XML
    const cleanedXml = bpmnXml
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .trim();

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Process Diagram - BPMN</title>
    
    <!-- BPMN.js CSS -->
    <link rel="stylesheet" href="https://unpkg.com/bpmn-js@11.5.0/dist/assets/diagram-js.css">
    <link rel="stylesheet" href="https://unpkg.com/bpmn-js@11.5.0/dist/assets/bpmn-font/css/bpmn.css">
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f5f5f5;
            height: 100vh;
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            text-align: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        .header h1 {
            font-size: 1.8em;
            margin-bottom: 5px;
            font-weight: 300;
        }
        
        .header p {
            font-size: 0.9em;
            opacity: 0.9;
        }
        
        .controls {
            background: white;
            padding: 15px;
            text-align: center;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            display: flex;
            justify-content: center;
            gap: 10px;
            flex-wrap: wrap;
        }
        
        .btn {
            padding: 10px 20px;
            margin: 0 5px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s ease;
            font-size: 14px;
        }
        
        .btn-primary {
            background: #667eea;
            color: white;
        }
        
        .btn-primary:hover {
            background: #5a67d8;
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }
        
        .btn-secondary {
            background: #f8f9fa;
            color: #333;
            border: 1px solid #ddd;
        }
        
        .btn-secondary:hover {
            background: #e9ecef;
            transform: translateY(-1px);
        }
        
        #bpmnContainer {
            width: 100%;
            height: calc(100vh - 140px);
            background: white;
            position: relative;
        }
        
        .zoom-controls {
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 10;
            background: white;
            border-radius: 5px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            padding: 5px;
        }
        
        .zoom-btn {
            width: 35px;
            height: 35px;
            border: none;
            background: white;
            cursor: pointer;
            font-size: 18px;
            border-radius: 3px;
            transition: background 0.3s;
        }
        
        .zoom-btn:hover {
            background: #f0f0f0;
        }
        
        .properties-panel {
            position: absolute;
            top: 10px;
            left: 10px;
            z-index: 10;
            background: white;
            border-radius: 5px;
            padding: 10px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            max-width: 250px;
            display: none;
        }
        
        .properties-panel h3 {
            margin: 0 0 10px 0;
            font-size: 14px;
        }
        
        .property {
            margin: 5px 0;
            font-size: 12px;
        }
        
        .property-label {
            font-weight: bold;
        }
        
        .error {
            color: #d32f2f;
            text-align: center;
            padding: 50px;
            font-size: 16px;
        }
        
        .error details {
            margin-top: 20px;
            text-align: left;
            max-width: 800px;
            margin-left: auto;
            margin-right: auto;
        }
        
        .error pre {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Business Process Diagram</h1>
        <p>Interactive BPMN Process Model</p>
    </div>
    
    <div class="controls">
        <button class="btn btn-primary" onclick="fitViewport()">🔍 Fit to Screen</button>
        <button class="btn btn-secondary" onclick="zoomIn()">➕ Zoom In</button>
        <button class="btn btn-secondary" onclick="zoomOut()">➖ Zoom Out</button>
        <button class="btn btn-secondary" onclick="downloadSVG()">📥 Download SVG</button>
        <button class="btn btn-secondary" onclick="downloadBPMN()">📄 Download BPMN</button>
        <button class="btn btn-secondary" onclick="downloadPNG()">🖼️ Download PNG</button>
        <button class="btn btn-secondary" onclick="window.print()">🖨️ Print</button>
        <button class="btn btn-secondary" onclick="toggleFullscreen()">⛶ Fullscreen</button>
    </div>
    
    <div id="bpmnContainer">
        <div class="zoom-controls">
            <button class="zoom-btn" onclick="zoomIn()" title="Zoom In">+</button>
            <button class="zoom-btn" onclick="zoomOut()" title="Zoom Out">−</button>
            <button class="zoom-btn" onclick="fitViewport()" title="Fit">⊡</button>
        </div>
        <div class="properties-panel" id="propertiesPanel">
            <h3>Element Properties</h3>
            <div id="properties"></div>
        </div>
    </div>
    
    <script src="https://unpkg.com/bpmn-js@11.5.0/dist/bpmn-navigated-viewer.production.min.js"></script>
    <script>
        let viewer;
        const bpmnXmlData = ${JSON.stringify(cleanedXml)};
        
        async function initViewer() {
            viewer = new BpmnJS({ 
                container: '#bpmnContainer',
                keyboard: {
                    bindTo: window
                }
            });
            
            try {
                await viewer.importXML(bpmnXmlData);
                
                // Auto-layout if needed
                const canvas = viewer.get('canvas');
                const elementRegistry = viewer.get('elementRegistry');
                
                // Check if diagram has no layout information
                const elements = elementRegistry.getAll();
                let needsLayout = true;
                
                elements.forEach(element => {
                    if (element.x !== undefined && element.y !== undefined) {
                        needsLayout = false;
                    }
                });
                
                if (needsLayout) {
                    autoLayout();
                }
                
                fitViewport();
                setupEventListeners();
                console.log('BPMN diagram loaded successfully');
                
            } catch (error) {
                console.error('Error loading BPMN:', error);
                document.getElementById('bpmnContainer').innerHTML = 
                    '<div class="error">' +
                    '<h2>Error loading BPMN diagram</h2>' +
                    '<p>' + error.message + '</p>' +
                    '<details>' +
                    '<summary>Show BPMN XML</summary>' +
                    '<pre>' + escapeHtml(bpmnXmlData) + '</pre>' +
                    '</details>' +
                    '</div>';
            }
        }
        
        function escapeHtml(text) {
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };
            return text.replace(/[&<>"']/g, m => map[m]);
        }
        
        function autoLayout() {
            // Simple auto-layout algorithm
            const elementRegistry = viewer.get('elementRegistry');
            const modeling = viewer.get('modeling');
            
            let x = 100;
            let y = 100;
            const spacing = 150;
            
            // Position elements in a simple left-to-right flow
            elementRegistry.forEach(element => {
                if (element.type === 'bpmn:Process' || element.type === 'label') {
                    return;
                }
                
                if (element.businessObject) {
                    modeling.moveElements([element], { x: x - (element.x || 0), y: y - (element.y || 0) });
                    x += spacing;
                    
                    // Wrap to next line if too wide
                    if (x > 1000) {
                        x = 100;
                        y += 150;
                    }
                }
            });
        }
        
        function setupEventListeners() {
            const eventBus = viewer.get('eventBus');
            const canvas = viewer.get('canvas');
            
            // Click on element to show properties
            eventBus.on('element.click', function(e) {
                const element = e.element;
                if (element.type !== 'bpmn:Process') {
                    showProperties(element);
                }
            });
            
            // Double click to center
            eventBus.on('element.dblclick', function(e) {
                canvas.zoom('fit-viewport', 'auto');
            });
            
            // Keyboard shortcuts
            document.addEventListener('keydown', function(e) {
                if (e.ctrlKey || e.metaKey) {
                    switch(e.key) {
                        case '=':
                        case '+':
                            e.preventDefault();
                            zoomIn();
                            break;
                        case '-':
                            e.preventDefault();
                            zoomOut();
                            break;
                        case '0':
                            e.preventDefault();
                            fitViewport();
                            break;
                    }
                }
            });
        }
        
        function showProperties(element) {
            const panel = document.getElementById('propertiesPanel');
            const propertiesDiv = document.getElementById('properties');
            
            let html = '';
            html += '<div class="property"><span class="property-label">ID:</span> ' + element.id + '</div>';
            html += '<div class="property"><span class="property-label">Type:</span> ' + element.type.replace('bpmn:', '') + '</div>';
            
            if (element.businessObject && element.businessObject.name) {
                html += '<div class="property"><span class="property-label">Name:</span> ' + element.businessObject.name + '</div>';
            }
            
            propertiesDiv.innerHTML = html;
            panel.style.display = 'block';
        }
        
        function fitViewport() {
            if (viewer) {
                const canvas = viewer.get('canvas');
                canvas.zoom('fit-viewport');
            }
        }
        
        function zoomIn() {
            if (viewer) {
                const canvas = viewer.get('canvas');
                const currentZoom = canvas.zoom();
                canvas.zoom(currentZoom * 1.2);
            }
        }
        
        function zoomOut() {
            if (viewer) {
                const canvas = viewer.get('canvas');
                const currentZoom = canvas.zoom();
                canvas.zoom(currentZoom * 0.8);
            }
        }
        
        async function downloadSVG() {
            if (!viewer) return;
            try {
                const { svg } = await viewer.saveSVG({ format: true });
                const blob = new Blob([svg], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'process-diagram.svg';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (error) {
                alert('Failed to download SVG: ' + error.message);
            }
        }
        
        function downloadBPMN() {
            const blob = new Blob([bpmnXmlData], { type: 'application/xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'process-diagram.bpmn';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        
        async function downloadPNG() {
            if (!viewer) return;
            try {
                const { svg } = await viewer.saveSVG({ format: true });
                
                // Convert SVG to PNG
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const img = new Image();
                
                img.onload = function() {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    
                    canvas.toBlob(function(blob) {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'process-diagram.png';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    });
                };
                
                const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
                const svgUrl = URL.createObjectURL(svgBlob);
                img.src = svgUrl;
                
            } catch (error) {
                alert('Failed to download PNG: ' + error.message);
            }
        }
        
        function toggleFullscreen() {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        }
        
        // Initialize on load
        document.addEventListener('DOMContentLoaded', initViewer);
        
        // Handle window resize
        window.addEventListener('resize', function() {
            if (viewer) {
                viewer.get('canvas').resized();
            }
        });
    </script>
</body>
</html>`;
    
    // Open new tab and write the HTML
    const newWindow = window.open('', '_blank');
    if (newWindow) {
        newWindow.document.write(html);
        newWindow.document.close();
    } else {
        console.error('Failed to open new window for BPMN diagram');
        alert('Please allow pop-ups for this site to view the BPMN diagram');
    }
}   