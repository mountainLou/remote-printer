// 测试docx到PDF的转换功能
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 创建测试docx文件
const testDocxPath = path.join(__dirname, 'uploads', 'test-docx-container.docx');
const testContent = `This is a test document for docx to PDF conversion.

Testing the remote printer service's ability to convert docx files to PDF before printing.

Document created on: 2026-02-05

=== Test Content ===

1. This is a numbered list item
2. This is another numbered list item
3. This is the third item

**Bold text** and *italic text* should be preserved in the conversion.

[Hyperlink test](http://localhost:3000)

`;

// 确保uploads目录存在
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
    fs.mkdirSync(path.join(__dirname, 'uploads'));
}

// 写入测试docx文件
fs.writeFileSync(testDocxPath, testContent);
console.log('Created test docx file:', testDocxPath);

// 转换为PDF
const pdfPath = testDocxPath.replace('.docx', '.pdf');
try {
    console.log('Converting docx to PDF...');
    execSync(`libreoffice --headless --convert-to pdf --outdir "${path.dirname(testDocxPath)}" "${testDocxPath}"`);
    
    if (fs.existsSync(pdfPath)) {
        console.log('✓ PDF conversion successful!');
        console.log('PDF file created:', pdfPath);
        console.log('PDF file size:', fs.statSync(pdfPath).size, 'bytes');
    } else {
        console.log('✗ PDF file not created');
    }
} catch (error) {
    console.error('✗ Conversion failed:', error.message);
}

// 列出uploads目录中的文件
console.log('\nFiles in uploads directory:');
const files = fs.readdirSync(path.join(__dirname, 'uploads'));
files.forEach(file => {
    const filePath = path.join(__dirname, 'uploads', file);
    const stats = fs.statSync(filePath);
    console.log(`${file} (${stats.size} bytes)`);
});
