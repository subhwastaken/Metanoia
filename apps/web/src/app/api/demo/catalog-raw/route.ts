import { NextResponse } from 'next/server';
import { DEMO_WEBSITE_STATE, MOCK_PRODUCTS } from '../../../../services/demoState';

export async function GET() {
  const status = DEMO_WEBSITE_STATE.status;
  const classes = DEMO_WEBSITE_STATE.dom_classes;

  if (status === 'EMPTY_EXTRACTION') {
    return NextResponse.json({ items: [], dom_classes: classes });
  }

  let itemsSource = MOCK_PRODUCTS;
  if (status === 'COUNT_COLLAPSE') {
    itemsSource = MOCK_PRODUCTS.slice(0, 2);
  }

  const items = itemsSource.map((p) => {
    const item = { ...p };

    // In DATA_DROPS or QUALITY_DEGRADE mode, nullify prices and availability on subsequent items
    if (status === 'DATA_DROPS' || status === 'QUALITY_DEGRADE') {
      if (item.id > 1) {
        item.price = null as any;
        item.availability = null as any;
      }
    }

    // In TYPE_MISMATCH mode, replace numeric prices with string formats
    if (status === 'TYPE_MISMATCH') {
      if (item.id % 2 === 0) {
        item.price = `USD ${item.price}` as any;
      } else {
        item.price = 'Call for quote' as any;
      }
    }

    return item;
  });

  return NextResponse.json({
    items,
    dom_classes: classes,
  });
}
export const dynamic = 'force-dynamic';
