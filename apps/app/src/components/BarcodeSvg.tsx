"use client";

import { useMemo } from "react";

const EAN13_L: Record<string, string> = {
  "0": "0001101",
  "1": "0011001",
  "2": "0010011",
  "3": "0111101",
  "4": "0100011",
  "5": "0110001",
  "6": "0101111",
  "7": "0111011",
  "8": "0110111",
  "9": "0001011"
};

const EAN13_G: Record<string, string> = {
  "0": "0100111",
  "1": "0110011",
  "2": "0011011",
  "3": "0100001",
  "4": "0011101",
  "5": "0111001",
  "6": "0000101",
  "7": "0010001",
  "8": "0001001",
  "9": "0010111"
};

const EAN13_R: Record<string, string> = {
  "0": "1110010",
  "1": "1100110",
  "2": "1101100",
  "3": "1000010",
  "4": "1011100",
  "5": "1001110",
  "6": "1010000",
  "7": "1000100",
  "8": "1001000",
  "9": "1110100"
};

const EAN13_PARITY: Record<string, string> = {
  "0": "LLLLLL",
  "1": "LLGLGG",
  "2": "LLGGLG",
  "3": "LLGGGL",
  "4": "LGLLGG",
  "5": "LGGLLG",
  "6": "LGGGLL",
  "7": "LGLGLG",
  "8": "LGLGGL",
  "9": "LGGLGL"
};

function isDigits(s: string): boolean {
  return /^[0-9]+$/.test(s);
}

function ean13CheckDigit12(d12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = Number(d12[i]);
    sum += (i % 2 === 0 ? 1 : 3) * n;
  }
  const mod = sum % 10;
  const cd = (10 - mod) % 10;
  return String(cd);
}

function isValidEan13(code: string): boolean {
  if (code.length !== 13 || !isDigits(code)) return false;
  const cd = ean13CheckDigit12(code.slice(0, 12));
  return code[12] === cd;
}

function buildEan13Bits(code: string): string {
  const first = code[0];
  const parity = EAN13_PARITY[first] ?? "LLLLLL";
  let bits = "";
  bits += "0000000000";
  bits += "101";
  for (let i = 1; i <= 6; i++) {
    const digit = code[i];
    const enc = parity[i - 1] === "G" ? EAN13_G[digit] : EAN13_L[digit];
    bits += enc;
  }
  bits += "01010";
  for (let i = 7; i <= 12; i++) {
    const digit = code[i];
    bits += EAN13_R[digit];
  }
  bits += "101";
  bits += "0000000000";
  return bits;
}

const CODE128_PATTERNS: string[] = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "2331112"
];

function code128ValueB(ch: string): number | null {
  const code = ch.charCodeAt(0);
  if (code < 32 || code > 126) return null;
  return code - 32;
}

function buildCode128BitsB(value: string): string | null {
  const codes: number[] = [];
  const start = 104;
  codes.push(start);
  for (const ch of value) {
    const v = code128ValueB(ch);
    if (v === null) return null;
    codes.push(v);
  }
  let checksum = start;
  for (let i = 1; i < codes.length; i++) checksum += codes[i] * i;
  checksum = checksum % 103;
  codes.push(checksum);
  codes.push(106);

  let bits = "";
  bits += "0000000000";
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) return null;
    if (code === 106) {
      const widths = pattern.split("").map((d) => Number(d));
      let bar = true;
      for (const w of widths) {
        bits += (bar ? "1" : "0").repeat(w);
        bar = !bar;
      }
      bits += "11";
      continue;
    }
    const widths = pattern.split("").map((d) => Number(d));
    let bar = true;
    for (const w of widths) {
      bits += (bar ? "1" : "0").repeat(w);
      bar = !bar;
    }
  }
  bits += "0000000000";
  return bits;
}

export function BarcodeSvg(props: { value: string; height?: number; className?: string }) {
  const height = props.height ?? 46;
  const value = (props.value ?? "").trim();

  const bits = useMemo(() => {
    if (!value) return null;
    if (isValidEan13(value)) return buildEan13Bits(value);
    return buildCode128BitsB(value);
  }, [value]);

  const viewBox = useMemo(() => {
    if (!bits) return "0 0 1 1";
    return `0 0 ${bits.length} ${height}`;
  }, [bits, height]);

  if (!bits) {
    return <div className={props.className}>{value}</div>;
  }

  const bars: Array<{ x: number; w: number }> = [];
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === "0") {
      i++;
      continue;
    }
    const start = i;
    while (i < bits.length && bits[i] === "1") i++;
    bars.push({ x: start, w: i - start });
  }

  return (
    <svg className={props.className} viewBox={viewBox} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={value}>
      <rect x="0" y="0" width={bits.length} height={height} fill="white" />
      {bars.map((b, idx) => (
        <rect key={idx} x={b.x} y="0" width={b.w} height={height} fill="black" />
      ))}
    </svg>
  );
}

