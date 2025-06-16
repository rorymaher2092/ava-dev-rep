const fs = require('fs');
const path = require('path');

// Path to buildInfo.ts
const buildInfoPath = path.join(__dirname, '../src/buildInfo.ts');

try {
  // Read the current buildInfo.ts file
  const content = fs.readFileSync(buildInfoPath, 'utf8');
  
  // Extract the current version using regex
  const versionMatch = content.match(/BUILD_VERSION = "([0-9]+\.[0-9]+\.[0-9]+)"/);
  
  if (versionMatch && versionMatch[1]) {
    const currentVersion = versionMatch[1];
    const versionParts = currentVersion.split('.');
    
    // Increment the build number (last part)
    versionParts[2] = (parseInt(versionParts[2], 10) + 1).toString();
    const newVersion = versionParts.join('.');
    
    // Create new content with updated version and current timestamp
    const newContent = `// This file contains build information that will be updated during the build process
export const BUILD_VERSION = "${newVersion}";
export const BUILD_TIME = new Date().toISOString();`;
    
    // Write the updated content back to the file
    fs.writeFileSync(buildInfoPath, newContent);
    
    console.log(`Build version incremented to ${newVersion}`);
  } else {
    console.error('Could not find version pattern in buildInfo.ts');
    process.exit(1);
  }
} catch (error) {
  console.error('Error updating build version:', error);
  process.exit(1);
}