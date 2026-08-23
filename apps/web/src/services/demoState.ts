const globalForDemo = global as unknown as {
  demoState: {
    status: string;
    dom_classes: Record<string, string>;
  };
};

export const DEMO_WEBSITE_STATE = globalForDemo.demoState || {
  status: 'NORMAL',
  dom_classes: {
    product_name: 'product-title',
    price: 'product-price',
    currency: 'product-currency',
    availability: 'product-stock',
    product_url: 'product-link',
  },
};

if (process.env.NODE_ENV !== 'production') {
  globalForDemo.demoState = DEMO_WEBSITE_STATE;
}

export const MOCK_PRODUCTS = [
  { id: 1, product_name: 'OptiCore Server CPU 32-Core', price: 1499.99, currency: 'USD', availability: 'In Stock', product_url: 'https://b2b-catalog.local/item/1' },
  { id: 2, product_name: 'ProSync Switch 48-Port PoE', price: 899.50, currency: 'USD', availability: 'In Stock', product_url: 'https://b2b-catalog.local/item/2' },
  { id: 3, product_name: 'VisionFlow Dual 4K KVM console', price: 329.00, currency: 'USD', availability: 'Low Stock', product_url: 'https://b2b-catalog.local/item/3' },
  { id: 4, product_name: 'SecureGate VPN Firewall Appliance', price: 450.00, currency: 'USD', availability: 'Out of Stock', product_url: 'https://b2b-catalog.local/item/4' },
  { id: 5, product_name: 'TeraStore Enterprise NAS 16TB', price: 649.00, currency: 'USD', availability: 'In Stock', product_url: 'https://b2b-catalog.local/item/5' },
  { id: 6, product_name: 'AeroFan Rackmount Cooling Fan Unit', price: 89.99, currency: 'USD', availability: 'In Stock', product_url: 'https://b2b-catalog.local/item/6' },
  { id: 7, product_name: 'VoltSafe Smart UPS 1500VA', price: 289.00, currency: 'USD', availability: 'In Stock', product_url: 'https://b2b-catalog.local/item/7' },
  { id: 8, product_name: 'OmniShield Patch Panel 24-Port', price: 45.50, currency: 'USD', availability: 'Low Stock', product_url: 'https://b2b-catalog.local/item/8' },
];
