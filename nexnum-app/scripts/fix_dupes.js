const fs = require('fs');
const path = 'src/app/admin/providers/page.tsx';
const content = fs.readFileSync(path, { encoding: 'utf8' });
const EOL = content.includes('\r\n') ? '\r\n' : '\n';
const lines = content.split(/\r?\n/);

console.log('Original lines:', lines.length);

const startLineIndex = 1805; // Line 1806
const endLineIndex = 2002;   // Line 2003

// Check content
const startLineContent = lines[startLineIndex] ? lines[startLineIndex].trim() : '';
const checkLineContent = lines[2001] ? lines[2001].trim() : ''; // Check Line 2002 (last code line)

console.log('Line 1806 content:', startLineContent);
console.log('Line 2002 content:', checkLineContent);

if (!startLineContent.includes('relative pt-2')) {
    console.error('Error: Line 1806 mismatch:', startLineContent);
    process.exit(1);
}
if (checkLineContent !== ')}') {
    console.error('Error: Line 2002 mismatch:', checkLineContent);
    process.exit(1);
}

const numToDelete = endLineIndex - startLineIndex + 1;
lines.splice(startLineIndex, numToDelete);

console.log('New lines:', lines.length);
fs.writeFileSync(path, lines.join(EOL));
console.log('Success');
