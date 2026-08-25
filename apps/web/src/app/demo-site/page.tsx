'use client';

import React, { useEffect, useState } from 'react';

export default function DemoSitePage() {
  const [state, setState] = useState<any>(null);
  const [catalog, setCatalog] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const stateRes = await fetch('/api/demo/state');
      const stateData = await stateRes.json();
      setState(stateData);

      const catalogRes = await fetch('/api/demo/catalog-raw');
      const catalogData = await catalogRes.json();
      setCatalog(catalogData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetDemo = async () => {
    setLoading(true);
    await fetch('/api/demo/reset', { method: 'POST' });
    await loadData();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="text-slate-500 mt-4 font-medium text-sm">Loading mock catalog...</p>
        </div>
      </div>
    );
  }

  const status = state?.status || 'NORMAL';
  const cls = state?.dom_classes || {};
  const items = catalog?.items || [];

  return (
    <div className="bg-slate-50 min-h-screen font-sans">
      <nav className="bg-slate-900 text-white py-4 px-8 flex justify-between items-center shadow-md">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <span className="text-indigo-400">&bull;</span> NicheTech B2B Catalog
          </h1>
          <p className="text-xs text-slate-400">Regional Electronics Distributor Endpoint</p>
        </div>
        <div className="text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-300 font-mono">
          API Endpoint: /demo-site
        </div>
      </nav>

      <main className="max-w-6xl mx-auto py-8 px-4">
        {status !== 'NORMAL' && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex justify-between items-center">
            <div>
              <h4 className="font-bold text-red-800">Demo Failure Active: {status}</h4>
              <p className="text-sm text-red-600">The page structure or dataset is currently altered. Scrapers using old selectors will fail.</p>
            </div>
            <button
              onClick={resetDemo}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-semibold transition"
            >
              Reset Site Layout
            </button>
          </div>
        )}

        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">Electronics Inventory</h2>
            <p className="text-slate-500">Live warehouse quantities and catalog prices</p>
          </div>
          <div className="text-sm text-slate-500 font-medium">
            Displaying {items.length} products
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {items.length > 0 ? (
            items.map((item: any) => {
              const priceVal = item.price;
              let priceDisplay = 'N/A';
              if (priceVal !== null && priceVal !== undefined) {
                priceDisplay = typeof priceVal === 'number' ? `$${priceVal.toFixed(2)}` : String(priceVal);
              }

              const stockVal = item.availability || 'Unavailable';
              const stockColor = stockVal.includes('In Stock')
                ? 'text-green-600'
                : stockVal.includes('Low Stock')
                ? 'text-amber-500'
                : 'text-red-500';

              return (
                <div
                  key={item.id}
                  className="product-card border border-slate-200 rounded p-4 bg-white shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <h3 className={`${cls.product_name || 'product-title'} text-lg font-bold text-slate-800`}>
                      {item.product_name}
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">Item ID: #{item.id}</p>
                  </div>
                  <div className="mt-4 flex justify-between items-baseline">
                    <span className={`${cls.price || 'product-price'} text-xl font-extrabold text-indigo-600`}>
                      {priceDisplay}
                    </span>
                    <span className={`${cls.currency || 'product-currency'} text-xs text-slate-400 font-semibold`}>
                      {item.currency}
                    </span>
                  </div>
                  <div className="mt-2 flex justify-between items-center text-sm">
                    <span className={`${cls.availability || 'product-stock'} font-medium ${stockColor}`}>
                      {stockVal}
                    </span>
                    <a
                      href={item.product_url}
                      className={`${cls.product_url || 'product-link'} text-indigo-600 hover:text-indigo-800 font-semibold`}
                    >
                      Specs &rarr;
                    </a>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full text-center py-12 text-slate-400 bg-slate-50 rounded border border-dashed">
              No products available in catalog.
            </div>
          )}
        </div>
      </main>

      <footer className="mt-16 py-8 border-t border-slate-200 text-center text-sm text-slate-400 bg-white">
        <p>&copy; 2026 NicheTech Solutions. Provided for Metanoia simulation demonstration.</p>
      </footer>
    </div>
  );
}
