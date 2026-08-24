import { NextResponse } from 'next/server';
import { DEMO_WEBSITE_STATE } from '../../../../services/demoState';
import { BrightDataService } from '../../../../services/brightdata';

export async function POST() {
  DEMO_WEBSITE_STATE.status = 'NORMAL';
  DEMO_WEBSITE_STATE.dom_classes = {
    product_name: 'product-title',
    price: 'product-price',
    currency: 'product-currency',
    availability: 'product-stock',
    product_url: 'product-link',
  };

  BrightDataService.resetSelectors();

  return NextResponse.json({ message: 'Demo site and simulated selectors reset to normal' });
}
