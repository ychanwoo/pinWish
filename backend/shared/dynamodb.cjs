const encode = (v) =>
  v === null
    ? { NULL: true }
    : typeof v === 'string'
      ? { S: v }
      : typeof v === 'number'
        ? { N: String(v) }
        : typeof v === 'boolean'
          ? { BOOL: v }
          : Array.isArray(v)
            ? { L: v.map(encode) }
            : {
                M: Object.fromEntries(
                  Object.entries(v)
                    .filter(([, x]) => x !== undefined)
                    .map(([k, x]) => [k, encode(x)]),
                ),
              }
const decode = (v) =>
  v.NULL === true
    ? null
    : 'S' in v
      ? v.S
      : 'N' in v
        ? Number(v.N)
        : 'BOOL' in v
          ? v.BOOL
          : 'L' in v
            ? v.L.map(decode)
            : Object.fromEntries(
                Object.entries(v.M).map(([k, x]) => [k, decode(x)]),
              )
const marshal = (v) => encode(v).M
const unmarshal = (v) => (v ? decode({ M: v }) : undefined)
module.exports = { marshal, unmarshal }
