from fastapi import APIRouter, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
import logging

router = APIRouter()
logger = logging.getLogger("scrapeguard.demo")

# In-memory store of the simulated website configuration
DEMO_WEBSITE_STATE = {
    "status": "NORMAL", # NORMAL, CLASS_RENAMED, ELEMENT_MOVED, DATA_DROPS, EMPTY_EXTRACTION, TYPE_MISMATCH, COUNT_COLLAPSE, QUALITY_DEGRADE
    "dom_classes": {
        "product_name": "product-title",
        "price": "product-price",
        "currency": "product-currency",
        "availability": "product-stock",
        "product_url": "product-link"
    }
}

MOCK_PRODUCTS = [
    {"id": 1, "product_name": "OptiCore Server CPU 32-Core", "price": 1499.99, "currency": "USD", "availability": "In Stock", "product_url": "https://b2b-catalog.local/item/1"},
    {"id": 2, "product_name": "ProSync Switch 48-Port PoE", "price": 899.50, "currency": "USD", "availability": "In Stock", "product_url": "https://b2b-catalog.local/item/2"},
    {"id": 3, "product_name": "VisionFlow Dual 4K KVM console", "price": 329.00, "currency": "USD", "availability": "Low Stock", "product_url": "https://b2b-catalog.local/item/3"},
    {"id": 4, "product_name": "SecureGate VPN Firewall Appliance", "price": 450.00, "currency": "USD", "availability": "Out of Stock", "product_url": "https://b2b-catalog.local/item/4"},
    {"id": 5, "product_name": "TeraStore Enterprise NAS 16TB", "price": 649.00, "currency": "USD", "availability": "In Stock", "product_url": "https://b2b-catalog.local/item/5"},
    {"id": 6, "product_name": "AeroFan Rackmount Cooling Fan Unit", "price": 89.99, "currency": "USD", "availability": "In Stock", "product_url": "https://b2b-catalog.local/item/6"},
    {"id": 7, "product_name": "VoltSafe Smart UPS 1500VA", "price": 289.00, "currency": "USD", "availability": "In Stock", "product_url": "https://b2b-catalog.local/item/7"},
    {"id": 8, "product_name": "OmniShield Patch Panel 24-Port", "price": 45.50, "currency": "USD", "availability": "Low Stock", "product_url": "https://b2b-catalog.local/item/8"},
]

class StateUpdateRequest(BaseModel):
    status: str

@router.get("/api/demo/state")
def get_state():
    return DEMO_WEBSITE_STATE

@router.post("/api/demo/state")
def update_state(req: StateUpdateRequest):
    status = req.status.upper()
    valid_states = ["NORMAL", "CLASS_RENAMED", "ELEMENT_MOVED", "DATA_DROPS", "EMPTY_EXTRACTION", "TYPE_MISMATCH", "COUNT_COLLAPSE", "QUALITY_DEGRADE"]
    
    if status not in valid_states:
        return JSONResponse(status_code=400, content={"error": f"Invalid state. Must be one of {valid_states}"})
        
    DEMO_WEBSITE_STATE["status"] = status
    
    # Update classes based on failure state
    if status == "NORMAL":
        DEMO_WEBSITE_STATE["dom_classes"] = {
            "product_name": "product-title",
            "price": "product-price",
            "currency": "product-currency",
            "availability": "product-stock",
            "product_url": "product-link"
        }
    elif status == "CLASS_RENAMED":
        # Simulate website DOM refactoring CSS change
        DEMO_WEBSITE_STATE["dom_classes"] = {
            "product_name": "item-name",
            "price": "item-cost",
            "currency": "item-currency",
            "availability": "item-status",
            "product_url": "item-link"
        }
    elif status == "ELEMENT_MOVED":
        # Slightly altered tag representation
        DEMO_WEBSITE_STATE["dom_classes"] = {
            "product_name": "item-header-title",
            "price": "item-pricing-val",
            "currency": "item-currency",
            "availability": "item-stock-availability",
            "product_url": "item-href"
        }
    # For others, we keep normal classes but modify the output contents in the HTML response
    else:
        DEMO_WEBSITE_STATE["dom_classes"] = {
            "product_name": "product-title",
            "price": "product-price",
            "currency": "product-currency",
            "availability": "product-stock",
            "product_url": "product-link"
        }
        
    logger.info(f"Demo site state updated to {status}")
    return DEMO_WEBSITE_STATE

@router.post("/api/demo/reset")
def reset_demo():
    DEMO_WEBSITE_STATE["status"] = "NORMAL"
    DEMO_WEBSITE_STATE["dom_classes"] = {
        "product_name": "product-title",
        "price": "product-price",
        "currency": "product-currency",
        "availability": "product-stock",
        "product_url": "product-link"
    }
    # Import service to reset simulated selectors as well
    from services.brightdata import BrightDataService
    BrightDataService.reset_selectors()
    return {"message": "Demo site and simulated selectors reset to normal"}

@router.get("/demo-site", response_class=HTMLResponse)
def get_demo_site():
    """
    Renders a B2B catalog HTML page, injecting classes and data modifications
    depending on the current failure simulation state.
    It also returns a JSON payload under /api/demo/catalog-raw which is what our
    simulated collector hits to parse data easily.
    """
    html_content = cls_render_catalog_html()
    return html_content

@router.get("/api/demo/catalog-raw")
def get_catalog_raw():
    """
    Under the hood endpoint hit by our simulated collector, providing raw data
    and active DOM mapping to simulate parsing HTML.
    """
    status = DEMO_WEBSITE_STATE["status"]
    classes = DEMO_WEBSITE_STATE["dom_classes"]
    
    items = []
    
    if status == "EMPTY_EXTRACTION":
        # Return empty dataset
        return {"items": [], "dom_classes": classes}
        
    elif status == "COUNT_COLLAPSE":
        # Return only 2 items instead of 8
        items_source = MOCK_PRODUCTS[:2]
    else:
        items_source = MOCK_PRODUCTS
        
    for p in items_source:
        item = p.copy()
        
        # In DATA_DROPS mode, nullify prices and stocks in 80% of items
        if status == "DATA_DROPS":
            if item["id"] > 1:
                item["price"] = None
                item["availability"] = None
                
        # In QUALITY_DEGRADE mode, nullify prices/availability in almost all
        elif status == "QUALITY_DEGRADE":
            if item["id"] > 1:
                item["price"] = None
                item["availability"] = None
                
        # In TYPE_MISMATCH mode, change float prices to raw string price format
        elif status == "TYPE_MISMATCH":
            if item["id"] % 2 == 0:
                item["price"] = f"USD {item['price']}"
            else:
                item["price"] = "Call for quote"
                
        items.append(item)
        
    return {
        "items": items,
        "dom_classes": classes
    }

def cls_render_catalog_html() -> str:
    status = DEMO_WEBSITE_STATE["status"]
    cls = DEMO_WEBSITE_STATE["dom_classes"]
    
    raw_res = get_catalog_raw()
    items = raw_res["items"]
    
    # Render static catalog template
    product_cards = []
    for item in items:
        price_val = item['price']
        if price_val is None:
            price_display = "N/A"
        elif isinstance(price_val, float):
            price_display = f"${price_val:.2f}"
        else:
            price_display = str(price_val)
            
        stock_val = item['availability'] or "Unavailable"
        stock_color = "text-green-600" if "In Stock" in stock_val else ("text-amber-500" if "Low Stock" in stock_val else "text-red-500")

        product_cards.append(f"""
        <div class="product-card border border-slate-200 rounded p-4 bg-white shadow-sm flex flex-col justify-between">
            <div>
                <h3 class="{cls['product_name']} text-lg font-bold text-slate-800">{item['product_name']}</h3>
                <p class="text-sm text-slate-500 mt-1">Item ID: #{item['id']}</p>
            </div>
            <div class="mt-4 flex justify-between items-baseline">
                <span class="{cls['price']} text-xl font-extrabold text-indigo-600">{price_display}</span>
                <span class="{cls['currency']} text-xs text-slate-400 font-semibold">{item['currency']}</span>
            </div>
            <div class="mt-2 flex justify-between items-center text-sm">
                <span class="{cls['availability']} font-medium {stock_color}">{stock_val}</span>
                <a href="{item['product_url']}" class="{cls['product_url']} text-indigo-600 hover:text-indigo-800 font-semibold">Specs &rarr;</a>
            </div>
        </div>
        """)
        
    cards_html = "\n".join(product_cards) if product_cards else '<div class="col-span-full text-center py-12 text-slate-400 bg-slate-50 rounded border border-dashed">No products available in catalog.</div>'
    
    status_indicator = f"""
    <div class="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex justify-between items-center">
        <div>
            <h4 class="font-bold text-red-800">Demo Failure Active: {status}</h4>
            <p class="text-sm text-red-600">The page structure or dataset is currently altered. Scrapers using old selectors will fail.</p>
        </div>
        <button onclick="resetDemo()" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-semibold transition">Reset Site Layout</button>
    </div>
    """ if status != "NORMAL" else ""

    return f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>NicheTech B2B Electronics Catalog</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            body {{ font-family: 'Inter', system-ui, sans-serif; }}
        </style>
    </head>
    <body class="bg-slate-50 min-h-screen">
        <nav class="bg-slate-900 text-white py-4 px-8 flex justify-between items-center shadow-md">
            <div>
                <h1 class="text-xl font-bold flex items-center gap-2">
                    <span class="text-indigo-400">&bull;</span> NicheTech B2B Catalog
                </h1>
                <p class="text-xs text-slate-400">Regional Electronics Distributor Endpoint</p>
            </div>
            <div class="text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-300 font-mono">
                API Endpoint: /demo-site
            </div>
        </nav>
        
        <main class="max-w-6xl mx-auto py-8 px-4">
            {status_indicator}
            
            <div class="flex justify-between items-center mb-6">
                <div>
                    <h2 class="text-2xl font-extrabold text-slate-900">Electronics Inventory</h2>
                    <p class="text-slate-500">Live warehouse quantities and catalog prices</p>
                </div>
                <div class="text-sm text-slate-500 font-medium">
                    Displaying {len(items)} products
                </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {cards_html}
            </div>
        </main>
        
        <footer class="mt-16 py-8 border-t border-slate-200 text-center text-sm text-slate-400 bg-white">
            <p>&copy; 2026 NicheTech Solutions. Provided for ScrapeGuard Simulation Demonstration.</p>
        </footer>

        <script>
            async function resetDemo() {{
                const res = await fetch('/api/demo/reset', {{ method: 'POST' }});
                if (res.ok) {{
                    window.location.reload();
                }}
            }}
        </script>
    </body>
    </html>
    """
