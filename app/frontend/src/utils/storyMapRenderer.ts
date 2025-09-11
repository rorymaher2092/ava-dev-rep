// Global canvas state
let canvasOpenCallback: ((htmlContent: string) => void) | null = null;

export function setCanvasOpenCallback(callback: (htmlContent: string) => void) {
    canvasOpenCallback = callback;
}

export function openStoryMapCanvas(htmlContent: string): void {
    // Use split-screen if callback is available, otherwise fallback to new window
    if (canvasOpenCallback) {
        canvasOpenCallback(htmlContent);
        return;
    }
    
    // Fallback to new window
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Story Map - Ava</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            min-height: 100vh;
        }
        .header {
            background: white;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            margin-bottom: 20px;
            text-align: center;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .header h1 {
            margin: 0;
            color: #2c3e50;
            font-size: 24px;
            font-weight: 700;
        }
        .controls {
            display: flex;
            gap: 10px;
        }
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s ease;
        }
        .btn-primary {
            background: #3498db;
            color: white;
        }
        .btn-primary:hover {
            background: #2980b9;
        }
        .btn-secondary {
            background: #95a5a6;
            color: white;
        }
        .btn-secondary:hover {
            background: #7f8c8d;
        }
        .story-map-container {
            background: white;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            overflow: auto;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
            font-size: 14px;
        }
        th, td {
            border: 1px solid #e1e8ed;
            padding: 14px 12px;
            text-align: left;
            vertical-align: top;
            position: relative;
        }
        th {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 12px;
            letter-spacing: 0.5px;
            position: sticky;
            top: 0;
            z-index: 10;
        }
        tr:nth-child(even) {
            background-color: #f8f9fa;
        }
        tr:hover {
            background-color: #e3f2fd;
            transform: scale(1.001);
            transition: all 0.2s ease;
        }
        .row-label {
            background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%) !important;
            font-weight: 600;
            color: #2c3e50;
            text-align: center;
            position: sticky;
            left: 0;
            z-index: 5;
        }
        .process-stage {
            background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%) !important;
            font-weight: bold;
            text-align: center;
            color: #2c3e50;
        }
        .persona-system {
            background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%) !important;
            font-style: italic;
            color: #8b4513;
        }
        .requirements ul {
            margin: 5px 0;
            padding-left: 18px;
        }
        .requirements li {
            margin-bottom: 4px;
            line-height: 1.4;
        }
        .collapsible {
            cursor: pointer;
            user-select: none;
        }
        .collapsible:hover {
            background-color: #e8f4f8;
        }
        .content {
            max-height: 200px;
            overflow: hidden;
            transition: max-height 0.3s ease;
        }
        .content.expanded {
            max-height: none;
        }
        .expand-btn {
            position: absolute;
            top: 5px;
            right: 5px;
            background: #3498db;
            color: white;
            border: none;
            border-radius: 3px;
            width: 20px;
            height: 20px;
            font-size: 12px;
            cursor: pointer;
            display: none;
        }
        td:hover .expand-btn {
            display: block;
        }
        @media print {
            body { background: white; }
            .header { box-shadow: none; }
            .story-map-container { box-shadow: none; }
            .controls { display: none; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>📋 Story Map Canvas</h1>
            <p style="margin: 5px 0 0 0; color: #7f8c8d; font-size: 14px;">Generated by Ava - Advanced Vocus Assistant</p>
        </div>
        <div class="controls">
            <button class="btn btn-secondary" onclick="toggleExpand()">Toggle Expand</button>
            <button class="btn btn-primary" onclick="window.print()">Print/Export</button>
        </div>
    </div>
    
    <div class="story-map-container">
        ${htmlContent}
    </div>

    <script>
        function toggleExpand() {
            const contents = document.querySelectorAll('.content');
            contents.forEach(content => {
                content.classList.toggle('expanded');
            });
        }
        
        // Add expand buttons to cells with lots of content
        document.addEventListener('DOMContentLoaded', function() {
            const cells = document.querySelectorAll('td');
            cells.forEach(cell => {
                if (cell.scrollHeight > 200) {
                    const btn = document.createElement('button');
                    btn.className = 'expand-btn';
                    btn.innerHTML = '+';
                    btn.onclick = function(e) {
                        e.stopPropagation();
                        const content = cell.querySelector('.content') || cell;
                        content.classList.toggle('expanded');
                        btn.innerHTML = content.classList.contains('expanded') ? '-' : '+';
                    };
                    cell.appendChild(btn);
                    
                    // Wrap content
                    const wrapper = document.createElement('div');
                    wrapper.className = 'content';
                    while (cell.firstChild && cell.firstChild !== btn) {
                        wrapper.appendChild(cell.firstChild);
                    }
                    cell.insertBefore(wrapper, btn);
                }
            });
        });
    </script>
</body>
</html>`;

    const newWindow = window.open('', '_blank', 'width=1400,height=900,scrollbars=yes,resizable=yes');
    if (newWindow) {
        newWindow.document.write(html);
        newWindow.document.close();
        newWindow.focus();
    } else {
        console.error('Failed to open new window for Story Map');
    }
}