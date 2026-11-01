// kaupet_open-stub. Produktanalyse finnes ikke i kaupet_open.
export function getProductPlatform(): "web" | "ios" | "android" {
  return "web";
}

export function trackProductEvent(_eventName: string, _properties: object = {}): void {}
