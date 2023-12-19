export function convertToDecimalString(num: number): string {
  const result: number = num / 100;
  const resultStr: string = result.toFixed(2);
  return resultStr;
}
