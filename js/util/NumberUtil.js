export function signedString(number) {
    return number.toLocaleString(undefined, { signDisplay: 'always' });
}

export function formatWithCommas(number) {
    return number.toLocaleString();
}

export function toFixed(number, decimals) {
    return number.toFixed(decimals);
}

export function isPositive(number) {
    return number > 0;
}

export function isNegative(number) {
    return number < 0;
}

// toFixedメソッドとsignedStringメソッドを組み合わせて、指定した小数点以下の桁数で符号付きの文字列を返す
export function signedFixedString(number, decimals) {
    return signedString(Number(toFixed(number, decimals)));
}

// 使用例
// console.log(signedString(123)); // "+123"
// console.log(formatWithCommas(1234567)); // "1,234,567"
// console.log(toFixed(123.456, 2)); // "123.46"
// console.log(isPositive(123)); // true
// console.log(isNegative(-123)); // true