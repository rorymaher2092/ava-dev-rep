// bpmnRenderer.ts
import avaLogo from "../assets/ava-white-noborder.png";

export function openBpmnDiagram(bpmnXml: string): void {
    // Clean the BPMN XML - remove escape sequences
    const cleanedXml = bpmnXml.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();

    // Create the HTML content with the working demo app structure
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BPMN Process Diagram</title>
    
    <!-- BPMN.js CSS - Updated to match working demo -->
    <link rel="stylesheet" href="https://unpkg.com/bpmn-js@17.8.3/dist/assets/diagram-js.css">
    <link rel="stylesheet" href="https://unpkg.com/bpmn-js@17.8.3/dist/assets/bpmn-font/css/bpmn.css">
    <link rel="stylesheet" href="https://unpkg.com/bpmn-js@17.8.3/dist/assets/bpmn-js.css">
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        html, body {
            height: 100%;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f5f5f5;
        }
        
        .header {
            background: #0f1c47;
            color: white;
            padding: 20px;
            text-align: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
        }
        
        .header-content {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        
        .header-logo {
            width: 60px;
            height: 60px;
            margin-right: 15px;
            border: none;
            outline: none;
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
            background: #0f1c47;
            color: white;
        }
        
        .btn-primary:hover {
            background: #1a2951;
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
        
        #canvas {
            width: 100%;
            height: calc(100vh - 140px);
            background: white;
            position: relative;
        }
        
        .error {
            color: #d32f2f;
            text-align: center;
            padding: 50px;
            font-size: 16px;
        }
        
        .loading {
            text-align: center;
            padding: 50px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="header">
        <img src="${avaLogo}" alt="Ava Logo" class="header-logo" id="ava-logo">
        <div class="header-content">
            <h1>Business Process Diagram</h1>
            <p>Interactive BPMN Process Model</p>
        </div>
    </div>
    
    <div class="controls">
        <button class="btn btn-primary" onclick="fitViewport()">🔍 Fit to Screen</button>
        <button class="btn btn-secondary" onclick="zoomIn()">➕ Zoom In</button>
        <button class="btn btn-secondary" onclick="zoomOut()">➖ Zoom Out</button>
        <button class="btn btn-secondary" onclick="downloadSVG()">📥 Download SVG</button>
        <button class="btn btn-secondary" onclick="downloadBPMN()">📄 Download BPMN</button>
        <button class="btn btn-secondary" onclick="downloadPNG()">🖼️ Download PNG</button>
        <button class="btn btn-secondary" onclick="toggleFullscreen()">⛶ Fullscreen</button>
    </div>
    
    <div id="canvas">
        <div class="loading">Loading BPMN diagram...</div>
    </div>
    
    <!-- BPMN.js Modeler Script - Updated version to match demo -->
    <script src="https://unpkg.com/bpmn-js@17.8.3/dist/bpmn-modeler.development.js"></script>
    
    <script>
        let bpmnModeler;
        const bpmnXmlData = ${JSON.stringify(cleanedXml)};
        
        async function initModeler() {
            const canvas = document.getElementById('canvas');
            
            try {
                // Clear loading message
                canvas.innerHTML = '';
                
                // Create modeler with editing capabilities
                bpmnModeler = new BpmnJS({
                    container: '#canvas',
                    keyboard: {
                        bindTo: window
                    }
                });
                
                // Import the BPMN XML
                await bpmnModeler.importXML(bpmnXmlData);
                
                // Fit diagram to viewport
                fitViewport();
                
                console.log('BPMN diagram loaded successfully');
                
            } catch (error) {
                console.error('Error loading BPMN:', error);
                canvas.innerHTML = '<div class="error">Error loading BPMN diagram: ' + error.message + '</div>';
            }
        }
        
        function fitViewport() {
            if (bpmnModeler) {
                const canvas = bpmnModeler.get('canvas');
                canvas.zoom('fit-viewport');
            }
        }
        
        function zoomIn() {
            if (bpmnModeler) {
                const canvas = bpmnModeler.get('canvas');
                const currentZoom = canvas.zoom();
                canvas.zoom(currentZoom * 1.2);
            }
        }
        
        function zoomOut() {
            if (bpmnModeler) {
                const canvas = bpmnModeler.get('canvas');
                const currentZoom = canvas.zoom();
                canvas.zoom(currentZoom * 0.8);
            }
        }
        
        async function downloadSVG() {
            if (!bpmnModeler) return;
            try {
                const { svg } = await bpmnModeler.saveSVG({ format: true });
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
        
        async function downloadBPMN() {
            if (!bpmnModeler) return;
            try {
                const { xml } = await bpmnModeler.saveXML({ format: true });
                const blob = new Blob([xml], { type: 'application/xml' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'process-diagram.bpmn';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (error) {
                alert('Failed to download BPMN: ' + error.message);
            }
        }
        
        async function downloadPNG() {
            if (!bpmnModeler) return;
            try {
                const { svg } = await bpmnModeler.saveSVG({ format: true });
                
                // Convert SVG to PNG
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const img = new Image();
                
                img.onload = function() {
                    // Set canvas dimensions
                    canvas.width = img.width || 1200;
                    canvas.height = img.height || 800;
                    
                    // White background
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    
                    // Draw the image
                    ctx.drawImage(img, 0, 0);
                    
                    // Convert to blob and download
                    canvas.toBlob(function(blob) {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'process-diagram.png';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    }, 'image/png');
                };
                
                // Convert SVG to data URL
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
        document.addEventListener('DOMContentLoaded', initModeler);
        
        // Handle window resize
        window.addEventListener('resize', function() {
            if (bpmnModeler) {
                bpmnModeler.get('canvas').resized();
            }
        });
    </script>
</body>
</html>`;

    // Open in new tab
    const newWindow = window.open("", "_blank");
    if (newWindow) {
        newWindow.document.write(html);
        newWindow.document.close();
    } else {
        console.error("Failed to open new window for BPMN diagram");
        alert("Please allow pop-ups for this site to view the BPMN diagram");
    }
}
