
const match = /ACCESS_BALANCE:([0-9.]+)/.exec("ACCESS_BALANCE:0.03");
const source = { ...match?.groups };
if (match) {
    match.forEach((val, idx) => { source[String(idx)] = val });
}

console.log('Source object:', source);

const pathWithDollar = '$1';
const pathWithoutDollar = '1';

function getValue(obj, path) {
    return path.split('.').reduce((o, key) => {
        if (o === undefined || o === null) return undefined;
        return o[key];
    }, obj);
}

console.log("Using '$1':", getValue(source, pathWithDollar));
console.log("Using '1':", getValue(source, pathWithoutDollar));
