import http from 'http';
import url from 'url';

/**
 * Mock Grizzly / SMS-Activate API Server
 * Protocol: SMS-Activate GET-based API
 */

const PORT = 3001;

// --- Aesthetics ---
const C = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    magenta: "\x1b[35m",
    blue: "\x1b[34m",
    gray: "\x1b[90m",
    white: "\x1b[37m",
    bgBlue: "\x1b[44m"
};

const S = {
    info: "🔹",
    success: "✅",
    warning: "⚠️",
    error: "🚫",
    sms: "📧",
    money: "💵",
    number: "📲",
    clock: "⏱️",
    bolt: "⚡",
    box: "📦"
};

function log(type, msg, meta = "") {
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    const timestamp = `\x1b[90m[${time}]\x1b[0m`;
    let symbol = "🔹";
    let color = "\x1b[36m";
    let levelTag = type.toUpperCase().padEnd(8);

    switch (type) {
        case 'info': symbol = "🔹"; color = "\x1b[36m"; break;
        case 'success': symbol = "✅"; color = "\x1b[32m"; break;
        case 'sms': symbol = "📧"; color = "\x1b[35m"; levelTag = "SMS     "; break;
        case 'req': symbol = "⚡"; color = "\x1b[34m"; levelTag = "API REQ "; break;
        case 'error': symbol = "🚫"; color = "\x1b[31m"; break;
        case 'warn': symbol = "⚠️"; color = "\x1b[33m"; break;
    }

    const metaStr = meta ? ` \x1b[90m›\x1b[0m \x1b[2m${meta}\x1b[0m` : "";
    console.log(`${timestamp} ${color}${symbol}\x1b[0m  \x1b[1m${levelTag}\x1b[0m  ${msg}${metaStr}`);
}

/** @type {Map<string, { id: string, number: string, status: string, codes: string[], createdAt: number, service: string, country: string, isWaitingNext?: boolean }>} */
const orders = new Map();
let balance = 999.99;

const server = http.createServer(async (req, res) => {
    const start = Date.now();
    const parsedUrl = url.parse(req.url || '', true);
    const { action, api_key, id: orderId, status, service, country } = parsedUrl.query;

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/plain');

    if (parsedUrl.pathname !== '/stubs/handler_api.php') {
        res.statusCode = 404;
        return res.end('Not Found');
    }

    let responseBody = "";

    try {
        switch (action) {
            case 'getBalance':
                responseBody = `ACCESS_BALANCE:${balance.toFixed(2)}`;
                break;

            case 'getCountries':
                const countryData = {
                    "22": { "id": 22, "rus": "India", "eng": "India", "chn": "India", "visible": 1, "retry": 1, "rent": 0, "multiService": 1 }
                };
                res.setHeader('Content-Type', 'application/json');
                responseBody = JSON.stringify(countryData);
                break;

            case 'getServices':
                const svcCountry = country || '22';
                const svcResp = await fetch(`https://api.grizzlysms.com/stubs/handler_api.php?api_key=690193741c8f4e3af54c80eba9f95ec7&action=getServicesList&country=${svcCountry}`);
                responseBody = await svcResp.text();
                res.setHeader('Content-Type', 'application/json');
                break;

            case 'getPrices':
                const priceCountry = country || '22';
                const priceResp = await fetch(`https://api.grizzlysms.com/stubs/handler_api.php?api_key=690193741c8f4e3af54c80eba9f95ec7&action=getPrices&country=${priceCountry}`);
                responseBody = await priceResp.text();
                res.setHeader('Content-Type', 'application/json');
                break;

            case 'getNumber':
                const id = Math.floor(Math.random() * 9000000 + 1000000).toString();
                const num = '1' + Math.floor(Math.random() * 9000000000 + 1000000000).toString();

                orders.set(id, {
                    id,
                    number: num,
                    status: '1',
                    createdAt: Date.now(),
                    service: service || 'unknown',
                    country: country || '22',
                    codes: []
                });

                // Simulate sequence of SMS
                // 1. First SMS after 10-15s
                /*setTimeout(() => {
                    const order = orders.get(id);
                    if (order && order.status === '1') {
                        const code = Math.floor(Math.random() * 900000 + 100000).toString();
                        order.codes.push(code);
                        log('sms', `Code Received: ${C.yellow}${C.bright}${code}${C.reset}`, `Order ${id} (${order.service})`);

                        // 2. Transition to "Waiting for next" after another 10s
                        setTimeout(() => {
                            if (orders.has(id)) {
                                orders.get(id).isWaitingNext = true;
                                log('info', `Simulating wait for 2nd code`, `Order ${id}`);
                            }
                        }, 10000);

                        // 3. Second SMS after another 20s
                        setTimeout(() => {
                            const secondOrder = orders.get(id);
                            if (secondOrder && secondOrder.status === '1') {
                                const code2 = Math.floor(Math.random() * 800000 + 200000).toString();
                                secondOrder.codes.push(code2);
                                secondOrder.isWaitingNext = false; // Got it
                                log('sms', `Second Code Received: ${C.magenta}${C.bright}${code2}${C.reset}`, `Order ${id}`);
                            }
                        }, 20000);
                    }
                }, 10000 + (Math.random() * 5000));*/

                responseBody = `ACCESS_NUMBER:${id}:${num}`;
                log('success', `Provisioned ${S.number} ${C.green}${num}${C.reset}`, `Service: ${service}, Order: ${id}`);
                break;

            case 'getStatus':
                if (!orderId) { responseBody = 'ERROR_NO_ID'; break; }
                const order = orders.get(orderId);
                if (!order) { responseBody = 'NO_ACTIVATION'; break; }

                if (order.codes.length > 0) {
                    const latest = order.codes[order.codes.length - 1];
                    if (order.isWaitingNext) {
                        responseBody = `STATUS_WAIT_CODE:${latest}`;
                    } else {
                        responseBody = `STATUS_OK:${latest}`;
                    }
                } else {
                    responseBody = 'STATUS_WAIT_CODE';
                }
                break;

            case 'setStatus':
                if (!orderId) { responseBody = 'ERROR_NO_ID'; break; }
                const existingOrder = orders.get(orderId);
                if (!existingOrder) { responseBody = 'NO_ACTIVATION'; break; }

                if (status === '8') { // Cancel
                    orders.delete(orderId);
                    responseBody = 'ACCESS_CANCEL';
                    log('warn', `Activation Cancelled`, `Order: ${orderId}`);
                    break;
                }

                if (status === '6') { // Finalize
                    orders.delete(orderId);
                    responseBody = 'ACCESS_READY';
                    log('success', `Activation Completed`, `Order: ${orderId}`);
                    break;
                }
                responseBody = 'ACCESS_READY';
                break;

            default:
                responseBody = 'BAD_ACTION';
        }

        const duration = Date.now() - start;
        log('req', `${C.bright}${action}${C.reset}`, `${req.method} › ${duration}ms`);
        res.end(responseBody);

    } catch (err) {
        log('error', err.message);
        res.statusCode = 500;
        res.end('ERROR_SQL');
    }
});

server.listen(PORT, () => {
    console.clear();
    console.log(`\n${C.bgBlue}${C.bright}  NEXNUM MOCK PROVIDER ENGINE  ${C.reset}\n`);
    console.log(`${C.cyan}${S.info}  Status:    ${C.green}${C.bright}READY${C.reset}`);
    console.log(`${C.cyan}${S.clock}   Uptime:    ${C.white}0.0s${C.reset}`);
    console.log(`${C.cyan}${S.bolt}  Endpoint:  ${C.yellow}http://localhost:${PORT}/stubs/handler_api.php${C.reset}\n`);

    console.log(`${C.dim}─────────────────────────────────────────────────────────────────────────────${C.reset}`);
    log('info', 'Mock API initialized', 'Listening for activations...');
});

