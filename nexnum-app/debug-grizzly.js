const fetch = require('node-fetch'); fetch('https://grizzlysms.com/api/service').then(res => res.json()).then(data => console.log(JSON.stringify(data.data[0], null, 2)));
