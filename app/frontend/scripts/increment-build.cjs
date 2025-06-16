const fs = require('fs');
const path = require('path');

// Path to buildInfo.ts
const buildInfoPath = path.join(__dirname, '../src/buildInfo.ts');

try {
  // Read the current buildInfo.ts file
  const content = fs.readFileSync(buildInfoPath, 'utf8');
  
  // Extract the current version using regex
  const versionMatch = content.match(/BUILD_VERSION = "([0-9]+)\.([0-9]+)\.([0-9]+)"/);
  
  if (versionMatch) {
    const major = versionMatch[1];
    // Get current month (1-12)
    const currentMonth = new Date().getMonth() + 1;
    // Get the current build number
    let build = parseInt(versionMatch[3], 10);
    
    // Increment the build number
    build += 1;
    
    // Create new version with format major.month.build
    const newVersion = `${major}.${currentMonth}.${build}`;
    
    // Create new content with updated version and current timestamp
    const newContent = `// This file contains build information that will be updated during the build process
export const BUILD_VERSION = "${newVersion}";
export const BUILD_TIME = new Date().toISOString();`;
    
    // Write the updated content back to the file
    fs.writeFileSync(buildInfoPath, newContent);
    
    console.log(`Build version updated to ${newVersion}`);
  } else {
    console.error('Could not find version pattern in buildInfo.ts');
    process.exit(1);
  }
} catch (error) {
  console.error('Error updating build version:', error);
  process.exit(1);
}