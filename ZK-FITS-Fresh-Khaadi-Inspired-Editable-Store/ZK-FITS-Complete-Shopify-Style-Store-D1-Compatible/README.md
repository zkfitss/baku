# ZK FITSS — Editable Storefront + Admin

This project contains the customer storefront, product detail page, responsive navigation, product catalogue, cart/checkout, product reviews moderation, admin dashboard, Cloudflare Pages Functions API, D1 schema and R2 image upload support.

## 1) Upload / deploy
1. Upload the **contents** of this project folder to the GitHub repository connected to Cloudflare Pages.
2. Cloudflare Pages build command: leave blank. Build output directory: `.`.
3. Keep the D1 binding named `DB` and the R2 binding named `IMAGES` as shown in `wrangler.toml`.
4. Confirm the D1 database is the existing `zkfitss` database. Do not create a replacement database if it already contains products/orders.

## 2) Existing D1 database status (checked 2026-11-18)
The live `zkfitss` database already contains `settings` and `product_reviews`. Its product and order IDs are TEXT, and orders use the existing `payment` column. The API in this package uses those exact conventions and generates text IDs for new products and orders.

The owner has already added `products.collection` and `products.images`. The `orders.customer_email` and `orders.created_at` columns were already present, and the `created_at` backfill completed successfully. Therefore **do not run migration 0003 or 0004** against this database. The included `0004_schema_compatibility.sql` is intentionally a no-op record to prevent accidentally re-adding existing columns.

Do **not** run the fresh `schema.sql` over a live database. `schema.sql` is for a genuinely new empty D1 database only. Preserve the existing D1 database and its data.

Do **not** run the fresh `schema.sql` over a live database. `schema.sql` is for a genuinely new empty D1 database only.

## 3) Cloudflare Pages environment variables / secrets
Set these in Pages → Settings → Variables and Secrets:
- `ADMIN_PASSWORD` — strong unique admin password (secret)
- `SESSION_SECRET` — long random secret (secret)
- `RESEND_API_KEY` — Resend API key (secret)
- `EMAIL_FROM` — optional sender override using a domain verified in Resend; the Admin Panel can also store the sender identity
- `ADMIN_EMAIL` — optional fallback email address that receives new order notifications (the Admin Panel setting can also set this)
- `PUBLIC_IMAGE_BASE` — public R2 custom domain or public bucket URL used to display uploaded images

Never put API keys in browser JavaScript or commit them to GitHub. Customer and admin order emails cannot be delivered until Resend sender verification and the variables above are configured.

## 4) Admin
After deployment open `/admin.html` and sign in with `ADMIN_PASSWORD`. The dashboard supports products, size/colour stock variants, per-variant image galleries, a single 10-image product upload area, orders, reviews moderation and store appearance settings. Product category remains Women or Girls; the separate Style / Collection product field has been removed.

## 5) Product variants and image management
The Admin product editor has one product-image upload area (up to 10 images total); the first uploaded image is the listing/main image. Enter sizes (comma-separated; the common shorthand `S M L XL` is also accepted) and colours (comma-separated), then use **Generate All Size × Colour Combinations**. Enter stock for each generated size/colour pair. Upload matching photos on each pair when that colour should show its own photos. The customer product page displays each size as its own selectable button, filters colours by the selected size, switches to the selected variant photos, and enables Add to Cart / Buy Now only after a valid in-stock size and colour are selected.

## 6) Payment and email notes
COD, bank transfer, Easypaisa and JazzCash are order-selection methods. Wallet/bank transfers are recorded as manual payment choices; they are not automatic gateway verification. Email status is returned by the API and requires a working Resend account and verified sender domain.

## 7) Final live checks
After deploying, test admin login, image upload/public image access, product create/edit, size-colour selection, cart checkout, inventory reduction, review submission/moderation and both email notifications on the live D1/R2 bindings. Browser and Cloudflare environment testing cannot be completed from the ZIP alone.


## Final fixes in this package
- Hero slider autoplay is set to 10 seconds; visible arrow graphics are hidden while their hit areas remain active, and swipe remains enabled.
- Product listing cards display uploaded images at their natural aspect ratio without a coloured frame or crop.
- Product cards show Add to Cart and Buy Now links that take customers to the product page to choose required variants before purchase.
- Product gallery supports up to 10 images total (main image plus up to 9 additional images).
- Admin product editor can generate all size × colour combinations from the entered size and colour lists; set stock for each combination before publishing.
- Product detail page menu selector bug fixed.

## Important
This package keeps the existing D1 table layout: products use TEXT IDs and orders use the `payment` column. It does not require rerunning the schema or review migrations. Existing product variant rows with zero stock remain unavailable until stock quantities are entered in Admin.


## SEO, favicon and social sharing (updated)
- The site now uses the **ZK FITSS** brand spelling in page titles and SEO/social metadata.
- `favicon.ico`, `favicon-512.png`, `icon-192.png`, `apple-touch-icon.png`, and `favicon.svg` provide browser, Google, and Apple icon formats.
- `og-image.jpg` is a 1200×630 social preview image for WhatsApp, Facebook, and other link previews.
- `site.webmanifest` provides the website icon/theme metadata.
- `robots.txt` allows public pages, blocks `/admin.html`, and points crawlers to `sitemap.xml`.
- The homepage includes canonical URL, meta description, Open Graph/Twitter metadata, and Organization/WebSite structured data.
- Product pages update their title, description, canonical URL, social preview metadata, and Product structured data after product data loads.
- Default favicon and social-preview URLs are set to the new files. Existing admin-configured custom values remain editable and can override those defaults.

### After deploying
1. Upload/commit the updated project files to the same GitHub repository connected to Cloudflare Pages.
2. Wait for the Cloudflare Pages deployment to finish, then open `https://www.zkfitss.com/favicon.ico`, `https://www.zkfitss.com/og-image.jpg`, `https://www.zkfitss.com/robots.txt`, and `https://www.zkfitss.com/sitemap.xml` to confirm they load.
3. In Google Search Console, inspect `https://www.zkfitss.com/`, request indexing, and submit `https://www.zkfitss.com/sitemap.xml`.
4. Google controls when its search-result favicon and title refresh. A correct deployment does not guarantee an immediate change; recrawling can take days or longer.


## Store analytics (new)
- The Admin sidebar now includes **Analytics** with 7/30/90/365-day reporting.
- Tracks storefront page views, product views, add-to-cart actions, checkout starts and completed orders; reports visitors, page views, orders, checkout revenue, traffic source/medium/campaign, approximate city/country, device type, popular pages/products and the shopping funnel.
- Completed purchases are recorded server-side after the order is saved. Source, campaign, landing page, session ID and approximate checkout city/country are saved in a server-side purchase event linked to the order, so order-source reporting survives after the browser session ends. Net revenue excludes orders marked Cancelled. No raw IP address is stored. Location is approximate Cloudflare city/country metadata and may be unavailable for some visits.
- Analytics starts after this version is deployed; it cannot recreate visitor history from before installation. Browser-session counts are an estimate, not a cross-device identity count. Ad platform conversions require separate Meta Pixel/TikTok Pixel/Google Ads tags and consent configuration; this first-party dashboard does not claim to replace those systems.

### Required database step for analytics
Apply the new additive migration to the **existing** Cloudflare D1 database named `zkfitss` after deploying the code:

```bash
npx wrangler d1 migrations apply zkfitss --remote
```

This applies `migrations/0005_analytics.sql` and creates only the analytics events table and indexes. Do not rerun `schema.sql`, do not create a new D1 database, and keep the existing DB binding. If the migration has not been applied, the Analytics tab will show a migration warning and will not display data.

### Analytics test
After deployment and migration, open the public storefront in a private/incognito browser, visit a product, add it to cart, start checkout and place a test order if appropriate. Then sign in to `/admin.html` → Analytics and refresh. Test orders will appear as revenue/orders, so use a clearly identified test order and cancel/delete it from reporting if you do not want it included in business figures.


### Recommended tracked social links
Use tagged links in social bios, story links and ads so in-app browsers that hide referrer details can still be attributed:
- Instagram: `https://www.zkfitss.com/?utm_source=instagram&utm_medium=social&utm_campaign=profile`
- Facebook: `https://www.zkfitss.com/?utm_source=facebook&utm_medium=social&utm_campaign=page`
- TikTok: `https://www.zkfitss.com/?utm_source=tiktok&utm_medium=social&utm_campaign=profile`
- WhatsApp: `https://www.zkfitss.com/?utm_source=whatsapp&utm_medium=messaging&utm_campaign=share`

For paid ads, use `utm_medium=paid_social` and a distinct `utm_campaign` name per campaign. Referrer-based attribution is best-effort; UTM links are more reliable when the app/browser suppresses referrer information.


## Analytics storage controls (added)
- Detailed analytics events are retained for 90 days. When an administrator opens Analytics, a maintenance task runs at most once every 24 hours and compacts older event rows into monthly summary tables before deleting the detailed rows.
- Monthly archive preserves page views, product views, add-to-cart events, checkout starts, unique anonymous browser sessions, and order/source attribution. Orders and net revenue are read from the existing orders table so current cancellation status is reflected.
- The Admin Analytics panel shows an estimated analytics payload footprint, retained event count, archived session count, archived months and last cleanup time. The estimate is for analytics payload only; it is not an exact D1 billing/database-size measurement and excludes SQLite indexes, overhead and other store data.
- Apply the new additive migration to the existing D1 database after deployment: `npx wrangler d1 migrations apply zkfitss --remote`. This applies migration `0006_analytics_retention.sql`; keep the existing database and bindings.
- Cleanup is request-driven: it runs when an authenticated admin opens Analytics, not from a background cron. If nobody opens Analytics, detailed rows may remain longer than 90 days; this avoids requiring a new Worker/cron deployment.

## Marketing pixels and conversion tracking (new)

The storefront now includes an optional marketing measurement bridge for Google Analytics 4, Google Ads purchase conversions, Meta Pixel and TikTok Pixel. All IDs are intentionally blank; no fake/demo IDs are shipped and no third-party pixel fires until a real ID is configured.

### Configure platform IDs

Open `/admin.html` → **Store Customization** → **Marketing & Tracking Integrations**. Enter the IDs and save settings. The values are persisted in the existing D1 `settings` table and read by the public storefront settings endpoint; no code edit or additional database migration is required.
- `ga4`: GA4 Measurement ID (`G-...`)
- `googleAds`: Google Ads conversion ID (`AW-...`)
- `googleAdsPurchaseLabel`: Google Ads purchase conversion label (required for Ads purchase conversion)
- `meta`: Meta Pixel ID from Events Manager
- `tiktok`: TikTok Pixel ID from Events Manager

The bridge loads IDs dynamically from the saved store settings and maps page views, product views, add-to-cart, checkout-start and successful order placement to platform events. GA4 and Google Ads receive transaction IDs where available; Meta and TikTok receive value/currency. The API validates ID formats and only an authenticated admin can save settings. Test with each platform's DebugView / Test Events before relying on campaign reporting. Do not paste API secrets or access tokens into ID fields. For server-side Conversions API, use Cloudflare Worker secrets and a dedicated server implementation.

### Notes
- This is browser-side pixel tracking. Ad blockers, browser privacy settings and consent choices can reduce measured events; platform counts will not exactly match the store database.
- Google Ads purchase conversion requires both the `AW-...` ID and its conversion label. GA4 is not a substitute for Google Ads conversion setup.
- Use clear privacy notice/consent practices appropriate to your business and customer locations. Do not send customer names, phone numbers, email, postal addresses or other direct identifiers to ad platforms.
- After deployment, test one order using each platform's test/debug tools and compare the order in the admin panel. Avoid placing repeated real orders just for testing.


## Blog CMS (added)

A blog manager is available in the admin dashboard under **Blog Posts**. Create drafts or publish articles, set a featured image, category, tags, SEO title and meta description. Published articles appear at `/blog.html` and use `/blog.html?slug=your-post-slug` for individual article pages.

Before deploying this update, apply the new D1 migration to the existing database:

```bash
npx wrangler d1 migrations apply zkfitss --remote
```

The migration file is `migrations/0007_blog.sql`. Deploy the complete updated project after the migration succeeds.
