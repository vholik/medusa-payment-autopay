import convert from "xml-js";

export function parseXml<T extends any>(xml: any) {
  return convert.xml2js(xml, { compact: true, textKey: "content" }) as T;
}
