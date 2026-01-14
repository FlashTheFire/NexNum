
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const vapidPublic = 'dAvYT9yUCw-17D0oY4vZ0TxI-Y0uXhnvfwnSs4RB29Y';
const vapidPrivate = 'kNVvSGMT6t4XbpCNPQJi0EDFi9HDWkWqdtXAJxuH-g_g';
const vapidSubject = 'mailto:support@nexnum.com';

let envContent = '';
if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
}

let newContent = envContent;

if (!newContent.includes('NEXT_PUBLIC_VAPID_PUBLIC_KEY')) {
    newContent += `\nNEXT_PUBLIC_VAPID_PUBLIC_KEY="${vapidPublic}"\n`;
}
if (!newContent.includes('VAPID_PRIVATE_KEY')) {
    newContent += `VAPID_PRIVATE_KEY="${vapidPrivate}"\n`;
}
if (!newContent.includes('VAPID_SUBJECT')) {
    newContent += `VAPID_SUBJECT="${vapidSubject}"\n`;
}

fs.writeFileSync(envPath, newContent);
console.log('VAPID keys added to .env');
