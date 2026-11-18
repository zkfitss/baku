# ZK FITS — Editable Storefront + Admin

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
After deployment open `/admin.html` and sign in with `ADMIN_PASSWORD`. The dashboard supports products, size/colour stock variants, per-variant image galleries, product gallery images, orders, reviews moderation and store appearance settings.

## 5) Product variants and image management
For each product, create a row for every available size + colour combination. Example: Small/Black, Small/Maroon, Medium/Black. Enter stock separately and upload the images for that exact combination. The customer product page filters colours by selected size and swaps the gallery to the matching combination's images.

## 6) Payment and email notes
COD, bank transfer, Easypaisa and JazzCash are order-selection methods. Wallet/bank transfers are recorded as manual payment choices; they are not automatic gateway verification. Email status is returned by the API and requires a working Resend account and verified sender domain.

## 7) Final live checks
After deploying, test admin login, image upload/public image access, product create/edit, size-colour selection, cart checkout, inventory reduction, review submission/moderation and both email notifications on the live D1/R2 bindings. Browser and Cloudflare environment testing cannot be completed from the ZIP alone.
