import { NextResponse } from 'next/server';
import { DEMO_WEBSITE_STATE } from '../../../../services/demoState';

export async function GET() {
  return NextResponse.json(DEMO_WEBSITE_STATE);
}

export async function POST(req: Request) {
  try {
    const { status } = await req.json();
    const upperStatus = (status || '').toUpperCase();

    const validStates = [
      'NORMAL',
      'CLASS_RENAMED',
      'ELEMENT_MOVED',
      'DATA_DROPS',
      'EMPTY_EXTRACTION',
      'TYPE_MISMATCH',
      'COUNT_COLLAPSE',
      'QUALITY_DEGRADE',
    ];

    if (!validStates.includes(upperStatus)) {
      return NextResponse.json({ error: `Invalid state. Must be one of ${validStates.join(', ')}` }, { status: 400 });
    }

    DEMO_WEBSITE_STATE.status = upperStatus;

    if (upperStatus === 'NORMAL') {
      DEMO_WEBSITE_STATE.dom_classes = {
        product_name: 'product-title',
        price: 'product-price',
        currency: 'product-currency',
        availability: 'product-stock',
        product_url: 'product-link',
      };
    } else if (upperStatus === 'CLASS_RENAMED') {
      DEMO_WEBSITE_STATE.dom_classes = {
        product_name: 'item-name',
        price: 'item-cost',
        currency: 'item-currency',
        availability: 'item-status',
        product_url: 'item-link',
      };
    } else if (upperStatus === 'ELEMENT_MOVED') {
      DEMO_WEBSITE_STATE.dom_classes = {
        product_name: 'item-header-title',
        price: 'item-pricing-val',
        currency: 'item-currency',
        availability: 'item-stock-availability',
        product_url: 'item-href',
      };
    } else {
      // For other states (e.g. data drops, count collapse) we keep standard classes but modify elements in catalog-raw
      DEMO_WEBSITE_STATE.dom_classes = {
        product_name: 'product-title',
        price: 'product-price',
        currency: 'product-currency',
        availability: 'product-stock',
        product_url: 'product-link',
      };
    }

    return NextResponse.json(DEMO_WEBSITE_STATE);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
