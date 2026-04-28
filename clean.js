const fs = require('fs');
const files = ['schema.sql','chat-backend.js','ChatApp.jsx','chat.test.js'];
files.forEach(f => {
  if (!fs.existsSync(f)) return;
  let c = fs.readFileSync(f, 'utf8');
  // Remove any line that contains double-slash and Russian letters
  c = c.replace(/^[ \\t]*\\/\\/.*[Р-пр-џ].*\\r?\\n/gm, '');
  // Remove any line that contains double-dash and Russian letters (SQL)
  c = c.replace(/^[ \\t]*--.*[Р-пр-џ].*\\r?\\n/gm, '');
  fs.writeFileSync(f, c);
});
